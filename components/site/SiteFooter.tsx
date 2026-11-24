
import { getTranslator } from "@/lib/i18n-server";
import Link from "next/link";
import type { SiteSettings } from "@/lib/options";
import type { ThemeDef } from "@/lib/themes";
import { listTerms } from "@/lib/terms";
import { listPosts } from "@/lib/posts";
export default async function SiteFooter({ settings, theme, }: {
    settings: SiteSettings;
    theme: ThemeDef;
}) {
    const tr = getTranslator();
    const title = settings.site_title;
    const categories = (await listTerms("category")).slice(0, 8);
    const recent = (await listPosts({ type: "post", status: "publish", perPage: 5 })).items;
    return (<footer style={{ background: theme.headerBg, color: theme.headerText }} className="noma-site-footer">
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
        <div>
          <h3 className="font-semibold mb-3" style={{ color: theme.headerText }}>{tr("Categories")}</h3>
          <ul className="space-y-1">
            {categories.map((c) => (<li key={c.id}><Link href={`/topics/${c.slug}`} className="opacity-80 hover:underline" style={{ color: theme.headerText }}>{c.name}</Link></li>))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-3" style={{ color: theme.headerText }}>{tr("Recent Posts")}</h3>
          <ul className="space-y-1">
            {recent.map((p) => (<li key={p.id}><Link href={`/read/${p.slug}`} className="opacity-80 hover:underline" style={{ color: theme.headerText }}>{p.title}</Link></li>))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-3" style={{ color: theme.headerText }}>{tr("Workspace")}</h3>
          <ul className="space-y-1">
            <li><Link href="/auth/sign-in" className="opacity-80 hover:underline" style={{ color: theme.headerText }}>{tr("Log in")}</Link></li>
            <li><Link href="/journal/feed" className="opacity-80 hover:underline" style={{ color: theme.headerText }}>{tr("Entries feed (RSS)")}</Link></li>
            <li><Link href="/studio" className="opacity-80 hover:underline" style={{ color: theme.headerText }}>{tr("Dashboard")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-black/10 py-4 text-center text-xs opacity-70" style={{ color: theme.headerText }}>
        {title} {tr("· A little space for good ideas.")}</div>
    </footer>);
}
