import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { sendGreenApiTextMessage } from "@/lib/server/green-api";
import { isAuthorizedChat, getAuthorizedSenderType } from "@/lib/server/auth-check";
import {
  extractTaskFromVoiceNote,
  extractTaskFromText,
  saveTaskToFirestore,
  buildFriendlyTaskConfirmationMessage,
  isBotSelfEchoMessage,
} from "@/lib/server/ai-extractor";
import { getTaskDeadlineDiffDays } from "@/lib/task-risk";
import { formatIndonesianDate } from "@/lib/date-utils";
import type { Task } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// In-memory dedupe lock cache (TTL 10 menit)
const inMemoryDedupeLocks = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredMemoryLocks(now: number) {
  for (const [key, expiresAt] of inMemoryDedupeLocks.entries()) {
    if (now > expiresAt) {
      inMemoryDedupeLocks.delete(key);
    }
  }
}

export async function GET() {
  return NextResponse.json({
    status: "success",
    service: "Jadwalku WhatsApp Webhook",
    provider: "green-api",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    const rawText = await request.text();
    if (!rawText) {
      return NextResponse.json({ status: "success", ignored: true, reason: "empty_body" });
    }
    payload = JSON.parse(rawText);
  } catch (err) {
    console.error("[jadwalku-webhook] Failed to parse JSON:", err);
    return NextResponse.json({ status: "success", ignored: true, error: "invalid_json" });
  }

  const typeWebhook = String(payload?.typeWebhook || "").trim();
  if (typeWebhook !== "incomingMessageReceived") {
    return NextResponse.json({
      status: "success",
      ignored: true,
      reason: `ignored_webhook_type_${typeWebhook || "unknown"}`,
    });
  }

  const senderData = (payload.senderData && typeof payload.senderData === "object"
    ? payload.senderData
    : {}) as Record<string, unknown>;

  const instanceData = (payload.instanceData && typeof payload.instanceData === "object"
    ? payload.instanceData
    : {}) as Record<string, unknown>;

  const messageData = (payload.messageData && typeof payload.messageData === "object"
    ? payload.messageData
    : {}) as Record<string, unknown>;

  const textMessageData = (messageData.textMessageData && typeof messageData.textMessageData === "object"
    ? messageData.textMessageData
    : {}) as Record<string, unknown>;

  const extendedTextMessageData = (
    messageData.extendedTextMessageData && typeof messageData.extendedTextMessageData === "object"
      ? messageData.extendedTextMessageData
      : {}
  ) as Record<string, unknown>;

  const fileMessageData = (messageData.fileMessageData && typeof messageData.fileMessageData === "object"
    ? messageData.fileMessageData
    : {}) as Record<string, unknown>;

  const textMessage = String(
    textMessageData.textMessage ||
    extendedTextMessageData.text ||
    fileMessageData.caption ||
    messageData.caption ||
    ""
  ).trim();

  // Fast exit jika pesan bot sendiri
  if (isBotSelfEchoMessage(textMessage)) {
    return NextResponse.json({ status: "ignored_bot_output" }, { status: 200 });
  }

  const rawChatId = String(senderData.chatId || payload.chatId || "").trim();
  const isGroup = rawChatId.endsWith("@g.us");
  const rawSender = String(senderData.sender || payload.sender || (!isGroup ? rawChatId : "")).trim();
  const senderName = String(senderData.senderName || senderData.senderContactName || "").trim();

  const cleanSender = rawSender
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@g\.us$/i, "")
    .replace(/[^\d]/g, "")
    .replace(/^0/, "62");

  // Safeguard jangan sampai memproses pesan dari bot instance sendiri
  const botWid = String(instanceData.wid || "").replace(/[^\d]/g, "");
  if (botWid && cleanSender === botWid) {
    return NextResponse.json({ status: "ignored_bot_self" }, { status: 200 });
  }

  // Verifikasi 3 ruang obrolan sah
  if (!isAuthorizedChat(rawChatId, cleanSender)) {
    console.warn("[jadwalku-webhook] Unauthorized chat rejected:", { rawChatId, cleanSender });
    return NextResponse.json({ status: "ignored_unauthorized_chat" }, { status: 200 });
  }

  const senderType = getAuthorizedSenderType(rawChatId, cleanSender) || "owner";

  // Deduplikasi via idMessage
  const idMessage = String(payload.idMessage || messageData.idMessage || payload.id || "").trim();
  const dedupeKey = idMessage || crypto.createHash("sha256").update([
    "jadwalku",
    rawChatId,
    cleanSender,
    String(payload.timestamp || Date.now()),
  ].join("|")).digest("hex");

  const now = Date.now();
  pruneExpiredMemoryLocks(now);

  if (inMemoryDedupeLocks.has(dedupeKey)) {
    return NextResponse.json({ status: "already_processed" }, { status: 200 });
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection("jadwalku_dedupe").doc(dedupeKey);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data();
      const expiresAt = typeof data?.expires_at === "number" ? data.expires_at : 0;
      if (now < expiresAt) {
        inMemoryDedupeLocks.set(dedupeKey, expiresAt);
        return NextResponse.json({ status: "already_processed" }, { status: 200 });
      }
    }

    inMemoryDedupeLocks.set(dedupeKey, now + DEDUPE_TTL_MS);
    await docRef.set({
      idMessage,
      chatId: rawChatId,
      sender: cleanSender,
      created_at: FieldValue.serverTimestamp(),
      expires_at: now + DEDUPE_TTL_MS,
    }).catch(() => {});
  } catch (err) {
    console.warn("[jadwalku-webhook] Dedupe check fallback to in-memory:", err);
    inMemoryDedupeLocks.set(dedupeKey, now + DEDUPE_TTL_MS);
  }

  const typeMessage = String(messageData.typeMessage || "");
  const downloadUrl = String(fileMessageData.downloadUrl || messageData.downloadUrl || "").trim();
  const mimeType = String(fileMessageData.mimeType || messageData.mimeType || "").trim();
  const fileName = String(fileMessageData.fileName || messageData.fileName || "").trim();

  const isAudio =
    typeMessage === "audioMessage" ||
    typeMessage === "voiceMessage" ||
    (typeMessage === "fileMessage" && (mimeType.toLowerCase().includes("audio") || /\.(ogg|opus|mp3|m4a|wav|aac)(\?.*)?$/i.test(fileName || downloadUrl))) ||
    mimeType.toLowerCase().includes("audio") ||
    /\.(ogg|opus|mp3|m4a|wav|aac)(\?.*)?$/i.test(downloadUrl);

  const senderInfo = {
    senderPhone: cleanSender,
    senderName,
    chatId: rawChatId,
    isGroup,
  };

  // 1. Tangani Audio / Voice Note
  if (isAudio && downloadUrl) {
    try {
      console.log(`[jadwalku-webhook] Downloading voice note from ${rawChatId}...`);
      const audioController = new AbortController();
      const timeoutId = setTimeout(() => audioController.abort(), 18000);

      let audioRes: Response;
      try {
        audioRes = await fetch(downloadUrl, {
          headers: { "User-Agent": "Jadwalku-GreenApi/1.0" },
          signal: audioController.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!audioRes.ok) {
        await sendGreenApiTextMessage(rawChatId, "⚠️ Maaf, bot gagal mengunduh rekaman suara dari WhatsApp. Boleh dicoba kirim ulang ya!");
        return NextResponse.json({ status: "audio_download_failed" }, { status: 200 });
      }

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      const extracted = await extractTaskFromVoiceNote(buffer, mimeType || "audio/ogg");

      if (!extracted || !extracted.title) {
        await sendGreenApiTextMessage(
          rawChatId,
          "Suaramu sudah terdengar jelas, tapi bot belum bisa menangkap detail tugas kuliahnya nih. Coba sebutkan mata kuliah dan deadline-nya lagi ya! ✨"
        );
        return NextResponse.json({ status: "voice_no_task_detected" }, { status: 200 });
      }

      const savedTask = await saveTaskToFirestore(extracted, "[Pesan Suara / Voice Note]", senderInfo);
      const confirmMsg = buildFriendlyTaskConfirmationMessage(savedTask, senderType, senderName);

      await sendGreenApiTextMessage(rawChatId, confirmMsg);
      return NextResponse.json({ status: "success", taskId: savedTask.id }, { status: 200 });
    } catch (audioErr) {
      console.error("[jadwalku-webhook] Voice note handling error:", audioErr);
      await sendGreenApiTextMessage(
        rawChatId,
        "⚠️ Maaf, ada sedikit gangguan saat memproses pesan suara tadi. Silakan coba kirim ulang ya!"
      ).catch(() => {});
      return NextResponse.json({ status: "error", error: String(audioErr) }, { status: 200 });
    }
  }

  // 2. Tangani Perintah Singkat Teks (!jadwal / !tugas / !bantuan)
  const lowerText = textMessage.toLowerCase();

  if (lowerText === "!help" || lowerText === "!bantuan") {
    const helpMsg = [
      "✨ *Halo! Ini Bot Asisten Jadwalku* 📚",
      "",
      "Aku siap bantuin kamu mencatat dan mengingatkan tugas kuliah secara otomatis:",
      "",
      "🎙️ *Kirim Voice Note:*",
      "Tinggal rekam suara kamu, sebutkan mata kuliah, tugasnya apa, dan kapan deadline-nya. Bot akan langsung mencatatnya ke jadwal!",
      "",
      "✍️ *Kirim Teks Langsung:*",
      "Ketik detail tugas dengan santai, misal:",
      '_`Tugas Basis Data buat ERD deadline kamis depan jam 23:59 ya`_',
      "",
      "📌 *Perintah Cepat:*",
      "• `!jadwal` atau `!tugas` : Cek daftar tugas yang belum selesai",
      "• `!bantuan` : Tampilkan petunjuk ini",
      "",
      "💻 Akses kalender lengkap & riwayat di Web Jadwalku!",
    ].join("\n");

    await sendGreenApiTextMessage(rawChatId, helpMsg);
    return NextResponse.json({ status: "success", action: "help_sent" }, { status: 200 });
  }

  if (lowerText === "!jadwal" || lowerText === "!tugas" || lowerText === "!list") {
    try {
      const db = getAdminDb();
      const snapshot = await db.collection("jadwalku_tasks")
        .where("status", "in", ["pending", "in_progress"])
        .get();

      const tasks: Task[] = [];
      snapshot.forEach((doc) => {
        tasks.push({ id: doc.id, ...(doc.data() as Omit<Task, "id">) });
      });

      tasks.sort((a, b) => {
        const da = a.deadline_date ? new Date(a.deadline_date).getTime() : Infinity;
        const dbTime = b.deadline_date ? new Date(b.deadline_date).getTime() : Infinity;
        return da - dbTime;
      });

      if (tasks.length === 0) {
        await sendGreenApiTextMessage(
          rawChatId,
          "🎉 *Hore! Tidak ada tugas yang pending.* Semua tugas sudah beres atau belum ada yang dicatat. Semangat ya! 🌸"
        );
        return NextResponse.json({ status: "success", count: 0 }, { status: 200 });
      }

      const lines = [
        "📚 *DAFTAR TUGAS KULIAH AKTIF* ⏰",
        "Berikut tugas yang masih perlu dikerjakan:",
        "",
      ];

      tasks.forEach((t, i) => {
        const diff = getTaskDeadlineDiffDays(t.deadline_date);
        let badge = "⏳";
        let timeLabel = "";
        if (diff === null) {
          timeLabel = "Tenggat belum diatur";
        } else if (diff < 0) {
          badge = "🚨";
          timeLabel = `Lewat ${Math.abs(diff)} hari`;
        } else if (diff === 0) {
          badge = "🔥";
          timeLabel = "*Hari H (Hari Ini!)*";
        } else if (diff === 1) {
          badge = "⚠️";
          timeLabel = "*Besok! (H-1)*";
        } else {
          timeLabel = `H-${diff}`;
        }

        const dateStr = formatIndonesianDate(t.deadline_date);
        lines.push(`${i + 1}. ${badge} *[${t.course_name}]* ${t.title}`);
        lines.push(`   📅 Tenggat: ${dateStr} (${timeLabel})`);
        if (t.lms_url) {
          lines.push(`   🔗 LMS: ${t.lms_url}`);
        }
        lines.push("");
      });

      lines.push("Yuk dicicil biar santai dan nggak mepet! Semangat terus ya! 💪✨");
      await sendGreenApiTextMessage(rawChatId, lines.join("\n"));
      return NextResponse.json({ status: "success", count: tasks.length }, { status: 200 });
    } catch (listErr) {
      console.error("[jadwalku-webhook] Failed to list tasks:", listErr);
      await sendGreenApiTextMessage(rawChatId, "⚠️ Maaf, gagal memuat daftar tugas saat ini.");
      return NextResponse.json({ status: "error" }, { status: 200 });
    }
  }

  // 3. Tangani Pesan Teks Bebas (Deteksi Tugas AI)
  if (textMessage) {
    if (textMessage.length < 5) {
      return NextResponse.json({ status: "ignored_short_text" }, { status: 200 });
    }

    try {
      console.log(`[jadwalku-webhook] Analyzing text for tasks from ${rawChatId}: "${textMessage.slice(0, 50)}..."`);
      const extracted = await extractTaskFromText(textMessage);

      if (extracted && extracted.title && extracted.title.length > 2) {
        const savedTask = await saveTaskToFirestore(extracted, textMessage, senderInfo);
        const confirmMsg = buildFriendlyTaskConfirmationMessage(savedTask, senderType, senderName);

        await sendGreenApiTextMessage(rawChatId, confirmMsg);
        return NextResponse.json({ status: "success", taskId: savedTask.id }, { status: 200 });
      }

      const triggerWords = ["tugas", "deadline", "kumpul", "kuliah", "pr", "latihan", "makalah", "proyek", "resum"];
      const containsTrigger = triggerWords.some((w) => lowerText.includes(w));

      if (!isGroup && containsTrigger) {
        await sendGreenApiTextMessage(
          rawChatId,
          "Kamu sepertinya mau nyatet tugas ya? 🤔\nBoleh ditulis lebih jelas dengan nama mata kuliah dan perkiraan tanggal/jam deadline-nya, atau langsung kirim pesan suara ya! ✨"
        );
      }

      return NextResponse.json({ status: "no_task_detected" }, { status: 200 });
    } catch (textErr) {
      console.error("[jadwalku-webhook] Text task extraction error:", textErr);
      return NextResponse.json({ status: "error", error: String(textErr) }, { status: 200 });
    }
  }

  return NextResponse.json({ status: "unhandled" }, { status: 200 });
}
