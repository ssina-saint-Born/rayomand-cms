import { getDb, now } from "@/lib/db";
import { getOption, setOption } from "@/lib/options";

// Theme state lives in `options` so it travels with the existing settings
// store: `theme` (active slug), `theme_packs` (uploaded declarative JSON),
// `theme_licenses` (activated premium serials) and `theme_engine` (mode).

export interface StoredPack {
    slug: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    license?: "free" | "premium";
    product?: string;
    tokens: any;
    layout: any;
    home: any[];
    installed_at: string;
}

export interface StoredLicense {
    product: string;
    theme: string;
    serial: string;
    issued_at: string;
    expires_at: string | null;
    perpetual: boolean;
    host: string;
    activated_at: string;
}

export type EngineMode = "declarative" | "coded" | "headless";

export async function getActiveSlug(): Promise<string> {
    return (await getOption("theme", "twentytwentyfive")) || "twentytwentyfive";
}

export async function setActiveSlug(slug: string): Promise<void> {
    await setOption("theme", slug);
}

export async function getEngineMode(): Promise<EngineMode> {
    const v = await getOption("theme_engine", "declarative");
    return v === "coded" || v === "headless" ? v : "declarative";
}

export async function setEngineMode(mode: EngineMode): Promise<void> {
    await setOption("theme_engine", mode);
}

function parseJson<T>(raw: string, fallback: T): T {
    try {
        const v = JSON.parse(raw);
        return v == null ? fallback : v as T;
    }
    catch {
        return fallback;
    }
}

export async function listPacks(): Promise<StoredPack[]> {
    const raw = await getOption("theme_packs", "[]");
    const list = parseJson<any[]>(raw, []);
    return Array.isArray(list) ? list : [];
}

export async function savePacks(packs: StoredPack[]): Promise<void> {
    await setOption("theme_packs", JSON.stringify(packs));
}

export async function getPack(slug: string): Promise<StoredPack | null> {
    return (await listPacks()).find((p) => p.slug === slug) || null;
}

export async function listLicenses(): Promise<StoredLicense[]> {
    const raw = await getOption("theme_licenses", "[]");
    const list = parseJson<any[]>(raw, []);
    return Array.isArray(list) ? list : [];
}

export async function saveLicenses(list: StoredLicense[]): Promise<void> {
    await setOption("theme_licenses", JSON.stringify(list));
}

export async function licenseFor(product: string, theme?: string): Promise<StoredLicense | null> {
    const nowIso = now();
    const list = await listLicenses();
    return list.find((l) => {
        if (l.product !== product && l.product !== "*")
            return false;
        if (theme && l.theme && l.theme !== theme)
            return false;
        if (l.expires_at && l.expires_at < nowIso)
            return false;
        return true;
    }) || null;
}

export interface ThemeAssetLog {
    id: number;
    theme: string;
    kind: string;
    created_at: string;
    ip: string;
    agent: string;
}

// Bundle downloads are logged so an operator can audit which serial fetched
// which theme from the vendor.
export async function logAssetDownload(theme: string, kind: string, ip: string, agent: string): Promise<void> {
    await getDb().execute(
        "INSERT INTO theme_asset_logs (theme,kind,ip,agent,created_at) VALUES ($1,$2,$3,$4,$5)",
        theme, kind, ip.slice(0, 60), agent.slice(0, 240), now(),
    );
}
