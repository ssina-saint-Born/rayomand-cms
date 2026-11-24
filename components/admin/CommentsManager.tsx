"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Comment } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, EmptyState, Notice } from "./ui";
import { formatDate } from "@/lib/format";
const TABS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "spam", label: "Spam" },
    { key: "trash", label: "Trash" },
];
export default function CommentsManager() {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("all");
    const [error, setError] = useState("");
    async function load() {
        setLoading(true);
        try {
            const data = await api<{
                items: Comment[];
            }>("/api/content/comments?status=all&per_page=200");
            setItems(data.items);
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);
    const counts = useMemo(() => {
        const c: Record<string, number> = { all: items.length };
        for (const t of TABS)
            if (t.key !== "all")
                c[t.key] = items.filter((x) => x.status === t.key).length;
        return c;
    }, [items]);
    const filtered = tab === "all" ? items : items.filter((c) => c.status === tab);
    async function setStatus(id: number, status: string) {
        try {
            await api(`/api/content/comments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function remove(id: number) {
        if (!confirm(tr("Delete this comment permanently?")))
            return;
        try {
            await api(`/api/content/comments/${id}`, { method: "DELETE" });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    return (<div>
      <PageHeader title={tr("Comments")}/>
      {error && <Notice type="error">{tr(error)}</Notice>}
      <div className="flex items-center gap-1 text-sm mb-3">
        {TABS.map((t, i) => (<React.Fragment key={t.key}>
            {i > 0 && <span className="text-rm-border">|</span>}
            <button onClick={() => setTab(t.key)} className={`px-1 ${tab === t.key ? "font-semibold text-rm-dark" : "text-rm-blue hover:underline"}`}>
              {tr(t.label)} <span className="text-rm-muted">({counts[t.key] || 0})</span>
            </button>
          </React.Fragment>))}
      </div>
      <div className="rm-admin-card overflow-hidden">
        {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState>{tr("No comments found.")}</EmptyState> : (<table className="rm-table">
            <thead><tr><th className="w-48">{tr("Author")}</th><th>{tr("Comment")}</th><th className="w-48">{tr("In response to")}</th></tr></thead>
            <tbody>
              {filtered.map((c) => (<tr key={c.id}>
                  <td>
                    <div className="font-semibold">{c.author_name}</div>
                    <div className="text-xs text-rm-muted">{c.author_email}</div>
                    <span className={`rm-badge mt-1 ${c.status === "approved" ? "bg-green-100 text-green-700" : c.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{tr(c.status)}</span>
                  </td>
                  <td>
                    <p className="text-sm">{c.content}</p>
                    <div className="text-xs text-rm-muted mt-1 flex gap-2 flex-wrap">
                      {c.status !== "approved" && <button onClick={() => setStatus(c.id, "approved")} className="hover:text-rm-green">{tr("Approve")}</button>}
                      {c.status === "approved" && <button onClick={() => setStatus(c.id, "pending")} className="hover:text-rm-blue">{tr("Unapprove")}</button>}
                      {c.status !== "spam" && <button onClick={() => setStatus(c.id, "spam")} className="hover:text-rm-red">{tr("Spam")}</button>}
                      {c.status !== "trash" && <button onClick={() => setStatus(c.id, "trash")} className="hover:text-rm-red">{tr("Trash")}</button>}
                      <button onClick={() => remove(c.id)} className="hover:text-rm-red">{tr("Delete")}</button>
                    </div>
                  </td>
                  <td className="text-xs text-rm-muted">
                    <Link href={`/studio/editor/${c.post_id}`} className="text-rm-blue hover:underline">{c.post_title || tr("Post #{0}", {"0": String(c.post_id ?? "")})}</Link>
                    <div className="mt-1">{formatDate(c.created_at, undefined, locale)}</div>
                  </td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
    </div>);
}
