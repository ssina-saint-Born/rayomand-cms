import Link from "next/link";
import type { Post } from "@/lib/types";
import type { ActiveTheme } from "@/lib/theme/spec";
import { formatDate, excerptFrom } from "@/lib/format";
import { blocksToPlainText } from "@/lib/blocks";
import { getLocale, getTranslator } from "@/lib/i18n-server";

export default function ThemePostCard({ post, theme, compact = false }: {
    post: Post;
    theme: ActiveTheme;
    compact?: boolean;
}) {
    const tr = getTranslator();
    const locale = getLocale();
    const excerpt = post.excerpt || excerptFrom(blocksToPlainText(post.content), compact ? 120 : 200);
    return (
        <article className="rm-theme-card">
            {post.featured_media && (
                <Link href={`/read/${post.slug}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.featured_media.url} alt={post.featured_media.alt || post.title} />
                </Link>
            )}
            <h2>
                <Link href={`/read/${post.slug}`}>{post.title}</Link>
                {post.sticky ? <span style={{ fontSize: 11, marginInlineStart: 8, opacity: 0.7 }}>· {tr("Featured")}</span> : null}
            </h2>
            <div className="rm-theme-meta">
                <span>{formatDate(post.published_at, undefined, locale)}</span>
                {post.author && <span>{tr("by")} {post.author.display_name}</span>}
                {post.categories && post.categories.length > 0 && (
                    <span>{post.categories.map((c, i) => (
                        <span key={c.id}>
                            <Link href={`/topics/${c.slug}`}>{c.name}</Link>{i < post.categories!.length - 1 ? ", " : ""}
                        </span>
                    ))}</span>
                )}
            </div>
            <p className="rm-theme-excerpt">{excerpt}</p>
            <Link href={`/read/${post.slug}`} className="rm-theme-more">{tr("Continue reading →")}</Link>
        </article>
    );
}
