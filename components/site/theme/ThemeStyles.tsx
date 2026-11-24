import type { ActiveTheme } from "@/lib/theme/spec";
import { fontStack } from "@/lib/theme/spec";
import type { CSSProperties } from "react";

// Declarative themes are pure data, so all of their styling is derived from
// tokens here. The stylesheet is keyed off CSS custom properties set on the
// scope element; every token value was validated in lib/theme/spec.ts, so no
// theme can inject arbitrary CSS.

export const THEME_CSS = `
.rm-theme-scope { background: var(--rm-theme-bg); color: var(--rm-theme-text); }
.rm-theme-scope .rm-theme-header { background: var(--rm-theme-header-bg); color: var(--rm-theme-header-text); border-bottom: 1px solid var(--rm-theme-border); }
.rm-theme-scope.rm-theme-sticky .rm-theme-header { position: sticky; top: 0; z-index: 40; }
.rm-theme-scope .rm-theme-header-inner { max-width: var(--rm-theme-max); margin: 0 auto; padding: 22px 28px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.rm-theme-scope .rm-theme-header-centered .rm-theme-header-inner { flex-direction: column; text-align: center; gap: 14px; }
.rm-theme-scope .rm-theme-header-centered .rm-theme-nav { justify-content: center; margin-inline-start: 0; }
.rm-theme-scope .rm-theme-header-minimal .rm-theme-header-inner { padding-block: 16px; }
.rm-theme-scope .rm-theme-brand { display: flex; align-items: center; gap: 12px; color: inherit; }
.rm-theme-scope .rm-theme-brand-title { font-size: 23px; font-weight: 650; letter-spacing: -0.04em; }
.rm-theme-scope .rm-theme-brand-tag { font-size: 12px; opacity: 0.72; margin-top: 2px; }
.rm-theme-scope .rm-theme-nav { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-inline-start: auto; }
.rm-theme-scope .rm-theme-nav a { padding: 8px 12px; border-radius: 10px; font-size: 13px; color: var(--rm-theme-header-text); }
.rm-theme-scope .rm-theme-nav a:hover { background: rgba(127,127,127,0.12); text-decoration: none; }
.rm-theme-scope .rm-theme-search { display: flex; align-items: center; }
.rm-theme-scope .rm-theme-search input { min-height: 38px; border: 1px solid var(--rm-theme-border); border-radius: 999px; background: transparent; color: inherit; font-size: 12px; padding: 8px 16px; width: 160px; }
.rm-theme-scope .rm-theme-main { max-width: var(--rm-theme-max); margin: 0 auto; padding: 44px 28px 64px; width: 100%; }
.rm-theme-scope .rm-theme-main-wide { max-width: calc(var(--rm-theme-max) + 240px); }
.rm-theme-scope .rm-theme-footer { border-top: 1px solid var(--rm-theme-border); background: var(--rm-theme-surface); color: var(--rm-theme-text); margin-top: 40px; }
.rm-theme-scope .rm-theme-footer-inner { max-width: var(--rm-theme-max); margin: 0 auto; padding: 40px 28px; display: grid; gap: 28px; }
.rm-theme-scope .rm-theme-footer-cols { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.rm-theme-scope .rm-theme-footer h3 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 650; margin-bottom: 12px; opacity: 0.85; }
.rm-theme-scope .rm-theme-footer a { color: var(--rm-theme-text); opacity: 0.82; }
.rm-theme-scope .rm-theme-footer a:hover { opacity: 1; text-decoration: underline; }
.rm-theme-scope .rm-theme-footer-base { border-top: 1px solid var(--rm-theme-border); padding: 16px 28px; text-align: center; font-size: 12px; opacity: 0.68; }
.rm-theme-scope .rm-theme-card { background: var(--rm-theme-surface); border: 1px solid var(--rm-theme-border); border-radius: var(--rm-theme-radius); padding: 26px; margin-bottom: 22px; }
.rm-theme-scope.rm-theme-cards-soft .rm-theme-card { box-shadow: 0 6px 24px rgba(20,30,25,0.07); }
.rm-theme-scope.rm-theme-cards-flat .rm-theme-card { box-shadow: none; }
.rm-theme-scope.rm-theme-cards-outline .rm-theme-card { background: transparent; }
.rm-theme-scope .rm-theme-card h2 { font-size: 26px; line-height: 1.22; font-weight: 600; letter-spacing: -0.03em; }
.rm-theme-scope .rm-theme-card h2 a { color: var(--rm-theme-accent); }
.rm-theme-scope .rm-theme-card img { border-radius: calc(var(--rm-theme-radius) * 0.6); max-height: 320px; width: 100%; object-fit: cover; margin-bottom: 16px; }
.rm-theme-scope .rm-theme-meta { font-size: 12px; color: var(--rm-theme-muted); display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 0 12px; }
.rm-theme-scope .rm-theme-meta a { color: var(--rm-theme-accent); }
.rm-theme-scope .rm-theme-excerpt { color: var(--rm-theme-text); opacity: 0.9; line-height: 1.75; }
.rm-theme-scope .rm-theme-more { display: inline-block; margin-top: 14px; font-size: 13px; font-weight: 600; color: var(--rm-theme-accent); }
.rm-theme-scope .rm-theme-hero { padding: 40px 8px 28px; }
.rm-theme-scope .rm-theme-hero h1 { font-size: clamp(34px, 5vw, 56px); line-height: 1.1; letter-spacing: -0.05em; font-weight: 600; margin-bottom: 14px; }
.rm-theme-scope .rm-theme-hero p { font-size: 17px; line-height: 1.7; color: var(--rm-theme-muted); max-width: 620px; }
.rm-theme-scope .rm-theme-hero img { width: 100%; border-radius: var(--rm-theme-radius); margin-top: 24px; max-height: 420px; object-fit: cover; }
.rm-theme-scope .rm-theme-cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 22px; padding: 12px 22px; border-radius: 999px; background: var(--rm-theme-accent); color: var(--rm-theme-accent-text); font-weight: 600; font-size: 14px; }
.rm-theme-scope .rm-theme-cta:hover { text-decoration: none; filter: brightness(1.06); }
.rm-theme-scope .rm-theme-section-title { font-size: 13px; font-weight: 650; letter-spacing: 0.12em; text-transform: uppercase; color: var(--rm-theme-muted); margin: 38px 0 16px; }
.rm-theme-scope .rm-theme-grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.rm-theme-scope .rm-theme-grid .rm-theme-card { margin-bottom: 0; }
.rm-theme-scope .rm-theme-chip { display: inline-flex; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--rm-theme-border); color: var(--rm-theme-text); font-size: 13px; }
.rm-theme-scope .rm-theme-chip:hover { border-color: var(--rm-theme-accent); color: var(--rm-theme-accent); text-decoration: none; }
.rm-theme-scope .rm-theme-banner { border-radius: var(--rm-theme-radius); padding: 34px; background: var(--rm-theme-surface); border: 1px solid var(--rm-theme-border); }
.rm-theme-scope .rm-theme-banner h2 { font-size: 28px; font-weight: 600; letter-spacing: -0.03em; margin-bottom: 8px; }
.rm-theme-scope .rm-theme-pagination { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--rm-theme-border); padding-top: 20px; margin-top: 28px; font-size: 14px; }
.rm-theme-scope .rm-theme-pagination a { color: var(--rm-theme-accent); }
.rm-theme-scope .rm-theme-article h1 { font-size: clamp(32px, 4vw, 46px); line-height: 1.16; font-weight: 600; letter-spacing: -0.04em; margin-bottom: 12px; }
.rm-theme-scope .rm-theme-article img { border-radius: var(--rm-theme-radius); }
.rm-theme-scope .rm-theme-empty { color: var(--rm-theme-muted); }
`;

export function themeStyleObject(theme: ActiveTheme): CSSProperties {
    const t = theme.tokens;
    const vars: Record<string, string> = {
        "--rm-theme-bg": t.bg,
        "--rm-theme-surface": t.surface,
        "--rm-theme-text": t.text,
        "--rm-theme-muted": t.muted,
        "--rm-theme-accent": t.accent,
        "--rm-theme-accent-text": t.accentText,
        "--rm-theme-header-bg": t.headerBg,
        "--rm-theme-header-text": t.headerText,
        "--rm-theme-border": t.border,
        "--rm-theme-radius": `${t.radius}px`,
        "--rm-theme-max": `${t.maxWidth}px`,
    };
    return {
        background: t.bg,
        color: t.text,
        fontFamily: fontStack(t.font),
        ...vars,
    } as CSSProperties;
}

export function themeScopeClass(theme: ActiveTheme): string {
    const layout = theme.layout;
    return [
        "rm-theme-scope",
        `rm-theme-cards-${layout.cardStyle}`,
        layout.stickyHeader ? "rm-theme-sticky" : "",
        layout.contentWidth === "wide" ? "rm-theme-wide" : "",
    ].filter(Boolean).join(" ");
}

export function ThemeStyles() {
    return <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />;
}
