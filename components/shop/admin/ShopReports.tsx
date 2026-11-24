"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { Donut, HBars, TrendChart } from "./Charts";
import { ErrorNote, ORDER_STATUS_META, StatCard, useMoney, ShopHeader } from "./shared";
const RANGES = [
    { days: 7, label: "Last 7 days" },
    { days: 30, label: "Last 30 days" },
    { days: 90, label: "Last 90 days" },
];
export default function ShopReports() {
    const { t: tr } = useI18n();
    const money = useMoney();
    const [days, setDays] = useState(30);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        setData(null);
        api<any>(`/api/commerce/reports?days=${days}`).then(setData).catch((e) => setError(e.message));
    }, [days]);
    const s = data?.summary;
    const statusItems = data
        ? Object.entries(data.statuses as Record<string, number>).filter(([, v]) => v > 0).map(([k, v]) => ({ label: ORDER_STATUS_META[k]?.label || k, value: v }))
        : [];
    return (<div>
      <ShopHeader title={tr("Reports")} sub={tr("Sales performance across your store")} action={<div className="flex gap-2 items-center">
            <select className="rm-input !w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((r) => <option key={r.days} value={r.days}>{tr(r.label)}</option>)}
            </select>
            <a className="rm-btn rm-btn-secondary" href={`/api/commerce/reports?format=csv&days=${days}`}>{tr("Export orders CSV")}</a>
          </div>}/>
      <ErrorNote error={error}/>
      {!data ? <Spinner label={tr("Crunching numbers…")}/> : (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label={tr("Net sales")} value={money(s.net_sales)} tone="#656080" sub={tr("{0} gross − {1} refunds", {"0": String(money(s.gross_sales) ?? ""), "1": String(money(s.refunds) ?? "")})}/>
            <StatCard label={tr("Orders")} value={s.orders} tone="#8c6372" sub={tr("average {0}", {"0": String(money(s.average_order) ?? "")})}/>
            <StatCard label={tr("Items sold")} value={s.items_sold} tone="#546c83" sub={tr("{0} shipping collected", {"0": String(money(s.shipping) ?? "")})}/>
            <StatCard label={tr("Discounts")} value={money(s.discounts)} tone="#a58c64" sub={tr("coupon savings given")}/>
          </div>

          <div className="rm-admin-card p-4 mb-5">
            <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Sales trend")}</h2>
            <TrendChart points={data.series} money={money} height={240}/>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="rm-admin-card p-4">
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Top products by sales")}</h2>
              <HBars items={data.top.map((t: any) => ({ label: t.name, value: t.sales, extra: tr("{0} sold", { "0": t.qty }) }))} money={money}/>
            </div>
            <div className="rm-admin-card p-4">
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Sales by category")}</h2>
              <HBars items={data.categories.map((c: any) => ({ label: c.name, value: c.sales, extra: tr("{0} items", { "0": c.qty }) }))} money={money}/>
            </div>
            <div className="rm-admin-card p-4">
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{tr("Order statuses (all time)")}</h2>
              <Donut items={statusItems} centerLabel="orders"/>
            </div>
          </div>
        </>)}
    </div>);
}
