import type { DeclarativeTheme } from "./spec";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "./spec";

// Built-in declarative themes. They ship as data only, so the same validator
// that checks an uploaded pack also checks these.

function base(patch: Partial<DeclarativeTheme> & Pick<DeclarativeTheme, "slug" | "name" | "description">): DeclarativeTheme {
    return {
        version: "1.0.0",
        author: "Rayomand",
        license: "free",
        tokens: DEFAULT_TOKENS,
        layout: DEFAULT_LAYOUT,
        home: [{ type: "latest", count: 10 }],
        ...patch,
    } as DeclarativeTheme;
}

export const BUILTIN_SPECS: DeclarativeTheme[] = [
    base({
        slug: "twentytwentyfive",
        name: "Meadow",
        description: "Soft sage surfaces and a calm, contemporary editorial rhythm.",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#f3f5f1", surface: "#fdfefb", text: "#273c36", muted: "#65756d",
            accent: "#45665b", accentText: "#ffffff", headerBg: "#fdfefb", headerText: "#273c36",
            border: "#dce3dc", radius: 28, font: "sans", maxWidth: 768,
        },
        layout: { ...DEFAULT_LAYOUT, header: "classic", footer: "columns", cardStyle: "soft" },
        home: [
            { type: "hero", title: "", subtitle: "" },
            { type: "latest", count: 10 },
        ],
    }),
    base({
        slug: "twentytwentyfour",
        name: "Sandstone",
        description: "Warm ivory, muted clay and considered serif typography.",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#f6f3ed", surface: "#fbf8f2", text: "#433b32", muted: "#7b6f63",
            accent: "#826553", accentText: "#ffffff", headerBg: "#fbf8f2", headerText: "#433b32",
            border: "#e3dcd1", radius: 20, font: "serif", maxWidth: 740,
        },
        layout: { ...DEFAULT_LAYOUT, header: "centered", footer: "simple", cardStyle: "flat" },
        home: [
            { type: "featured", title: "Selected writing", count: 2 },
            { type: "latest", title: "Latest", count: 8 },
        ],
    }),
    base({
        slug: "twentytwentythree",
        name: "Evening",
        description: "Mist-toned pages, a deep ink header and subtle lavender accents.",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#f4f3f7", surface: "#ffffff", text: "#3c3848", muted: "#6f6a7d",
            accent: "#656080", accentText: "#ffffff", headerBg: "#353b39", headerText: "#f4f5ef",
            border: "#e0dee7", radius: 16, font: "sans", maxWidth: 820,
        },
        layout: { ...DEFAULT_LAYOUT, header: "classic", footer: "columns", cardStyle: "outline", stickyHeader: true },
        home: [
            { type: "hero", title: "", subtitle: "" },
            { type: "featured", title: "Featured", count: 3 },
            { type: "latest", title: "More stories", count: 9 },
        ],
    }),
    base({
        slug: "classic",
        name: "Linen",
        description: "A minimal reading space in pale linen and understated olive.",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#f5f5ee", surface: "#fbfbf5", text: "#3b4435", muted: "#6d7565",
            accent: "#5f7050", accentText: "#ffffff", headerBg: "#ecefe3", headerText: "#3b4435",
            border: "#e0e2d6", radius: 8, font: "sans", maxWidth: 700,
        },
        layout: { ...DEFAULT_LAYOUT, header: "minimal", footer: "simple", cardStyle: "flat" },
        home: [{ type: "latest", count: 12 }],
    }),
    // Premium packs: locked until a license for `product` is active.
    base({
        slug: "aurora",
        name: "Aurora",
        description: "Deep gradient hero, glass cards and a confident display scale.",
        version: "1.2.0",
        license: "premium",
        product: "aurora",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#0f1524", surface: "#182036", text: "#e8edf7", muted: "#9aa8c4",
            accent: "#7c9cff", accentText: "#0b1020", headerBg: "#0b1020", headerText: "#e8edf7",
            border: "#26314d", radius: 22, font: "sans", maxWidth: 1120,
        },
        layout: { ...DEFAULT_LAYOUT, header: "centered", footer: "columns", cardStyle: "outline", contentWidth: "wide", stickyHeader: true },
        home: [
            { type: "hero", title: "", subtitle: "", cta: { label: "Start reading", url: "/" } },
            { type: "categories", title: "Browse", limit: 8 },
            { type: "featured", title: "Highlights", count: 3 },
            { type: "latest", title: "Latest", count: 9 },
            { type: "cta", title: "Write with Aurora", body: "A stage for long-form work.", cta: { label: "Open the studio", url: "/studio" } },
        ],
    }),
    base({
        slug: "monograph",
        name: "Monograph",
        description: "Print-inspired editorial grid with serif headlines and generous margins.",
        version: "1.0.3",
        license: "premium",
        product: "monograph",
        tokens: {
            ...DEFAULT_TOKENS,
            bg: "#fbfaf6", surface: "#ffffff", text: "#1f1d1a", muted: "#6b655c",
            accent: "#8a3324", accentText: "#ffffff", headerBg: "#ffffff", headerText: "#1f1d1a",
            border: "#e6e1d6", radius: 4, font: "serif", maxWidth: 1080,
        },
        layout: { ...DEFAULT_LAYOUT, header: "classic", footer: "simple", cardStyle: "flat", contentWidth: "wide" },
        home: [
            { type: "featured", title: "The cover story", count: 1 },
            { type: "latest", title: "From the archive", count: 10 },
            { type: "categories", title: "Sections", limit: 6 },
        ],
    }),
];

export function builtinSpec(slug: string): DeclarativeTheme | undefined {
    return BUILTIN_SPECS.find((t) => t.slug === slug);
}
