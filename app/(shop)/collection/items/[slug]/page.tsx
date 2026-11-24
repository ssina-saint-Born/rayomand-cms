import type { Metadata } from "next";
import ProductDetail from "@/components/shop/ProductDetail";
import JsonLd from "@/components/seo/JsonLd";
import { getProduct } from "@/lib/shop/products";
import { getSettings } from "@/lib/options";
import { decodeSlug } from "@/lib/slug";
import { buildMetadata, resolveOrigin, productJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { truncate } from "@/lib/format";
import { blocksToPlainText } from "@/lib/blocks";

export const dynamic = "force-dynamic";

async function loadProduct(slug: string) {
  const p = await getProduct(slug);
  if (!p || p.status !== "publish") return null;
  return p;
}

function plain(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const origin = await resolveOrigin();
  const p = await loadProduct(decodeSlug(params.slug));
  if (!p) {
    return { title: "Product not found", robots: { index: false, follow: false } };
  }
  const description = truncate(plain(p.short_description || p.description), 160);
  return buildMetadata(
    {
      title: p.name,
      description,
      canonicalPath: `/collection/items/${p.slug}`,
      image: p.images?.[0]?.src || null,
      type: "website",
    },
    origin,
  );
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const origin = await resolveOrigin();
  const settings = await getSettings();
  const p = await loadProduct(decodeSlug(params.slug));
  const jsonLd: Record<string, any>[] = [];
  if (p) {
    jsonLd.push(
      productJsonLd({
        origin,
        name: p.name,
        description: truncate(plain(p.short_description || p.description), 300),
        image: p.images?.[0]?.src || null,
        sku: p.sku,
        price: p.price,
        currency: (settings as any).currency || "USD",
        inStock: p.stock_status !== "outofstock",
        url: `/collection/items/${p.slug}`,
        ratingValue: p.average_rating || undefined,
        reviewCount: p.rating_count || undefined,
      }),
    );
  }
  jsonLd.push(
    breadcrumbJsonLd(origin, [
      { name: settings.site_title, path: "/" },
      { name: "Collection", path: "/collection" },
      ...(p ? [{ name: p.name, path: `/collection/items/${p.slug}` }] : []),
    ]),
  );
  return (
    <>
      <JsonLd data={jsonLd} />
      <ProductDetail />
    </>
  );
}
