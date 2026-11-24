"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Post } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, EmptyState } from "./ui";
import { formatDate } from "@/lib/format";
const TABS = [
    { key: "all", label: "All" },
    { key: "publish", label: "Published" },
    { key: "draft", label: "Drafts" },
    { key: "pending", label: "Pending" },
    { key: "trash", label: "Trash" },
];
export default function PostsList({ type }: {
    type: "post" | "page";
}) {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<number[]>([]);
    const [page, setPage] = useState(1);
    const [error, setError] = useState("");
    const perPage = 15;
    const base = type === "page" ? "pages" : "posts";
    async function load() {
        setLoading(true);
        try {
            const data = await api<{
                items: Post[];
            }>(`/api/content/${base}?status=any&per_page=200`);
            setItems(data.items);
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, [type]);
    const counts = useMemo(() => {
        const c: Record<string, number> = { all: items.length };
        for (const t of TABS)
            if (t.key !== "all")
                c[t.key] = items.filter((p) => p.status === t.key).length;
        return c;
    }, [items]);
    const filtered = useMemo(() => {
        let list = items;
        if (tab !== "all")
            list = list.filter((p) => p.status === tab);
        else
            list = list.filter((p) => p.status !== "trash");
        if (search.trim()) {
            const s = search.toLowerCase();
            list = list.filter((p) => p.title.toLowerCase().includes(s));
        }
        return list;
    }, [items, tab, search]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
    async function act(id: number, action: "trash" | "restore" | "delete") {
        setError("");
        try {
            if (action === "delete")
                await api(`/api/content/${base}/${id}?force=1`, { method: "DELETE" });
            else if (action === "restore")
                await api(`/api/content/${base}/${id}?action=restore`, { method: "DELETE" });
            else
                await api(`/api/content/${base}/${id}`, { method: "DELETE" });
            await load();
            setSelected((s) => s.filter((x) => x !== id));
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function bulk(action: "trash" | "restore" | "delete") {
        for (const id of selected)
            await act(id, action);
        setSelected([]);
    }
    const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    const allChecked = pageItems.length > 0 && pageItems.every((p) => selected.includes(p.id));
    return (<div>
      <PageHeader title={type === "page" ? tr("Pages") : tr("Posts")} action={<Link href={`/studio/editor/new?type=${type}`} className="rm-btn rm-btn-primary">{tr("Add New")}</Link>}/>
      {error && <div className="text-sm text-rm-red mb-3">{tr(error)}</div>}

      <div className="noma-tab-strip mb-3" aria-label={tr("Content status")}>
        {TABS.map((t) => (<button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} className="noma-tab" aria-pressed={tab === t.key}>
            {tr(t.label)} <span className="text-rm-muted">({counts[t.key] || 0})</span>
          </button>))}
      </div>

      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2">
          <select className="rm-input w-40" defaultValue="" onChange={(e) => {
            if (e.target.value)
                bulk(e.target.value as any);
            e.target.value = "";
        }}>
            <option value="">{tr("Bulk actions")}</option>
            <option value="trash">{tr("Move to Trash")}</option>
            <option value="restore">{tr("Restore")}</option>
            <option value="delete">{tr("Delete Permanently")}</option>
          </select>
          <span className="text-xs text-rm-muted">{selected.length} {" "}{tr("selected")}</span>
        </div>
        <input className="rm-input w-full sm:w-64" placeholder={tr("Search {0}…", {"0": tr(type === "page" ? "pages" : "posts")})} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
      </div>

      <div className="rm-admin-card overflow-hidden">
        {loading ? (<Spinner />) : pageItems.length === 0 ? (<EmptyState>{tr("No")}{" "}{type === "page" ? tr("pages") : tr("posts")} {" "}{tr("found.")}</EmptyState>) : (<table className="rm-table">
            <thead>
              <tr>
                <th className="w-8"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : pageItems.map((p) => p.id))}/></th>
                <th>{tr("Title")}</th>
                <th>{tr("Author")}</th>
                {type === "post" && <th>{tr("Categories")}</th>}
                {type === "post" && <th>{tr("Tags")}</th>}
                <th className="w-16">{tr("Comments")}</th>
                <th>{tr("Date")}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (<tr key={p.id}>
                  <td><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}/></td>
                  <td>
                    <Link href={`/studio/editor/${p.id}`} className="font-semibold text-rm-blue hover:underline">
                      {p.title || tr("(no title)")}
                    </Link>
                    {p.sticky ? <span className="rm-badge bg-rm-gray text-rm-muted ms-2">{tr("Sticky")}</span> : null}
                    <div className="text-xs text-rm-muted mt-1 flex gap-2">
                      <Link href={`/studio/editor/${p.id}`} className="hover:text-rm-blue">{tr("Edit")}</Link>
                      {p.status === "trash" ? (<>
                          <button onClick={() => act(p.id, "restore")} className="hover:text-rm-blue">{tr("Restore")}</button>
                          <button onClick={() => act(p.id, "delete")} className="hover:text-rm-red">{tr("Delete Permanently")}</button>
                        </>) : (<>
                          {p.status === "publish" && <a href={`/read/${p.slug}`} target="_blank" rel="noreferrer" className="hover:text-rm-blue">{tr("View")}</a>}
                          <button onClick={() => act(p.id, "trash")} className="hover:text-rm-red">{tr("Trash")}</button>
                        </>)}
                    </div>
                  </td>
                  <td className="text-rm-muted">{p.author?.display_name || "—"}</td>
                  {type === "post" && <td className="text-rm-muted text-xs">{(p.categories || []).map((c) => c.name).join(", ") || "—"}</td>}
                  {type === "post" && <td className="text-rm-muted text-xs">{(p.tags || []).map((t) => t.name).join(", ") || "—"}</td>}
                  <td className="text-rm-muted">{p.comment_count ?? 0}</td>
                  <td className="text-rm-muted text-xs">
                    <span className={`rm-badge ${p.status === "publish" ? "bg-green-100 text-green-700" : p.status === "trash" ? "bg-red-100 text-red-700" : "bg-rm-gray text-rm-muted"}`}>{tr(p.status)}</span>
                    <div className="mt-1">{p.published_at ? formatDate(p.published_at, undefined, locale) : "—"}</div>
                  </td>
                </tr>))}
            </tbody>
          </table>)}
      </div>

      {totalPages > 1 && (<div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button className="rm-btn rm-btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{tr("‹ Prev")}</button>
          <span className="text-rm-muted">{tr("Page")}{" "}{page} {" "}{tr("of")}{" "}{totalPages}</span>
          <button className="rm-btn rm-btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>{tr("Next ›")}</button>
        </div>)}
    </div>);
}
