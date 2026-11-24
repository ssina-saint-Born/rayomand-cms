import { getTranslator } from "@/lib/i18n-server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTermBySlug } from "@/lib/terms";
import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { decodeSlug } from "@/lib/slug";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import Archive from "@/components/site/Archive";
import JsonLd from "@/components/seo/JsonLd";
import { archiveMetadata, collectionPageJsonLd, breadcrumbJsonLd, resolveOrigin } from "@/lib/seo";
export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: { page?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const term = await getTermBySlug("tag", decodeSlug(params.slug));
    if (!term) return { title: getTranslator()("Not found"), robots: { index: false, follow: false } };
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const origin = await resolveOrigin();
    return archiveMetadata({
        title: term.name,
        description: term.description || getTranslator()("Posts tagged {0}.", { "0": term.name }),
        path: `/labels/${term.slug}`,
        page,
        origin,
    });
}

export default async function TagArchive({ params, searchParams }: Props) {
    const tr = getTranslator();
    const term = (await getTermBySlug("tag", decodeSlug(params.slug)));
    if (!term)
        notFound();
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const { items, total } = (await listPosts({ type: "post", status: "publish", tag: term.id, page, perPage: settings.posts_per_page }));
    const origin = await resolveOrigin();
    const jsonLd = [
        collectionPageJsonLd({ origin, name: term.name, description: term.description, path: `/labels/${term.slug}` }),
        breadcrumbJsonLd(origin, [
            { name: settings.site_title, path: "/" },
            { name: term.name, path: `/labels/${term.slug}` },
        ]),
    ];
    return (<>
      {page === 1 && <JsonLd data={jsonLd}/>}
      <Archive title={tr("Tag: {0}", {"0": String(term.name ?? "")})} description={term.description} posts={items} theme={theme} baseHref={`/labels/${term.slug}`} page={page} totalPages={Math.max(1, Math.ceil(total / settings.posts_per_page))}/>
    </>);
}
