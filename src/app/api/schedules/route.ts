import { NextResponse, type NextRequest } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import type { RecurringSchedule, ScheduleCategory, ScheduleRecurrence, ScheduleOverride } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    if ("toDate" in val && typeof (val as { toDate: () => Date }).toDate === "function") {
      try {
        return (val as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return null;
      }
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeFirestoreValue);
    }
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      cleanObj[k] = sanitizeFirestoreValue(v);
    }
    return cleanObj;
  }
  return val;
}

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("jadwalku_schedules").get();
    const schedules: RecurringSchedule[] = [];

    snap.forEach((doc) => {
      try {
        const raw = doc.data();
        const clean = sanitizeFirestoreValue(raw) as Record<string, unknown>;
        schedules.push({
          id: doc.id,
          title: String(clean.title || "Kuliah"),
          category: (clean.category as ScheduleCategory) || "kuliah",
          days: Array.isArray(clean.days) ? clean.days : [1],
          start_time: String(clean.start_time || "08:00"),
          end_time: String(clean.end_time || "09:40"),
          location: String(clean.location || "Kampus"),
          recurrence: (clean.recurrence as ScheduleRecurrence) || "weekly",
          overrides: (clean.overrides as Record<string, ScheduleOverride>) || {},
          created_at: clean.created_at ? String(clean.created_at) : undefined,
          updated_at: clean.updated_at ? String(clean.updated_at) : undefined,
          created_by: clean.created_by ? String(clean.created_by) : undefined,
        });
      } catch (err) {
        console.warn("Failed to parse schedule:", doc.id, err);
      }
    });

    // Urutkan berdasarkan hari pertama dan jam mulai
    schedules.sort((a, b) => {
      const dayA = Array.isArray(a.days) && a.days.length > 0 ? a.days[0] : 7;
      const dayB = Array.isArray(b.days) && b.days.length > 0 ? b.days[0] : 7;
      if (dayA !== dayB) return dayA - dayB;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });

    return NextResponse.json({ ok: true, schedules });
  } catch (err) {
    console.error("Failed to fetch recurring schedules:", err);
    return NextResponse.json({ ok: false, error: String(err), schedules: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Body JSON tidak valid" }, { status: 400 });
    }

    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "Nama mata kuliah atau kegiatan wajib diisi" }, { status: 400 });
    }

    const category: ScheduleCategory = ["kuliah", "personal", "rutinitas"].includes(body.category)
      ? body.category
      : "kuliah";

    const days: number[] = Array.isArray(body.days) && body.days.length > 0
      ? body.days.map((d: unknown) => Number(d)).filter((d: number) => !isNaN(d) && d >= 0 && d <= 6)
      : [1];

    const start_time = String(body.start_time || "08:00").trim();
    const end_time = String(body.end_time || "09:40").trim();
    const location = String(body.location || "Kampus").trim();
    const recurrence: ScheduleRecurrence = ["weekly", "biweekly", "custom"].includes(body.recurrence)
      ? body.recurrence
      : "weekly";

    const scheduleData: Omit<RecurringSchedule, "id"> = {
      title,
      category,
      days,
      start_time,
      end_time,
      location,
      recurrence,
      overrides: {},
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      created_by: String(body.created_by || "Web App").trim(),
    };

    const db = getAdminDb();
    const docRef = await db.collection("jadwalku_schedules").add(scheduleData);

    const createdSchedule: RecurringSchedule = {
      id: docRef.id,
      ...scheduleData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, schedule: createdSchedule }, { status: 201 });
  } catch (err) {
    console.error("Failed to create recurring schedule:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Schedule ID wajib disertakan" }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection("jadwalku_schedules").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ ok: false, error: "Jadwal tidak ditemukan" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      updated_at: FieldValue.serverTimestamp(),
    };

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.category !== undefined) updates.category = body.category;
    if (Array.isArray(body.days)) updates.days = body.days;
    if (body.start_time !== undefined) updates.start_time = String(body.start_time).trim();
    if (body.end_time !== undefined) updates.end_time = String(body.end_time).trim();
    if (body.location !== undefined) updates.location = String(body.location).trim();
    if (body.recurrence !== undefined) updates.recurrence = body.recurrence;

    // Tambah / Hapus override untuk tanggal tertentu
    if (body.overrideAction === "set" && body.overrideDate && body.overrideData) {
      updates[`overrides.${body.overrideDate}`] = body.overrideData;
    } else if (body.overrideAction === "delete" && body.overrideDate) {
      updates[`overrides.${body.overrideDate}`] = FieldValue.delete();
    }

    await docRef.update(updates);
    return NextResponse.json({ ok: true, message: "Jadwal berhasil diperbarui" });
  } catch (err) {
    console.error("Failed to update recurring schedule:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Schedule ID wajib disertakan" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("jadwalku_schedules").doc(id).delete();

    return NextResponse.json({ ok: true, message: "Jadwal berhasil dihapus" });
  } catch (err) {
    console.error("Failed to delete recurring schedule:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
