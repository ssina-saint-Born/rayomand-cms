import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/options";
import { resolveOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  const origin = await resolveOrigin();

  // Private workspace + transactional routes never belong in the index.
  const disallow = ["/studio", "/studio/", "/api/", "/auth/", "/basket", "/purchase", "/account", "/files/"];

  if (settings.blog_public === false) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: undefined,
      host: origin || undefined,
    };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Keep faceted/paginated search results out of the crawl budget.
      { userAgent: "*", allow: ["/search"], disallow: ["/search?"] },
    ],
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
    host: origin || undefined,
  };
}
