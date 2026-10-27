import { NextResponse, type NextRequest } from "next/server";
import { extractTaskFromVoiceNote, extractTaskFromText } from "@/lib/server/ai-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const audioFile = formData.get("audio");

      if (!audioFile || !(audioFile instanceof Blob)) {
        return NextResponse.json(
          { ok: false, error: "File audio tidak ditemukan dalam request form-data." },
          { status: 400 }
        );
      }

      const mimeType = audioFile.type || "audio/webm";
      const arrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Ukuran rekaman audio kosong (0 bytes)." },
          { status: 400 }
        );
      }

      const extracted = await extractTaskFromVoiceNote(buffer, mimeType);

      if (extracted.error === "not_a_task") {
        return NextResponse.json({
          ok: false,
          error: "Audio tidak terdeteksi sebagai rincian tugas kuliah.",
          extracted,
        });
      }

      return NextResponse.json({ ok: true, extracted });
    }

    if (contentType.includes("application/json")) {
      const body = await request.json();

      if (body.audioBase64) {
        const buffer = Buffer.from(body.audioBase64, "base64");
        const mimeType = body.mimeType || "audio/webm";
        const extracted = await extractTaskFromVoiceNote(buffer, mimeType);

        if (extracted.error === "not_a_task") {
          return NextResponse.json({
            ok: false,
            error: "Audio tidak terdeteksi sebagai rincian tugas kuliah.",
            extracted,
          });
        }

        return NextResponse.json({ ok: true, extracted });
      }

      if (body.text) {
        const extracted = await extractTaskFromText(String(body.text));

        if (extracted.error === "not_a_task") {
          return NextResponse.json({
            ok: false,
            error: "Teks tidak terdeteksi sebagai rincian tugas kuliah.",
            extracted,
          });
        }

        return NextResponse.json({ ok: true, extracted });
      }

      return NextResponse.json(
        { ok: false, error: "Harap sertakan file audio atau teks untuk diekstrak." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Content-Type harus multipart/form-data atau application/json." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[jadwalku-extract] Extraction error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Gagal memproses ekstraksi AI." },
      { status: 500 }
    );
  }
}
