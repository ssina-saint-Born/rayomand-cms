import { getTranslator } from "@/lib/i18n-server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUserByUsername } from "@/lib/users";
import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { decodeSlug } from "@/lib/slug";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import Archive from "@/components/site/Archive";
import JsonLd from "@/components/seo/JsonLd";
import { archiveMetadata, breadcrumbJsonLd, resolveOrigin, absoluteUrl } from "@/lib/seo";
export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: { page?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const user = await getUserByUsername(decodeSlug(params.slug));
    if (!user) return { title: getTranslator()("Not found"), robots: { index: false, follow: false } };
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const origin = await resolveOrigin();
    return archiveMetadata({
        title: user.display_name,
        description: user.bio || getTranslator()("Articles by {0}.", { "0": user.display_name }),
        path: `/creators/${user.username}`,
        page,
        origin,
    });
}

export default async function AuthorArchive({ params, searchParams }: Props) {
    const tr = getTranslator();
    const user = (await getUserByUsername(decodeSlug(params.slug)));
    if (!user)
        notFound();
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const { items, total } = (await listPosts({ type: "post", status: "publish", author: user.id, page, perPage: settings.posts_per_page }));
    const origin = await resolveOrigin();
    const jsonLd = [
        {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
                "@type": "Person",
                name: user.display_name,
                description: user.bio || undefined,
                url: absoluteUrl(origin, `/creators/${user.username}`),
            },
        },
        breadcrumbJsonLd(origin, [
            { name: settings.site_title, path: "/" },
            { name: user.display_name, path: `/creators/${user.username}` },
        ]),
    ];
    return (<>
      {page === 1 && <JsonLd data={jsonLd}/>}
      <Archive title={tr("Author: {0}", {"0": String(user.display_name ?? "")})} description={user.bio} posts={items} theme={theme} baseHref={`/creators/${user.username}`} page={page} totalPages={Math.max(1, Math.ceil(total / settings.posts_per_page))}/>
    </>);
}
