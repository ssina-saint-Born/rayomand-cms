
import { getTranslator } from "@/lib/i18n-server";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageProvider";

export default function NotFound() {
    const tr = getTranslator();
  return (
    <div className="min-h-screen bg-rm-gray flex flex-col items-center justify-center px-4 text-center">
      <div className="rayomand-login-language"><LanguageSwitch /></div>
      <Link href="/" className="flex items-center gap-3 mb-8"><BrandMark /><strong>Rayomand CMS</strong></Link>
      <h1 className="text-6xl font-bold text-rm-dark mb-3">404</h1>
      <p className="text-rm-muted mb-6">{tr("This page could not be found. It may have been moved or deleted.")}</p>
      <Link href="/" className="rm-btn rm-btn-primary">{tr("Back to home")}</Link>
    </div>
  );
}