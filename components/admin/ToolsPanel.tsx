"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Card, Notice } from "./ui";
export default function ToolsPanel() {
    const { t: tr } = useI18n();
    const [msg, setMsg] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [importing, setImporting] = useState(false);
    const [health, setHealth] = useState<any>(null);
    const [healthError, setHealthError] = useState("");
    useEffect(() => { api("/api/content/health").then(setHealth).catch(error => setHealthError(error.message)); }, []);
    async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setImporting(true);
        setMsg(null);
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const result = await api("/api/content/tools/import", { method: "POST", body: JSON.stringify(json) });
            setMsg({ type: "success", text: `Imported ${result.importedPosts} posts, ${result.importedTerms} terms, ${result.importedComments} comments.` });
        }
        catch (err: any) {
            setMsg({ type: "error", text: err.message || "Invalid import file" });
        }
        setImporting(false);
        e.target.value = "";
    }
    return (<div>
      <PageHeader title={tr("Tools")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
        <Card title={tr("Export")}>
          <p className="text-sm text-rm-muted mb-3">{tr("Download your posts, pages, comments, terms, menus and settings as a JSON file (WXR-style).")}</p>
          <a className="rm-btn rm-btn-primary" href="/api/content/tools/export">{tr("Download Export File")}</a>
        </Card>

        <Card title={tr("Import")}>
          <p className="text-sm text-rm-muted mb-3">{tr("Import content from a previously exported JSON file.")}</p>
          <label className="rm-btn rm-btn-secondary cursor-pointer">
            {importing ? tr("Importing…") : tr("Choose File & Import")}
            <input type="file" accept="application/json" className="hidden" onChange={handleImport} disabled={importing}/>
          </label>
        </Card>

        <Card title={tr("Site Health")}>
          {healthError ? <p className="text-rm-red" role="alert">{tr("Health check failed:")}{" "}{healthError}</p> : !health ? <p>{tr("Checking live services…")}</p> : <ul className="text-sm space-y-2">
            <li>{tr("Database:")}{" "}{health.database.engine} — {health.database.connected ? tr("connected") : tr("unavailable")} ({health.database.name})</li>
            <li>{tr("Local storage:")}{" "}{health.storage ? tr("accessible") : tr("unavailable")}</li>
            <li>{tr("SMTP:")}{" "}{tr(health.smtp)}</li>
            <li>{tr("Redis:")}{" "}{tr(health.redis)}</li>
          </ul>}
        </Card>

        <Card title={tr("Workspace Data")}>
          <p className="text-sm text-rm-muted mb-3">{tr("Administrator-only export of stored workspace content and settings.")}</p>
          <a className="rm-btn rm-btn-secondary" href="/api/content/tools/export">{tr("Export Data")}</a>
          <p className="text-xs text-rm-muted mt-3">{tr("Exports may contain personal information; store them privately.")}</p>
        </Card>
      </div>
    </div>);
}
