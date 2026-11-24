
import { getTranslator, getLocale } from "@/lib/i18n-server";
import Link from "next/link";
import type { Post } from "@/lib/types";
import { formatDate, excerptFrom } from "@/lib/format";
import { blocksToPlainText } from "@/lib/blocks";

export default function PostCard({ post, accent }: { post: Post; accent: string }) {
    const locale = getLocale();
    const tr = getTranslator();
  const excerpt = post.excerpt || excerptFrom(blocksToPlainText(post.content), 220);
  return (
    <article className="noma-journal">
      {post.featured_media && (
        <Link href={`/read/${post.slug}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.featured_media.url} alt={post.featured_media.alt} className="w-full max-h-80 object-cover rounded-md mb-4" />
        </Link>
      )}
      <h2 className="text-2xl font-bold mb-2">
        <Link href={`/read/${post.slug}`} className="hover:underline" style={{ color: accent }}>
          {post.title}
        </Link>
        {post.sticky ? <span className="ms-2 text-xs align-middle bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">{tr("Featured")}</span> : null}
      </h2>
      <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
        <span>{formatDate(post.published_at, undefined, locale)}</span>
        <span>{tr("by")}{" "}{post.author?.display_name || tr("unknown")}</span>
        {post.categories && post.categories.length > 0 && (
          <span>
            {tr("in")}{post.categories.map((c, i) => (
              <span key={c.id}>
                <Link href={`/topics/${c.slug}`} className="hover:underline" style={{ color: accent }}>{c.name}</Link>
                {i < post.categories!.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
        <span>{post.comment_count ?? 0} {" "}{tr("comments")}</span>
      </div>
      <p className="text-gray-700 leading-relaxed">{excerpt}</p>
      <Link href={`/read/${post.slug}`} className="inline-block mt-3 text-sm font-semibold hover:underline" style={{ color: accent }}>
        {tr("Continue reading →")}</Link>
    </article>
  );
}