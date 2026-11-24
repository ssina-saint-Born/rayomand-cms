import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/options";
import { resolveOrigin, absoluteUrl } from "@/lib/seo";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Full sitemap of public, indexable URLs: posts, pages, categories, tags,
// authors, the shop and each visible product. Excluded entirely when the site
// is set to discourage indexing.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings();
  if (settings.blog_public === false) return [];

  const origin = await resolveOrigin();
  if (!origin) return [];
  const db = getDb();
  const entries: MetadataRoute.Sitemap = [];

  const staticPaths: Array<{ path: string; priority: number; freq: "daily" | "weekly" | "monthly" }> = [
    { path: "/", priority: 1, freq: "daily" },
    { path: "/collection", priority: 0.8, freq: "weekly" },
  ];
  for (const s of staticPaths) {
    entries.push({ url: absoluteUrl(origin, s.path), changeFrequency: s.freq, priority: s.priority });
  }

  const posts = (await db.many(
    "SELECT slug, updated_at, published_at FROM posts WHERE status='publish' AND type='post' ORDER BY published_at DESC",
  )) as Array<{ slug: string; updated_at: string; published_at: string | null }>;
  for (const p of posts) {
    entries.push({
      url: absoluteUrl(origin, `/read/${p.slug}`),
      lastModified: p.updated_at || p.published_at || undefined,
      changeFrequency: "monthly",
      priority: 0.9,
    });
  }

  const pages = (await db.many(
    "SELECT slug, updated_at, published_at FROM posts WHERE status='publish' AND type='page' ORDER BY published_at DESC",
  )) as Array<{ slug: string; updated_at: string; published_at: string | null }>;
  for (const p of pages) {
    entries.push({
      url: absoluteUrl(origin, `/read/${p.slug}`),
      lastModified: p.updated_at || p.published_at || undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  const terms = (await db.many("SELECT taxonomy, slug FROM terms ORDER BY taxonomy, name")) as Array<{
    taxonomy: string;
    slug: string;
  }>;
  for (const t of terms) {
    const path = t.taxonomy === "category" ? `/topics/${t.slug}` : `/labels/${t.slug}`;
    entries.push({ url: absoluteUrl(origin, path), changeFrequency: "weekly", priority: 0.5 });
  }

  const authors = (await db.many(
    "SELECT DISTINCT u.username FROM users u JOIN posts p ON p.author_id=u.id WHERE p.status='publish' AND p.type='post'",
  )) as Array<{ username: string }>;
  for (const a of authors) {
    entries.push({ url: absoluteUrl(origin, `/creators/${a.username}`), changeFrequency: "weekly", priority: 0.4 });
  }

  const products = (await db.many(
    "SELECT slug, updated_at FROM products WHERE status='publish' AND catalog_visibility != 'hidden' AND type != 'variation'",
  )) as Array<{ slug: string; updated_at: string }>;
  for (const p of products) {
    entries.push({
      url: absoluteUrl(origin, `/collection/items/${p.slug}`),
      lastModified: p.updated_at || undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
