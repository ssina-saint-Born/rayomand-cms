import Link from "next/link";
import type { ActiveTheme, HomeSection } from "@/lib/theme/spec";
import type { SiteSettings } from "@/lib/options";
import type { Post, Term } from "@/lib/types";
import ThemePostCard from "./ThemePostCard";
import { getTranslator } from "@/lib/i18n-server";

interface SectionData {
    featured: Post[];
    latest: Post[];
    categories: Term[];
}

// Renders the ordered home-page sections declared in the active theme. Data is
// fetched once in the page and passed in, so the section list stays purely
// presentational and can change without touching query code.
export default function HomeSections({ theme, settings, sections, data }: {
    theme: ActiveTheme;
    settings: SiteSettings;
    sections: HomeSection[];
    data: SectionData;
}) {
    const tr = getTranslator();
    return (
        <>
            {sections.map((section, i) => {
                switch (section.type) {
                    case "hero":
                        return (
                            <section key={i} className="rm-theme-hero">
                                <h1>{section.title || settings.site_title}</h1>
                                <p>{section.subtitle || settings.tagline}</p>
                                {section.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={section.image} alt="" />
                                ) : null}
                                {section.cta ? <Link href={section.cta.url} className="rm-theme-cta">{section.cta.label} →</Link> : null}
                            </section>
                        );
                    case "featured": {
                        const posts = data.featured.slice(0, section.count);
                        if (!posts.length) return null;
                        return (
                            <section key={i}>
                                <h2 className="rm-theme-section-title">{section.title || tr("Featured")}</h2>
                                <div className="rm-theme-grid">
                                    {posts.map((p) => <ThemePostCard key={p.id} post={p} theme={theme} compact />)}
                                </div>
                            </section>
                        );
                    }
                    case "latest": {
                        const posts = data.latest.slice(0, section.count);
                        return (
                            <section key={i}>
                                {section.title ? <h2 className="rm-theme-section-title">{section.title}</h2> : null}
                                {posts.length === 0
                                    ? <p className="rm-theme-empty">{tr("Nothing published yet. Log in to the dashboard to write your first post.")}</p>
                                    : posts.map((p) => <ThemePostCard key={p.id} post={p} theme={theme} />)}
                            </section>
                        );
                    }
                    case "categories": {
                        const cats = data.categories.slice(0, section.limit);
                        if (!cats.length) return null;
                        return (
                            <section key={i}>
                                <h2 className="rm-theme-section-title">{section.title || tr("Categories")}</h2>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                                    {cats.map((c) => <Link key={c.id} href={`/topics/${c.slug}`} className="rm-theme-chip">{c.name}</Link>)}
                                </div>
                            </section>
                        );
                    }
                    case "cta":
                        return (
                            <section key={i} className="rm-theme-banner" style={{ marginTop: 32 }}>
                                <h2>{section.title}</h2>
                                {section.body ? <p className="rm-theme-excerpt">{section.body}</p> : null}
                                {section.cta ? <Link href={section.cta.url} className="rm-theme-cta">{section.cta.label} →</Link> : null}
                            </section>
                        );
                    default:
                        return null;
                }
            })}
        </>
    );
}
