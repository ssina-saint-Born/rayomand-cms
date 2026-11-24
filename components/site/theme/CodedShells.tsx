import Link from "next/link";
import type { ReactNode } from "react";
import type { ActiveTheme } from "@/lib/theme/spec";
import type { SiteSettings } from "@/lib/options";
import type { Menu } from "@/lib/types";
import BrandMark from "@/components/BrandMark";
import { getTranslator } from "@/lib/i18n-server";

// Route 2 — coded themes. A developer registers a React shell keyed by slug in
// lib/theme/coded.ts; this file holds the actual layouts. Unlike declarative
// packs these are trusted in-repo code, so they can use any component, but the
// palette still comes from the theme's tokens for consistency.

export function MagazineShell({ theme, settings, menu, children }: {
    theme: ActiveTheme;
    settings: SiteSettings;
    menu: Menu | null;
    children: ReactNode;
}) {
    const tr = getTranslator();
    const items = menu?.items || [];
    return (
        <div className="min-h-screen flex flex-col" style={{ background: "var(--rm-theme-bg)", color: "var(--rm-theme-text)" }}>
            <div style={{ background: "var(--rm-theme-header-bg)", color: "var(--rm-theme-header-text)" }}>
                <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", gap: 16 }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit" }}>
                        <BrandMark />
                        <strong style={{ fontSize: 20, letterSpacing: "-0.04em" }}>{settings.site_title}</strong>
                    </Link>
                    <nav style={{ marginInlineStart: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {items.map((it) => (
                            <Link key={it.id} href={it.url} style={{ padding: "8px 12px", fontSize: 13, color: "inherit" }}>{it.label}</Link>
                        ))}
                        <Link href="/collection" style={{ padding: "8px 12px", fontSize: 13, color: "inherit" }}>{tr("Collection")}</Link>
                    </nav>
                </div>
            </div>
            <div style={{ background: "var(--rm-theme-accent)", height: 4 }} />
            <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 28px 72px", width: "100%", flex: 1 }}>
                {children}
            </main>
            <footer style={{ borderTop: "1px solid var(--rm-theme-border)", background: "var(--rm-theme-surface)" }}>
                <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px", fontSize: 12, color: "var(--rm-theme-muted)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <span>{settings.site_title}</span>
                    <nav style={{ display: "flex", gap: 16 }}>
                        <Link href="/journal/feed">{tr("Feed")}</Link>
                        <Link href="/studio">{tr("Dashboard")}</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
