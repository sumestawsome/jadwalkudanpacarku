import "server-only";

import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { formatWitaDate, parseDeadlineString } from "@/lib/date-utils";
import type { ExtractedTask, Task } from "@/types";

export const FETCH_TIMEOUT_MS = 15000;

export const SUPPORTED_GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-1.5-flash",
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

const SYSTEM_PROMPT = "Kamu adalah asisten pintar pencatat jadwal & tugas kuliah personal/couple untuk Jadwalku.\n" +
"Tugasmu adalah mendengarkan rekaman suara atau membaca teks dan mengekstrak rincian tugas kuliah ke format JSON murni.\n" +
"Tahun dasar saat ini adalah 2026.\n\n" +
"Format JSON WAJIB:\n" +
"{\n" +
'  "course_name": "Nama mata kuliah yang disebutkan (contoh: Basis Data, Matematika Diskrit, atau Umum)",\n' +
'  "title": "Judul spesifik tugas kuliah (contoh: Latihan Soal Halaman 45, Makalah Arsitektur Cloud)",\n' +
'  "deadline": "Format YYYY-MM-DD HH:mm (WITA) jika tanggal/waktu disebutkan. Jika hanya tanggal, set jam ke 23:59. Jika tidak disebutkan, isi null.",\n' +
'  "description": "Instruksi khusus atau catatan yang disebutkan (default: kosong)",\n' +
'  "submission_url": "Tempat pengumpulan yang disebutkan (default: E-Learning)"\n' +
"}\n\n" +
"Jika input tidak berisi informasi tugas kuliah sama sekali, kembalikan:\n" +
'{\n  "error": "not_a_task"\n}';

export function isBotSelfEchoMessage(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    t.startsWith("✨ *Tugas Kuliah Berhasil Dicatat!") ||
    t.startsWith("🔥 *PENGINGAT") ||
    t.startsWith("🌱 *PENGINGAT") ||
    t.startsWith("⚠️ *PENGINGAT") ||
    t.startsWith("⏳ *PENGINGAT") ||
    t.startsWith("📚 *DAFTAR TUGAS KULIAH AKTIF*") ||
    t.startsWith("⛔ *Akses Ditolak*") ||
    t.startsWith("✨ *Halo! Ini Bot Asisten Jadwalku*")
  );
}

export async function extractTaskFromVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<ExtractedTask> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di environment variables.");
  }

  const base64Audio = audioBuffer.toString("base64");
  const uniqueModels = [...new Set(SUPPORTED_GEMINI_MODELS)];

  let rawJsonText = "";
  let lastError: Error | null = null;

  for (const model of uniqueModels) {
    try {
      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
                    text: "Dengarkan pesan suara ini dan ekstrak tugas kuliah ke format JSON murni.",
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
      console.warn("[jadwalku-ai] Model " + model + " failed, trying fallback:", err);
    }
  }

  if (!rawJsonText) {
    throw lastError || new Error("Gagal mendapatkan respons dari Gemini Flash AI.");
  }

  return parseExtractedJson(rawJsonText);
}

export async function extractTaskFromText(text: string): Promise<ExtractedTask> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di environment variables.");
  }

  const uniqueModels = [...new Set(SUPPORTED_GEMINI_MODELS)];
  let rawJsonText = "";
  let lastError: Error | null = null;

  for (const model of uniqueModels) {
    try {
      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
      console.warn("[jadwalku-ai] Model " + model + " failed on text extraction:", err);
    }
  }

  if (!rawJsonText) {
    throw lastError || new Error("Gagal memproses teks dengan Gemini Flash.");
  }

  return parseExtractedJson(rawJsonText);
}

function parseExtractedJson(rawText: string): ExtractedTask {
  let clean = rawText.trim();
  if (clean.startsWith('```json')) {
    clean = clean.slice(7);
  } else if (clean.startsWith('```')) {
    clean = clean.slice(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.slice(0, -3);
  }
  clean = clean.trim();

  const parsed = JSON.parse(clean);

  if (parsed.error === "not_a_task") {
    return {
      course_name: "",
      title: "",
      deadline: "",
      error: "not_a_task",
    };
  }

  const title = parsed.title || parsed.name || "Tugas Kuliah";

  return {
    course_name: parsed.course_name || "Umum",
    title,
    name: title,
    deadline: parsed.deadline || "",
    description: parsed.description || "",
    submission_url: parsed.submission_url || "E-Learning",
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

  let deadlineVal: Date | null = null;
  if (extracted.deadline) {
    deadlineVal = parseDeadlineString(extracted.deadline);
  }

  if (!deadlineVal) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    defaultDate.setHours(23, 59, 0, 0);
    deadlineVal = defaultDate;
  }

  const isVoice = rawSourceMessage.includes("Voice Note") || rawSourceMessage.includes("Pesan Suara");
  const taskTitle = extracted.title || extracted.name || "Tugas Kuliah";
  const deadlineIso = deadlineVal.toISOString();

  const taskData: Omit<Task, "id"> = {
    title: taskTitle,
    name: taskTitle,
    course_name: extracted.course_name,
    subject_name: extracted.course_name,
    deadline: deadlineVal,
    deadline_date: deadlineIso,
    description: extracted.description || "",
    submission_url: extracted.submission_url || "E-Learning",
    lms_url: extracted.submission_url || "E-Learning",
    status: "pending",
    type: "tugas_kuliah",
    is_archived: false,
    created_via_voice: isVoice,
    created_by: senderInfo?.senderName || senderInfo?.senderPhone || "WhatsApp Bot",
    sender_phone: senderInfo?.senderPhone || "",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    reminders_sent: [],
  };

  const docRef = await db.collection("jadwalku_tasks").add(taskData);

  return {
    id: docRef.id,
    ...taskData,
  };
}

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

  return [
    "✨ *Tugas Kuliah Berhasil Dicatat!* 📝",
    "",
    greeting + " Tugas barumu sudah otomatis tersimpan ke jadwal:",
    "📚 *Mata Kuliah:* " + (task.course_name || "Umum"),
    "📝 *Tugas:* " + (task.title || task.name),
    "⏰ *Tenggat:* " + deadlineStr,
    ...(task.description ? ["📌 *Rincian:* " + task.description] : []),
    "🔗 *Tempat Kumpul:* " + (task.lms_url || task.submission_url || "E-Learning"),
    "",
    "Semangat belajarnya ya, jangan lupa dicicil biar gak begadang! 🥰💪",
    "👉 Cek jadwal web: " + appUrl,
  ].join("\n");
}
