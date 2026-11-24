"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Media } from "@/lib/types";
import { api, uploadFile } from "@/lib/client";
export default function MediaPicker({ open, onClose, onSelect, }: {
    open: boolean;
    onClose: () => void;
    onSelect: (m: Media) => void;
}) {
    const { t: tr } = useI18n();
    const [items, setItems] = useState<Media[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
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
    useEffect(() => {
        if (open)
            load();
    }, [open]);
    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setError("");
        try {
            const m = await uploadFile(file);
            setItems((prev) => [m, ...prev]);
            onSelect(m);
            onClose();
        }
        catch (err: any) {
            setError(err.message);
        }
        setUploading(false);
        e.target.value = "";
    }
    if (!open)
        return null;
    return (<div className="noma-modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-md w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-rm-border">
          <h2 className="font-semibold text-rm-dark">{tr("Media Library")}</h2>
          <button onClick={onClose} className="text-rm-muted hover:text-rm-dark text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-3 border-b border-rm-border flex items-center gap-3">
          <label className="rm-btn rm-btn-primary cursor-pointer">
            {uploading ? tr("Uploading…") : tr("Upload file")}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}/>
          </label>
          {error && <span className="text-sm text-rm-red">{tr(error)}</span>}
        </div>
        <div className="p-5 overflow-y-auto">
          {loading ? (<p className="text-sm text-rm-muted">{tr("Loading…")}</p>) : items.length === 0 ? (<p className="text-sm text-rm-muted">{tr("No media yet. Upload a file to get started.")}</p>) : (<div className="grid grid-cols-4 gap-3">
              {items.map((m) => (<button key={m.id} onClick={() => {
                    onSelect(m);
                    onClose();
                }} className="border border-rm-border rounded overflow-hidden hover:border-rm-blue text-start">
                  {m.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.alt} className="w-full h-24 object-cover"/>) : (<div className="w-full h-24 flex items-center justify-center bg-rm-gray text-xs text-rm-muted uppercase">
                      {m.mime.split("/")[1]}
                    </div>)}
                  <div className="px-2 py-1 text-xs truncate">{m.filename}</div>
                </button>))}
            </div>)}
        </div>
      </div>
    </div>);
}
