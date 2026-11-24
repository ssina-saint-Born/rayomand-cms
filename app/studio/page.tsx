
import { getTranslator, getLocale } from "@/lib/i18n-server";
import Link from "next/link";
import { countByStatus } from "@/lib/posts";
import { countByStatus as commentCounts, recentComments } from "@/lib/comments";
import { countMedia } from "@/lib/media";
import { countUsers } from "@/lib/users";
import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { Card } from "@/components/admin/ui";
import QuickDraft from "@/components/admin/QuickDraft";
import BrandMark from "@/components/BrandMark";
import { getTheme } from "@/lib/themes";
import { formatDate, timeAgo } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
    const locale = getLocale();
    const tr = getTranslator();
    const postCounts = (await countByStatus("post"));
    const pageCounts = (await countByStatus("page"));
    const cCounts = (await commentCounts());
    const settings = (await getSettings());
    const recent = (await listPosts({ type: "post", status: "any", perPage: 5 })).items;
    const comments = (await recentComments(5));
    const stats = [
        { label: "Posts", value: postCounts.publish || 0, href: "/studio/posts" },
        { label: "Pages", value: pageCounts.publish || 0, href: "/studio/pages" },
        { label: "Comments", value: cCounts.approved || 0, href: "/studio/comments" },
        { label: "Media", value: (await countMedia()), href: "/studio/media" },
        { label: "Users", value: (await countUsers()), href: "/studio/users" },
    ];
    return (<div>
      <section className="noma-dashboard-intro">
        <div><p className="noma-eyebrow">{tr("A fresh perspective")}</p><h1>{tr("Your space to create.")}</h1><p>{tr("Keep your stories, collections and conversations moving. Everything you need, with a little room to breathe.")}</p></div>
        <BrandMark />
      </section>
      <div className="noma-dashboard-stats">
        {stats.map((s) => <Link key={s.label} href={s.href}><span>{tr(s.label)}</span><strong>{s.value}</strong></Link>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title={tr("Workspace at a glance")}>
          <p className="text-sm text-rm-muted leading-relaxed">{tr("Your site uses the")}{" "}<strong className="text-rm-dark">{getTheme(settings.theme).name}</strong> {" "}{tr("design. Shape your next idea in the studio, or refine your workspace below.")}</p>
          <div className="flex flex-wrap gap-2 mt-5"><Link href="/studio/themes" className="rm-btn rm-btn-secondary">{tr("Explore designs")}</Link><Link href="/" className="rm-btn rm-btn-ghost">{tr("Open your site →")}</Link></div>
        </Card>

        <Card title={tr("Capture an idea")}>
          <QuickDraft />
        </Card>

        <Card title={tr("Activity — Recently Published")}>
          {recent.length === 0 ? (<p className="text-sm text-rm-muted">{tr("No posts yet.")}</p>) : (<ul className="space-y-2">
              {recent.map((p) => (<li key={p.id} className="text-sm flex items-center justify-between">
                  <Link href={`/studio/editor/${p.id}`} className="text-rm-blue hover:underline truncate">
                    {p.title || tr("(no title)")}
                  </Link>
                  <span className="text-xs text-rm-muted shrink-0 ms-2">
                    {tr(p.status)} · {p.published_at ? formatDate(p.published_at, undefined, locale) : tr("draft")}
                  </span>
                </li>))}
            </ul>)}
        </Card>

        <Card title={tr("Recent Comments")}>
          {comments.length === 0 ? (<p className="text-sm text-rm-muted">{tr("No comments yet.")}</p>) : (<ul className="space-y-3">
              {comments.map((c) => (<li key={c.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.author_name}</span>
                    <span className="text-xs text-rm-muted">{timeAgo(c.created_at, locale)} · {tr(c.status)}</span>
                  </div>
                  <p className="text-rm-muted truncate">{c.content}</p>
                  <Link href={`/studio/comments`} className="text-xs text-rm-blue hover:underline">
                    {tr("on")}{c.post_title}
                  </Link>
                </li>))}
            </ul>)}
        </Card>
      </div>
    </div>);
}
