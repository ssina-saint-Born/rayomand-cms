"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useState } from "react";
import { api } from "@/lib/client";
export default function QuickDraft() {
    const { t: tr } = useI18n();
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    async function save() {
        if (!title.trim())
            return;
        setBusy(true);
        setMsg("");
        try {
            await api("/api/content/posts", {
                method: "POST",
                body: JSON.stringify({
                    title,
                    status: "draft",
                    content: [{ id: "qd1", type: "paragraph", attrs: { text } }],
                }),
            });
            setTitle("");
            setText("");
            setMsg("Draft saved.");
        }
        catch (e: any) {
            setMsg(e.message);
        }
        setBusy(false);
    }
    return (<div className="space-y-2">
      <input className="rm-input" placeholder={tr("Title")} value={title} onChange={(e) => setTitle(e.target.value)}/>
      <textarea className="rm-input min-h-[80px]" placeholder={tr("What's on your mind?")} value={text} onChange={(e) => setText(e.target.value)}/>
      <div className="flex items-center gap-3">
        <button className="rm-btn rm-btn-primary" disabled={busy} onClick={save}>{busy ? tr("Saving…") : tr("Save Draft")}</button>
        {msg && <span className="text-xs text-rm-muted">{tr(msg)}</span>}
      </div>
    </div>);
}
