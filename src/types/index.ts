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
