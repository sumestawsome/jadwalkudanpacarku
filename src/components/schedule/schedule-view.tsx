"use client";

import { useState, useEffect } from "react";
import type { Task } from "@/types";
import { getCalendarGrid, isSameDay } from "@/lib/calendar-utils";
import { getTaskDeadlineDiffDays, getRiskLevelFromTask } from "@/lib/task-risk";
import { formatIndonesianDate } from "@/lib/date-utils";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
  Sun,
  Moon,
  Mic,
  MessageSquare,
  Sparkles,
  BookOpen,
} from "lucide-react";

type Props = {
  initialTasks: Task[];
};

function getTaskDueDate(task: Task): Date | null {
  if (!task.deadline_date) return null;
  const d = new Date(task.deadline_date);
  return isNaN(d.getTime()) ? null : d;
}

function getRiskDotClass(level: "none" | "yellow" | "orange" | "red"): string {
  switch (level) {
    case "red":
      return "bg-rose-500";
    case "orange":
      return "bg-orange-500";
    case "yellow":
      return "bg-amber-400";
    case "none":
    default:
      return "bg-zinc-300 dark:bg-zinc-700";
  }
}

export function ScheduleView({ initialTasks }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : false;

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const setToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const refreshTasks = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/tasks?archived=${showArchived ? "true" : "false"}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.tasks)) {
          setTasks(json.tasks);
        }
      }
    } catch (err) {
      console.warn("Failed to refresh tasks:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const daysGrid = getCalendarGrid(currentYear, currentMonth);

  const getTasksForDay = (day: Date): Task[] => {
    return tasks.filter((task) => {
      const d = getTaskDueDate(task);
      return d ? isSameDay(d, day) : false;
    });
  };

  const filteredTasks = tasks.filter((task) => {
    if (!showArchived && (task.is_archived || task.status === "archived")) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const course = (task.course_name || "").toLowerCase();
      const title = (task.title || "").toLowerCase();
      const desc = (task.description || "").toLowerCase();
      if (!course.includes(q) && !title.includes(q) && !desc.includes(q)) {
        return false;
      }
    }

    if (onlyUrgent) {
      const diff = getTaskDeadlineDiffDays(task.deadline_date);
      if (diff === null || diff > 3) {
        return false;
      }
    }

    if (selectedDate) {
      const d = getTaskDueDate(task);
      if (!d || !isSameDay(d, selectedDate)) {
        return false;
      }
    }

    return true;
  });

  const activeCount = tasks.filter((t) => !t.is_archived && t.status !== "archived").length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* ── Compact & Mobile-First Header ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 sm:size-9 shrink-0 border border-zinc-200 dark:border-zinc-800 bg-indigo-600 text-white rounded-none flex items-center justify-center font-bold">
              <BookOpen className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none truncate">
                  Jadwalku
                </h1>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 leading-none">
                  PERSONAL & COUPLE
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate leading-tight mt-0.5">
                Asisten Pengingat & Jadwal Kuliah Pintar
              </p>
            </div>
          </div>

          {/* Right: Counter Badge + Refresh + Theme Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="px-2 sm:px-2.5 py-1 rounded-none border border-amber-500/40 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 font-mono text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-none">
              <span className="size-1.5 rounded-none bg-amber-500 dark:bg-amber-400" />
              <span>
                {activeCount}{" "}
                <span className="hidden sm:inline">Tugas Aktif</span>
                <span className="sm:hidden">Tugas</span>
              </span>
            </div>

            <button
              type="button"
              onClick={refreshTasks}
              disabled={isRefreshing}
              className="size-8 sm:h-8 sm:px-2.5 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center justify-center sm:gap-1.5 transition-colors cursor-pointer shadow-none disabled:opacity-50"
              title="Segarkan data terbaru"
              aria-label="Segarkan data terbaru"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Memuat..." : "Segarkan"}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="size-8 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer shadow-none"
              title={isDark ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
              aria-label={isDark ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
            >
              {isDark ? (
                <Sun className="size-4 text-amber-500" />
              ) : (
                <Moon className="size-4 text-indigo-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-4">
        {/* ── Filter & Search Toolbar ── */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-2 sm:p-2.5 rounded-none shadow-none flex flex-row items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-3.5 text-zinc-400 dark:text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari mata kuliah, tugas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 sm:h-9 pl-8 pr-2.5 text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 rounded-none focus:outline-none focus:border-indigo-600 shadow-none"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setOnlyUrgent(!onlyUrgent)}
              className={`h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold rounded-none border flex items-center gap-1.5 transition-colors shadow-none cursor-pointer ${
                onlyUrgent
                  ? "bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/50"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Flame className="size-3.5 text-rose-500 shrink-0" />
              <span className="hidden sm:inline">Deadline Mepet (≤ 3 Hari)</span>
              <span className="sm:hidden">Mepet</span>
            </button>

            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold rounded-none border flex items-center gap-1.5 transition-colors shadow-none cursor-pointer ${
                showArchived
                  ? "bg-zinc-800 text-white border-zinc-800 dark:bg-zinc-200 dark:text-zinc-900"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>Riwayat/Arsip</span>
            </button>

            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="h-8 sm:h-9 px-2.5 text-[11px] sm:text-xs font-semibold rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors cursor-pointer shadow-none"
                title="Hapus filter tanggal"
              >
                <span>Reset Tanggal</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Active Date Filter Notice ── */}
        {selectedDate && (
          <div className="border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2 rounded-none flex items-center justify-between gap-2 text-xs text-indigo-900 dark:text-indigo-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <CalendarIcon className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">
                Tugas tanggal:{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                </strong>{" "}
                ({filteredTasks.length} tugas)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs underline font-semibold text-indigo-600 dark:text-indigo-400 hover:opacity-80 shrink-0 cursor-pointer"
            >
              Tampilkan Semua
            </button>
          </div>
        )}

        {/* ── Content Grid: Left Calendar + Right Tasks List ── */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
          {/* ── Left Column: Calendar + WhatsApp Quick Info (5 cols) ── */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-4">
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5 sm:p-4 rounded-none shadow-none space-y-3">
              {/* Calendar Header */}
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {monthNames[currentMonth]} {currentYear}
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="size-7 sm:size-8 rounded-none border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 flex items-center justify-center transition-colors shadow-none cursor-pointer"
                    title="Bulan Sebelumnya"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={setToday}
                    className="h-7 sm:h-8 px-2 rounded-none border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-[11px] font-semibold flex items-center transition-colors shadow-none cursor-pointer"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="size-7 sm:size-8 rounded-none border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 flex items-center justify-center transition-colors shadow-none cursor-pointer"
                    title="Bulan Berikutnya"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              {/* Day Names Header */}
              <div className="grid grid-cols-7 text-center text-[10px] sm:text-[11px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
                <div>Min</div>
                <div>Sen</div>
                <div>Sel</div>
                <div>Rab</div>
                <div>Kam</div>
                <div>Jum</div>
                <div>Sab</div>
              </div>

              {/* 6-Week Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {daysGrid.map((day, idx) => {
                  const isCurrentMonth = day.getMonth() === currentMonth;
                  const isToday = isSameDay(day, new Date());
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const dayTasks = getTasksForDay(day);

                  let maxRisk: "none" | "yellow" | "orange" | "red" = "none";
                  let maxWeight = 0;
                  const weights = { red: 3, orange: 2, yellow: 1, none: 0 };
                  dayTasks.forEach((t) => {
                    const r = getRiskLevelFromTask(t.deadline_date);
                    const w = weights[r] || 0;
                    if (w > maxWeight) {
                      maxWeight = w;
                      maxRisk = r;
                    }
                  });

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDate(null);
                        } else {
                          setSelectedDate(day);
                        }
                      }}
                      className={`relative aspect-square p-1 rounded-none border text-left flex flex-col justify-between transition-colors cursor-pointer shadow-none overflow-hidden ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-600 text-white z-10 font-bold"
                          : isCurrentMonth
                          ? "bg-white dark:bg-zinc-950/70 border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700"
                          : "bg-zinc-100/50 dark:bg-zinc-950/30 border-zinc-200/60 dark:border-zinc-900/60 text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full leading-none">
                        <span
                          className={`text-[11px] font-mono ${
                            isToday
                              ? isSelected
                                ? "bg-white text-indigo-600 px-1 py-0.5 font-bold"
                                : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 px-1 py-0.5 font-bold"
                              : ""
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {dayTasks.length > 0 && (
                          <span
                            className={`size-1.5 rounded-none shrink-0 ${getRiskDotClass(maxRisk)}`}
                            title={`${dayTasks.length} tugas jatuh tempo`}
                          />
                        )}
                      </div>

                      {dayTasks.length > 0 && (
                        <div className="w-full flex justify-end">
                          <span
                            className={`text-[9px] font-mono font-semibold px-1 py-0.2 rounded-none ${
                              isSelected
                                ? "bg-indigo-700 text-white"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                            }`}
                          >
                            {dayTasks.length}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Calendar Legend */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-500">Keterangan:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-none bg-rose-500" />
                  <span>≤ 1 Hari / Lewat</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-none bg-orange-500" />
                  <span>2-3 Hari</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-none bg-amber-400" />
                  <span>4-5 Hari</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-none bg-zinc-300 dark:bg-zinc-700" />
                  <span>{">"} 5 Hari</span>
                </span>
              </div>
            </div>

            {/* WhatsApp Bot Instructions Box */}
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-3 sm:p-3.5 rounded-none shadow-none space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200 font-semibold">
                <Sparkles className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Asisten WhatsApp Jadwalku:</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                Kirim pesan suara (Voice Note) atau ketik santai ke bot WhatsApp:
              </p>
              <div className="font-mono text-[11px] space-y-1 bg-zinc-50 dark:bg-zinc-950 p-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 rounded-none">
                <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold">
                  <Mic className="size-3" /> Voice Note Otomatis
                </div>
                <div className="text-[10px] text-zinc-500 pb-1">
                  Langsung rekam tugas & deadline, Gemini Flash akan mengekstraknya secara instan!
                </div>
                <div>• <code className="text-indigo-600 dark:text-indigo-400 font-bold">!jadwal</code> : Cek daftar tugas aktif</div>
                <div>• <code className="text-indigo-600 dark:text-indigo-400 font-bold">!bantuan</code> : Panduan lengkap</div>
              </div>
            </div>
          </div>

          {/* ── Right Column: Task Cards (7 cols) ── */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between pb-0.5">
              <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <span>{showArchived ? "Daftar Riwayat & Arsip" : "Daftar Tugas Kuliah"}</span>
                <span className="text-xs font-mono font-normal text-zinc-500 dark:text-zinc-400">
                  ({filteredTasks.length})
                </span>
              </h2>
              {onlyUrgent && (
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <Flame className="size-3.5" />
                  <span>Mode Mepet</span>
                </span>
              )}
            </div>

            {filteredTasks.length === 0 ? (
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 sm:p-8 text-center rounded-none shadow-none space-y-2.5">
                <div className="size-10 rounded-none bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-800 dark:text-zinc-200">
                  {selectedDate
                    ? "Tidak ada tugas jatuh tempo pada tanggal ini"
                    : onlyUrgent
                    ? "Aman! Tidak ada tugas dengan deadline mepet (≤ 3 hari)"
                    : "Belum ada tugas tercatat"}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                  {selectedDate || onlyUrgent || searchQuery
                    ? "Coba ubah kata kunci pencarian atau reset filter tanggal untuk melihat semua tugas."
                    : "Semua tugas kuliah telah selesai atau belum ada tugas baru yang ditambahkan via bot."}
                </p>
                {(selectedDate || onlyUrgent || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(null);
                      setOnlyUrgent(false);
                      setSearchQuery("");
                    }}
                    className="h-7 px-3 text-xs font-semibold rounded-none border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 hover:opacity-80 transition-opacity shadow-none cursor-pointer"
                  >
                    Tampilkan Semua Tugas
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task, idx) => {
                  const courseName = task.course_name || "Mata Kuliah";
                  const taskTitle = task.title || "Tugas Kuliah";
                  const diffDays = getTaskDeadlineDiffDays(task.deadline_date);
                  const deadlineStr = formatIndonesianDate(task.deadline_date);
                  const submission = task.lms_url || "E-Learning";
                  const isUrl = /^https?:\/\//i.test(submission.trim());

                  let urgencyBadge = null;
                  if (task.is_archived || task.status === "archived") {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        Arsip
                      </span>
                    );
                  } else if (diffDays === null) {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        Tanpa Tenggat
                      </span>
                    );
                  } else if (diffDays < 0) {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        <span>Lewat Tenggat</span>
                      </span>
                    );
                  } else if (diffDays === 0) {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-bold bg-rose-100 dark:bg-rose-600/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-600/40 flex items-center gap-1 animate-pulse">
                        <Flame className="size-3" />
                        <span>Hari H (Hari Ini!)</span>
                      </span>
                    );
                  } else if (diffDays === 1) {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-bold bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-500/30 flex items-center gap-1">
                        <Flame className="size-3" />
                        <span>Deadline Besok</span>
                      </span>
                    );
                  } else if (diffDays <= 3) {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-semibold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>Sisa {diffDays} hari</span>
                      </span>
                    );
                  } else {
                    urgencyBadge = (
                      <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                        {diffDays} hari lagi
                      </span>
                    );
                  }

                  return (
                    <article
                      key={task.id || idx}
                      className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-4.5 rounded-none shadow-none space-y-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                    >
                      {/* Top Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-none text-xs font-mono font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                            {courseName}
                          </span>
                          {task.created_via_voice ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-lime-50 dark:bg-lime-950/50 text-lime-700 dark:text-lime-400 border border-lime-200 dark:border-lime-800/60">
                              <Mic className="size-2.5" /> VN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              <MessageSquare className="size-2.5" /> WA
                            </span>
                          )}
                        </div>
                        {urgencyBadge}
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1.5">
                        <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">
                          {taskTitle}
                        </h3>
                        {task.description && (
                          <div className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-50 dark:bg-zinc-950/60 p-2.5 sm:p-3 border border-zinc-200 dark:border-zinc-800/80 rounded-none">
                            <span className="text-[10px] sm:text-[11px] font-mono uppercase text-zinc-500 block mb-1">
                              Ketentuan / Rincian:
                            </span>
                            {task.description}
                          </div>
                        )}
                      </div>

                      {/* Metadata Row: Deadline & Submission LMS */}
                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 grid sm:grid-cols-2 gap-2.5 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-zinc-500 font-mono text-[10px] sm:text-[11px] uppercase block">
                            Waktu Tenggat:
                          </span>
                          <div className="flex items-center gap-1.5 font-mono text-zinc-800 dark:text-zinc-200">
                            <Clock className="size-3.5 text-zinc-400 shrink-0" />
                            <span>{deadlineStr}</span>
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <span className="text-zinc-500 font-mono text-[10px] sm:text-[11px] uppercase block">
                            Tempat Pengumpulan / LMS:
                          </span>
                          {isUrl ? (
                            <a
                              href={submission.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:opacity-80 font-medium underline underline-offset-2 break-all cursor-pointer transition-opacity"
                            >
                              <ExternalLink className="size-3.5 shrink-0" />
                              <span>{submission.trim()}</span>
                            </a>
                          ) : (
                            <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
                              <GraduationCap className="size-3.5 text-zinc-400 shrink-0" />
                              <span className="font-medium">{submission}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Compact Footer ── */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 sm:px-6 py-4 mt-8 text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <p>
          &copy; {new Date().getFullYear()} Jadwalku • Asisten Tugas Kuliah Personal & Couple
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
          Ditenagai oleh Gemini Flash AI & WhatsApp Green-API.
        </p>
      </footer>
    </div>
  );
}
