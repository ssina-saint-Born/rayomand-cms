import { getTranslator, getLocale } from "@/lib/i18n-server";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getPostBySlug, adjacentPosts, findSlugRedirect } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import { getMetaValue } from "@/lib/postmeta";
import { decodeSlug } from "@/lib/slug";
import { currentUser, canEdit } from "@/lib/auth";
import { RenderBlocks } from "@/lib/blocks";
import JsonLd from "@/components/seo/JsonLd";
import Comments from "@/components/site/Comments";
import { formatDate } from "@/lib/format";
import {
    buildMetadata,
    postDescription,
    articleJsonLdWithSite,
    breadcrumbJsonLd,
    resolveOrigin,
} from "@/lib/seo";
export const dynamic = "force-dynamic";

async function loadItem(slug: string) {
    const post = (await getPostBySlug(slug, "post")) || (await getPostBySlug(slug, "page"));
    return post;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const post = await loadItem(decodeSlug(params.slug));
    if (!post) return { title: getTranslator()("Not found"), robots: { index: false, follow: false } };
    // Mirror the body's visibility rules: a non-published (or private, for
    // non-editors) post must not leak its title/description through the head
    // tags even though the body renders 404.
    const viewer = await currentUser();
    const visible = post.status === "publish" || (post.status === "private" && canEdit(viewer));
    if (!visible) return { title: getTranslator()("Not found"), robots: { index: false, follow: false } };
    const origin = await resolveOrigin();
    const seoTitle = await getMetaValue(post.id, "seo_title");
    const seoDesc = await getMetaValue(post.id, "seo_description");
    const seoCanonical = await getMetaValue(post.id, "seo_canonical");
    const seoImage = await getMetaValue(post.id, "seo_image");
    const noindexMeta = await getMetaValue(post.id, "seo_noindex");
    const image = seoImage || post.featured_media?.url || null;
    return buildMetadata(
        {
            title: seoTitle || post.title,
            description: seoDesc || postDescription(post),
            canonicalPath: seoCanonical || `/read/${post.slug}`,
            image,
            type: post.type === "post" ? "article" : "website",
            publishedTime: post.published_at || post.created_at,
            modifiedTime: post.updated_at,
            authors: post.author ? [post.author.display_name] : undefined,
            section: post.categories?.[0]?.name,
            tags: post.tags?.map((t) => t.name),
            noindex: noindexMeta === "1" || post.status !== "publish",
            locale: getLocale(),
        },
        origin,
    );
}

export default async function SingleView({ params }: { params: { slug: string } }) {
    const locale = getLocale();
    const tr = getTranslator();
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const slug = decodeSlug(params.slug);
    const item = await loadItem(slug);

    if (!item) {
        // A renamed permalink keeps working via a 301 to its current URL.
        const redirect = await findSlugRedirect(slug);
        if (redirect) permanentRedirect(`/read/${redirect.slug}`);
        notFound();
    }

    // Private posts are only visible to editors; everyone else gets a 404
    // (not a soft "not found" that still leaks the title).
    if (item.status === "private") {
        const u = await currentUser();
        if (!canEdit(u)) notFound();
    }
    else if (item.status !== "publish") {
        notFound();
    }

    const isPost = item.type === "post";
    const adj = isPost ? (await adjacentPosts(item)) : { prev: null, next: null };
    const origin = await resolveOrigin();

    const description = postDescription(item);
    const jsonLd: Record<string, any>[] = [
        await articleJsonLdWithSite({
            origin,
            post: item,
            description,
            image: item.featured_media?.url || null,
            section: item.categories?.[0]?.name,
            locale,
        }),
        breadcrumbJsonLd(origin, [
            { name: settings.site_title, path: "/" },
            ...(item.categories && item.categories[0]
                ? [{ name: item.categories[0].name, path: `/topics/${item.categories[0].slug}` }]
                : []),
            { name: item.title, path: `/read/${item.slug}` },
        ]),
    ];

    return (<article className="rm-theme-article">
      <JsonLd data={jsonLd}/>
      <header style={{ marginBottom: 24 }}>
        <h1>{item.title}</h1>
        {isPost && (<div className="rm-theme-meta" style={{ fontSize: 13 }}>
            <time dateTime={item.published_at || item.created_at}>{formatDate(item.published_at, undefined, locale)}</time>
            <span>{tr("by")}{" "}<Link href={`/creators/${item.author?.username}`}>{item.author?.display_name}</Link></span>
            {item.categories && item.categories.length > 0 && (<span>
                {tr("in")}{item.categories.map((c, i) => (<span key={c.id}>
                    <Link href={`/topics/${c.slug}`}>{c.name}</Link>
                    {i < item.categories!.length - 1 ? ", " : ""}
                  </span>))}
              </span>)}
          </div>)}
      </header>

      {item.featured_media && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.featured_media.url} alt={item.featured_media.alt || item.title} width={item.featured_media.width || undefined} height={item.featured_media.height || undefined} style={{ width: "100%", maxHeight: 420, objectFit: "cover", marginBottom: 32 }}/> )}

      <RenderBlocks blocks={item.content}/>

      {isPost && item.tags && item.tags.length > 0 && (<div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {item.tags.map((t) => (<Link key={t.id} href={`/labels/${t.slug}`} className="rm-theme-chip">#{t.name}</Link>))}
        </div>)}

      {isPost && item.author && (<div className="rm-theme-card" style={{ marginTop: 40, display: "flex", gap: 16, alignItems: "flex-start" }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "var(--rm-theme-accent)", color: "var(--rm-theme-accent-text)", fontWeight: 700, flexShrink: 0 }}>
            {item.author.display_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}><Link href={`/creators/${item.author.username}`}>{item.author.display_name}</Link></div>
            <p style={{ fontSize: 14, color: "var(--rm-theme-muted)" }}>{item.author.bio || tr("Author at {0}.", { "0": settings.site_title })}</p>
          </div>
        </div>)}

      {isPost && (adj.prev || adj.next) && (<nav aria-label={tr("More posts")} style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, borderTop: "1px solid var(--rm-theme-border)", paddingTop: 24, fontSize: 14 }}>
          <div>{adj.prev && <Link href={`/read/${adj.prev.slug}`}>← {adj.prev.title}</Link>}</div>
          <div style={{ textAlign: "end" }}>{adj.next && <Link href={`/read/${adj.next.slug}`}>{adj.next.title} →</Link>}</div>
        </nav>)}

      <Comments postId={item.id} accent={theme.accent} open={item.comment_status === "open"}/>
    </article>);
}
