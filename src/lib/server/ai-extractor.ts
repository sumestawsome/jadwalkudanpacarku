import "server-only";

import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { formatWitaDate, formatIndonesianDate, parseDeadlineString } from "@/lib/date-utils";
import { getTaskDeadlineDiffDays } from "@/lib/task-risk";
import type {
  ExtractedTask,
  Task,
  RecurringSchedule,
  ExtractedSchedule,
  ExtractedScheduleOverride,
  AiExtractionResult,
  AiIntentType,
  ScheduleOverride,
} from "@/types";

export const FETCH_TIMEOUT_MS = 15000;

export const SUPPORTED_GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
].filter(Boolean) as string[];

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getDynamicSystemPrompt(): string {
  const currentWita = formatWitaDate(new Date());
  return [
    "Kamu adalah asisten pintar pencatat jadwal & tugas kuliah personal/couple untuk Jadwalku.",
    "Tugasmu adalah menganalisis pesan suara atau teks dan mengklasifikasikan maksud (intent) pengguna ke format JSON murni.",
    `Waktu referensi saat ini adalah: ${currentWita} (Tahun 2026, WITA).`,
    "",
    "KLASIFIKASI INTENT (PILIH SALAH SATU):",
    "1. 'TASK_CREATE':",
    "   - Pengguna menyebutkan tugas kuliah, PR, makalah, proyek, kuis, atau latihan yang harus dikerjakan dengan deadline.",
    "   - Contoh: 'Tugas Basis Data buat ERD deadline besok jam 7 malam', 'Jangan lupa ada resume modul 3 deadline jumat'.",
    "",
    "2. 'SCHEDULE_CREATE':",
    "   - Pengguna mendaftarkan jadwal kuliah rutin, kelas berulang, les, atau rutinitas harian/mingguan.",
    "   - Contoh: 'Ada kuliah Pemrograman Web setiap Senin jam 08:00 sampai 09:40 di Lab 3', 'Tiap Kamis dan Jumat ada kelas Basis Data jam 10:00 di Ruang 204'.",
    "",
    "3. 'SCHEDULE_OVERRIDE':",
    "   - Pengguna mengumumkan pemindahan jadwal, perubahan jam kuliah, ganti ruangan, atau jadwal pengganti untuk suatu tanggal tertentu.",
    "   - Contoh: 'Kuliah Basis Data besok dipindah ke jam 13:00 di Ruang 402 ya', 'Kelas Matdis hari Senin nanti diganti jam 14:00 di Zoom'.",
    "",
    "ATURAN PERHITUNGAN DEADLINE / TANGGAL:",
    "- Jadikan waktu referensi saat ini sebagai patokan dasar tanggal, hari, dan jam.",
    "- 'besok' = H+1 dari tanggal referensi. 'lusa' = H+2 dari tanggal referensi.",
    "- Nama hari (misal 'hari Jumat ini', 'Senin depan') dihitung tanggalnya relatif terhadap waktu referensi saat ini.",
    "- Konversi jam informal ke format 24 jam (contoh: 'jam 7 malam' -> 19:00, 'jam 2 siang' -> 14:00, 'jam 8 pagi' -> 08:00 WITA).",
    "- Untuk TASK_CREATE: jika pengguna tidak menyebut jam sama sekali, set jam default 23:59 WITA. Jika tidak ada tanggal/waktu deadline sama sekali, set deadline: null.",
    "- Untuk SCHEDULE_CREATE: ekstrak array 'days' (0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu). Default start_time '08:00' dan end_time '09:40' jika tidak disebut.",
    "- Untuk SCHEDULE_OVERRIDE: hitung 'target_date' dalam format YYYY-MM-DD WITA relatif terhadap referensi saat ini.",
    "",
    "FORMAT JSON WAJIB (HANYA JSON MURNI TANPA MARKDOWN / PENJELASAN):",
    "{",
    '  "intent": "TASK_CREATE" | "SCHEDULE_CREATE" | "SCHEDULE_OVERRIDE",',
    '  "task": {',
    '    "course_name": "Nama mata kuliah yang disebutkan (atau Umum jika tidak ada)",',
    '    "title": "Judul spesifik tugas kuliah",',
    '    "deadline": "Format YYYY-MM-DD HH:mm (WITA) atau null jika tidak disebutkan",',
    '    "description": "Instruksi khusus atau catatan rincian (kosong jika tidak ada)",',
    '    "submission_url": "Tempat pengumpulan yang disebutkan (contoh: Google Drive, Email, E-Learning, Hardcopy, dll)"',
    '  },',
    '  "schedule": {',
    '    "title": "Nama mata kuliah atau kegiatan rutin",',
    '    "category": "kuliah" | "personal" | "rutinitas",',
    '    "days": [1, 3],',
    '    "start_time": "HH:mm",',
    '    "end_time": "HH:mm",',
    '    "location": "Nama ruangan, link meet, atau lokasi (default: Kampus)",',
    '    "recurrence": "weekly" | "biweekly" | "custom"',
    '  },',
    '  "override": {',
    '    "target_title": "Nama mata kuliah yang jadwalnya dipindahkan",',
    '    "target_date": "Format YYYY-MM-DD",',
    '    "new_start_time": "HH:mm",',
    '    "new_end_time": "HH:mm atau null",',
    '    "new_location": "Nama ruangan / link baru (atau null jika sama)",',
    '    "note": "Catatan singkat pemindahan jadwal (atau null)"',
    '  }',
    "}",
    "",
    "Jika input sama sekali tidak berkaitan dengan tugas, jadwal rutin, atau pemindahan jadwal kuliah, kembalikan:",
    '{\n  "error": "not_a_task"\n}',
  ].join("\n");
}

export const SYSTEM_PROMPT = getDynamicSystemPrompt();

export function isBotSelfEchoMessage(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    t.startsWith("✨ *Tugas Kuliah Berhasil Dicatat!") ||
    t.startsWith("🗓️ *Jadwal Rutin Berhasil Disimpan!") ||
    t.startsWith("📢 *PENGUMUMAN PERUBAHAN JADWAL KULIAH*") ||
    t.startsWith("🔥 *PERINGATAN DARURAT") ||
    t.startsWith("⚠️ *PERINGATAN") ||
    t.startsWith("🔥 *PENGINGAT") ||
    t.startsWith("🌱 *PENGINGAT") ||
    t.startsWith("⏳ *PENGINGAT") ||
    t.startsWith("📚 *DAFTAR TUGAS KULIAH AKTIF*") ||
    t.startsWith("📅 *REKAP JADWAL KULIAH MINGGU INI*") ||
    t.startsWith("⛔ *Akses Ditolak*") ||
    t.startsWith("✨ *Halo! Ini Bot Asisten Jadwalku*")
  );
}

/**
 * Ekstraksi Multi-Intent dari Rekaman Suara (Voice Note)
 */
export async function extractIntentFromAudio(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<AiExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di environment variables.");
  }

  const base64Audio = audioBuffer.toString("base64");
  const uniqueModels = [...new Set(SUPPORTED_GEMINI_MODELS)];

  let rawJsonText = "";
  let lastError: Error | null = null;
  const systemPrompt = getDynamicSystemPrompt();

  for (const model of uniqueModels) {
    try {
      const geminiUrl =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        apiKey;

      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Audio,
                    },
                  },
                  {
                    text: "Dengarkan pesan suara ini dan tentukan apakah ini tugas, jadwal rutin baru, atau pemindahan jadwal. Ekstrak ke format JSON murni.",
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: "application/json",
            },
          }),
        },
        FETCH_TIMEOUT_MS
      );

      if (!res.ok) {
        throw new Error("Gemini API HTTP " + res.status + ": " + (await res.text()));
      }

      const json = await res.json();
      rawJsonText = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (rawJsonText) break;
    } catch (err) {
      lastError = err as Error;
      console.warn("[jadwalku-ai] Model " + model + " failed on audio, trying fallback:", err);
    }
  }

  if (!rawJsonText) {
    throw lastError || new Error("Gagal mendapatkan respons dari Gemini Flash AI.");
  }

  return parseExtractedResult(rawJsonText);
}

/**
 * Ekstraksi Multi-Intent dari Teks Bebas
 */
export async function extractIntentFromText(text: string): Promise<AiExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di environment variables.");
  }

  const uniqueModels = [...new Set(SUPPORTED_GEMINI_MODELS)];
  let rawJsonText = "";
  let lastError: Error | null = null;
  const systemPrompt = getDynamicSystemPrompt();

  for (const model of uniqueModels) {
    try {
      const geminiUrl =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        apiKey;

      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              {
                role: "user",
                parts: [{ text }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: "application/json",
            },
          }),
        },
        FETCH_TIMEOUT_MS
      );

      if (!res.ok) {
        throw new Error("Gemini API HTTP " + res.status + ": " + (await res.text()));
      }

      const json = await res.json();
      rawJsonText = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (rawJsonText) break;
    } catch (err) {
      lastError = err as Error;
      console.warn("[jadwalku-ai] Model " + model + " failed on text, trying fallback:", err);
    }
  }

  if (!rawJsonText) {
    throw lastError || new Error("Gagal memproses teks dengan Gemini Flash.");
  }

  return parseExtractedResult(rawJsonText);
}

// Backward-compatible wrappers for tasks
export async function extractTaskFromVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<ExtractedTask> {
  const res = await extractIntentFromAudio(audioBuffer, mimeType);
  if (res.error === "not_a_task" || !res.task) {
    return {
      course_name: "",
      title: "",
      deadline: "",
      error: "not_a_task",
    };
  }
  return res.task;
}

export async function extractTaskFromText(text: string): Promise<ExtractedTask> {
  const res = await extractIntentFromText(text);
  if (res.error === "not_a_task" || !res.task) {
    return {
      course_name: "",
      title: "",
      deadline: "",
      error: "not_a_task",
    };
  }
  return res.task;
}

export function parseExtractedResult(rawText: string): AiExtractionResult {
  let clean = rawText.trim();
  if (clean.startsWith("```json")) {
    clean = clean.slice(7);
  } else if (clean.startsWith("```")) {
    clean = clean.slice(3);
  }
  if (clean.endsWith("```")) {
    clean = clean.slice(0, -3);
  }
  clean = clean.trim();

  const parsed = JSON.parse(clean);

  if (parsed.error === "not_a_task") {
    return {
      intent: "TASK_CREATE",
      error: "not_a_task",
    };
  }

  const intent: AiIntentType =
    parsed.intent === "SCHEDULE_CREATE" || parsed.intent === "SCHEDULE_OVERRIDE"
      ? parsed.intent
      : "TASK_CREATE";

  let task: ExtractedTask | undefined;
  if (intent === "TASK_CREATE" || parsed.task) {
    const rawTask = parsed.task || parsed;
    const title = rawTask.title || rawTask.name || "Tugas Kuliah";
    const rawDeadline =
      rawTask.deadline && rawTask.deadline !== "null" ? String(rawTask.deadline).trim() : "";
    task = {
      course_name: (rawTask.course_name && String(rawTask.course_name).trim()) || "Umum",
      title,
      name: title,
      deadline: rawDeadline,
      is_estimated_deadline: !rawDeadline,
      description: rawTask.description || "",
      submission_url: rawTask.submission_url || "E-Learning",
    };
  }

  let schedule: ExtractedSchedule | undefined;
  if (intent === "SCHEDULE_CREATE" && parsed.schedule) {
    const s = parsed.schedule;
    const days =
      Array.isArray(s.days) && s.days.length > 0
        ? s.days.map(Number).filter((d: number) => !isNaN(d) && d >= 0 && d <= 6)
        : [1];
    schedule = {
      title: s.title || "Kuliah",
      category: s.category || "kuliah",
      days,
      start_time: s.start_time || "08:00",
      end_time: s.end_time || "09:40",
      location: s.location || "Kampus",
      recurrence: s.recurrence || "weekly",
      notes: s.notes || "",
    };
  }

  let override: ExtractedScheduleOverride | undefined;
  if (intent === "SCHEDULE_OVERRIDE" && parsed.override) {
    const o = parsed.override;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDateStr = tomorrow.toISOString().slice(0, 10);
    override = {
      target_title: o.target_title || o.course_name || "Kuliah",
      target_date: o.target_date || defaultDateStr,
      new_start_time: o.new_start_time || "08:00",
      new_end_time: o.new_end_time || undefined,
      new_location: o.new_location || undefined,
      note: o.note || "Pemindahan jadwal kuliah",
    };
  }

  return {
    intent,
    task,
    schedule,
    override,
  };
}

export async function saveTaskToFirestore(
  extracted: ExtractedTask,
  rawSourceMessage: string,
  senderInfo?: {
    senderPhone?: string;
    senderName?: string;
    chatId?: string;
    isGroup?: boolean;
  }
): Promise<Task> {
  const db = getAdminDb();

  let isEstimated = Boolean(extracted.is_estimated_deadline);
  let deadlineVal: Date | null = null;
  if (extracted.deadline && extracted.deadline !== "null") {
    deadlineVal = parseDeadlineString(extracted.deadline);
  }

  if (!deadlineVal) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    defaultDate.setHours(23, 59, 0, 0);
    deadlineVal = defaultDate;
    isEstimated = true;
  }

  const isVoice =
    rawSourceMessage.includes("Voice Note") || rawSourceMessage.includes("Pesan Suara");
  const taskTitle = extracted.title || extracted.name || "Tugas Kuliah";
  const courseName = (extracted.course_name && extracted.course_name.trim()) || "Umum";
  const deadlineIso = deadlineVal.toISOString();

  // Eskalasi Pengingat & Kunci Milestone Terlewat
  const now = new Date();
  const diffMs = deadlineVal.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = getTaskDeadlineDiffDays(deadlineVal, now);

  const remindersSent: string[] = [];
  if (diffHours < 24) {
    // Input H-1 (< 24 Jam): Kunci milestone harian
    remindersSent.push("h5", "h3", "h1", "today");
    if (diffHours <= 15) remindersSent.push("h_15");
    if (diffHours <= 10) remindersSent.push("h_10");
    if (diffHours <= 5) remindersSent.push("h_5");
  } else if (diffDays !== null && diffDays <= 5 && diffDays >= 2) {
    // Input H-5 s/d H-2: Kunci milestone terlewat
    if (diffDays <= 5) remindersSent.push("h5");
    if (diffDays <= 3) remindersSent.push("h3");
  }

  const taskData: Omit<Task, "id"> = {
    title: taskTitle,
    name: taskTitle,
    course_name: courseName,
    subject_name: courseName,
    deadline: deadlineVal,
    deadline_date: deadlineIso,
    description: extracted.description || "",
    submission_url: extracted.submission_url || "E-Learning",
    lms_url: extracted.submission_url || "E-Learning",
    status: "pending",
    type: "tugas_kuliah",
    is_archived: false,
    is_estimated_deadline: isEstimated,
    created_via_voice: isVoice,
    created_by: senderInfo?.senderName || senderInfo?.senderPhone || "WhatsApp Bot",
    sender_phone: senderInfo?.senderPhone || "",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    reminders_sent: remindersSent,
  };

  const docRef = await db.collection("jadwalku_tasks").add(taskData);

  return {
    id: docRef.id,
    ...taskData,
  };
}

export async function saveScheduleToFirestore(
  extracted: ExtractedSchedule,
  senderInfo?: {
    senderPhone?: string;
    senderName?: string;
    chatId?: string;
    isGroup?: boolean;
  }
): Promise<RecurringSchedule> {
  const db = getAdminDb();

  const scheduleData: Omit<RecurringSchedule, "id"> = {
    title: extracted.title || "Kuliah",
    category: extracted.category || "kuliah",
    days: extracted.days || [1],
    start_time: extracted.start_time || "08:00",
    end_time: extracted.end_time || "09:40",
    location: extracted.location || "Kampus",
    recurrence: extracted.recurrence || "weekly",
    overrides: {},
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    created_by: senderInfo?.senderName || senderInfo?.senderPhone || "WhatsApp Bot",
  };

  const docRef = await db.collection("jadwalku_schedules").add(scheduleData);
  return {
    id: docRef.id,
    ...scheduleData,
  };
}

export async function applyScheduleOverrideToFirestore(
  override: ExtractedScheduleOverride
): Promise<{ schedule: RecurringSchedule; override: ScheduleOverride } | null> {
  const db = getAdminDb();
  const snap = await db.collection("jadwalku_schedules").get();

  if (snap.empty) {
    const targetDate = override.target_date;
    const targetDay = new Date(targetDate).getDay();
    const newScheduleData: Omit<RecurringSchedule, "id"> = {
      title: override.target_title,
      category: "kuliah",
      days: [isNaN(targetDay) ? 1 : targetDay],
      start_time: override.new_start_time || "08:00",
      end_time: override.new_end_time || "09:40",
      location: override.new_location || "Kampus",
      recurrence: "weekly",
      overrides: {
        [override.target_date]: {
          date: override.target_date,
          start_time: override.new_start_time,
          end_time: override.new_end_time,
          location: override.new_location,
          note: override.note,
        },
      },
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      created_by: "WhatsApp Bot (Override)",
    };
    const docRef = await db.collection("jadwalku_schedules").add(newScheduleData);
    return {
      schedule: { id: docRef.id, ...newScheduleData },
      override: newScheduleData.overrides![override.target_date],
    };
  }

  const queryTitle = override.target_title.toLowerCase().trim();
  let foundDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  for (const doc of snap.docs) {
    const sTitle = String(doc.data().title || "").toLowerCase().trim();
    if (sTitle === queryTitle || sTitle.includes(queryTitle) || queryTitle.includes(sTitle)) {
      foundDoc = doc;
      break;
    }
  }

  if (!foundDoc) {
    foundDoc = snap.docs[0];
  }

  const existingData = foundDoc.data() as Omit<RecurringSchedule, "id">;
  const overrideObj: ScheduleOverride = {
    date: override.target_date,
    start_time: override.new_start_time || existingData.start_time,
    end_time: override.new_end_time || existingData.end_time,
    location: override.new_location || existingData.location,
    note: override.note || "Pemindahan jadwal kuliah",
  };

  await db.collection("jadwalku_schedules").doc(foundDoc.id).update({
    [`overrides.${override.target_date}`]: overrideObj,
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    schedule: { ...existingData, id: foundDoc.id },
    override: overrideObj,
  };
}

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function buildFriendlyTaskConfirmationMessage(
  task: Task,
  senderType: string | null = "owner",
  senderName?: string
): string {
  const deadlineStr = formatWitaDate(task.deadline || task.deadline_date);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://jadwalku.vercel.app";

  let greeting = "Halo!";
  if (senderType === "partner") {
    greeting = "Halo sayang! 💕";
  } else if (senderType === "owner") {
    greeting = "Halo! 📚";
  } else if (senderType === "couple_group") {
    greeting = "Halo " + (senderName || "kalian berdua") + "! ✨";
  }

  // Hitung Badge Eskalasi Peringatan untuk 1 Bubble Chat Gabungan
  let urgencyHeaderBadge = "";
  const now = new Date();
  const deadlineDate = task.deadline_date ? new Date(task.deadline_date) : null;

  if (deadlineDate && !isNaN(deadlineDate.getTime())) {
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = getTaskDeadlineDiffDays(deadlineDate, now);

    if (diffHours < 24 && diffHours >= 0) {
      const remainingHours = Math.max(1, Math.round(diffHours));
      urgencyHeaderBadge = `🔥 *PERINGATAN DARURAT: Tenggat sisa ${remainingHours} jam lagi!* 🔥`;
    } else if (diffDays !== null && diffDays <= 5 && diffDays >= 2) {
      urgencyHeaderBadge = `⚠️ *PERINGATAN: Tugas sudah H-${diffDays}!* ⚠️`;
    }
  }

  const estimatedNote = task.is_estimated_deadline
    ? [
        "",
        "⚠️ *Catatan:* Deadline belum kamu sebutkan, jadi bot pasang perkiraan 3 hari lagi. Bisa kamu sesuaikan kapan saja lewat web ya!",
      ]
    : [];

  return [
    ...(urgencyHeaderBadge ? [urgencyHeaderBadge, ""] : []),
    "✨ *Tugas Kuliah Berhasil Dicatat!* 📝",
    "",
    greeting + " Tugas barumu sudah otomatis tersimpan ke jadwal:",
    "📚 *Mata Kuliah:* " + (task.course_name || "Umum"),
    "📝 *Tugas:* " + (task.title || task.name),
    "⏰ *Tenggat:* " + deadlineStr + (task.is_estimated_deadline ? " _(Perkiraan 3 Hari)_" : ""),
    ...(task.description ? ["📌 *Rincian:* " + task.description] : []),
    "🔗 *Tempat Kumpul:* " + (task.lms_url || task.submission_url || "E-Learning"),
    ...estimatedNote,
    "",
    "Semangat belajarnya ya, jangan lupa dicicil biar gak begadang! 🥰💪",
    "👉 Cek jadwal web: " + appUrl,
  ].join("\n");
}

export function buildScheduleConfirmationMessage(
  schedule: RecurringSchedule,
  senderType: string | null = "owner",
  senderName?: string
): string {
  const daysText = schedule.days.map((d) => DAY_NAMES[d] || `Hari ${d}`).join(", ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://jadwalku.vercel.app";

  return [
    "🗓️ *Jadwal Rutin Berhasil Disimpan!* ✨",
    "",
    `Halo ${senderName || "kalian"}! Jadwal kuliah / rutinitas baru sudah dicatat:`,
    `📚 *Kegiatan / Matkul:* ${schedule.title}`,
    `🏷️ *Kategori:* ${schedule.category.toUpperCase()}`,
    `📅 *Hari:* Setiap ${daysText}`,
    `⏰ *Waktu:* ${schedule.start_time} - ${schedule.end_time} WITA`,
    `📍 *Lokasi / Ruang:* ${schedule.location || "Kampus"}`,
    `🔁 *Perulangan:* ${schedule.recurrence === "weekly" ? "Tiap Minggu" : schedule.recurrence}`,
    "",
    "Semua jadwal rutin akan otomatis muncul di web & rekap mingguan WhatsApp! 🌸💪",
    `👉 Cek jadwal web: ${appUrl}`,
  ].join("\n");
}

export function buildScheduleOverrideAnnouncementMessage(
  scheduleTitle: string,
  override: ScheduleOverride,
  original?: RecurringSchedule
): string {
  const dateFormatted = formatIndonesianDate(override.date);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://jadwalku.vercel.app";

  const originalTime = original ? `${original.start_time} - ${original.end_time} WITA` : "";
  const originalLoc = original ? original.location : "";

  return [
    "📢 *PENGUMUMAN PERUBAHAN JADWAL KULIAH* 📢",
    "",
    "Perhatian untuk semua, ada pemindahan jadwal:",
    `📚 *Mata Kuliah:* ${scheduleTitle}`,
    `📅 *Tanggal Perubahan:* ${dateFormatted}`,
    `⏰ *Waktu Baru:* ${override.start_time || "Sesuai jadwal"} ${
      override.end_time ? `- ${override.end_time}` : ""
    } WITA`,
    ...(originalTime ? [`   _(Semula: ${originalTime})_`] : []),
    `📍 *Ruangan / Lokasi Baru:* ${override.location || "Kampus"}`,
    ...(originalLoc ? [`   _(Semula: ${originalLoc})_`] : []),
    ...(override.note ? [`📌 *Catatan:* ${override.note}`] : []),
    "",
    "Jadwal di sistem Jadwalku sudah otomatis disesuaikan untuk tanggal tersebut. Jangan sampai salah jadwal ya! 🌸✨",
    `👉 Cek jadwal lengkap: ${appUrl}`,
  ].join("\n");
}
