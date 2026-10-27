import "server-only";

import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { sendGreenApiTextMessage } from "@/lib/server/green-api";
import { getTaskDeadlineDiffDays } from "@/lib/task-risk";
import { formatIndonesianDate } from "@/lib/date-utils";
import type { Task } from "@/types";

export interface CronExecutionResult {
  checked: number;
  reminded: number;
  archived: number;
  skipped: number;
  errors: string[];
  tasks: Array<{
    id: string;
    title: string;
    action: "reminded" | "archived" | "skipped";
    milestone?: string;
    diffDays?: number | null;
  }>;
}

/**
 * Mendapatkan daftar ruang chat tujuan siaran pengingat (Grup Couple atau Nomor Personal)
 */
function getReminderChatRecipients(): string[] {
  const recipients: string[] = [];
  const coupleGroup = process.env.WHATSAPP_COUPLE_GROUP_ID?.trim();
  const ownerPhone = process.env.WHATSAPP_OWNER_PHONE?.trim();
  const partnerPhone = process.env.WHATSAPP_PARTNER_PHONE?.trim();

  if (coupleGroup) {
    recipients.push(coupleGroup.endsWith("@g.us") ? coupleGroup : `${coupleGroup}@g.us`);
  } else {
    if (ownerPhone) {
      const clean = ownerPhone.replace(/[^\d]/g, "").replace(/^0/, "62");
      recipients.push(`${clean}@c.us`);
    }
    if (partnerPhone) {
      const clean = partnerPhone.replace(/[^\d]/g, "").replace(/^0/, "62");
      recipients.push(`${clean}@c.us`);
    }
  }

  return recipients;
}

function buildReminderMessage(task: Task, milestone: "h5" | "h3" | "h1" | "today"): string {
  const deadlineStr = formatIndonesianDate(task.deadline_date || task.deadline);
  const lmsInfo = task.lms_url || task.submission_url ? `\n🔗 *LMS / Pengumpulan:* ${task.lms_url || task.submission_url}` : "";
  const descInfo = task.description ? `\n📌 *Catatan:* ${task.description}` : "";
  const course = task.course_name || "Umum";
  const title = task.title || task.name || "Tugas Kuliah";

  switch (milestone) {
    case "today":
      return [
        "🔥 *PENGINGAT TUGAS KULIAH (HARI INI!)* 🔥",
        "",
        `Perhatian! Hari ini adalah batas akhir pengumpulan tugas:`,
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `⏰ *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Pastikan tugasmu sudah terunggah sebelum jamnya mepet ya. Semangat menuntaskan hari ini! 🌸💪",
      ].filter(Boolean).join("\n");

    case "h1":
      return [
        "⚠️ *PENGINGAT TUGAS KULIAH (H-1 - BESOK)* ⚠️",
        "",
        `Halo! Pengumpulan tugas ini tinggal besok lho:`,
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `⏰ *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Yuk cek kembali file dan laporannya biar malam ini bisa tidur nyenyak! 🌙✨",
      ].filter(Boolean).join("\n");

    case "h3":
      return [
        "⏳ *PENGINGAT TUGAS KULIAH (H-3)* ⏳",
        "",
        `Hai hai! Pengingat santai, tugas ini ada tenggat dalam 3 hari:`,
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `📅 *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Bisa mulai dicicil sedikit-sedikit dari sekarang ya biar nggak numpuk. Semangat! 🌷",
      ].filter(Boolean).join("\n");

    case "h5":
    default:
      return [
        "🌱 *PENGINGAT TUGAS KULIAH (H-5)* 🌱",
        "",
        `Pengingat awal pekan untuk tugas kuliah:`,
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `📅 *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Masih ada waktu 5 hari, catat di to-do list kamu ya! Have a productive day! ☕✨",
      ].filter(Boolean).join("\n");
  }
}

/**
 * Eksekutor Cron Pengingat Jadwalku:
 * 1. Otomatis mengubah status tugas yang tenggatnya sudah lewat (diffDays < 0) menjadi 'archived'.
 * 2. Mengirimkan notifikasi pengingat H-5, H-3, H-1, dan Hari H ke WhatsApp.
 * 3. Menyimpan riwayat milestone pengingat di reminders_sent agar tidak berulang.
 */
export async function runTaskRemindersAndAutoArchive(options?: {
  force?: boolean;
}): Promise<CronExecutionResult> {
  const db = getAdminDb();
  const force = options?.force || false;

  const result: CronExecutionResult = {
    checked: 0,
    reminded: 0,
    archived: 0,
    skipped: 0,
    errors: [],
    tasks: [],
  };

  try {
    const snapshot = await db.collection("jadwalku_tasks")
      .where("is_archived", "==", false)
      .get();

    result.checked = snapshot.size;
    const recipients = getReminderChatRecipients();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const task: Task = { id: doc.id, ...data } as Task;
      const safeTitle = task.title || task.name || "Tugas Kuliah";

      // Skip jika tugas sudah selesai
      if (task.status === "completed" || task.status === "selesai") {
        result.skipped++;
        result.tasks.push({ id: task.id, title: safeTitle, action: "skipped" });
        continue;
      }

      const diffDays = getTaskDeadlineDiffDays(task.deadline_date || task.deadline);

      // =========================================================================
      // 1. AUTO-ARCHIVE LOGIC: Jika tenggat sudah lewat (diffDays < 0)
      // =========================================================================
      if (diffDays !== null && diffDays < 0) {
        console.log(`[jadwalku-cron] Auto-archiving expired task "${safeTitle}" (diffDays=${diffDays})`);
        try {
          await db.collection("jadwalku_tasks").doc(task.id).update({
            status: "archived",
            is_archived: true,
            archived_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });

          result.archived++;
          result.tasks.push({
            id: task.id,
            title: safeTitle,
            action: "archived",
            diffDays,
          });
        } catch (archErr) {
          const errStr = `Failed to auto-archive task ${task.id}: ${String(archErr)}`;
          console.error(errStr);
          result.errors.push(errStr);
        }
        continue;
      }

      // =========================================================================
      // 2. MILESTONE REMINDER LOGIC (H-5, H-3, H-1, Hari H)
      // =========================================================================
      if (diffDays === null) {
        result.skipped++;
        result.tasks.push({ id: task.id, title: safeTitle, action: "skipped", diffDays: null });
        continue;
      }

      const remindersSent = Array.isArray(task.reminders_sent) ? task.reminders_sent : [];
      let targetMilestone: "today" | "h1" | "h3" | "h5" | null = null;

      if (diffDays === 0) {
        if (force || !remindersSent.includes("today")) {
          targetMilestone = "today";
        }
      } else if (diffDays === 1) {
        if (force || !remindersSent.includes("h1")) {
          targetMilestone = "h1";
        }
      } else if (diffDays <= 3 && diffDays > 1) {
        if (force || !remindersSent.includes("h3")) {
          targetMilestone = "h3";
        }
      } else if (diffDays <= 5 && diffDays > 3) {
        if (force || !remindersSent.includes("h5")) {
          targetMilestone = "h5";
        }
      }

      if (!targetMilestone) {
        result.skipped++;
        result.tasks.push({ id: task.id, title: safeTitle, action: "skipped", diffDays });
        continue;
      }

      // Kirim pengingat ke ruang chat yang terdaftar
      const reminderMsg = buildReminderMessage(task, targetMilestone);
      let sentSuccess = false;

      for (const chatId of recipients) {
        try {
          const sendRes = await sendGreenApiTextMessage(chatId, reminderMsg);
          if (sendRes.ok) {
            sentSuccess = true;
          }
        } catch (sendErr) {
          console.error(`[jadwalku-cron] Failed to send reminder to ${chatId}:`, sendErr);
          result.errors.push(`Task ${task.id} send to ${chatId} failed: ${String(sendErr)}`);
        }
      }

      if (sentSuccess || recipients.length === 0) {
        try {
          await db.collection("jadwalku_tasks").doc(task.id).update({
            reminders_sent: FieldValue.arrayUnion(targetMilestone),
            last_reminder_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });

          result.reminded++;
          result.tasks.push({
            id: task.id,
            title: safeTitle,
            action: "reminded",
            milestone: targetMilestone,
            diffDays,
          });
        } catch (upErr) {
          console.error(`[jadwalku-cron] Failed to update reminder status for ${task.id}:`, upErr);
        }
      }
    }
  } catch (err) {
    const errStr = `Cron execution failed: ${String(err)}`;
    console.error(errStr);
    result.errors.push(errStr);
  }

  return result;
}
