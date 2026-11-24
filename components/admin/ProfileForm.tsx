"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Notice } from "./ui";
import { useAdminUser } from "./AdminFrame";
export default function ProfileForm() {
    const { t: tr } = useI18n();
    const me = useAdminUser();
    const [form, setForm] = useState({
        display_name: me?.display_name || "",
        email: me?.email || "",
        bio: me?.bio || "",
        password: "",
    });
    const [msg, setMsg] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!me)
            return;
        setBusy(true);
        setMsg(null);
        try {
            const payload: any = { display_name: form.display_name, email: form.email, bio: form.bio };
            if (form.password)
                payload.password = form.password;
            await api(`/api/content/users/${me.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            setForm({ ...form, password: "" });
            setMsg({ type: "success", text: "Profile updated." });
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setBusy(false);
    }
    if (!me)
        return null;
    return (<div className="max-w-2xl">
      <PageHeader title={tr("Profile")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      <form onSubmit={save} className="rm-admin-card p-5 space-y-4">
        <div className="text-sm text-rm-muted">{tr("Username:")}{" "}<strong className="text-rm-dark">{me.username}</strong> {" "}{tr("· Role:")}{" "}<strong className="text-rm-dark capitalize">{tr(me.role)}</strong></div>
        <label className="block text-sm">{tr("Display name")}<input className="rm-input mt-1" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}/></label>
        <label className="block text-sm">{tr("Email")}<input className="rm-input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label>
        <label className="block text-sm">{tr("Biographical info")}<textarea className="rm-input mt-1 min-h-[80px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}/></label>
        <label className="block text-sm">{tr("New password")}<input className="rm-input mt-1" type="password" placeholder={tr("Leave blank to keep current")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/></label>
        <button className="rm-btn rm-btn-primary" disabled={busy}>{busy ? tr("Saving…") : tr("Update Profile")}</button>
      </form>
    </div>);
}
