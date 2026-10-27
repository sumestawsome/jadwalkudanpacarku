import type { Task } from "@/types";

function getCalendarDateParts(date: Date, timeZone = "Asia/Makassar") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateString = formatter.format(date); // YYYY-MM-DD
    const [year, month, day] = dateString.split("-").map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    return { year, month, day, dateString, utcMidnight };
  } catch {
    const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      dateString: date.toISOString().slice(0, 10),
      utcMidnight,
    };
  }
}

export function getTaskDeadlineDiffDays(
  taskOrDeadline?: unknown,
  refDate: Date = new Date()
): number | null {
  if (!taskOrDeadline) return null;

  let rawDeadline: unknown = taskOrDeadline;
  if (
    typeof taskOrDeadline === "object" &&
    taskOrDeadline !== null &&
    !(taskOrDeadline instanceof Date) &&
    !("toDate" in (taskOrDeadline as Record<string, unknown>))
  ) {
    const t = taskOrDeadline as Record<string, unknown>;
    rawDeadline = t.deadline_date || t.deadline;
  }

  if (!rawDeadline) return null;

  const deadlineDate =
    typeof rawDeadline === "object" && rawDeadline !== null && "toDate" in rawDeadline
      ? (rawDeadline as { toDate: () => Date }).toDate()
      : rawDeadline instanceof Date
      ? rawDeadline
      : typeof rawDeadline === "string"
      ? new Date(rawDeadline)
      : null;

  if (!deadlineDate || isNaN(deadlineDate.getTime())) return null;

  const tz = (typeof process !== "undefined" && process.env?.APP_TIMEZONE) || "Asia/Makassar";
  const todayCal = getCalendarDateParts(refDate, tz);
  const deadlineCal = getCalendarDateParts(deadlineDate, tz);

  const diffMs = deadlineCal.utcMidnight - todayCal.utcMidnight;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function getRiskLevelFromTask(
  taskOrDeadline?: unknown
): "none" | "yellow" | "orange" | "red" {
  if (!taskOrDeadline) return "none";
  if (
    typeof taskOrDeadline === "object" &&
    taskOrDeadline !== null &&
    !(taskOrDeadline instanceof Date) &&
    !("toDate" in (taskOrDeadline as Record<string, unknown>))
  ) {
    const t = taskOrDeadline as Task;
    if (t.status === "selesai" || t.status === "completed" || t.status === "archived" || t.is_archived) {
      return "none";
    }
  }

  const diffDays = getTaskDeadlineDiffDays(taskOrDeadline);
  if (diffDays === null) return "none";

  if (diffDays <= 1) {
    return "red";
  }
  if (diffDays <= 3) {
    return "orange";
  }
  if (diffDays <= 5) {
    return "yellow";
  }
  return "none";
}
