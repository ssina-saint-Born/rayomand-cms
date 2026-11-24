"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Media } from "@/lib/types";
import { api, uploadFile } from "@/lib/client";
import { PageHeader, Spinner, EmptyState, Notice } from "./ui";
import { formatDate } from "@/lib/format";
export default function MediaLibrary() {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [active, setActive] = useState<Media | null>(null);
    const [form, setForm] = useState({ alt: "", caption: "", title: "" });
    async function load() {
        setLoading(true);
        try {
            setItems(await api<Media[]>("/api/content/media"));
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);
    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || []);
        if (!files.length)
            return;
        setUploading(true);
        setError("");
        for (const f of files) {
            try {
                await uploadFile(f);
            }
            catch (err: any) {
                setError(err.message);
            }
        }
        await load();
        setUploading(false);
        e.target.value = "";
    }
    function open(m: Media) {
        setActive(m);
        setForm({ alt: m.alt, caption: m.caption, title: m.title });
    }
    async function saveDetail() {
        if (!active)
            return;
        try {
            await api(`/api/content/media/${active.id}`, { method: "PATCH", body: JSON.stringify(form) });
            setActive(null);
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function remove() {
        if (!active)
            return;
        if (!confirm(tr("Delete this file permanently?")))
            return;
        try {
            await api(`/api/content/media/${active.id}`, { method: "DELETE" });
            setActive(null);
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    return (<div>
      <PageHeader title={tr("Media Library")} action={<label className="rm-btn rm-btn-primary cursor-pointer">
            {uploading ? tr("Uploading…") : tr("Add New")}
            <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading}/>
          </label>}/>
      {error && <Notice type="error">{tr(error)}</Notice>}
      <div className="rm-admin-card p-4">
        {loading ? (<Spinner />) : items.length === 0 ? (<EmptyState>{tr("No media files yet. Click “Add New” to upload images, PDFs, audio or video.")}</EmptyState>) : (<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {items.map((m) => (<button key={m.id} onClick={() => open(m)} className="border border-rm-border rounded overflow-hidden hover:border-rm-blue text-start">
                {m.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.alt} className="w-full h-28 object-cover"/>) : (<div className="w-full h-28 flex items-center justify-center bg-rm-gray text-xs uppercase text-rm-muted">{m.mime.split("/")[1]}</div>)}
                <div className="px-2 py-1 text-xs truncate">{m.filename}</div>
              </button>))}
          </div>)}
      </div>

      {active && (<div className="noma-modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-rm-border">
              <h2 className="font-semibold">{tr("Attachment details")}</h2>
              <button onClick={() => setActive(null)} className="text-xl text-rm-muted hover:text-rm-dark">×</button>
            </div>
            <div className="p-5 flex gap-5">
              <div className="w-48 shrink-0">
                {active.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.url} alt={active.alt} className="w-full rounded border border-rm-border"/>) : (<div className="w-full h-32 flex items-center justify-center bg-rm-gray rounded text-xs uppercase text-rm-muted">{active.mime.split("/")[1]}</div>)}
                <p className="text-xs text-rm-muted mt-2 break-all">{active.filename}</p>
                <p className="text-xs text-rm-muted">{(active.size / 1024).toFixed(1)} {" "}{tr("KB ·")}{" "}{formatDate(active.created_at, undefined, locale)}</p>
              </div>
              <div className="flex-1 space-y-3">
                <label className="block text-xs text-rm-muted">{tr("Title")}<input className="rm-input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
                <label className="block text-xs text-rm-muted">{tr("Alt text")}<input className="rm-input mt-1" value={form.alt} onChange={(e) => setForm({ ...form, alt: e.target.value })}/></label>
                <label className="block text-xs text-rm-muted">{tr("Caption")}<textarea className="rm-input mt-1" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })}/></label>
                <label className="block text-xs text-rm-muted">{tr("File URL")}<input className="rm-input mt-1 bg-rm-gray" readOnly value={active.url || ""}/></label>
                <div className="flex gap-2 pt-2">
                  <button className="rm-btn rm-btn-primary" onClick={saveDetail}>{tr("Save")}</button>
                  <button className="rm-btn rm-btn-danger" onClick={remove}>{tr("Delete permanently")}</button>
                </div>
              </div>
            </div>
          </div>
        </div>)}
    </div>);
}
