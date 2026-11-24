"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";

export default function PluginsManager() {
    const { t: tr } = useI18n();
  const [commerce, setCommerce] = useState<boolean | null>(null);
  const [downloads, setDownloads] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    Promise.all([api<any>("/api/downloads/settings"), api<any>("/api/commerce/settings")]).then(([som, woo]) => { setCommerce(!som.disable_ecommerce); setDownloads(!!woo.enable_downloads); }).catch(error => setMessage({ type: "error", text: error.message }));
  }, []);
  async function toggle(kind: "commerce" | "downloads") {
    try {
      if (kind === "commerce") { await api("/api/downloads/settings", { method: "POST", body: JSON.stringify({ disable_ecommerce: commerce ? 1 : 0 }) }); setCommerce(!commerce); }
      else { await api("/api/commerce/settings", { method: "POST", body: JSON.stringify({ enable_downloads: downloads ? 0 : 1 }) }); setDownloads(!downloads); }
      setMessage({ type: "success", text: "Live feature configuration updated." });
    } catch (error: any) { setMessage({ type: "error", text: error.message }); }
  }
  return <div><PageHeader title={tr("Extensions")} />{message && <Notice type={message.type}>{tr(message.text)}</Notice>}
    {commerce === null ? <Spinner /> : <div className="rm-admin-card overflow-x-auto"><table className="rm-table"><thead><tr><th>{tr("Integrated module")}</th><th>{tr("Description")}</th><th>{tr("Status")}</th></tr></thead><tbody>
      <tr><td className="font-semibold">{tr("Rayomand CMS Commerce")}</td><td>{tr("Products, cart, checkout, orders, customers, coupons, reviews and reports. Disabling stops new purchases; existing records remain accessible.")}</td><td><button className="rm-btn rm-btn-secondary" onClick={() => toggle("commerce")}>{commerce ? tr("Disable purchases") : tr("Enable purchases")}</button></td></tr>
      <tr><td className="font-semibold">{tr("Digital downloads")}</td><td>{tr("Secure file grants, direct downloads, configured SMTP links, redirects, limits and download history.")}</td><td><button className="rm-btn rm-btn-secondary" onClick={() => toggle("downloads")}>{downloads ? tr("Disable downloads") : tr("Enable downloads")}</button></td></tr>
    </tbody></table></div>}
    <p className="text-xs text-rm-muted mt-3">{tr("These are built-in Next.js modules. PHP plugin installation and native plugin hooks are not supported; no activation is simulated.")}</p>
  </div>;
}
