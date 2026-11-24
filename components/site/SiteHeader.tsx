
import { getTranslator } from "@/lib/i18n-server";
import Link from "next/link";
import type { SiteSettings } from "@/lib/options";
import type { ThemeDef } from "@/lib/themes";
import type { Menu } from "@/lib/types";
import CartBadge from "@/components/shop/CartBadge";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageProvider";

export default function SiteHeader({ settings, theme, menu }: { settings: SiteSettings; theme: ThemeDef; menu: Menu | null }) {
    const tr = getTranslator();
  const items = menu?.items || [];
  const title = settings.site_title;
  const tagline = settings.tagline === "Just another Next.js site" ? tr("Stories, ideas & digital collections.") : settings.tagline;
  return (
    <header style={{ background: theme.headerBg, color: theme.headerText }} className="noma-site-header">
      <div className="noma-site-header-inner">
        <Link href="/" className="noma-site-brand" style={{ color: theme.headerText }}>
          <BrandMark />
          <div><span className="noma-site-brand-title">{title}</span>{tagline && <p className="text-xs opacity-75 mt-0.5">{tagline}</p>}</div>
        </Link>
        <nav className="noma-site-nav" aria-label={tr("Site navigation")}>
          <LanguageSwitch />
          {items.map((it) => <Link key={it.id} href={it.url} style={{ color: theme.headerText }}>{it.label}</Link>)}
          <Link href="/collection" className="font-semibold" style={{ color: theme.headerText }}>{tr("Collection")}</Link>
          <Link href="/account" style={{ color: theme.headerText }}>{tr("My account")}</Link>
          <CartBadge color={theme.headerText} />
          <form action="/search" method="get" className="noma-site-search" role="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input name="s" type="search" placeholder={tr("Search stories…")} aria-label={tr("Search stories")} />
          </form>
        </nav>
      </div>
    </header>
  );
}
