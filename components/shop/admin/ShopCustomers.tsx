"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDate, useMoney, ShopHeader } from "./shared";

const EMPTY = { phone: "", first_name: "", last_name: "", email: "", company: "", address_1: "", address_2: "", city: "", state: "", postcode: "" };

export default function ShopCustomers() {
    const { t: tr, locale } = useI18n();
    const money = useMoney();
    const [items, setItems] = useState<any[] | null>(null);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ ...EMPTY });

    function load() {
        api<any>(`/api/commerce/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => setItems(r.items))
            .catch((e) => setError(e.message));
    }

    useEffect(() => {
        const t = setTimeout(load, search ? 250 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

    async function create(e: React.FormEvent) {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            await api("/api/commerce/customers", { method: "POST", body: JSON.stringify(form) });
            setCreating(false); setForm({ ...EMPTY }); load();
        }
        catch (err: any) { setError(err.message); }
        setBusy(false);
    }

    return (<div>
      <ShopHeader title={tr("Customers")} sub={tr("Registered customers and their spend")} action={<button className="rm-btn rm-btn-primary" onClick={() => setCreating(true)}>{tr("New customer")}</button>}/>
      <ErrorNote error={error}/>
      <div className="mb-4">
        <input className="rm-input !w-72" placeholder={tr("Search name, username or email…")} value={search} onChange={(e) => setSearch(e.target.value)}/>
      </div>

      {creating && (<div className="rm-admin-card p-5 mb-5">
          <h3 className="font-semibold text-sm mb-3">{tr("New customer")}</h3>
          <form onSubmit={create} className="grid md:grid-cols-2 gap-3">
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Mobile")} *</label><input className="rm-input" dir="ltr" inputMode="tel" placeholder="0912…" value={form.phone} onChange={(e) => set("phone", e.target.value)} required/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Email")}</label><input className="rm-input" type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("First name")}</label><input className="rm-input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Last name")}</label><input className="rm-input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Company")}</label><input className="rm-input" value={form.company} onChange={(e) => set("company", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("City")}</label><input className="rm-input" value={form.city} onChange={(e) => set("city", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Address")}</label><input className="rm-input" value={form.address_1} onChange={(e) => set("address_1", e.target.value)}/></div>
            <div><label className="block text-xs text-rm-muted mb-1">{tr("Postcode")}</label><input className="rm-input" dir="ltr" value={form.postcode} onChange={(e) => set("postcode", e.target.value)}/></div>
            <div className="md:col-span-2 flex gap-2 pt-1">
              <button type="submit" className="rm-btn rm-btn-primary" disabled={busy || !form.phone.trim()}>{busy ? tr("Please wait…") : tr("Create customer")}</button>
              <button type="button" className="rm-btn rm-btn-secondary" onClick={() => { setCreating(false); setForm({ ...EMPTY }); }}>{tr("Cancel")}</button>
            </div>
          </form>
        </div>)}

      {!items ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[700px]">
            <thead><tr><th>{tr("Customer")}</th><th>{tr("Email")}</th><th>{tr("Role")}</th><th>{tr("Orders")}</th><th>{tr("Total spent")}</th><th>{tr("Registered")}</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (<React.Fragment key={c.id}>
                  <tr>
                    <td>
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold me-2" style={{ background: "#656080" }}>
                        {(c.display_name || c.username).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-semibold">{c.display_name}</span>
                      <span className="text-xs text-rm-muted ms-1.5">@{c.username}</span>
                    </td>
                    <td className="text-rm-muted">{c.email}</td>
                    <td className="capitalize text-rm-muted">{tr(c.role)}</td>
                    <td>{c.order_count}</td>
                    <td className="font-bold">{money(c.total_spent)}</td>
                    <td className="text-rm-muted">{fmtDate(c.created_at, locale)}</td>
                    <td>
                      <button className="text-rm-blue hover:underline text-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>
                        {open === c.id ? tr("Hide") : tr("Addresses")}
                      </button>
                    </td>
                  </tr>
                  {open === c.id && (<tr>
                      <td colSpan={7} className="!bg-[#faf7fd]">
                        <div className="grid sm:grid-cols-2 gap-4 text-sm py-1">
                          {(["billing", "shipping"] as const).map((kind) => {
                        const a = c[kind] || {};
                        const lines = [a.company, a.address_1, a.address_2, [a.city, a.state, a.postcode].filter(Boolean).join(", "), a.country].filter(Boolean);
                        return (<div key={kind}>
                                <p className="font-semibold capitalize mb-1" style={{ color: "#504b69" }}>{kind}</p>
                                {lines.length ? lines.map((l, i) => <p key={i} className="text-rm-text">{l}</p>) : <p className="text-rm-muted">{tr("No")}{" "}{kind} {" "}{tr("address saved.")}</p>}
                                {kind === "billing" && a.phone && <p className="text-rm-muted">{a.phone}</p>}
                              </div>);
                    })}
                        </div>
                      </td>
                    </tr>)}
                </React.Fragment>))}
              {!items.length && <tr><td colSpan={7} className="text-center text-rm-muted py-8">{tr("No customers found.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
    </div>);
}
