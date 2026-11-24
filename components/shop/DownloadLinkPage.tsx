"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
export default function DownloadLinkPage() {
    const { t: tr, locale } = useI18n();
    const sp = useSearchParams();
    const token = sp.get("token") || "";
    const [data, setData] = useState<any>(null);
    useEffect(() => {
        api(`/api/downloads/token?token=${encodeURIComponent(token)}`).then(setData).catch(() => setData({ ok: false, message: "Could not verify this link." }));
    }, [token]);
    if (!data)
        return <div className="shop-card h-48 animate-pulse bg-shop-border/40 max-w-xl mx-auto"/>;
    if (!data.ok) {
        return (<div className="shop-card p-10 max-w-xl mx-auto text-center space-y-3 border-t-4 border-t-shop-red">
        <h1 className="text-xl font-extrabold">{tr("Link unavailable")}</h1>
        <p className="text-shop-muted">{tr(data.message)}</p>
        <Link href="/collection" className="shop-btn shop-btn-primary">{tr("Back to shop")}</Link>
      </div>);
    }
    return (<div className="shop-card p-8 max-w-xl mx-auto space-y-5 border-t-4 border-t-shop-purple">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-shop-purple">{tr("Secure download link")}</p>
        <h1 className="text-2xl font-extrabold mt-1">{data.product.name}</h1>
        <p className="text-sm text-shop-muted mt-1">{tr("This link expires")}{" "}{new Date(data.expires_at).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} {" "}{tr("and works until your download completes.")}</p>
      </div>
      <div className="space-y-2">
        {data.product.files.map((f: any, i: number) => (<a key={i} href={data.file_urls[i]} download={f.name} className="flex items-center justify-between border border-shop-border rounded-lg px-4 py-3 hover:border-shop-purple hover:bg-shop-bg/60 transition-colors">
            <span className="font-semibold text-sm">{f.name}</span>
            <span className="shop-btn shop-btn-free shop-btn-sm">{tr("Download")}</span>
          </a>))}
      </div>
      {data.zip_url && (<a href={data.zip_url} className="shop-btn shop-btn-primary w-full">{tr("Download all as ZIP")}</a>)}
    </div>);
}
