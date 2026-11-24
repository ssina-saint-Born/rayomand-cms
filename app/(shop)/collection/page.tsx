import type { Metadata } from "next";
import ShopBrowser from "@/components/shop/ShopBrowser";
import JsonLd from "@/components/seo/JsonLd";
import { getSettings } from "@/lib/options";
import { buildMetadata, resolveOrigin, breadcrumbJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const origin = await resolveOrigin();
  return buildMetadata(
    {
      title: "Collection",
      description: settings.tagline || "Browse the digital collection.",
      canonicalPath: "/collection",
      image: settings.default_og_image || null,
      type: "website",
    },
    origin,
  );
}

export default async function ShopPage() {
  const origin = await resolveOrigin();
  const settings = await getSettings();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(origin, [
          { name: settings.site_title, path: "/" },
          { name: "Collection", path: "/collection" },
        ])}
      />
      <ShopBrowser />
    </>
  );
}
