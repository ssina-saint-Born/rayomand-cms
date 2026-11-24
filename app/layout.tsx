import type { Metadata } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import { getLocale } from "@/lib/i18n-server";
import { getSettings } from "@/lib/options";
import { getSiteUrl, SITE_NAME_FALLBACK } from "@/lib/seo";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const origin = await getSiteUrl();
  const title = settings.site_title || SITE_NAME_FALLBACK;
  const description = settings.tagline || "Rayomand CMS — publishing, commerce and digital collections.";
  const ogImage = settings.default_og_image ? new URL(settings.default_og_image, origin || "http://localhost").toString() : undefined;
  return {
    metadataBase: origin ? new URL(origin) : undefined,
    title: { default: title, template: `%s ${settings.seo_title_separator} ${title}` },
    description,
    applicationName: title,
    icons: {
      icon: [
        { url: "/rayomand-icon-32.png", type: "image/png", sizes: "32x32" },
        { url: "/rayomand-icon-192.png", type: "image/png", sizes: "192x192" },
      ],
      shortcut: "/favicon.ico",
      apple: { url: "/rayomand-apple-icon.png", sizes: "180x180" },
    },
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      site: settings.twitter_site || undefined,
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    verification: {
      google: settings.search_verification_google || undefined,
      other: settings.search_verification_bing
        ? { "msvalidate.01": settings.search_verification_bing }
        : undefined,
    },
    alternates: { types: { "application/rss+xml": "/journal/feed" } },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}><body><LanguageProvider initialLocale={locale}>{children}</LanguageProvider></body></html>;
}
