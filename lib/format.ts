const DIGITS: Record<string, string> = {
  "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3", "\u06F4": "4",
  "\u06F5": "5", "\u06F6": "6", "\u06F7": "7", "\u06F8": "8", "\u06F9": "9",
  "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
  "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
};

// URL-safe slug that keeps non-Latin letters (Persian/Arabic) instead of
// discarding them. Diacritics and tatweel are dropped; ZWNJ becomes a hyphen.
export function slugify(input: string): string {
  const s = (input || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u200c\u200d]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .split("")
    .map((ch) => DIGITS[ch] ?? ch)
    .join("");
  return s || "item";
}

export function excerptFrom(text: string, len = 160): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len).trimEnd() + "…" : clean;
}

export function truncate(text: string, len: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len).trimEnd() + "…" : clean;
}

export function formatDate(iso: string | null, format = "F j, Y", locale: "en" | "fa" = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (locale === "fa") return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const map: Record<string, string> = {
    F: months[d.getUTCMonth()],
    M: months[d.getUTCMonth()].slice(0, 3),
    j: String(d.getUTCDate()),
    d: String(d.getUTCDate()).padStart(2, "0"),
    Y: String(d.getUTCFullYear()),
    y: String(d.getUTCFullYear()).slice(-2),
    n: String(d.getUTCMonth() + 1),
    m: String(d.getUTCMonth() + 1).padStart(2, "0"),
  };
  return format.replace(/F|M|j|d|Y|y|n|m/g, (k) => map[k] ?? k);
}

export function timeAgo(iso: string, locale: "en" | "fa" = "en"): string {
  if (locale === "fa") {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day";
    const value = unit === "minute" ? minutes : unit === "hour" ? Math.floor(minutes / 60) : Math.floor(minutes / 1440);
    return new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" }).format(-value, unit);
  }
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
