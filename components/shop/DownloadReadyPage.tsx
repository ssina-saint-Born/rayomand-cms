"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
export default function DownloadReadyPage() {
    const { t: tr } = useI18n();
    const sp = useSearchParams();
    const token = sp.get("token") || "";
    const [data, setData] = useState<any>(null);
    const [count, setCount] = useState<number | null>(null);
    const started = useRef(false);
    useEffect(() => {
        api(`/api/downloads/token?token=${encodeURIComponent(token)}`).then((d) => {
            setData(d);
            if (d.ok)
                setCount(Number(d.redirect_time ?? 3));
        }).catch(() => setData({ ok: false, message: "Could not verify this link." }));
    }, [token]);
    useEffect(() => {
        if (count === null || !data?.ok)
            return;
        if (count <= 0) {
            if (!started.current) {
                started.current = true;
                window.location.href = data.zip_url || data.file_urls[0];
            }
            return;
        }
        const t = setTimeout(() => setCount(count - 1), 1000);
        return () => clearTimeout(t);
    }, [count, data]);
    if (!data)
        return <div className="shop-card h-48 animate-pulse bg-shop-border/40 max-w-xl mx-auto"/>;
    if (!data.ok) {
        return (<div className="shop-card p-10 max-w-xl mx-auto text-center space-y-3 border-t-4 border-t-shop-red">
        <h1 className="text-xl font-extrabold">{tr("Link unavailable")}</h1>
        <p className="text-shop-muted">{tr(data.message)}</p>
        <Link href="/collection" className="shop-btn shop-btn-primary">{tr("Back to shop")}</Link>
      </div>);
    }
    return (<div className="shop-card p-10 max-w-xl mx-auto text-center space-y-4 border-t-4 border-t-shop-green">
      <div className="w-16 h-16 mx-auto rounded-full bg-shop-green/15 flex items-center justify-center">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4c6c57" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <h1 className="text-2xl font-extrabold">{tr(data.redirect_text || "Your download is ready")}</h1>
      <p className="text-shop-muted">{data.product.name}</p>
      {count !== null && count > 0 ? (<p className="text-sm font-semibold text-shop-purple">{tr("Starting automatically in")}{" "}{count} {" "}{tr("second")}{count === 1 ? "" : tr("s")}…</p>) : (<p className="text-sm font-semibold text-shop-green">{tr("Download started.")}</p>)}
      <a href={data.zip_url || data.file_urls[0]} className="shop-btn shop-btn-free">{tr("Download now")}</a>
      <div><Link href="/collection" className="text-sm font-semibold text-shop-purple hover:underline">{tr("Continue shopping")}</Link></div>
    </div>);
}
