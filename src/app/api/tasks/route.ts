import { NextResponse, type NextRequest } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
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
