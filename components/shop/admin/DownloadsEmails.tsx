"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, ShopHeader } from "./shared";
export default function DownloadsEmails() {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<any[] | null>(null);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState<number | null>(null);
    async function load() {
        try {
            setItems((await api<any>("/api/downloads/emails")).items);
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    useEffect(() => { load(); }, []);
    const filtered = (items || []).filter((m) => `${m.to_email} ${m.subject} ${m.type}`.toLowerCase().includes(search.toLowerCase()));
    return <div>
    <ShopHeader title={tr("Email log")} sub={tr("Actual SMTP attempts — the latest 200 messages")} action={<button className="rm-btn rm-btn-secondary" onClick={load}>{tr("Refresh")}</button>}/>
    <ErrorNote error={error}/>
    <p className="noma-notice bg-blue-50 text-rm-blue">{tr("Accepted means the SMTP server accepted the message, not guaranteed inbox delivery. Failed or unconfigured attempts are never reported as sent.")}</p>
    <input className="rm-input !w-72 mb-4" placeholder={tr("Search recipient, subject or type…")} value={search} onChange={(e) => setSearch(e.target.value)}/>
    {!items ? <Spinner /> : <div className="rm-admin-card overflow-x-auto"><table className="rm-table"><thead><tr><th>{tr("Recipient")}</th><th>{tr("Subject")}</th><th>{tr("Status")}</th><th>{tr("Attempted")}</th><th></th></tr></thead><tbody>
      {filtered.map((m) => <React.Fragment key={m.id}><tr><td className="font-semibold">{m.to_email}</td><td>{m.subject}</td><td><span className="rm-badge bg-shop-purple/10 text-shop-purple">{tr(m.status)}</span></td><td className="text-xs text-rm-muted whitespace-nowrap">{fmtDateTime(m.created_at, locale)}</td><td><button className="text-rm-blue hover:underline" onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? tr("Close") : tr("Read")}</button></td></tr>
        {open === m.id && <tr><td colSpan={5} className="!bg-[#faf7fd]"><h2 className="font-semibold mb-2">{m.heading}</h2><div className="whitespace-pre-wrap text-sm break-words">{String(m.body).split(/(https?:\/\/[^\s]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} className="text-rm-blue underline" href={part}>{part}</a> : <React.Fragment key={i}>{part}</React.Fragment>)}</div></td></tr>}
      </React.Fragment>)}
      {!filtered.length && <tr><td colSpan={5} className="text-center text-rm-muted py-8">{tr("No messages found.")}</td></tr>}
    </tbody></table></div>}
  </div>;
}
