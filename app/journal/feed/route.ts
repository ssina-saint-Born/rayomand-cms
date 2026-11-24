import { listPosts } from "@/lib/posts";
import { getSettings } from "@/lib/options";
import { blocksToPlainText } from "@/lib/blocks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function esc(s: string): string {
    return (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
export async function GET(req: Request) {
    const settings = (await getSettings());
    const { items } = (await listPosts({ type: "post", status: "publish", perPage: 20 }));
    const base = esc(new URL(req.url).origin);
    const entries = items
        .map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/read/${p.slug}</link>
      <guid>${base}/read/${p.slug}</guid>
      <pubDate>${p.published_at ? new Date(p.published_at).toUTCString() : ""}</pubDate>
      <description>${esc(p.excerpt || blocksToPlainText(p.content).slice(0, 300))}</description>
    </item>`)
        .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(settings.site_title)}</title>
    <link>${base}/</link>
    <description>${esc(settings.tagline)}</description>
    <language>en</language>
${entries}
  </channel>
</rss>`;
    return new Response(xml, {
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
}
