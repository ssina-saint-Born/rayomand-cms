"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice, EmptyState } from "./ui";
import { formatDate } from "@/lib/format";

interface BlockRow {
    id: number;
    identifier: string;
    blocked_by: number | null;
    blocked_by_label: string | null;
    blocked_until: string | null;
    created_at: string;
    is_system: boolean;
}

export default function AccessBlocks() {
    const { t: tr, locale } = useI18n();
    const [rows, setRows] = useState<BlockRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [perPage] = useState(20);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [identifier, setIdentifier] = useState("");
    const [filter, setFilter] = useState("");
    const [until, setUntil] = useState("");
    const [busy, setBusy] = useState(false);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [blockedBy, setBlockedBy] = useState("");
    const [admins, setAdmins] = useState<{ id: number; label: string }[]>([]);

    async function load(p = page) {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ page: String(p), per_page: String(perPage) });
            if (filter.trim()) qs.set("identifier", filter.trim());
            if (fromDate) qs.set("from_date", fromDate);
            if (toDate) qs.set("to_date", toDate);
            if (blockedBy.trim()) qs.set("blocked_by", blockedBy.trim());
            const data = await api<{ success: boolean; data: { blocks: BlockRow[]; total_items: number; current_page: number } }>(`/api/access/blocks?${qs.toString()}`);
            setRows(data.data.blocks || []);
            setTotal(data.data.total_items || 0);
            setPage(data.data.current_page || p);
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    useEffect(() => {
        load(1);
        api<{ success: boolean; data: { users: { id: number; label: string }[] } }>("/api/access/blocks", { method: "POST", body: JSON.stringify({ action: "filters" }) })
            .then((r) => setAdmins(r.data.users || []))
            .catch(() => { });
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, []);

    async function add(e: React.FormEvent) {
        e.preventDefault(); setError(""); setNotice(""); setBusy(true);
        try {
            const data = await api<{ success: boolean; message: string }>("/api/access/blocks", {
                method: "POST",
                body: JSON.stringify({ action: "add", identifier, blocked_until: until || undefined }),
            });
            if (!data.success) setError(data.message);
            else { setNotice(data.message); setIdentifier(""); setUntil(""); await load(1); }
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function remove(id: number) {
        if (!confirm(tr("Remove this block?"))) return;
        setError(""); setNotice("");
        try {
            const data = await api<{ success: boolean; message: string }>("/api/access/blocks", {
                method: "POST",
                body: JSON.stringify({ action: "delete", block_id: id }),
            });
            if (!data.success) setError(data.message);
            else { setNotice(data.message); await load(); }
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    const pages = Math.max(1, Math.ceil(total / perPage));

    return (<div>
      <PageHeader title={tr("Blocked identifiers")}/>
      {error && <Notice type="error">{error}</Notice>}
      {notice && <Notice type="success">{notice}</Notice>}

      <div className="rm-admin-card p-5 mb-5">
        <h3 className="font-semibold text-sm mb-3">{tr("Block a mobile, email, IP or username")}</h3>
        <form onSubmit={add} className="grid md:grid-cols-3 gap-3 items-end">
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Identifier")}</label><input className="rm-input" dir="ltr" placeholder="0912… / you@site.com / 1.2.3.4" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required/></div>
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Blocked until (optional)")}</label><input type="date" className="rm-input" value={until} onChange={(e) => setUntil(e.target.value)}/><p className="text-[11px] text-rm-muted mt-1">{tr("Leave empty to block permanently.")}</p></div>
          <button type="submit" className="rm-btn rm-btn-primary" disabled={busy || !identifier.trim()}>{busy ? tr("Please wait…") : tr("Block")}</button>
        </form>
      </div>

      <div className="rm-admin-card p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Identifier")}</label><input className="rm-input" placeholder={tr("Search identifier…")} value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(1); }}/></div>
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Blocked by")}</label><select className="rm-input" value={blockedBy} onChange={(e) => setBlockedBy(e.target.value)}><option value="">{tr("Any")}</option>{admins.map((a) => <option key={a.id} value={a.label}>{a.label}</option>)}</select></div>
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Blocked from")}</label><input type="date" className="rm-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/></div>
          <div><label className="block text-xs text-rm-muted mb-1">{tr("Blocked to")}</label><input type="date" className="rm-input" value={toDate} onChange={(e) => setToDate(e.target.value)}/></div>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="rm-btn rm-btn-secondary" onClick={() => load(1)}>{tr("Filter")}</button>
          <button className="rm-btn rm-btn-secondary" onClick={() => { setFilter(""); setFromDate(""); setToDate(""); setBlockedBy(""); setTimeout(() => load(1), 0); }}>{tr("Clear")}</button>
        </div>
      </div>

      <div className="rm-admin-card overflow-hidden">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState>{tr("No blocked identifiers.")}</EmptyState> : (<table className="rm-table">
            <thead><tr><th>{tr("Identifier")}</th><th>{tr("Blocked by")}</th><th>{tr("Blocked until")}</th><th>{tr("Created")}</th><th className="w-24"></th></tr></thead>
            <tbody>
              {rows.map((r) => (<tr key={r.id}>
                  <td className="font-mono text-xs" dir="ltr">{r.identifier}</td>
                  <td className="text-xs">{r.is_system ? <span className="rm-badge bg-rm-gray text-rm-muted">{tr("System")}</span> : (r.blocked_by_label || "—")}</td>
                  <td className="text-xs">{r.blocked_until ? formatDate(r.blocked_until, undefined, locale) : <span className="text-rm-muted">{tr("Permanent")}</span>}</td>
                  <td className="text-xs text-rm-muted">{formatDate(r.created_at, undefined, locale)}</td>
                  <td>{r.is_system ? <span className="text-xs text-rm-muted">{tr("Locked")}</span> : <button className="text-xs text-rm-red hover:underline" onClick={() => remove(r.id)}>{tr("Unblock")}</button>}</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>

      {pages > 1 && <div className="flex items-center justify-center gap-2 mt-4">
        <button className="rm-btn rm-btn-secondary" disabled={page <= 1} onClick={() => load(page - 1)}>{tr("Previous")}</button>
        <span className="text-xs text-rm-muted">{page} / {pages}</span>
        <button className="rm-btn rm-btn-secondary" disabled={page >= pages} onClick={() => load(page + 1)}>{tr("Next")}</button>
      </div>}
    </div>);
}
