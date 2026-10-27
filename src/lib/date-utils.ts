/**
 * Formats a Date/Timestamp into standard Indonesian date string with WITA time.
 * Example: "Sabtu, 31 Oktober 2026 (23:59 WITA)"
 */
export function formatWitaDate(dateObj: unknown): string {
  if (!dateObj) return "-";
  const d =
    typeof dateObj === "object" && dateObj !== null && "toDate" in dateObj
      ? (dateObj as { toDate: () => Date }).toDate()
      : dateObj instanceof Date
      ? dateObj
      : new Date(dateObj as string | number);

  if (isNaN(d.getTime())) return "-";

  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
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

  // Adjust to WITA (UTC+8)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const witaDate = new Date(utc + 3600000 * 8);

  const dayName = days[witaDate.getDay()];
  const dateNum = witaDate.getDate();
  const monthName = months[witaDate.getMonth()];
  const year = witaDate.getFullYear();
  const hours = String(witaDate.getHours()).padStart(2, "0");
  const minutes = String(witaDate.getMinutes()).padStart(2, "0");

  return `${dayName}, ${dateNum} ${monthName} ${year} (${hours}:${minutes} WITA)`;
}

export function formatIndonesianDate(dateObj: unknown): string {
  if (!dateObj) return "-";
  const d =
    typeof dateObj === "object" && dateObj !== null && "toDate" in dateObj
      ? (dateObj as { toDate: () => Date }).toDate()
      : dateObj instanceof Date
      ? dateObj
      : new Date(dateObj as string | number);

  if (isNaN(d.getTime())) return "-";

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];

  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function parseDeadlineString(raw?: string | null): Date | null {
  if (!raw || !raw.trim()) return null;
  const clean = raw.trim();

  // Matches YYYY-MM-DD or YYYY-MM-DD HH:mm (treated explicitly as WITA / UTC+8)
  const m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const hour = m[4] !== undefined ? parseInt(m[4], 10) : 23;
    const min = m[5] !== undefined ? parseInt(m[5], 10) : 59;
    // WITA is UTC+8, so UTC hour = hour - 8
    return new Date(Date.UTC(year, month, day, hour - 8, min, 0));
  }

  // Fallback direct parse for ISO strings with explicit timezone offsets
  const direct = new Date(clean);
  if (!isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}
