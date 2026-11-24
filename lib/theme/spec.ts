import type { ThemeDef } from "@/lib/themes";

// A declarative theme is a plain JSON document: design tokens, layout
// variants and the ordered list of home-page sections. Nothing in it is
// executable, so an uploaded pack can be validated and stored as data.

export type FontFamily = "sans" | "serif" | "mono";
export type HeaderVariant = "classic" | "centered" | "minimal";
export type FooterVariant = "columns" | "simple";
export type CardStyle = "soft" | "flat" | "outline";
export type ContentWidth = "narrow" | "wide";

export interface ThemeTokens {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    headerBg: string;
    headerText: string;
    border: string;
    radius: number;
    font: FontFamily;
    maxWidth: number;
}

export interface ThemeLayout {
    header: HeaderVariant;
    footer: FooterVariant;
    contentWidth: ContentWidth;
    cardStyle: CardStyle;
    showSearch: boolean;
    showLanguage: boolean;
    stickyHeader: boolean;
}

export type HomeSection =
    | { type: "hero"; title?: string; subtitle?: string; image?: string; cta?: { label: string; url: string } }
    | { type: "featured"; title?: string; count: number }
    | { type: "latest"; title?: string; count: number }
    | { type: "categories"; title?: string; limit: number }
    | { type: "cta"; title: string; body?: string; cta?: { label: string; url: string } };

export interface DeclarativeTheme {
    slug: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    /** "free" built-ins need no license; "premium" packs are license-gated. */
    license?: "free" | "premium";
    product?: string;
    tokens: ThemeTokens;
    layout: ThemeLayout;
    home: HomeSection[];
}

export interface ActiveTheme extends ThemeDef {
    slug: string;
    name: string;
    description: string;
    tokens: ThemeTokens;
    layout: ThemeLayout;
    home: HomeSection[];
    source: "builtin" | "declarative" | "coded";
    license: "free" | "premium";
    product?: string;
}

export const DEFAULT_TOKENS: ThemeTokens = {
    bg: "#f3f5f1",
    surface: "#fdfefb",
    text: "#273c36",
    muted: "#65756d",
    accent: "#45665b",
    accentText: "#ffffff",
    headerBg: "#fdfefb",
    headerText: "#273c36",
    border: "#dce3dc",
    radius: 24,
    font: "sans",
    maxWidth: 768,
};

export const DEFAULT_LAYOUT: ThemeLayout = {
    header: "classic",
    footer: "columns",
    contentWidth: "narrow",
    cardStyle: "soft",
    showSearch: true,
    showLanguage: true,
    stickyHeader: false,
};

export const DEFAULT_HOME: HomeSection[] = [
    { type: "latest", title: "", count: 10 },
];

const SAFE_COLOR = /^[#a-zA-Z0-9(),.%\s/-]{0,64}$/;

function color(value: unknown, fallback: string): string {
    if (typeof value !== "string")
        return fallback;
    const v = value.trim();
    if (!v || !SAFE_COLOR.test(v) || /[;{}<>"\\]/.test(v))
        return fallback;
    return v;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value: unknown, fallback = "", max = 200): string {
    if (typeof value !== "string")
        return fallback;
    return value.slice(0, max);
}

function cta(value: unknown): { label: string; url: string } | undefined {
    if (!value || typeof value !== "object")
        return undefined;
    const v = value as any;
    const label = text(v.label, "", 60);
    let url = text(v.url, "", 500);
    // Only site-relative or http(s) links; blocks javascript:/data: URLs.
    if (url && !/^(https?:\/\/|\/)/i.test(url))
        url = "/";
    if (!label || !url)
        return undefined;
    return { label, url };
}

export function normalizeTokens(raw: any): ThemeTokens {
    const t = raw && typeof raw === "object" ? raw : {};
    return {
        bg: color(t.bg, DEFAULT_TOKENS.bg),
        surface: color(t.surface, DEFAULT_TOKENS.surface),
        text: color(t.text, DEFAULT_TOKENS.text),
        muted: color(t.muted, DEFAULT_TOKENS.muted),
        accent: color(t.accent, DEFAULT_TOKENS.accent),
        accentText: color(t.accentText, DEFAULT_TOKENS.accentText),
        headerBg: color(t.headerBg, DEFAULT_TOKENS.headerBg),
        headerText: color(t.headerText, DEFAULT_TOKENS.headerText),
        border: color(t.border, DEFAULT_TOKENS.border),
        radius: int(t.radius, DEFAULT_TOKENS.radius, 0, 40),
        font: oneOf(t.font, ["sans", "serif", "mono"] as const, DEFAULT_TOKENS.font),
        maxWidth: int(t.maxWidth, DEFAULT_TOKENS.maxWidth, 480, 1400),
    };
}

export function normalizeLayout(raw: any): ThemeLayout {
    const l = raw && typeof raw === "object" ? raw : {};
    return {
        header: oneOf(l.header, ["classic", "centered", "minimal"] as const, DEFAULT_LAYOUT.header),
        footer: oneOf(l.footer, ["columns", "simple"] as const, DEFAULT_LAYOUT.footer),
        contentWidth: oneOf(l.contentWidth, ["narrow", "wide"] as const, DEFAULT_LAYOUT.contentWidth),
        cardStyle: oneOf(l.cardStyle, ["soft", "flat", "outline"] as const, DEFAULT_LAYOUT.cardStyle),
        showSearch: l.showSearch !== false,
        showLanguage: l.showLanguage !== false,
        stickyHeader: l.stickyHeader === true,
    };
}

export function normalizeHome(raw: any): HomeSection[] {
    const list = Array.isArray(raw) ? raw : DEFAULT_HOME;
    const out: HomeSection[] = [];
    for (const item of list.slice(0, 8)) {
        if (!item || typeof item !== "object")
            continue;
        const s = item as any;
        switch (s.type) {
            case "hero":
                out.push({
                    type: "hero",
                    title: text(s.title, "", 120) || undefined,
                    subtitle: text(s.subtitle, "", 240) || undefined,
                    image: /^(https?:\/\/|\/)/i.test(String(s.image || "")) ? text(s.image, "", 500) : undefined,
                    cta: cta(s.cta),
                });
                break;
            case "featured":
                out.push({ type: "featured", title: text(s.title, "", 80) || undefined, count: int(s.count, 3, 1, 12) });
                break;
            case "latest":
                out.push({ type: "latest", title: text(s.title, "", 80) || undefined, count: int(s.count, 6, 1, 24) });
                break;
            case "categories":
                out.push({ type: "categories", title: text(s.title, "", 80) || undefined, limit: int(s.limit, 8, 1, 24) });
                break;
            case "cta":
                out.push({
                    type: "cta",
                    title: text(s.title, "Ready to begin?", 120),
                    body: text(s.body, "", 240) || undefined,
                    cta: cta(s.cta),
                });
                break;
        }
    }
    return out.length ? out : DEFAULT_HOME;
}

export function normalizeTheme(raw: any): DeclarativeTheme {
    const t = raw && typeof raw === "object" ? raw : {};
    const slug = text(t.slug, "", 60).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    return {
        slug: slug || "custom",
        name: text(t.name, "Custom theme", 80) || "Custom theme",
        description: text(t.description, "", 240),
        version: text(t.version, "1.0.0", 20) || "1.0.0",
        author: text(t.author, "", 80) || undefined,
        license: t.license === "premium" ? "premium" : "free",
        product: text(t.product, "", 60) || undefined,
        tokens: normalizeTokens(t.tokens),
        layout: normalizeLayout(t.layout),
        home: normalizeHome(t.home),
    };
}

export function specToThemeDef(spec: DeclarativeTheme): ThemeDef {
    return {
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        bg: spec.tokens.bg,
        text: spec.tokens.text,
        accent: spec.tokens.accent,
        headerBg: spec.tokens.headerBg,
        headerText: spec.tokens.headerText,
        font: spec.tokens.font,
    };
}

export function toActiveTheme(spec: DeclarativeTheme, source: ActiveTheme["source"]): ActiveTheme {
    return {
        ...specToThemeDef(spec),
        tokens: spec.tokens,
        layout: spec.layout,
        home: spec.home,
        source,
        license: spec.license || "free",
        product: spec.product,
    };
}

export function fontStack(font: FontFamily): string | undefined {
    if (font === "serif")
        return "Georgia, 'Times New Roman', serif";
    if (font === "mono")
        return "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    return undefined;
}
