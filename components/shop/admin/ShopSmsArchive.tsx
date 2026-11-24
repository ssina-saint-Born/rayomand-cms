"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, OkNote, Pager, ShopHeader } from "./shared";
import { useSmsBundle } from "./ShopSmsSettings";

export default function ShopSmsArchive() {
    const { t: tr, locale } = useI18n();
    const { bundle } = useSmsBundle();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [search, setSearch] = useState("");
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<number[]>([]);

    const load = useCallback(async () => {
        setError("");
        try {
            const q = new URLSearchParams({ page: String(page), per_page: "20" });
            if (search)
                q.set("search", search);
            if (type)
                q.set("type", type);
            const r = await api<any>(`/api/commerce/sms/archive?${q}`);
            setData(r);
            setSelected([]);
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [search, type, page]);
    useEffect(() => { load(); }, [load]);

    const allChecked = !!data?.items?.length && selected.length === data.items.length;
    const toggleAll = () => setSelected(allChecked ? [] : data.items.map((r: any) => r.id));
    const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

    async function removeSelected() {
        if (!selected.length || !confirm(tr("Delete {0} archived message(s)?", { "0": String(selected.length) })))
            return;
        try {
            const r = await api<any>("/api/commerce/sms/archive", { method: "DELETE", body: JSON.stringify({ ids: selected }) });
            setMsg(tr("{0} message(s) deleted.", { "0": String(r.deleted ?? selected.length) }));
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    async function removePeriod(period: string) {
        const labels: Record<string, string> = {
            day: tr("Delete messages older than one day?"),
            week: tr("Delete messages older than one week?"),
            month: tr("Delete messages older than one month?"),
            all: tr("Delete the entire archive? This cannot be undone."),
        };
        if (!confirm(labels[period] || tr("Delete these messages?")))
            return;
        try {
            const r = await api<any>(`/api/commerce/sms/archive?period=${period}`, { method: "DELETE" });
            setMsg(tr("{0} message(s) deleted.", { "0": String(r.deleted ?? 0) }));
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    const events = bundle?.events || {};
    return (<div>
      <ShopHeader title={tr("SMS archive")} sub={data ? tr("{0} messages", { "0": String(data.total ?? "") }) : undefined}
        action={<a className="rm-btn rm-btn-secondary" href="/api/commerce/sms/archive?format=csv">{tr("Export CSV")}</a>}/>

      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      <div className="flex flex-wrap gap-2 items-end mb-4">
        <input className="rm-input !w-60" placeholder={tr("Search receiver…")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        <select className="rm-input !w-64" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">{tr("All events")}</option>
          {Object.entries(events).map(([code, label]) => <option key={code} value={code}>{tr(label)}</option>)}
        </select>
        <div className="flex-1"/>
        <button className="rm-btn rm-btn-secondary" disabled={!selected.length} onClick={removeSelected}>{tr("Delete selected")}</button>
        <div className="flex gap-1">
          <button className="rm-btn rm-btn-secondary rm-btn-sm" onClick={() => removePeriod("day")}>{tr("Older than a day")}</button>
          <button className="rm-btn rm-btn-secondary rm-btn-sm" onClick={() => removePeriod("week")}>{tr("Older than a week")}</button>
          <button className="rm-btn rm-btn-secondary rm-btn-sm" onClick={() => removePeriod("month")}>{tr("Older than a month")}</button>
          <button className="rm-btn rm-btn-danger rm-btn-sm" onClick={() => removePeriod("all")}>{tr("Empty archive")}</button>
        </div>
      </div>

      {!data ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[860px]">
            <thead><tr>
                <th className="w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll}/></th>
                <th>{tr("Date")}</th><th>{tr("Event")}</th><th>{tr("Receiver")}</th><th>{tr("Message")}</th><th>{tr("Result")}</th>
              </tr></thead>
            <tbody>
              {data.items.map((r: any) => (<tr key={r.id}>
                  <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)}/></td>
                  <td className="text-rm-muted whitespace-nowrap">{fmtDateTime(r.created_at, locale)}</td>
                  <td className="text-xs">
                    <span className="font-semibold">{tr(events[r.type] || `#${r.type}`)}</span>
                    {r.post_type && <span className="block text-rm-muted">{r.post_type}{r.post_id ? ` #${r.post_id}` : ""}</span>}
                  </td>
                  <td className="font-mono text-xs" dir="ltr">{r.reciever}</td>
                  <td className="text-xs max-w-[320px]"><span className="line-clamp-3 whitespace-pre-wrap">{r.message}</span></td>
                  <td className="text-xs max-w-[180px]"><span className="line-clamp-3 break-words" dir="ltr">{r.result}</span></td>
                </tr>))}
              {!data.items.length && <tr><td colSpan={6} className="text-center text-rm-muted py-8">{tr("No archived messages yet.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
      <div className="mt-4"><Pager page={page} pages={data?.pages || 1} onPage={setPage}/></div>
    </div>);
}
