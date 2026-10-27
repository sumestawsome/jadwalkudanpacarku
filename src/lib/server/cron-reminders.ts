import "server-only";

import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { sendGreenApiTextMessage } from "@/lib/server/green-api";
import { getTaskDeadlineDiffDays } from "@/lib/task-risk";
import { formatIndonesianDate, formatWitaDate } from "@/lib/date-utils";
import type { Task, RecurringSchedule } from "@/types";

export interface CronExecutionResult {
  checked: number;
  reminded: number;
  archived: number;
  skipped: number;
  weekly_recap_sent: boolean;
  errors: string[];
  tasks: Array<{
    id: string;
    title: string;
    action: "reminded" | "archived" | "skipped";
    milestone?: string;
    diffDays?: number | null;
    diffHours?: number | null;
  }>;
}

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * Mendapatkan daftar ruang chat tujuan siaran pengingat (Grup Couple atau Nomor Personal)
 */
export function getReminderChatRecipients(): string[] {
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

export function buildReminderMessage(task: Task, milestone: string): string {
  const deadlineStr = formatWitaDate(task.deadline_date || task.deadline);
  const lmsInfo = task.lms_url || task.submission_url ? `\n🔗 *LMS / Pengumpulan:* ${task.lms_url || task.submission_url}` : "";
  const descInfo = task.description ? `\n📌 *Catatan:* ${task.description}` : "";
  const course = task.course_name || "Umum";
  const title = task.title || task.name || "Tugas Kuliah";

  if (milestone.startsWith("hourly_")) {
    const hoursNum = milestone.replace("hourly_", "").replace("h", "");
    return [
      `🚨 *PENGINGAT INTENSIF: SISA ${hoursNum} JAM LAGI!* ⚡`,
      "",
      `Perhatian! Tugas kuliah ini belum selesai dan waktu pengumpulan tersisa sekitar ${hoursNum} jam lagi:`,
      `📚 *Mata Kuliah:* ${course}`,
      `📝 *Tugas:* ${title}`,
      `⏰ *Tenggat:* ${deadlineStr}`,
      descInfo,
      lmsInfo,
      "",
      "Ayo segera selesaikan dan kumpulkan sekarang sebelum mepet ya! Kamu pasti bisa! 💪🔥",
    ].filter(Boolean).join("\n");
  }

  switch (milestone) {
    case "h_5":
      return [
        "🔥 *PERINGATAN KRITIS: TENGGAT SISA 5 JAM LAGI!* 🔥",
        "",
        "Gawat! Batas waktu pengumpulan tugas ini tinggal 5 jam lagi:",
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `⏰ *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Jangan ditunda lagi, segera selesaikan dan upload tugasmu sekarang ya! Semangat! ⚡🏃",
      ].filter(Boolean).join("\n");

    case "h_10":
      return [
        "⚠️ *PENGINGAT DARURAT: SISA 10 JAM LAGI!* ⚠️",
        "",
        "Perhatian! Sisa waktu pengerjaan tugas kuliah ini tersisa 10 jam:",
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `⏰ *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Yuk fokus tuntaskan hari ini biar malam nanti gak keteteran! 🌸✨",
      ].filter(Boolean).join("\n");

    case "h_15":
      return [
        "⏰ *PENGINGAT TUGAS: SISA 15 JAM LAGI!* ⏳",
        "",
        "Halo! Pengingat tenggat tugas kuliah tersisa 15 jam lagi:",
        `📚 *Mata Kuliah:* ${course}`,
        `📝 *Tugas:* ${title}`,
        `⏰ *Tenggat:* ${deadlineStr}`,
        descInfo,
        lmsInfo,
        "",
        "Luangkan waktu sejenak untuk cek kembali kelengkapan tugasmu ya! Semangat! 🌷",
      ].filter(Boolean).join("\n");

    case "today":
      return [
        "🔥 *PENGINGAT TUGAS KULIAH (HARI INI!)* 🔥",
        "",
        "Perhatian! Hari ini adalah batas akhir pengumpulan tugas:",
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
        "Halo! Pengumpulan tugas ini tinggal besok lho:",
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
        "Hai hai! Pengingat santai, tugas ini ada tenggat dalam 3 hari:",
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
        "Pengingat awal pekan untuk tugas kuliah:",
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
 * Otomatis mengirimkan rekap jadwal kuliah & rutinitas setiap hari Senin jam 06:30 WITA
 */
export async function checkAndSendWeeklyScheduleRecap(force = false): Promise<boolean> {
  const db = getAdminDb();
  const now = new Date();

  // Konversi ke zona waktu WITA (Asia/Makassar, UTC+8)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value; // "Mon", etc.
  const year = parts.find((p) => p.type === "year")?.value || "2026";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  const todayWitaDateStr = `${year}-${month}-${day}`;
  const isMonday = weekdayStr === "Mon";

  // Hanya jalankan pada hari Senin jam 06:30 WITA ke atas (atau jika dipaksa via force=true)
  if (!force) {
    if (!isMonday) return false;
    if (hour < 6 || (hour === 6 && minute < 30)) return false;

    // Periksa apakah sudah dikirim hari ini
    const systemDoc = await db.collection("jadwalku_system").doc("weekly_recap").get();
    if (systemDoc.exists && systemDoc.data()?.last_recap_date === todayWitaDateStr) {
      return false;
    }
  }

  console.log(`[jadwalku-cron] Preparing weekly schedule recap for Monday (${todayWitaDateStr})...`);

  const schedSnap = await db.collection("jadwalku_schedules").get();
  if (schedSnap.empty) {
    console.log("[jadwalku-cron] No recurring schedules found in jadwalku_schedules.");
    return false;
  }

  const schedules: RecurringSchedule[] = [];
  schedSnap.forEach((doc) => {
    schedules.push({ id: doc.id, ...(doc.data() as Omit<RecurringSchedule, "id">) });
  });

  // Hitung rentang tanggal Senin s/d Minggu minggu ini dalam WITA
  // Buat referensi hari Senin minggu ini
  const mondayDate = new Date(`${todayWitaDateStr}T00:00:00+08:00`);
  // Map index hari (1: Senin, 2: Selasa, ... 6: Sabtu, 0: Minggu)
  const weekDayDates: Record<number, { dateStr: string; dateObj: Date }> = {};
  for (let offset = 0; offset < 7; offset++) {
    const cur = new Date(mondayDate.getTime() + offset * 24 * 60 * 60 * 1000);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const curDateStr = `${y}-${m}-${d}`;
    const dayOfWeek = cur.getDay(); // 0 = Sun, 1 = Mon, ...
    weekDayDates[dayOfWeek] = { dateStr: curDateStr, dateObj: cur };
  }

  const sundayDate = weekDayDates[0]?.dateObj || mondayDate;
  const periodText = `${formatIndonesianDate(mondayDate)} - ${formatIndonesianDate(sundayDate)}`;

  const lines: string[] = [
    "📅 *REKAP JADWAL KULIAH & RUTINITAS MINGGU INI* 📚",
    `✨ *Periode:* ${periodText}`,
    "",
    "Semangat mengawali pekan baru! Berikut rangkuman jadwal kita minggu ini:",
    "━━━━━━━━━━━━━━━━━━━━━",
  ];

  // Urutan hari: Senin (1) s/d Minggu (0)
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  let totalEntries = 0;

  for (const dayIdx of dayOrder) {
    const dayInfo = weekDayDates[dayIdx];
    const dayName = DAY_NAMES[dayIdx];
    const targetDateStr = dayInfo?.dateStr || "";

    // Cari jadwal yang aktif pada hari ini
    const daySchedules = schedules.filter((s) => Array.isArray(s.days) && s.days.includes(dayIdx));

    if (daySchedules.length === 0) continue;

    // Urutkan berdasarkan jam mulai
    daySchedules.sort((a, b) => (a.start_time || "00:00").localeCompare(b.start_time || "00:00"));

    lines.push(`📌 *${dayName.toUpperCase()}* (${formatIndonesianDate(dayInfo.dateObj)})`);

    for (const item of daySchedules) {
      totalEntries++;
      // Cek apakah ada override untuk tanggal ini
      const override = item.overrides?.[targetDateStr];
      const startTime = override?.start_time || item.start_time || "08:00";
      const endTime = override?.end_time || item.end_time || "09:40";
      const location = override?.location || item.location || "Kampus";
      const isOverridden = Boolean(override);

      const timeStr = `${startTime} - ${endTime} WITA`;
      const catBadge = item.category === "kuliah" ? "🎓" : item.category === "personal" ? "👤" : "⚡";

      lines.push(`• ${catBadge} *${item.title}* (${timeStr})`);
      lines.push(`  📍 Ruang/Lokasi: ${location}`);
      if (isOverridden) {
        lines.push(`  ⚠️ _[Jadwal Pengganti: ${override?.note || "Waktu/ruangan disesuaikan"}]_`);
      }
    }
    lines.push("");
  }

  if (totalEntries === 0) {
    lines.push("Tidak ada jadwal rutin kuliah yang terjadwal minggu ini. Nikmati waktu luangmu! 🌸");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://jadwalku.vercel.app";
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("Semoga perkuliahan dan aktivitas minggu ini lancar serta berkah ya! Semangat! 🌷💪");
  lines.push(`👉 Cek & atur jadwal: ${appUrl}`);

  const recapMessage = lines.join("\n");
  const recipients = getReminderChatRecipients();

  for (const chatId of recipients) {
    try {
      await sendGreenApiTextMessage(chatId, recapMessage);
    } catch (sendErr) {
      console.error(`[jadwalku-cron] Failed to send weekly recap to ${chatId}:`, sendErr);
    }
  }

  // Tandai bahwa rekap minggu ini sudah dikirim
  await db.collection("jadwalku_system").doc("weekly_recap").set({
    last_recap_date: todayWitaDateStr,
    sent_at: FieldValue.serverTimestamp(),
    total_schedules: totalEntries,
  }, { merge: true });

  console.log(`[jadwalku-cron] Weekly schedule recap successfully sent for ${todayWitaDateStr}.`);
  return true;
}

/**
 * Eksekutor Cron Pengingat Jadwalku:
 * 1. Otomatis mengubah status tugas yang tenggatnya sudah lewat menjadi 'archived'.
 * 2. Mengirimkan pengingat jam-jaman (<24 jam: H-15, H-10, H-5; dan pengingat intensif per jam jika sisa waktu <10 jam).
 * 3. Mengirimkan pengingat harian (H-5, H-3, H-1, Hari H).
 * 4. Mengirimkan rekap mingguan otomatis setiap hari Senin jam 06:30 WITA.
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
    weekly_recap_sent: false,
    errors: [],
    tasks: [],
  };

  try {
    // 0. Cek Rekap Mingguan Senin 06:30 WITA
    try {
      const recapSent = await checkAndSendWeeklyScheduleRecap(force);
      result.weekly_recap_sent = recapSent;
    } catch (recapErr) {
      console.error("[jadwalku-cron] Weekly schedule recap error:", recapErr);
      result.errors.push(`Weekly recap error: ${String(recapErr)}`);
    }

    const snapshot = await db.collection("jadwalku_tasks")
      .where("is_archived", "==", false)
      .get();

    result.checked = snapshot.size;
    const recipients = getReminderChatRecipients();
    const now = new Date();

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

      // Hitung deadline Date & perbedaan waktu
      let deadlineDate: Date | null = null;
      const rawDeadline = task.deadline_date || task.deadline;
      if (rawDeadline) {
        if (typeof rawDeadline === "object" && rawDeadline !== null && "toDate" in rawDeadline) {
          deadlineDate = (rawDeadline as { toDate: () => Date }).toDate();
        } else if (rawDeadline instanceof Date) {
          deadlineDate = rawDeadline;
        } else if (typeof rawDeadline === "string") {
          deadlineDate = new Date(rawDeadline);
        }
      }

      const diffDays = getTaskDeadlineDiffDays(task.deadline_date || task.deadline, now);
      const diffMs = deadlineDate && !isNaN(deadlineDate.getTime()) ? deadlineDate.getTime() - now.getTime() : null;
      const diffHours = diffMs !== null ? diffMs / (1000 * 60 * 60) : null;

      // =========================================================================
      // 1. AUTO-ARCHIVE LOGIC: Jika tenggat sudah lewat (diffMs <= 0 || diffDays < 0)
      // =========================================================================
      if ((diffMs !== null && diffMs <= 0) || (diffDays !== null && diffDays < 0)) {
        console.log(`[jadwalku-cron] Auto-archiving expired task "${safeTitle}" (diffMs=${diffMs}, diffDays=${diffDays})`);
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
            diffHours,
          });
        } catch (archErr) {
          const errStr = `Failed to auto-archive task ${task.id}: ${String(archErr)}`;
          console.error(errStr);
          result.errors.push(errStr);
        }
        continue;
      }

      // =========================================================================
      // 2. LOGIKA PENGINGAT ESKALASI JAM-JAMAN (< 24 JAM) & HARIAN
      // =========================================================================
      if (diffHours === null && diffDays === null) {
        result.skipped++;
        result.tasks.push({ id: task.id, title: safeTitle, action: "skipped", diffDays: null });
        continue;
      }

      const remindersSent = Array.isArray(task.reminders_sent) ? task.reminders_sent : [];
      let targetMilestone: string | null = null;

      if (diffHours !== null && diffHours < 24 && diffHours > 0) {
        // TUGAS DENGAN SISA WAKTU < 24 JAM:
        // Kirim pengingat saat menyentuh H-15 jam, H-10 jam, dan H-5 jam
        // Jika sisa waktu < 10 jam dan belum selesai: kirim pengingat intensif setiap jam
        if (diffHours <= 15.5 && diffHours > 10 && !remindersSent.includes("h_15")) {
          targetMilestone = "h_15";
        } else if (diffHours <= 10.5 && diffHours > 9 && !remindersSent.includes("h_10")) {
          targetMilestone = "h_10";
        } else if (diffHours <= 5.5 && diffHours > 4 && !remindersSent.includes("h_5")) {
          targetMilestone = "h_5";
        } else if (diffHours < 10) {
          // Sisa waktu < 10 jam dan belum selesai: kirim pengingat intensif setiap jam
          const hoursLeft = Math.max(1, Math.round(diffHours));
          const hourlyKey = `hourly_${hoursLeft}h`;

          // Cek jeda minimal 45 menit sejak pengingat terakhir agar tidak double kirim jika cron dijalankan berulang
          const lastReminderAt = task.last_reminder_at
            ? (typeof task.last_reminder_at === "object" && "toDate" in task.last_reminder_at
                ? (task.last_reminder_at as { toDate: () => Date }).toDate().getTime()
                : new Date(task.last_reminder_at as string | number).getTime())
            : 0;

          const msSinceLast = now.getTime() - lastReminderAt;
          const cooldownPassed = msSinceLast >= 45 * 60 * 1000;

          if (force || (!remindersSent.includes(hourlyKey) && cooldownPassed)) {
            if (hoursLeft === 5 && !remindersSent.includes("h_5")) {
              targetMilestone = "h_5";
            } else {
              targetMilestone = hourlyKey;
            }
          }
        }
      } else if (diffDays !== null) {
        // PENGINGAT HARIAN (> 24 JAM)
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
      }

      if (!targetMilestone) {
        result.skipped++;
        result.tasks.push({ id: task.id, title: safeTitle, action: "skipped", diffDays, diffHours });
        continue;
      }

      // Kirim pengingat ke WhatsApp
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
            diffHours,
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
