"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { Donut, TrendChart } from "./Charts";
import { ErrorNote, fmtDate, ORDER_STATUS_META, StatCard, StatusBadge, useMoney, ShopHeader } from "./shared";
export default function ShopHome() {
    const { t: tr, locale } = useI18n();
    const money = useMoney();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        Promise.all([
            api<any>("/api/commerce/reports?days=30"),
            api<any>("/api/commerce/orders?per_page=6"),
            api<any>("/api/commerce/products?per_page=100&status=any"),
        ])
            .then(([reports, orders, products]) => setData({ reports, orders, products, dl: { summary: reports.downloads } }))
            .catch((e) => setError(e.message));
    }, []);
    if (error)
        return <ErrorNote error={error}/>;
    if (!data)
        return <Spinner label={tr("Loading store overview…")}/>;
    const { reports, orders, products, dl } = data;
    const s = reports.summary;
    const lowStock = products.items.filter((p: any) => p.manage_stock && p.stock_quantity != null && p.stock_quantity <= 5 && p.type !== "variation");
    const statusItems = Object.entries(reports.statuses as Record<string, number>)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: ORDER_STATUS_META[k]?.label || k, value: v }));
    return (<div>
      <ShopHeader title={tr("Commerce overview")} sub={tr("Store overview — last 30 days")} action={<div className="flex gap-2">
            <Link href="/collection" className="rm-btn rm-btn-secondary">{tr("View store")}</Link>
            <Link href="/studio/commerce/products/new" className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }}>{tr("Add product")}</Link>
          </div>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label={tr("Net sales")} value={money(s.net_sales)} tone="#656080" sub={tr("{0} orders · avg {1}", {"0": String(s.orders ?? ""), "1": String(money(s.average_order) ?? "")})}/>
        <StatCard label={tr("Items sold")} value={s.items_sold} tone="#8c6372" sub={tr("{0} gross", {"0": String(money(s.gross_sales) ?? "")})}/>
        <StatCard label={tr("Free downloads")} value={dl.summary.period} tone="#4c6c57" sub={tr("{0} all-time · {1} unique", {"0": String(dl.summary.total ?? ""), "1": String(dl.summary.unique ?? "")})}/>
        <StatCard label={tr("Refunds")} value={money(s.refunds)} tone="#975953" sub={tr("{0} discounts given", {"0": String(money(s.discounts) ?? "")})}/>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <div className="rm-admin-card p-4 lg:col-span-2">
          <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Sales, orders & downloads")}</h2>
          <TrendChart points={reports.series} money={money}/>
        </div>
        <div className="rm-admin-card p-4">
          <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Orders by status")}</h2>
          <Donut items={statusItems} centerLabel="orders"/>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rm-admin-card lg:col-span-2 overflow-hidden">
          <div className="px-4 py-3 border-b border-rm-border flex items-center justify-between">
            <h2 className="font-semibold text-sm text-rm-dark">{tr("Recent orders")}</h2>
            <Link href="/studio/commerce/orders" className="text-xs text-rm-blue hover:underline">{tr("View all")}</Link>
          </div>
          <table className="rm-table">
            <thead><tr><th>{tr("Order")}</th><th>{tr("Date")}</th><th>{tr("Status")}</th><th>{tr("Total")}</th></tr></thead>
            <tbody>
              {orders.items.map((o: any) => (<tr key={o.id}>
                  <td>
                    <Link href={`/studio/commerce/orders/${o.id}`} className="text-rm-blue font-semibold hover:underline">#{o.number}</Link>
                    <span className="text-rm-muted text-xs ms-2">{o.billing?.first_name} {o.billing?.last_name}</span>
                  </td>
                  <td className="text-rm-muted">{fmtDate(o.created_at, locale)}</td>
                  <td><StatusBadge status={o.status}/></td>
                  <td className="font-semibold">{money(o.total)}</td>
                </tr>))}
              {!orders.items.length && <tr><td colSpan={4} className="text-center text-rm-muted py-6">{tr("No orders yet.")}</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rm-admin-card p-4">
            <h2 className="font-semibold text-sm text-rm-dark mb-2">{tr("Low stock")}</h2>
            {lowStock.length ? (<ul className="space-y-1.5 text-sm">
                {lowStock.map((p: any) => (<li key={p.id} className="flex justify-between gap-2">
                    <Link href={`/studio/commerce/products/${p.id}`} className="text-rm-blue hover:underline truncate">{p.name}</Link>
                    <span className={`font-bold whitespace-nowrap ${p.stock_quantity === 0 ? "text-rm-red" : "text-rm-yellow"}`}>{p.stock_quantity} {" "}{tr("left")}</span>
                  </li>))}
              </ul>) : <p className="text-sm text-rm-muted">{tr("Stock levels look healthy.")}</p>}
          </div>
          <div className="rm-admin-card p-4">
            <h2 className="font-semibold text-sm text-rm-dark mb-2">{tr("Free Downloads add-on")}</h2>
            <p className="text-sm text-rm-muted mb-3">{dl.summary.total} {" "}{tr("downloads served across")}{" "}{products.items.filter((p: any) => p.free_download).length} {" "}{tr("free products.")}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/studio/downloads" className="rm-btn rm-btn-secondary">{tr("Stats")}</Link>
              <Link href="/studio/downloads/settings" className="rm-btn rm-btn-secondary">{tr("Settings")}</Link>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
