"use client";

import { useState, useEffect } from "react";
import type { RecurringSchedule, ScheduleCategory, ScheduleRecurrence } from "@/types";
import {
  X,
  Plus,
  Loader2,
  Clock,
  MapPin,
  Calendar,
  BookOpen,
  User,
  Zap,
  Repeat,
  AlertCircle,
} from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onScheduleCreated: (schedule: RecurringSchedule) => void;
};

const DAY_OPTIONS = [
  { value: 1, label: "Senin", short: "Sen" },
  { value: 2, label: "Selasa", short: "Sel" },
  { value: 3, label: "Rabu", short: "Rab" },
  { value: 4, label: "Kamis", short: "Kam" },
  { value: 5, label: "Jumat", short: "Jum" },
  { value: 6, label: "Sabtu", short: "Sab" },
  { value: 0, label: "Minggu", short: "Min" },
];

export function AddScheduleModal({ isOpen, onClose, onScheduleCreated }: Props) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ScheduleCategory>("kuliah");
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Default Senin
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:40");
  const [location, setLocation] = useState("Kampus");
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>("weekly");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setCategory("kuliah");
      setSelectedDays([1]);
      setStartTime("08:00");
      setEndTime("09:40");
      setLocation("Kampus");
      setRecurrence("weekly");
      setSubmitError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Minimal 1 hari dipilih
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day].sort((a, b) => {
          // Urutkan Senin (1) s/d Minggu (0)
          const normA = a === 0 ? 7 : a;
          const normB = b === 0 ? 7 : b;
          return normA - normB;
        });
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setSubmitError("Nama mata kuliah atau kegiatan wajib diisi.");
      return;
    }

    if (selectedDays.length === 0) {
      setSubmitError("Pilih minimal satu hari berulang.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          days: selectedDays,
          start_time: startTime || "08:00",
          end_time: endTime || "09:40",
          location: location.trim() || "Kampus",
          recurrence,
          created_by: "Web Jadwalku",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal menyimpan jadwal rutin.");
      }

      onScheduleCreated(data.schedule);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 rounded-none shadow-none flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <div className="size-7 bg-indigo-600 text-white rounded-none flex items-center justify-center font-bold">
              <Calendar className="size-4" />
            </div>
            <div>
              <h2 id="schedule-modal-title" className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                Tambah Jadwal Rutin
              </h2>
              <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                Kuliah Mingguan / Rutinitas Berulang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-none border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center cursor-pointer shadow-none"
            aria-label="Tutup modal"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {submitError && (
            <div className="p-2.5 rounded-none border border-rose-400/50 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Kategori Jadwal */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1.5">
              Kategori Kegiatan
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("kuliah")}
                className={`py-2 px-2 rounded-none border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-none ${
                  category === "kuliah"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <BookOpen className="size-3.5" />
                <span>Kuliah</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory("rutinitas")}
                className={`py-2 px-2 rounded-none border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-none ${
                  category === "rutinitas"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Zap className="size-3.5" />
                <span>Rutinitas</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory("personal")}
                className={`py-2 px-2 rounded-none border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-none ${
                  category === "personal"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <User className="size-3.5" />
                <span>Personal</span>
              </button>
            </div>
          </div>

          {/* Nama Kegiatan / Matkul */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1">
              Nama Mata Kuliah / Kegiatan *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Pemrograman Web, Basis Data, Olahraga Pagi"
              className="w-full h-9 px-3 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 rounded-none focus:outline-none focus:border-indigo-600 shadow-none font-medium"
            />
          </div>

          {/* Pilihan Hari Berulang */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300">
                Hari Berulang *
              </label>
              <span className="text-[10px] font-mono text-zinc-500">
                {selectedDays.length} hari aktif
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_OPTIONS.map((d) => {
                const isSelected = selectedDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-none border transition-colors cursor-pointer shadow-none flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 font-extrabold"
                        : "bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{d.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jam Mulai & Jam Selesai */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1">
                Jam Mulai (WITA)
              </label>
              <div className="relative">
                <Clock className="size-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-9 pl-8 pr-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-none focus:outline-none focus:border-indigo-600 shadow-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1">
                Jam Selesai (WITA)
              </label>
              <div className="relative">
                <Clock className="size-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-9 pl-8 pr-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-none focus:outline-none focus:border-indigo-600 shadow-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Lokasi / Ruangan */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1">
              Ruangan / Tempat / Link Meet
            </label>
            <div className="relative">
              <MapPin className="size-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Contoh: Lab Komputer 3, Ruang 204, Zoom"
                className="w-full h-9 pl-8 pr-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 rounded-none focus:outline-none focus:border-indigo-600 shadow-none"
              />
            </div>
          </div>

          {/* Pola Perulangan */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-1">
              Frekuensi Perulangan
            </label>
            <div className="relative">
              <Repeat className="size-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as ScheduleRecurrence)}
                className="w-full h-9 pl-8 pr-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-none focus:outline-none focus:border-indigo-600 shadow-none font-medium appearance-none"
              >
                <option value="weekly">Setiap Minggu (Default)</option>
                <option value="biweekly">Tiap 2 Minggu (Biweekly)</option>
                <option value="custom">Kustom</option>
              </select>
            </div>
          </div>

          {/* Footer Tombol Simpan */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 rounded-none border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer shadow-none disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 rounded-none border border-indigo-600 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  <span>Simpan Jadwal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
