"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Term } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, EmptyState, Notice } from "./ui";
export default function TermsManager({ taxonomy }: {
    taxonomy: "category" | "tag";
}) {
    const { t: tr } = useI18n();
    const endpoint = taxonomy === "category" ? "categories" : "tags";
    const [items, setItems] = useState<Term[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [form, setForm] = useState({ name: "", slug: "", description: "" });
    const [editing, setEditing] = useState<Term | null>(null);
    async function load() {
        setLoading(true);
        try {
            setItems(await api<Term[]>(`/api/content/${endpoint}`));
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, [taxonomy]);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        try {
            if (editing) {
                await api(`/api/content/${endpoint}/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
            }
            else {
                await api(`/api/content/${endpoint}`, { method: "POST", body: JSON.stringify(form) });
            }
            setForm({ name: "", slug: "", description: "" });
            setEditing(null);
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function remove(id: number) {
        if (!confirm(tr("Delete this {0}?", {"0": tr(taxonomy === "category" ? "Category" : "Tag")})))
            return;
        try {
            await api(`/api/content/${endpoint}/${id}`, { method: "DELETE" });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    function startEdit(t: Term) {
        setEditing(t);
        setForm({ name: t.name, slug: t.slug, description: t.description });
    }
    return (<div>
      <PageHeader title={taxonomy === "category" ? tr("Categories") : tr("Tags")}/>
      {error && <Notice type="error">{tr(error)}</Notice>}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:w-80 shrink-0 rm-admin-card p-4">
          <h3 className="font-semibold text-sm mb-3">{editing ? tr("Edit {0}", {"0": tr(taxonomy === "category" ? "Category" : "Tag")}) : tr("Add New {0}", {"0": tr(taxonomy === "category" ? "Category" : "Tag")})}</h3>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-rm-muted">{tr("Name")}<input className="rm-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required/></label>
            <label className="block text-xs text-rm-muted">{tr("Slug")}<input className="rm-input mt-1" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={tr("auto-generated")}/></label>
            <label className="block text-xs text-rm-muted">{tr("Description")}<textarea className="rm-input mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
            <div className="flex gap-2">
              <button className="rm-btn rm-btn-primary" type="submit">{editing ? tr("Update") : tr("Add New")}</button>
              {editing && <button type="button" className="rm-btn rm-btn-ghost" onClick={() => { setEditing(null); setForm({ name: "", slug: "", description: "" }); }}>{tr("Cancel")}</button>}
            </div>
          </form>
        </div>

        <div className="w-full min-w-0 flex-1 rm-admin-card overflow-x-auto">
          {loading ? <Spinner /> : items.length === 0 ? <EmptyState>{tr("No")}{" "}{taxonomy === "category" ? tr("categories") : tr("tags")} {" "}{tr("yet.")}</EmptyState> : (<table className="rm-table">
              <thead><tr><th>{tr("Name")}</th><th>{tr("Description")}</th><th>{tr("Slug")}</th><th className="w-16">{tr("Count")}</th></tr></thead>
              <tbody>
                {items.map((t) => (<tr key={t.id}>
                    <td>
                      <button onClick={() => startEdit(t)} className="font-semibold text-rm-blue hover:underline">{t.name}</button>
                      <div className="text-xs text-rm-muted mt-1 flex gap-2">
                        <button onClick={() => startEdit(t)} className="hover:text-rm-blue">{tr("Edit")}</button>
                        <button onClick={() => remove(t.id)} className="hover:text-rm-red">{tr("Delete")}</button>
                      </div>
                    </td>
                    <td className="text-rm-muted text-xs">{t.description || "—"}</td>
                    <td className="text-rm-muted text-xs">{t.slug}</td>
                    <td className="text-rm-muted">{t.count ?? 0}</td>
                  </tr>))}
              </tbody>
            </table>)}
        </div>
      </div>
    </div>);
}
