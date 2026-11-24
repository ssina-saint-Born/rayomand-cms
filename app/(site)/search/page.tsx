import { getTranslator } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import Archive from "@/components/site/Archive";
import { buildMetadata, resolveOrigin, canonicalPath } from "@/lib/seo";
export const dynamic = "force-dynamic";

type Props = { searchParams: { s?: string; page?: string } };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const tr = getTranslator();
    const s = (searchParams.s || "").trim();
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const origin = await resolveOrigin();
    // Search result pages are never indexed (duplicate, thin, query-driven).
    return buildMetadata(
        {
            title: s ? tr("Search Results for: {0}", { "0": s }) : tr("Search"),
            description: tr("Search published stories and pages."),
            canonicalPath: canonicalPath("/search", page),
            noindex: true,
        },
        origin,
    );
}

export default async function SearchPage({ searchParams }: Props) {
    const tr = getTranslator();
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const s = (searchParams.s || "").trim();
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const posts = s ? (await listPosts({ type: "post", status: "publish", search: s, page, perPage: settings.posts_per_page })) : { items: [], total: 0 };
    return (<Archive title={s ? tr("Search Results for: {0}", {"0": String(s ?? "")}) : tr("Search")} posts={posts.items} theme={theme} baseHref={`/search?s=${encodeURIComponent(s)}`} page={page} totalPages={Math.max(1, Math.ceil(posts.total / settings.posts_per_page))}/>);
}
