"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { ROLES } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, EmptyState, Notice } from "./ui";
import { useAdminUser } from "./AdminFrame";
import { formatDate } from "@/lib/format";

interface UserRow extends User {
    mobile?: string | null;
}

export default function UsersManager() {
    const { t: tr, locale } = useI18n();
    const me = useAdminUser();
    const [items, setItems] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [form, setForm] = useState({ username: "", email: "", password: "", display_name: "", role: "subscriber" });

    async function load() {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (search.trim()) qs.set("s", search.trim());
            if (roleFilter) qs.set("role", roleFilter);
            const data = await api<{ success: boolean; data?: { users: UserRow[] }; users?: UserRow[] }>(`/api/access/users?${qs.toString()}`);
            setItems(data.data?.users || data.users || []);
        }
        catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    async function add(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        try {
            await api("/api/content/users", { method: "POST", body: JSON.stringify(form) });
            setForm({ username: "", email: "", password: "", display_name: "", role: "subscriber" });
            setShowAdd(false);
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function changeRole(id: number, role: string) {
        try {
            await api(`/api/content/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    async function remove(id: number) {
        if (!confirm(tr("Delete this user?")))
            return;
        try {
            await api(`/api/content/users/${id}`, { method: "DELETE" });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    const exportQuery = () => {
        const qs = new URLSearchParams();
        if (search.trim()) qs.set("s", search.trim());
        if (roleFilter) qs.set("role", roleFilter);
        return qs.toString() ? `?${qs.toString()}` : "";
    };

    return (<div>
      <PageHeader title={tr("Users")} action={<div className="flex flex-wrap gap-2">
        <a className="rm-btn rm-btn-secondary" href={`/api/access/export/excel${exportQuery()}`}>{tr("Export Excel")}</a>
        <a className="rm-btn rm-btn-secondary" href={`/api/access/export/vcf${exportQuery()}`}>{tr("Export contacts (VCF)")}</a>
        <button className="rm-btn rm-btn-primary" onClick={() => setShowAdd((s) => !s)}>{tr("Add New")}</button>
      </div>}/>
      {error && <Notice type="error">{tr(error)}</Notice>}

      {showAdd && (<div className="rm-admin-card p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3">{tr("Add New User")}</h3>
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <input className="rm-input" placeholder={tr("Username (required)")} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required/>
            <input className="rm-input" type="email" placeholder={tr("Email (required)")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required/>
            <input className="rm-input" placeholder={tr("Display name")} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}/>
            <input className="rm-input" type="password" placeholder={tr("Password (required)")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required/>
            <select className="rm-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
            </select>
            <div className="flex gap-2 items-center">
              <button className="rm-btn rm-btn-primary" type="submit">{tr("Add User")}</button>
              <button type="button" className="rm-btn rm-btn-ghost" onClick={() => setShowAdd(false)}>{tr("Cancel")}</button>
            </div>
          </form>
        </div>)}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className="rm-input max-w-xs" placeholder={tr("Search name, username, email or mobile…")} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}/>
        <select className="rm-input max-w-[180px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{tr("All roles")}</option>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
        </select>
        <button className="rm-btn rm-btn-secondary" onClick={load}>{tr("Filter")}</button>
      </div>

      <div className="rm-admin-card overflow-hidden">
        {loading ? <Spinner /> : items.length === 0 ? <EmptyState>{tr("No users.")}</EmptyState> : (<table className="rm-table">
            <thead><tr><th>{tr("Username")}</th><th>{tr("Name")}</th><th>{tr("Mobile")}</th><th>{tr("Email")}</th><th>{tr("Role")}</th><th>{tr("Registered")}</th><th className="w-16"></th></tr></thead>
            <tbody>
              {items.map((u) => (<tr key={u.id}>
                  <td className="font-semibold text-rm-blue">{u.username}{u.id === me?.id && <span className="rm-badge bg-rm-gray text-rm-muted ms-2">{tr("You")}</span>}</td>
                  <td>{u.display_name}</td>
                  <td className="text-xs font-mono" dir="ltr">{u.mobile || <span className="text-rm-muted">—</span>}</td>
                  <td className="text-rm-muted text-xs" dir="ltr">{u.email.endsWith("@access.local") ? "—" : u.email}</td>
                  <td>
                    <select className="rm-input w-36" value={u.role} disabled={u.id === me?.id} onChange={(e) => changeRole(u.id, e.target.value)}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
                    </select>
                  </td>
                  <td className="text-rm-muted text-xs">{formatDate(u.created_at, undefined, locale)}</td>
                  <td>{u.id !== me?.id && <button onClick={() => remove(u.id)} className="text-xs text-rm-red hover:underline">{tr("Delete")}</button>}</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
    </div>);
}
