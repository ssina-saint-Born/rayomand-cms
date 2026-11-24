import { getDb, withTransaction } from "../db";
import { SHOP_DEFAULTS, DOWNLOADS_DEFAULTS } from "./schema";
export async function getShopSettings(): Promise<Record<string, any>> {
    const row = (await getDb().one("SELECT value FROM options WHERE name='shop_settings'"));
    let stored: Record<string, any> = {};
    try {
        stored = row ? JSON.parse(row.value) : {};
    }
    catch {
        stored = {};
    }
    return { ...SHOP_DEFAULTS, ...stored };
}
export async function setShopSettings(patch: Record<string, any>) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(7845233)");
        const next = { ...(await getShopSettings()), ...patch };
        (await getDb().execute("INSERT INTO options (name,value) VALUES ('shop_settings',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", JSON.stringify(next)));
        return next;
    });
}
export async function getDownloadsSettings(): Promise<Record<string, any>> {
    const row = (await getDb().one("SELECT value FROM options WHERE name='downloads_settings'"));
    let stored: Record<string, any> = {};
    try {
        stored = row ? JSON.parse(row.value) : {};
    }
    catch {
        stored = {};
    }
    return { ...DOWNLOADS_DEFAULTS, ...stored };
}
export async function setDownloadsSettings(patch: Record<string, any>) {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(7845233)");
        const next = { ...(await getDownloadsSettings()), ...patch };
        (await getDb().execute("INSERT INTO options (name,value) VALUES ('downloads_settings',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", JSON.stringify(next)));
        return next;
    });
}
const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$", INR: "₹" };
export function money(amount: number, s?: Record<string, any>): string {
    const cfg = s ?? SHOP_DEFAULTS;
    const n = Number(amount || 0);
    const dec = Number(cfg.num_decimals ?? 2);
    const fixed = Math.abs(n).toFixed(dec);
    const [int, frac] = fixed.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousand_sep ?? ",");
    const body = dec > 0 ? `${grouped}${cfg.decimal_sep ?? "."}${frac}` : grouped;
    const sym = SYMBOLS[cfg.currency] ?? `${cfg.currency} `;
    const sign = n < 0 ? "-" : "";
    switch (cfg.currency_pos) {
        case "right": return `${sign}${body}${sym}`;
        case "left_space": return `${sign}${sym} ${body}`;
        case "right_space": return `${sign}${body} ${sym}`;
        default: return `${sign}${sym}${body}`;
    }
}
export function parseJson<T>(v: any, fallback: T): T {
    if (v == null)
        return fallback;
    if (typeof v === "object")
        return v as T;
    try {
        return JSON.parse(v) as T;
    }
    catch {
        return fallback;
    }
}
export function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
