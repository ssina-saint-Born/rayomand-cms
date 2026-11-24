"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDate, L, OkNote, Toggle, useMoney, ShopHeader } from "./shared";
const EMPTY = {
    code: "", discount_type: "percent", amount: 0, description: "", usage_limit: 0,
    individual_use: false, free_shipping: false, minimum_amount: 0, maximum_amount: 0,
    expiry_date: "", enabled: true, product_ids: [] as number[],
};
export default function ShopCoupons() {
    const { t: tr, locale } = useI18n();
    const money = useMoney();
    const [items, setItems] = useState<any[] | null>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [editing, setEditing] = useState<any | null>(null);
    const [busy, setBusy] = useState(false);
    const [products, setProducts] = useState<any[]>([]);
    async function load() {
        try {
            setItems((await api<any>("/api/commerce/coupons")).items);
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    useEffect(() => {
        load();
        api<any>("/api/commerce/products?per_page=100&status=any").then((r) => setProducts(r.items)).catch(() => { });
    }, []);
    async function save() {
        if (!editing)
            return;
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const body = { ...editing, expiry_date: editing.expiry_date || null };
            if (editing.id)
                await api(`/api/commerce/coupons/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
            else
                await api("/api/commerce/coupons", { method: "POST", body: JSON.stringify(body) });
            setMsg(`Coupon ${editing.code.toLowerCase()} saved.`);
            setEditing(null);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    async function remove(c: any) {
        if (!confirm(tr("Delete coupon {0}?", {"0": String(c.code ?? "")})))
            return;
        try {
            await api(`/api/commerce/coupons/${c.id}`, { method: "DELETE" });
            setMsg("Coupon deleted.");
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    const setE = (k: string, v: any) => setEditing((e: any) => ({ ...e, [k]: v }));
    return (<div>
      <ShopHeader title={tr("Coupons")} sub={tr("Discount codes customers can apply at cart and checkout")} action={<button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} onClick={() => setEditing({ ...EMPTY })}>{tr("Add coupon")}</button>}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      {editing && (<div className="rm-admin-card p-4 mb-5 border-t-4" style={{ borderTopColor: "#656080" }}>
          <h2 className="font-semibold text-sm text-rm-dark mb-3">{editing.id ? tr("Edit coupon {0}", {"0": String(editing.code ?? "")}) : tr("New coupon")}</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <L label={tr("Coupon code")}><input className="rm-input mt-1 uppercase" value={editing.code} onChange={(e) => setE("code", e.target.value)} placeholder={tr("SUMMER20")}/></L>
            <L label={tr("Discount type")}>
              <select className="rm-input mt-1" value={editing.discount_type} onChange={(e) => setE("discount_type", e.target.value)}>
                <option value="percent">{tr("Percentage discount")}</option>
                <option value="fixed_cart">{tr("Fixed cart discount")}</option>
                <option value="fixed_product">{tr("Fixed product discount")}</option>
              </select>
            </L>
            <L label={tr("Coupon amount")}><input className="rm-input mt-1" type="number" step="0.01" min="0" value={editing.amount} onChange={(e) => setE("amount", Number(e.target.value))}/></L>
            <L label={tr("Description")}><input className="rm-input mt-1" value={editing.description} onChange={(e) => setE("description", e.target.value)}/></L>
            <L label={tr("Usage limit")} hint={tr("0 = unlimited")}><input className="rm-input mt-1" type="number" min="0" value={editing.usage_limit} onChange={(e) => setE("usage_limit", Number(e.target.value))}/></L>
            <L label={tr("Expiry date")}><input className="rm-input mt-1" type="date" value={editing.expiry_date || ""} onChange={(e) => setE("expiry_date", e.target.value)}/></L>
            <L label={tr("Minimum spend")} hint={tr("0 = none")}><input className="rm-input mt-1" type="number" step="0.01" min="0" value={editing.minimum_amount} onChange={(e) => setE("minimum_amount", Number(e.target.value))}/></L>
            <L label={tr("Maximum spend")} hint={tr("0 = none")}><input className="rm-input mt-1" type="number" step="0.01" min="0" value={editing.maximum_amount} onChange={(e) => setE("maximum_amount", Number(e.target.value))}/></L>
          </div>
          <div className="flex flex-wrap gap-5 mt-3">
            <Toggle checked={!!editing.individual_use} onChange={(v) => setE("individual_use", v)} label={tr("Individual use only")}/>
            <Toggle checked={!!editing.free_shipping} onChange={(v) => setE("free_shipping", v)} label={tr("Grants free shipping")}/>
            <Toggle checked={editing.enabled !== false && editing.enabled !== 0} onChange={(v) => setE("enabled", v)} label={tr("Enabled")}/>
          </div>
          {editing.discount_type === "fixed_product" && (<div className="mt-3">
              <p className="text-sm font-semibold mb-1.5">{tr("Apply to specific products only")}</p>
              <div className="flex flex-wrap gap-2">
                {products.filter((p) => p.type !== "variation").map((p) => (<label key={p.id} className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer ${editing.product_ids.includes(p.id) ? "text-white border-transparent" : "bg-white border-rm-border"}`} style={editing.product_ids.includes(p.id) ? { background: "#656080" } : undefined}>
                    <input type="checkbox" className="hidden" checked={editing.product_ids.includes(p.id)} onChange={(e) => setE("product_ids", e.target.checked ? [...editing.product_ids, p.id] : editing.product_ids.filter((x: number) => x !== p.id))}/>
                    {p.name}
                  </label>))}
              </div>
            </div>)}
          <div className="flex gap-2 mt-4 pt-3 border-t border-rm-border">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !editing.code.trim()} onClick={save}>{busy ? tr("Saving…") : tr("Save coupon")}</button>
            <button className="rm-btn rm-btn-secondary" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
          </div>
        </div>)}

      {!items ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[720px]">
            <thead><tr><th>{tr("Code")}</th><th>{tr("Type")}</th><th>{tr("Amount")}</th><th>{tr("Usage")}</th><th>{tr("Restrictions")}</th><th>{tr("Expiry")}</th><th>{tr("Actions")}</th></tr></thead>
            <tbody>
              {items.map((c) => (<tr key={c.id}>
                  <td>
                    <span className="font-mono font-bold uppercase" style={{ color: "#656080" }}>{c.code}</span>
                    {!c.enabled && <span className="rm-badge bg-rm-gray text-rm-muted ms-2">{tr("disabled")}</span>}
                    {c.description && <p className="text-xs text-rm-muted mt-0.5">{c.description}</p>}
                  </td>
                  <td className="text-rm-muted capitalize">{tr(c.discount_type.replace("_", " "))}</td>
                  <td className="font-semibold">{c.discount_type === "percent" ? `${c.amount}%` : money(c.amount)}</td>
                  <td>{c.usage_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className="text-xs text-rm-muted">
                    {[
                    c.minimum_amount > 0 && tr("Minimum: {0}", { "0": money(c.minimum_amount) }),
                    c.maximum_amount > 0 && tr("Maximum: {0}", { "0": money(c.maximum_amount) }),
                    c.individual_use && tr("Individual use"),
                    c.free_shipping && tr("Free shipping"),
                    c.product_ids?.length && tr("{0} products", { "0": c.product_ids.length }),
                ].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="text-rm-muted">{c.expiry_date ? fmtDate(c.expiry_date, locale) : tr("Never")}</td>
                  <td className="whitespace-nowrap">
                    <button className="text-rm-blue hover:underline text-sm me-3" onClick={() => setEditing({ ...c, expiry_date: c.expiry_date ? String(c.expiry_date).slice(0, 10) : "", individual_use: !!c.individual_use, free_shipping: !!c.free_shipping, enabled: !!c.enabled })}>{tr("Edit")}</button>
                    <button className="text-rm-red hover:underline text-sm" onClick={() => remove(c)}>{tr("Delete")}</button>
                  </td>
                </tr>))}
              {!items.length && <tr><td colSpan={7} className="text-center text-rm-muted py-8">{tr("No coupons yet. Create your first discount code.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
    </div>);
}
