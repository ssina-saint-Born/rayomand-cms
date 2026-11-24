import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSettings } from "./options";
import { blocksToPlainText } from "./blocks";
import { truncate } from "./format";
import type { Post } from "./types";

// Central SEO helpers. Everything here derives from the existing settings and
// post rows so no schema change is needed for the base layer. Per-post overrides
// live in `postmeta` and are read by the page-level generateMetadata calls.

export const SITE_NAME_FALLBACK = "Rayomand CMS";

// Absolute site origin for canonical/OG/sitemap URLs. Prefers an explicit
// `site_url` setting, then NEXT_PUBLIC_SITE_URL, then the request host.
export async function getSiteUrl(explicitOrigin?: string): Promise<string> {
  if (explicitOrigin) return explicitOrigin.replace(/\/+$/, "");
  const o = await getSettings();
  const configured = (o as any).site_url || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (configured) return String(configured).replace(/\/+$/, "");
  return "";
}

// Derive the origin from the incoming request (proxy-aware) so canonical and
// OpenGraph URLs stay absolute even before `site_url` is configured.
export function requestOrigin(): string {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    if (!host) return "";
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

// Resolve the best absolute origin: configured site_url wins, else request host.
export async function resolveOrigin(): Promise<string> {
  const configured = await getSiteUrl();
  return configured || requestOrigin();
}

export function absoluteUrl(origin: string, path: string): string {
  if (!path) return origin;
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// Search engines should ignore private previews and scheduled posts. `blog_public`
// (Settings → Reading → Search Engine Visibility) turns the whole site off.
export async function siteIsIndexable(): Promise<boolean> {
  const o = await getSettings();
  return o.blog_public !== false;
}

export function postIsPublic(post: Pick<Post, "status">): boolean {
  return post.status === "publish";
}

export interface SeoInput {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
  authors?: string[];
  section?: string;
  tags?: string[];
  noindex?: boolean;
  locale?: string;
}

function clampDescription(text: string, max = 160): string {
  return truncate(text, max);
}

// Build a Next.js Metadata object from page-level SEO input plus site settings.
export async function buildMetadata(input: SeoInput, origin: string): Promise<Metadata> {
  const settings = await getSettings();
  const siteTitle = settings.site_title || SITE_NAME_FALLBACK;
  const tagline = settings.tagline || "";
  const indexable = await siteIsIndexable();
  const title = input.title?.trim() || siteTitle;
  const description = clampDescription(input.description?.trim() || tagline || settings.site_title || "");
  const canonical = input.canonicalPath ? absoluteUrl(origin, input.canonicalPath) : undefined;
  const image = input.image ? absoluteUrl(origin, input.image) : undefined;
  const noindex = input.noindex || !indexable;

  const ogImages = image ? [{ url: image, alt: title }] : undefined;

  // When the page title already equals the site title (e.g. the home archive),
  // emitting it as a plain string would let the root layout template produce
  // "Title · Title". Use an absolute title to bypass the template in that case.
  const pageTitle: Metadata["title"] =
    title === siteTitle ? { absolute: title } : title;

  return {
    title: pageTitle,
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: {
      type: input.type || "website",
      siteName: siteTitle,
      title,
      description,
      url: canonical,
      images: ogImages,
      locale: input.locale === "fa" ? "fa_IR" : "en_US",
      ...(input.type === "article"
        ? {
            publishedTime: input.publishedTime || undefined,
            modifiedTime: input.modifiedTime || undefined,
            authors: input.authors,
            section: input.section,
            tags: input.tags,
          }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

// Derive a description from a post: explicit excerpt, else first text blocks.
export function postDescription(post: Post, max = 160): string {
  const fromExcerpt = (post.excerpt || "").trim();
  if (fromExcerpt) return clampDescription(fromExcerpt, max);
  return clampDescription(blocksToPlainText(post.content), max);
}

// ---------------------------------------------------------------- JSON-LD ---

export interface OrganizationInput {
  origin: string;
  siteTitle: string;
  logo?: string | null;
  sameAs?: string[];
  description?: string;
}

export function organizationJsonLd(o: OrganizationInput): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: o.siteTitle,
    url: o.origin || undefined,
    logo: o.logo ? absoluteUrl(o.origin, o.logo) : undefined,
    description: o.description || undefined,
    sameAs: o.sameAs && o.sameAs.length ? o.sameAs : undefined,
  };
}

export function websiteJsonLd(o: { origin: string; siteTitle: string; description?: string }): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: o.siteTitle,
    url: o.origin || undefined,
    description: o.description || undefined,
    potentialAction: o.origin
      ? {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${o.origin}/search?s={search_term_string}` },
          "query-input": "required name=search_term_string",
        }
      : undefined,
  };
}

export interface ArticleJsonLdInput {
  origin: string;
  post: Post;
  description: string;
  image?: string | null;
  section?: string;
  siteName?: string;
  locale?: string;
}

export function articleJsonLd(i: ArticleJsonLdInput): Record<string, any> {
  const { post } = i;
  const url = absoluteUrl(i.origin, `/read/${post.slug}`);
  const authorName = post.author?.display_name || post.author?.username || undefined;
  return {
    "@context": "https://schema.org",
    "@type": post.type === "page" ? "WebPage" : "Article",
    headline: truncate(post.title, 110),
    description: i.description || undefined,
    image: i.image ? [absoluteUrl(i.origin, i.image)] : undefined,
    datePublished: post.published_at || post.created_at || undefined,
    dateModified: post.updated_at || post.published_at || undefined,
    author: authorName ? { "@type": "Person", name: authorName } : undefined,
    publisher: { "@type": "Organization", name: i.siteName || SITE_NAME_FALLBACK },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    articleSection: i.section || undefined,
    inLanguage: i.locale === "fa" ? "fa-IR" : "en",
  };
}

export async function articleJsonLdWithSite(i: Omit<ArticleJsonLdInput, "siteName">): Promise<Record<string, any>> {
  const settings = await getSettings();
  return articleJsonLd({ ...i, siteName: settings.site_title || SITE_NAME_FALLBACK });
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(origin: string, items: BreadcrumbItem[]): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: absoluteUrl(origin, it.path),
    })),
  };
}

export function collectionPageJsonLd(o: { origin: string; name: string; description?: string; path: string }): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: o.name,
    description: o.description || undefined,
    url: absoluteUrl(o.origin, o.path),
  };
}

export function productJsonLd(p: {
  origin: string;
  name: string;
  description?: string;
  image?: string | null;
  sku?: string;
  price?: number | null;
  currency?: string;
  inStock?: boolean;
  url: string;
  ratingValue?: number;
  reviewCount?: number;
}): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description || undefined,
    image: p.image ? [absoluteUrl(p.origin, p.image)] : undefined,
    sku: p.sku || undefined,
    brand: { "@type": "Brand", name: p.name.split(" ")[0] || p.name },
    offers: {
      "@type": "Offer",
      price: p.price == null ? undefined : Number(p.price),
      priceCurrency: p.currency || "USD",
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absoluteUrl(p.origin, p.url),
    },
    ...(p.ratingValue && p.reviewCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.ratingValue,
            reviewCount: p.reviewCount,
          },
        }
      : {}),
  };
}

// Canonical path helper that strips query noise (pagination, tracking) for the
// base canonical while letting callers opt into a specific page number.
export function canonicalPath(path: string, page?: number): string {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  return page && page > 1 ? `${clean}?page=${page}` : clean;
}

// Archive metadata (category/tag/author) built from a title + description.
export async function archiveMetadata(o: {
  title: string;
  description?: string;
  path: string;
  page: number;
  origin: string;
  image?: string | null;
}): Promise<Metadata> {
  return buildMetadata(
    {
      title: o.title,
      description: o.description,
      canonicalPath: canonicalPath(o.path, o.page),
      image: o.image ?? null,
      type: "website",
      noindex: o.page > 1,
    },
    o.origin,
  );
}
