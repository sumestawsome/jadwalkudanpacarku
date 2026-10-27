import { NextResponse, type NextRequest } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/server/firebase-admin";
import { parseDeadlineString } from "@/lib/date-utils";
import type { Task } from "@/types";

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

export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb();
    const includeArchived = request.nextUrl.searchParams.get("archived") === "true";

    let query: FirebaseFirestore.Query = db.collection("jadwalku_tasks");
    if (!includeArchived) {
      query = query.where("is_archived", "==", false);
    }

    const snap = await query.get();
    const tasks: Task[] = [];

    snap.forEach((doc) => {
      try {
        const raw = doc.data();
        const clean = sanitizeFirestoreValue(raw) as Record<string, unknown>;
        tasks.push({
          id: doc.id,
          ...clean,
        } as Task);
      } catch (err) {
        console.warn("Failed to parse task:", doc.id, err);
      }
    });

    tasks.sort((a, b) => {
      const ta = a.deadline_date ? new Date(a.deadline_date).getTime() : Infinity;
      const tb = b.deadline_date ? new Date(b.deadline_date).getTime() : Infinity;
      return ta - tb;
    });

    return NextResponse.json({ ok: true, tasks });
  } catch (err) {
    console.error("Failed to fetch tasks:", err);
    return NextResponse.json({ ok: false, error: String(err), tasks: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Body JSON tidak valid" }, { status: 400 });
    }

    const title = String(body.title || body.name || "").trim() || "Tugas Kuliah";
    const course_name = String(body.course_name || body.subject_name || "Umum").trim() || "Umum";
    const description = String(body.description || "").trim();
    const submission_url = String(body.submission_url || body.lms_url || "E-Learning").trim() || "E-Learning";
    const created_via_voice = Boolean(body.created_via_voice);
    const created_by = String(body.created_by || "Web App").trim();

    let deadlineVal: Date | null = null;
    if (body.deadline) {
      deadlineVal = parseDeadlineString(String(body.deadline));
    }

    if (!deadlineVal) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 3);
      defaultDate.setHours(23, 59, 0, 0);
      deadlineVal = defaultDate;
    }

    const deadlineIso = deadlineVal.toISOString();

    const taskData: Omit<Task, "id"> = {
      title,
      name: title,
      course_name,
      subject_name: course_name,
      deadline: deadlineVal,
      deadline_date: deadlineIso,
      description,
      submission_url,
      lms_url: submission_url,
      status: "pending",
      type: "tugas_kuliah",
      is_archived: false,
      created_via_voice,
      created_by,
      sender_phone: "",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      reminders_sent: [],
    };

    const db = getAdminDb();
    const docRef = await db.collection("jadwalku_tasks").add(taskData);

    const createdTask: Task = {
      id: docRef.id,
      ...taskData,
      deadline: deadlineIso,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, task: createdTask }, { status: 201 });
  } catch (err) {
    console.error("Failed to create task:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
