"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, OkNote, ShopHeader } from "./shared";
export default function DownloadsSubscribers() {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<any[] | null>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { api<any>("/api/downloads/subscribers").then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, []);
    async function change(method: string, body?: any, id?: number) {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const r = await api<any>(`/api/downloads/subscribers${id ? `?id=${id}` : ""}`, { method, body: body ? JSON.stringify(body) : undefined });
            setItems(r.items);
            setMsg(method === "POST" ? "Subscriber saved." : method === "PATCH" ? "Subscriber unsubscribed." : "Subscriber deleted.");
            if (method === "POST") {
                setName("");
                setEmail("");
            }
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    const filtered = (items || []).filter((s) => (status === "all" || !!s.subscribed === (status === "active")) && `${s.email} ${s.name}`.toLowerCase().includes(search.toLowerCase()));
    return <div>
    <ShopHeader title={tr("Newsletter subscribers")} sub={items ? tr("{0} active subscribers · {1} total", {"0": String(items.filter((s) => s.subscribed).length ?? ""), "1": String(items.length ?? "")}) : undefined}/>
    <ErrorNote error={error}/><OkNote msg={msg}/>
    <form className="rm-admin-card p-4 flex flex-wrap gap-2 mb-5" onSubmit={(e) => { e.preventDefault(); change("POST", { email, name }); }}>
      <input className="rm-input !w-52" placeholder={tr("Name (optional)")} value={name} onChange={(e) => setName(e.target.value)}/>
      <input className="rm-input !w-64" required type="email" placeholder={tr("Email address")} value={email} onChange={(e) => setEmail(e.target.value)}/>
      <button className="rm-btn rm-btn-primary" style={{ background: "#4c6c57", borderColor: "#4c6c57" }} disabled={busy}>{tr("Add subscriber")}</button>
    </form>
    <div className="flex gap-2 mb-4"><input className="rm-input !w-64" placeholder={tr("Search subscribers…")} value={search} onChange={(e) => setSearch(e.target.value)}/><select className="rm-input !w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">{tr("All subscribers")}</option><option value="active">{tr("Subscribed")}</option><option value="inactive">{tr("Unsubscribed")}</option></select></div>
    {!items ? <Spinner /> : <div className="rm-admin-card overflow-x-auto"><table className="rm-table"><thead><tr><th>{tr("Email")}</th><th>{tr("Name")}</th><th>{tr("Source")}</th><th>{tr("Status")}</th><th>{tr("Date")}</th><th>{tr("Actions")}</th></tr></thead><tbody>
      {filtered.map((s) => <tr key={s.id}><td className="font-semibold">{s.email}</td><td>{s.name || "—"}</td><td className="text-xs text-rm-muted">{tr(s.source)}</td><td><span className={`rm-badge ${s.subscribed ? "bg-green-100 text-green-800" : "bg-rm-gray text-rm-muted"}`}>{s.subscribed ? tr("Subscribed") : tr("Unsubscribed")}</span></td><td className="text-xs text-rm-muted">{fmtDateTime(s.created_at, locale)}</td><td className="whitespace-nowrap text-xs">
        <button disabled={busy} className="text-rm-blue hover:underline me-3" onClick={() => change(s.subscribed ? "PATCH" : "POST", { email: s.email, name: s.name })}>{s.subscribed ? tr("Unsubscribe") : tr("Subscribe")}</button>
        <button disabled={busy} className="text-rm-red hover:underline" onClick={() => {
                    if (confirm(tr("Delete subscriber {0}?", {"0": String(s.email ?? "")})))
                        change("DELETE", undefined, s.id);
                }}>{tr("Delete")}</button>
      </td></tr>)}
      {!filtered.length && <tr><td colSpan={6} className="text-center text-rm-muted py-8">{tr("No subscribers match.")}</td></tr>}
    </tbody></table></div>}
  </div>;
}
