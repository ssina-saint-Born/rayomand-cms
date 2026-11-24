"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, L, OkNote, Pager, ShopHeader } from "./shared";
import { useSmsBundle } from "./ShopSmsSettings";

function parseGroupsRaw(raw: string): { code: string; label: string }[] {
    const out: { code: string; label: string }[] = [];
    const re = /(\d+)\s*:\s*([^\n\r]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(raw ?? "")))) {
        const label = m[2].trim();
        if (label)
            out.push({ code: m[1], label });
    }
    return out;
}

export default function ShopSmsContacts() {
    const { t: tr, locale } = useI18n();
    const { bundle, error: bundleError } = useSmsBundle();
    const [data, setData] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [search, setSearch] = useState("");
    const [productId, setProductId] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<number[]>([]);
    const [form, setForm] = useState<{ product_id: string; mobile: string; groups: string[] }>({ product_id: "", mobile: "", groups: [] });

    const load = useCallback(async () => {
        setError("");
        try {
            const q = new URLSearchParams({ page: String(page), per_page: "20" });
            if (search)
                q.set("search", search);
            if (productId)
                q.set("product_id", productId);
            const r = await api<any>(`/api/commerce/sms/contacts?${q}`);
            setData(r);
            setSelected([]);
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [search, productId, page]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api<any>("/api/commerce/products?per_page=100&status=any")
            .then((r) => setProducts(r.items || []))
            .catch(() => { });
    }, []);

    const groupOptions = useMemo(() => {
        const s = bundle?.settings || {};
        const out: { code: string; label: string }[] = [];
        if (s.enable_onsale)
            out.push({ code: "_onsale", label: String(s.notif_onsale_text || "On sale") });
        if (s.enable_notif_no_stock)
            out.push({ code: "_in", label: String(s.notif_no_stock_text || "Back in stock") });
        if (s.enable_notif_low_stock)
            out.push({ code: "_low", label: String(s.notif_low_stock_text || "Low stock") });
        return [...out, ...parseGroupsRaw(String(s.notif_options ?? ""))];
    }, [bundle]);

    const allChecked = !!data?.items?.length && selected.length === data.items.length;
    const toggleAll = () => setSelected(allChecked ? [] : data.items.map((r: any) => r.id));
    const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    const toggleGroup = (code: string) => setForm((f) => ({ ...f, groups: f.groups.includes(code) ? f.groups.filter((g) => g !== code) : [...f.groups, code] }));

    async function add() {
        setError("");
        setMsg("");
        try {
            await api("/api/commerce/sms/contacts", { method: "POST", body: JSON.stringify({ product_id: Number(form.product_id), mobile: form.mobile, groups: form.groups }) });
            setMsg(tr("Subscriber saved."));
            setForm({ product_id: "", mobile: "", groups: [] });
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    async function removeSelected() {
        if (!selected.length || !confirm(tr("Delete {0} subscriber(s)?", { "0": String(selected.length) })))
            return;
        try {
            const r = await api<any>(`/api/commerce/sms/contacts?ids=${selected.join(",")}`, { method: "DELETE" });
            setMsg(tr("{0} subscriber(s) deleted.", { "0": String(r.deleted ?? selected.length) }));
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    return (<div>
      <ShopHeader title={tr("Newsletter subscribers")} sub={data ? tr("{0} subscribers", { "0": String(data.total ?? "") }) : undefined}
        action={<a className="rm-btn rm-btn-secondary" href="/api/commerce/sms/contacts?format=csv">{tr("Export CSV")}</a>}/>

      <ErrorNote error={error || bundleError}/>
      <OkNote msg={msg}/>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <input className="rm-input !w-56" placeholder={tr("Search mobile or product ID…")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
            <select className="rm-input !w-64" value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }}>
              <option value="">{tr("All products")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex-1"/>
            <button className="rm-btn rm-btn-secondary" disabled={!selected.length} onClick={removeSelected}>{tr("Delete selected")}</button>
          </div>

          {!data ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
              <table className="rm-table min-w-[640px]">
                <thead><tr>
                    <th className="w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll}/></th>
                    <th>{tr("Mobile")}</th><th>{tr("Product")}</th><th>{tr("Groups")}</th><th>{tr("Subscribed")}</th>
                  </tr></thead>
                <tbody>
                  {data.items.map((r: any) => (<tr key={r.id}>
                      <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)}/></td>
                      <td className="font-mono text-xs" dir="ltr">{r.mobile}</td>
                      <td className="text-sm">{r.product_name || `#${r.product_id}`}</td>
                      <td className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {String(r.groups || "").split(",").filter(Boolean).map((g) => (<span key={g} className="rounded bg-rm-gray px-1.5 py-0.5 font-mono">{g}</span>))}
                        </div>
                      </td>
                      <td className="text-rm-muted whitespace-nowrap text-xs">{fmtDateTime(r.created_at, locale)}</td>
                    </tr>))}
                  {!data.items.length && <tr><td colSpan={5} className="text-center text-rm-muted py-8">{tr("No subscribers yet.")}</td></tr>}
                </tbody>
              </table>
            </div>)}
          <Pager page={page} pages={data?.pages || 1} onPage={setPage}/>
        </div>

        <div className="rm-admin-card p-4 space-y-3">
          <h2 className="font-semibold text-sm text-rm-dark">{tr("Add subscriber manually")}</h2>
          <L label={tr("Product")}>
            <select className="rm-input mt-1" value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">{tr("Choose a product…")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
          <L label={tr("Mobile")}><input className="rm-input mt-1" dir="ltr" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}/></L>
          <div>
            <span className="block text-sm font-semibold text-rm-dark mb-1">{tr("Groups")}</span>
            {groupOptions.length ? (<div className="space-y-1">
                {groupOptions.map((g) => (<label key={g.code} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.groups.includes(g.code)} onChange={() => toggleGroup(g.code)}/> {tr(g.label)} <code className="text-xs text-rm-muted">{g.code}</code>
                  </label>))}
              </div>) : <p className="text-xs text-rm-muted">{tr("Enable newsletter groups in the SMS settings first.")}</p>}
          </div>
          <button className="rm-btn rm-btn-primary w-full" style={{ background: "#656080", borderColor: "#656080" }} disabled={!form.product_id || !form.mobile.trim() || !form.groups.length} onClick={add}>{tr("Add subscriber")}</button>
          <p className="text-xs text-rm-muted">{tr("Existing numbers are merged into one record so nobody receives duplicates.")}</p>
        </div>
      </div>
    </div>);
}
