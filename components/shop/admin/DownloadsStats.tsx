"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { Donut, HBars, TrendChart } from "./Charts";
import { ErrorNote, fmtDateTime, Pager, StatCard, ShopHeader } from "./shared";
export default function DownloadsStats() {
    const { t: tr, locale } = useI18n();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    const [days, setDays] = useState(30);
    const [page, setPage] = useState(1);
    const [productId, setProductId] = useState("");
    const [products, setProducts] = useState<any[]>([]);
    useEffect(() => {
        api<any>("/api/commerce/products?per_page=100&status=any").then((r) => setProducts(r.items)).catch((e) => setError(e.message));
    }, []);
    useEffect(() => {
        let current = true;
        const q = new URLSearchParams({ days: String(days), page: String(page), product_id: productId });
        api<any>(`/api/downloads/stats?${q}`).then((r) => {
            if (current)
                setData(r);
        }).catch((e) => {
            if (current)
                setError(e.message);
        });
        return () => { current = false; };
    }, [days, page, productId]);
    return (<div>
      <ShopHeader title={tr("Free Downloads")} sub={tr("Download activity, delivery methods and customer history")} action={<div className="flex gap-2"><Link className="rm-btn rm-btn-secondary" href="/studio/downloads/settings">{tr("Settings")}</Link><a className="rm-btn rm-btn-primary" style={{ background: "#4c6c57", borderColor: "#4c6c57" }} href="/api/downloads/stats?format=csv">{tr("Export CSV")}</a></div>}/>
      <ErrorNote error={error}/>
      <div className="mb-4 flex gap-2 items-center">
        <select className="rm-input !w-44" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>{tr("Last 7 days")}</option><option value={30}>{tr("Last 30 days")}</option><option value={90}>{tr("Last 90 days")}</option>
        </select>
        <span className="text-xs text-rm-muted">{tr("Summary and trend use the selected range; product ranking and log show all-time activity.")}</span>
      </div>
      {!data ? <Spinner label={tr("Loading download activity…")}/> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label={tr("All-time downloads")} value={data.summary.total} tone="#4c6c57"/>
          <StatCard label={tr("Last {0} days", {"0": String(days ?? "")})} value={data.summary.period} tone="#656080"/>
          <StatCard label={tr("Unique downloaders")} value={data.summary.unique} tone="#546c83" sub={tr("Registered users or captured emails")}/>
          <StatCard label={tr("Daily average")} value={(data.summary.period / days).toFixed(1)} tone="#8c6372"/>
        </div>
        <div className="grid lg:grid-cols-3 gap-4 mb-5">
          <div className="rm-admin-card p-4 lg:col-span-2"><h2 className="font-semibold text-sm mb-3">{tr("Download trend")}</h2><TrendChart points={data.series}/></div>
          <div className="rm-admin-card p-4"><h2 className="font-semibold text-sm mb-3">{tr("Delivery methods")}</h2><Donut items={data.summary.byMethod.map((m: any) => ({ label: m.method, value: m.c }))} centerLabel="downloads"/></div>
        </div>
        <div className="rm-admin-card p-4 mb-5"><h2 className="font-semibold text-sm mb-3">{tr("Most downloaded products — all time")}</h2><HBars items={data.top.map((p: any) => ({ label: p.name, value: p.downloads }))}/></div>
        <div className="flex justify-between items-center mb-3 gap-3">
          <h2 className="font-semibold text-sm">{tr("Download log (")}{data.log.total})</h2>
          <select className="rm-input !w-64" value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }}><option value="">{tr("All products")}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <div className="rm-admin-card overflow-x-auto"><table className="rm-table"><thead><tr><th>{tr("Date")}</th><th>{tr("Product")}</th><th>{tr("Customer")}</th><th>{tr("Email")}</th><th>{tr("Method")}</th><th>{tr("IP")}</th></tr></thead><tbody>
          {data.log.items.map((d: any) => <tr key={d.id}><td className="whitespace-nowrap text-xs text-rm-muted">{fmtDateTime(d.created_at, locale)}</td><td><Link className="text-rm-blue hover:underline" href={`/studio/commerce/products/${d.product_id}`}>{d.product_name || tr("Deleted product")}</Link></td><td>{d.username || tr("Guest")}</td><td className="text-rm-muted">{d.email || "—"}</td><td><span className="rm-badge bg-green-100 text-green-800">{tr(d.method)}</span></td><td className="text-xs font-mono text-rm-muted">{d.ip || "—"}</td></tr>)}
          {!data.log.items.length && <tr><td colSpan={6} className="text-center py-8 text-rm-muted">{tr("No downloads recorded.")}</td></tr>}
        </tbody></table></div>
        <div className="mt-4"><Pager page={page} pages={data.log.pages} onPage={setPage}/></div>
      </>}
    </div>);
}
