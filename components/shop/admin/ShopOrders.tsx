"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, ORDER_STATUS_META, Pager, StatusBadge, useMoney, ShopHeader } from "./shared";
const FILTERS = [
    { value: "any", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "on-hold", label: "On hold" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunded", label: "Refunded" },
    { value: "failed", label: "Failed" },
];
export default function ShopOrders() {
    const { t: tr, locale } = useI18n();
    const router = useRouter();
    const money = useMoney();
    const [data, setData] = useState<any>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [error, setError] = useState("");
    const [status, setStatus] = useState("any");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<number[]>([]);
    const load = useCallback(async () => {
        setError("");
        try {
            const q = new URLSearchParams({ status, page: String(page), per_page: "15" });
            if (search)
                q.set("search", search);
            setData(await api(`/api/commerce/orders?${q}`));
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [status, search, page]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api<any>("/api/commerce/reports?days=3650").then((r) => setCounts(r.statuses)).catch(() => { });
    }, []);
    const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
    const allChecked = !!data?.items?.length && selected.length === data.items.length;
    const toggleAll = () => setSelected(allChecked ? [] : data.items.map((o: any) => o.id));
    const toggle = (oid: number) => setSelected((s) => s.includes(oid) ? s.filter((x) => x !== oid) : [...s, oid]);
    return (<div>
      <ShopHeader title={tr("Orders")} sub={data ? tr("{0} orders", {"0": String(data.total ?? "")}) : undefined}/>
      <ErrorNote error={error}/>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => {
            const n = f.value === "any" ? totalAll : counts[f.value] || 0;
            return (<button key={f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${status === f.value ? "text-white border-transparent" : "bg-white text-rm-text border-rm-border hover:border-rm-blue"}`} style={status === f.value ? { background: "#656080" } : undefined}>
              {tr(f.label)} <span className={status === f.value ? "opacity-80" : "text-rm-muted"}>({n})</span>
            </button>);
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="rm-input !w-72" placeholder={tr("Search order number or billing…")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        <div className="flex-1"/>
        {selected.length > 0 && (<>
            <span className="text-xs text-rm-muted">{tr("{0} selected", { "0": String(selected.length) })}</span>
            <button className="rm-btn rm-btn-secondary" onClick={() => router.push(`/studio/commerce/sms/send?orders=${selected.join(",")}`)}>{tr("Send SMS to selected")}</button>
          </>)}
      </div>

      {!data ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[800px]">
            <thead><tr>
                <th className="w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll}/></th>
                <th>{tr("Order")}</th><th>{tr("Date")}</th><th>{tr("Status")}</th><th>{tr("Customer")}</th><th>{tr("Payment")}</th><th>{tr("Total")}</th><th>{tr("Actions")}</th>
              </tr></thead>
            <tbody>
              {data.items.map((o: any) => (<tr key={o.id}>
                  <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)}/></td>
                  <td>
                    <Link href={`/studio/commerce/orders/${o.id}`} className="text-rm-blue font-bold hover:underline">#{o.number}</Link>
                    {o.refunded_total > 0 && <span className="block text-xs text-rm-red">−{money(o.refunded_total)} {" "}{tr("refunded")}</span>}
                  </td>
                  <td className="text-rm-muted whitespace-nowrap">{fmtDateTime(o.created_at, locale)}</td>
                  <td><StatusBadge status={o.status}/></td>
                  <td>
                    <span className="font-semibold">{o.billing?.first_name} {o.billing?.last_name}</span>
                    <span className="block text-xs text-rm-muted">{o.billing?.email}</span>
                  </td>
                  <td className="text-rm-muted text-xs">{tr(o.payment_method_title || "—")}</td>
                  <td className="font-bold">{money(o.total)}</td>
                  <td><Link href={`/studio/commerce/orders/${o.id}`} className="rm-btn rm-btn-secondary rm-btn-sm">{tr("Manage")}</Link></td>
                </tr>))}
              {!data.items.length && <tr><td colSpan={8} className="text-center text-rm-muted py-8">{tr("No orders found.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
      <div className="mt-4"><Pager page={page} pages={data?.pages || 1} onPage={setPage}/></div>
      <p className="text-xs text-rm-muted mt-3">{tr("Status key:")}{" "}{Object.entries(ORDER_STATUS_META).map(([, m]) => tr(m.label)).join(" · ")}</p>
    </div>);
}
