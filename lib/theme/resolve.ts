import { getTheme, type ThemeDef } from "@/lib/themes";
import { BUILTIN_SPECS, builtinSpec } from "./builtin";
import { CODED_THEMES as CODED_REGISTRY, type CodedTheme } from "./coded";
import {
    toActiveTheme,
    normalizeTheme,
    DEFAULT_LAYOUT,
    type ActiveTheme,
    type DeclarativeTheme,
} from "./spec";
import { getActiveSlug, getPack, licenseFor, listPacks } from "./store";

// A "coded" theme is a developer-authored React shell registered by slug in
// lib/theme/coded.ts. The resolver treats it like any other theme for palette
// and licensing, and exposes its shell id so a layout can render it.
export const CODED_THEMES: Record<string, CodedTheme> = CODED_REGISTRY;

export function codedShell(slug: string): CodedTheme["shell"] | null {
    return CODED_REGISTRY[slug]?.shell || null;
}

export interface ThemeListing {
    slug: string;
    name: string;
    description: string;
    version: string;
    source: ActiveTheme["source"];
    license: "free" | "premium";
    product?: string;
    active: boolean;
    unlocked: boolean;
    tokens: DeclarativeTheme["tokens"];
    layout: DeclarativeTheme["layout"];
}

function specListing(spec: DeclarativeTheme, source: ActiveTheme["source"], activeSlug: string, unlocked: boolean): ThemeListing {
    return {
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        version: spec.version,
        source,
        license: spec.license || "free",
        product: spec.product,
        // A locked theme can never be the rendered theme, so it is not shown as
        // active even if its slug is the stored selection.
        active: unlocked && spec.slug === activeSlug,
        unlocked,
        tokens: spec.tokens,
        layout: spec.layout,
    };
}

function codedSpec(def: CodedTheme): DeclarativeTheme {
    return {
        slug: def.slug,
        name: def.name,
        description: def.description,
        version: "1.0.0",
        license: def.license || "free",
        product: def.product,
        tokens: {
            bg: def.bg, surface: def.bg, text: def.text, muted: def.text,
            accent: def.accent, accentText: "#ffffff", headerBg: def.headerBg, headerText: def.headerText,
            border: def.headerBg, radius: 20, font: def.font as any, maxWidth: 1180,
        },
        layout: { ...DEFAULT_LAYOUT, header: "classic", footer: "columns", contentWidth: "wide", cardStyle: "soft" },
        home: [{ type: "latest", count: 10 }],
    };
}

export async function listAllThemes(): Promise<ThemeListing[]> {
    const activeSlug = await getActiveSlug();
    const packs = await listPacks();
    const out: ThemeListing[] = [];
    const seen = new Set<string>();

    for (const spec of BUILTIN_SPECS) {
        const unlocked = (spec.license || "free") === "free" || !!(spec.product && await licenseFor(spec.product, spec.slug));
        out.push(specListing(spec, "builtin", activeSlug, unlocked));
        seen.add(spec.slug);
    }
    for (const pack of packs) {
        if (seen.has(pack.slug))
            continue;
        const spec = normalizeTheme(pack);
        const unlocked = (spec.license || "free") === "free" || !!(spec.product && await licenseFor(spec.product, spec.slug));
        out.push(specListing(spec, "declarative", activeSlug, unlocked));
        seen.add(spec.slug);
    }
    for (const [slug, def] of Object.entries(CODED_REGISTRY)) {
        if (seen.has(slug))
            continue;
        const spec = codedSpec(def);
        const unlocked = (def.license || "free") === "free" || !!(def.product && await licenseFor(def.product, slug));
        out.push(specListing(spec, "coded", activeSlug, unlocked));
    }
    return out;
}

async function findSpec(slug: string): Promise<{ spec: DeclarativeTheme; source: ActiveTheme["source"] } | null> {
    const builtin = builtinSpec(slug);
    if (builtin)
        return { spec: builtin, source: "builtin" };
    const pack = await getPack(slug);
    if (pack)
        return { spec: normalizeTheme(pack), source: "declarative" };
    const coded = CODED_REGISTRY[slug];
    if (coded)
        return { spec: codedSpec(coded), source: "coded" };
    return null;
}

export interface ResolvedTheme {
    theme: ActiveTheme;
    /** false when the theme is premium and no active license exists. */
    unlocked: boolean;
    /** the fallback free theme to render when locked. */
    fallback: ActiveTheme;
    /** coded shell id, when the active theme is a coded theme. */
    shell: string | null;
}

export async function resolveActiveTheme(slugOverride?: string): Promise<ResolvedTheme> {
    const slug = slugOverride || (await getActiveSlug());
    const found = await findSpec(slug);
    const fallbackSpec = builtinSpec("twentytwentyfive")!;
    const fallback = toActiveTheme(fallbackSpec, "builtin");

    if (!found) {
        const legacy = getTheme(slug);
        const spec: DeclarativeTheme = {
            ...fallbackSpec,
            slug: legacy.slug,
            name: legacy.name,
            description: legacy.description,
            tokens: {
                ...fallbackSpec.tokens,
                bg: legacy.bg, text: legacy.text, accent: legacy.accent,
                headerBg: legacy.headerBg, headerText: legacy.headerText,
                font: legacy.font as any,
            },
        };
        return { theme: toActiveTheme(spec, "builtin"), unlocked: true, fallback, shell: null };
    }

    const { spec, source } = found;
    const premium = (spec.license || "free") === "premium";
    const unlocked = !premium || !!(spec.product && await licenseFor(spec.product, spec.slug));
    const theme = unlocked ? toActiveTheme(spec, source) : fallback;
    return {
        theme,
        unlocked,
        fallback,
        shell: unlocked && source === "coded" ? (CODED_REGISTRY[slug]?.shell || null) : null,
    };
}

export async function activateTheme(slug: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const found = await findSpec(slug);
    if (!found)
        return { ok: false, message: "Unknown theme." };
    const premium = (found.spec.license || "free") === "premium";
    if (premium) {
        const licensed = found.spec.product ? await licenseFor(found.spec.product, found.spec.slug) : null;
        if (!licensed)
            return { ok: false, message: "This theme needs an active license. Enter its serial first." };
    }
    const { setActiveSlug } = await import("./store");
    await setActiveSlug(slug);
    return { ok: true };
}

export { toActiveTheme };
