export type TaskStatus =
  | "belum_dimulai"
  | "sedang_dikerjakan"
  | "selesai"
  | "archived"
  | "pending"
  | "in_progress"
  | "completed";

export type TaskPriority = "rendah" | "sedang" | "tinggi" | "kritis";

export interface Task {
  id: string;
  name?: string;
  title?: string;
  course_name?: string;
  subject_name?: string;
  deadline?: unknown;
  deadline_date?: string | null;
  description?: string;
  submission_url?: string;
  submission_link?: string;
  lms_url?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  type?: string;
  is_archived?: boolean;
  is_estimated_deadline?: boolean;
  created_via_voice?: boolean;
  created_by?: string;
  sender_phone?: string;
  created_at?: unknown;
  updated_at?: unknown;
  archived_at?: unknown;
  last_reminder_at?: unknown;
  reminders_sent?: string[];
}

export interface ExtractedTask {
  course_name: string;
  name?: string;
  title?: string;
  deadline?: string;
  is_estimated_deadline?: boolean;
  description?: string;
  submission_url?: string;
  error?: string;
}

export interface NormalizedIncomingWhatsAppMessage {
  provider: "green-api";
  message: string;
  sender: string;
  senderName?: string;
  groupId?: string;
  isGroup: boolean;
  rawMessageId?: string;
  timestamp?: number | string;
  url?: string;
  mediaUrl?: string;
  attachment?: string;
  filename?: string;
  filetype?: string;
  messageType?: string;
  extension?: string;
}

// ============================================================================
// MODUL JADWAL RUTIN KULIAH & RUTINITAS (RECURRING SCHEDULES)
// ============================================================================
export type ScheduleCategory = "kuliah" | "personal" | "rutinitas";
export type ScheduleRecurrence = "weekly" | "biweekly" | "custom";

export interface ScheduleOverride {
  date: string; // Format YYYY-MM-DD
  start_time?: string;
  end_time?: string;
  location?: string;
  note?: string;
}

export interface RecurringSchedule {
  id: string;
  title: string;
  category: ScheduleCategory;
  days: number[]; // 0 = Minggu, 1 = Senin, 2 = Selasa, 3 = Rabu, 4 = Kamis, 5 = Jumat, 6 = Sabtu
  start_time: string; // Format "HH:mm"
  end_time: string; // Format "HH:mm"
  location: string;
  recurrence: ScheduleRecurrence;
  overrides?: Record<string, ScheduleOverride>;
  created_at?: unknown;
  updated_at?: unknown;
  created_by?: string;
}

// Multi-Intent AI Extractor Types
export type AiIntentType = "TASK_CREATE" | "SCHEDULE_CREATE" | "SCHEDULE_OVERRIDE";

export interface ExtractedSchedule {
  title: string;
  category?: ScheduleCategory;
  days: number[];
  start_time: string;
  end_time: string;
  location: string;
  recurrence: ScheduleRecurrence;
  notes?: string;
}

export interface ExtractedScheduleOverride {
  target_title: string;
  target_date: string; // YYYY-MM-DD
  new_start_time?: string;
  new_end_time?: string;
  new_location?: string;
  note?: string;
}

export interface AiExtractionResult {
  intent: AiIntentType;
  task?: ExtractedTask;
  schedule?: ExtractedSchedule;
  override?: ExtractedScheduleOverride;
  error?: string;
}

