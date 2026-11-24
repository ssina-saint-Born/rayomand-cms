import { getTranslator } from "@/lib/i18n-server";
import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import { listPosts, getPost } from "@/lib/posts";
import { listTerms } from "@/lib/terms";
import { RenderBlocks } from "@/lib/blocks";
import HomeSections from "@/components/site/theme/HomeSections";
import ThemePostCard from "@/components/site/theme/ThemePostCard";
import JsonLd from "@/components/seo/JsonLd";
import { buildMetadata, websiteJsonLd, organizationJsonLd, resolveOrigin, canonicalPath } from "@/lib/seo";
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: { page?: string } }): Promise<Metadata> {
    const settings = await getSettings();
    const origin = await resolveOrigin();
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const frontPage = settings.show_on_front === "page" && settings.page_on_front ? await getPost(Number(settings.page_on_front)) : null;
    return buildMetadata(
        {
            title: frontPage?.title || settings.site_title,
            description: frontPage?.excerpt || settings.tagline,
            canonicalPath: canonicalPath("/", page),
            image: settings.default_og_image || null,
            type: "website",
            // Page 2+ of an archive is a duplicate listing: keep it crawlable but
            // out of the index so the canonical home page ranks.
            noindex: page > 1,
        },
        origin,
    );
}

export default async function Home({ searchParams }: { searchParams: { page?: string } }) {
    const tr = getTranslator();
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const origin = await resolveOrigin();

    if (settings.show_on_front === "page" && settings.page_on_front) {
        const front = (await getPost(Number(settings.page_on_front)));
        if (front) {
            return (<div>
          <JsonLd data={websiteJsonLd({ origin, siteTitle: settings.site_title, description: settings.tagline })}/>
          <article className="rm-theme-article">
            <h1>{front.title}</h1>
            <RenderBlocks blocks={front.content}/>
          </article>
        </div>);
        }
    }

    const socialProfiles = (settings.social_profiles || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const jsonLd: Record<string, any>[] = [
        websiteJsonLd({ origin, siteTitle: settings.site_title, description: settings.tagline }),
        organizationJsonLd({
            origin,
            siteTitle: settings.organization_name || settings.site_title,
            logo: settings.organization_logo || settings.site_icon || null,
            sameAs: socialProfiles,
            description: settings.tagline,
        }),
    ];

    // Archive pagination (page >= 2) bypasses the declarative section list so a
    // "latest" section can't loop on itself.
    if (page > 1) {
        const { items, total } = (await listPosts({ type: "post", status: "publish", page, perPage: settings.posts_per_page }));
        const totalPages = Math.max(1, Math.ceil(total / settings.posts_per_page));
        return (<div>
          <h1 className="sr-only">{settings.site_title} — {tr("Page")} {page}</h1>
          {items.map((p) => <ThemePostCard key={p.id} post={p} theme={theme} />)}
          <nav className="rm-theme-pagination" aria-label={tr("Pagination")}>
            {page > 1 ? <Link href={`/?page=${page - 1}`} rel="prev">← {tr("Newer posts")}</Link> : <span />}
            <span>{tr("Page")} {page} {tr("of")} {totalPages}</span>
            {page < totalPages ? <Link href={`/?page=${page + 1}`} rel="next">{tr("Older posts →")}</Link> : <span />}
          </nav>
        </div>);
    }

    const wantsFeatured = theme.home.some((s) => s.type === "featured");
    const wantsCategories = theme.home.some((s) => s.type === "categories");
    const maxLatest = Math.max(10, ...theme.home.map((s) => (s.type === "latest" ? s.count : 0)));
    const maxFeatured = Math.max(3, ...theme.home.map((s) => (s.type === "featured" ? s.count : 0)));

    const latest = (await listPosts({ type: "post", status: "publish", page: 1, perPage: maxLatest })).items;
    const featured = wantsFeatured
        ? (await listPosts({ type: "post", status: "publish", perPage: maxFeatured, sticky: true })).items
        : [];
    const categories = wantsCategories ? (await listTerms("category")) : [];

    return (<div>
      <JsonLd data={jsonLd}/>
      {/* The hero section renders its own <h1>; only add a visually-hidden
          heading when the theme's section list has no hero, so the page always
          has exactly one top-level heading. */}
      {!theme.home.some((s) => s.type === "hero") && <h1 className="sr-only">{settings.site_title}</h1>}
      <HomeSections theme={theme} settings={settings} sections={theme.home} data={{ featured, latest, categories }}/>
    </div>);
}
