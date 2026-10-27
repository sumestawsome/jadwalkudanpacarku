import type { Metadata } from "next";
import { getAdminDb } from "@/lib/server/firebase-admin";
import { ScheduleView } from "@/components/schedule/schedule-view";
import type { Task } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Jadwal & Tugas Kuliah | Jadwalku",
  description: "Kalender interaktif dan jadwal tenggat tugas kuliah.",
};

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

export default async function HomePage() {
  let initialTasks: Task[] = [];

  try {
    const db = getAdminDb();
    const snap = await db
      .collection("jadwalku_tasks")
      .where("is_archived", "==", false)
      .get();

    const tasks: Task[] = [];
    snap.forEach((doc) => {
      try {
        const raw = doc.data();
        const clean = sanitizeFirestoreValue(raw) as Record<string, unknown>;
        tasks.push({
          id: doc.id,
          ...clean,
        } as Task);
      } catch (docErr) {
        console.warn(`[HomePage] Skipping doc ${doc.id}:`, docErr);
      }
    });

    tasks.sort((a, b) => {
      const ta = a.deadline_date ? new Date(a.deadline_date).getTime() : Infinity;
      const tb = b.deadline_date ? new Date(b.deadline_date).getTime() : Infinity;
      return ta - tb;
    });

    initialTasks = JSON.parse(JSON.stringify(tasks));
  } catch (err) {
    console.error("[HomePage] Failed to fetch initial tasks:", err);
    initialTasks = [];
  }

  return <ScheduleView initialTasks={initialTasks} />;
}
