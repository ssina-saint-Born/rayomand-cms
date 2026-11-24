import Link from "next/link";
import type { ActiveTheme } from "@/lib/theme/spec";
import type { SiteSettings } from "@/lib/options";
import { listTerms } from "@/lib/terms";
import { listPosts } from "@/lib/posts";
import { getTranslator } from "@/lib/i18n-server";

export default async function ThemeFooter({ theme, settings }: {
    theme: ActiveTheme;
    settings: SiteSettings;
}) {
    const tr = getTranslator();
    const simple = theme.layout.footer === "simple";
    const categories = simple ? [] : (await listTerms("category")).slice(0, 8);
    const recent = simple ? [] : (await listPosts({ type: "post", status: "publish", perPage: 5 })).items;
    return (
        <footer className="rm-theme-footer">
            <div className={`rm-theme-footer-inner${simple ? "" : " rm-theme-footer-cols"}`}>
                {simple ? (
                    <div style={{ textAlign: "center" }}>
                        <div className="rm-theme-brand-title" style={{ fontSize: 20 }}>{settings.site_title}</div>
                        {settings.tagline ? <p style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>{settings.tagline}</p> : null}
                        <nav style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, fontSize: 13 }}>
                            <Link href="/collection">{tr("Collection")}</Link>
                            <Link href="/account">{tr("My account")}</Link>
                            <Link href="/journal/feed">{tr("Feed")}</Link>
                            <Link href="/studio">{tr("Dashboard")}</Link>
                        </nav>
                    </div>
                ) : (
                    <>
                        <div>
                            <h3>{tr("Categories")}</h3>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                                {categories.map((c) => <li key={c.id}><Link href={`/topics/${c.slug}`}>{c.name}</Link></li>)}
                            </ul>
                        </div>
                        <div>
                            <h3>{tr("Recent Posts")}</h3>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                                {recent.map((p) => <li key={p.id}><Link href={`/read/${p.slug}`}>{p.title}</Link></li>)}
                            </ul>
                        </div>
                        <div>
                            <h3>{tr("Workspace")}</h3>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                                <li><Link href="/auth/sign-in">{tr("Log in")}</Link></li>
                                <li><Link href="/journal/feed">{tr("Entries feed (RSS)")}</Link></li>
                                <li><Link href="/studio">{tr("Dashboard")}</Link></li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
            <div className="rm-theme-footer-base">{settings.site_title} · {tr("A little space for good ideas.")}</div>
        </footer>
    );
}
