import Link from "next/link";
import type { ActiveTheme } from "@/lib/theme/spec";
import type { SiteSettings } from "@/lib/options";
import type { Menu } from "@/lib/types";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageProvider";
import { getTranslator } from "@/lib/i18n-server";

export default function ThemeHeader({ theme, settings, menu }: {
    theme: ActiveTheme;
    settings: SiteSettings;
    menu: Menu | null;
}) {
    const tr = getTranslator();
    const items = menu?.items || [];
    const tagline = settings.tagline === "Just another Next.js site" ? "" : settings.tagline;
    const variant = theme.layout.header;
    return (
        <header className="rm-theme-header">
            <div className={`rm-theme-header-inner rm-theme-header-${variant}`}>
                <Link href="/" className="rm-theme-brand">
                    <BrandMark />
                    <span>
                        <span className="rm-theme-brand-title">{settings.site_title}</span>
                        {tagline ? <span className="rm-theme-brand-tag" style={{ display: "block" }}>{tagline}</span> : null}
                    </span>
                </Link>
                <nav className="rm-theme-nav" aria-label={tr("Site navigation")}>
                    {theme.layout.showLanguage && <LanguageSwitch />}
                    {items.map((it) => <Link key={it.id} href={it.url}>{it.label}</Link>)}
                    <Link href="/collection">{tr("Collection")}</Link>
                    <Link href="/account">{tr("My account")}</Link>
                    {theme.layout.showSearch && (
                        <form action="/search" method="get" className="rm-theme-search" role="search">
                            <input name="s" type="search" placeholder={tr("Search…")} aria-label={tr("Search")} />
                        </form>
                    )}
                </nav>
            </div>
        </header>
    );
}
