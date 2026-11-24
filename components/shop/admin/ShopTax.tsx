"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, L, OkNote, Toggle, ShopHeader } from "./shared";

interface TaxClass { id: number; name: string; slug: string }
interface TaxRate {
    id: number; tax_class: string; country: string; state: string; postcode: string; city: string;
    rate: number; name: string; priority: number; compound: number; shipping: number;
}
interface GeoProvince { code: string; name: string; cityCount: number }
interface GeoCity { name: string; code: string }

const EMPTY_RATE = (taxClass = ""): any => ({
    id: 0, tax_class: taxClass, country: "IR", state: "", postcode: "", city: "",
    rate: "", name: "", priority: 1, compound: 0, shipping: 1,
});

export default function ShopTax() {
    const { t: tr } = useI18n();
    const [tab, setTab] = useState<"rates" | "classes">("rates");
    const [rates, setRates] = useState<TaxRate[] | null>(null);
    const [classes, setClasses] = useState<TaxClass[] | null>(null);
    const [editing, setEditing] = useState<any | null>(null);
    const [editingClass, setEditingClass] = useState<any | null>(null);
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [cities, setCities] = useState<GeoCity[]>([]);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const [r, c] = await Promise.all([
                api<{ rates: TaxRate[] }>("/api/commerce/tax?kind=rates"),
                api<{ classes: TaxClass[] }>("/api/commerce/tax?kind=classes"),
            ]);
            setRates(r.rates);
            setClasses(c.classes);
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    useEffect(() => {
        load();
        api<{ provinces: GeoProvince[] }>("/api/storefront/geo").then((r) => setProvinces(r.provinces)).catch(() => { });
    }, []);

    useEffect(() => {
        const st = editing?.state;
        if (!editing || editing.country !== "IR" || !st) { setCities([]); return; }
        api<{ cities: GeoCity[] }>(`/api/storefront/geo?state=${encodeURIComponent(st)}`)
            .then((r) => setCities(r.cities)).catch(() => setCities([]));
    }, [editing?.country, editing?.state]);

    function classLabel(slug: string) {
        if (!slug) return tr("Standard rate");
        return classes?.find((c) => c.slug === slug)?.name || slug;
    }

    function provinceNameOf(code: string) {
        if (!code) return "";
        return provinces.find((p) => p.code === code)?.name || code;
    }

    async function saveRate() {
        if (!editing)
            return;
        setBusy(true);
        setError("");
        setMsg("");
        try {
            await api("/api/commerce/tax", {
                method: "POST",
                body: JSON.stringify({
                    kind: "rate",
                    id: editing.id || undefined,
                    tax_class: editing.tax_class || "",
                    country: editing.country,
                    state: editing.state,
                    postcode: editing.postcode,
                    city: editing.city,
                    rate: Number(editing.rate),
                    name: editing.name,
                    priority: Number(editing.priority) || 1,
                    compound: !!editing.compound,
                    shipping: editing.shipping ? 1 : 0,
                }),
            });
            setMsg(tr("Tax rate saved."));
            setEditing(null);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function removeRate(r: TaxRate) {
        if (!confirm(tr("Delete tax rate “{0}”?", { "0": r.name || `${r.rate}%` })))
            return;
        try {
            await api(`/api/commerce/tax?kind=rate&id=${r.id}`, { method: "DELETE" });
            setMsg(tr("Tax rate deleted."));
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    async function saveClass() {
        if (!editingClass)
            return;
        setBusy(true);
        setError("");
        setMsg("");
        try {
            await api("/api/commerce/tax", {
                method: "POST",
                body: JSON.stringify({ kind: "class", id: editingClass.id || undefined, name: editingClass.name }),
            });
            setMsg(tr("Tax class saved."));
            setEditingClass(null);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function removeClass(c: TaxClass) {
        if (!confirm(tr("Delete tax class “{0}”? Products and rates using it will fall back to standard.", { "0": c.name })))
            return;
        try {
            await api(`/api/commerce/tax?kind=class&id=${c.id}`, { method: "DELETE" });
            setMsg(tr("Tax class deleted."));
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    return (<div>
      <ShopHeader title={tr("Tax")} sub={tr("Tax classes and location-based rates by country, province, city and postcode")}/>

      <div className="flex gap-1 border-b border-rm-border mb-4">
        {[["rates", "Tax rates"], ["classes", "Tax classes"]].map(([id, label]) => (
            <button key={id} className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === id ? "text-rm-dark border-rm-blue" : "text-rm-muted border-transparent hover:text-rm-dark"}`} onClick={() => setTab(id as any)}>{tr(label)}</button>
        ))}
      </div>

      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      {tab === "rates" && (<>
          <div className="flex justify-end mb-3">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} onClick={() => setEditing(EMPTY_RATE())} disabled={!classes}>{tr("Add tax rate")}</button>
          </div>

          {editing && (<div className="rm-admin-card p-4 mb-5 border-t-4" style={{ borderTopColor: "#656080" }}>
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{editing.id ? tr("Edit tax rate") : tr("New tax rate")}</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <L label={tr("Tax class")}>
                  <select className="rm-input mt-1" value={editing.tax_class} onChange={(e) => setEditing({ ...editing, tax_class: e.target.value })}>
                    <option value="">{tr("Standard rate")}</option>
                    {(classes || []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                  </select>
                </L>
                <L label={tr("Country")}>
                  <select className="rm-input mt-1" value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value, state: "", city: "" })}>
                    <option value="">{tr("Any country")}</option>
                    <option value="IR">{tr("Iran")}</option>
                    <option value="US">{tr("United States")}</option>
                    <option value="GB">{tr("United Kingdom")}</option>
                    <option value="DE">{tr("Germany")}</option>
                    <option value="AE">{tr("United Arab Emirates")}</option>
                  </select>
                </L>
                <L label={tr("Rate (%)")}>
                  <input className="rm-input mt-1" type="number" step="0.01" min="0" value={editing.rate} onChange={(e) => setEditing({ ...editing, rate: e.target.value })} placeholder="9"/>
                </L>

                <L label={tr("Province / State")}>
                  {editing.country === "IR" ? (
                      <select className="rm-input mt-1" value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value, city: "" })}>
                        <option value="">{tr("All provinces")}</option>
                        {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                      </select>
                  ) : (
                      <input className="rm-input mt-1" value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value })} placeholder={tr("e.g. CA")}/>
                  )}
                </L>
                <L label={tr("City")} hint={tr("Leave empty for all cities")}>
                  {editing.country === "IR" && editing.state ? (
                      <select className="rm-input mt-1" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })}>
                        <option value="">{tr("All cities")}</option>
                        {cities.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                      </select>
                  ) : (
                      <input className="rm-input mt-1" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} placeholder={tr("Any city")} disabled={editing.country === "IR" && !editing.state}/>
                  )}
                </L>
                <L label={tr("Postcode")} hint={tr("Exact, prefix with * or range with ...")}>
                  <input className="rm-input mt-1" value={editing.postcode} onChange={(e) => setEditing({ ...editing, postcode: e.target.value })} placeholder={tr("Any")}/>
                </L>

                <L label={tr("Name")} hint={tr("Shown on the cart and invoices")}>
                  <input className="rm-input mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={tr("VAT")}/>
                </L>
                <L label={tr("Priority")} hint={tr("Higher priorities apply first")}>
                  <input className="rm-input mt-1" type="number" min="1" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}/>
                </L>
              </div>
              <div className="flex flex-wrap gap-5 mt-3">
                <Toggle checked={!!editing.compound} onChange={(v) => setEditing({ ...editing, compound: v })} label={tr("Compound (applied on top of other rates)")}/>
                <Toggle checked={!!editing.shipping} onChange={(v) => setEditing({ ...editing, shipping: v ? 1 : 0 })} label={tr("Apply to shipping cost")}/>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-rm-border">
                <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || editing.rate === ""} onClick={saveRate}>{busy ? tr("Saving…") : tr("Save rate")}</button>
                <button className="rm-btn rm-btn-secondary" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
              </div>
            </div>)}

          {!rates ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
              <table className="rm-table min-w-[760px]">
                <thead><tr><th>{tr("Class")}</th><th>{tr("Location")}</th><th>{tr("Rate")}</th><th>{tr("Name")}</th><th>{tr("Priority")}</th><th>{tr("Flags")}</th><th>{tr("Actions")}</th></tr></thead>
                <tbody>
                  {rates.map((r) => (<tr key={r.id}>
                      <td className="font-semibold whitespace-nowrap">{classLabel(r.tax_class)}</td>
                      <td className="text-xs text-rm-muted">
                        {[r.country || tr("Any country"), provinceNameOf(r.state), r.city, r.postcode && tr("ZIP {0}", { "0": r.postcode })].filter(Boolean).join(" · ")}
                      </td>
                      <td className="font-semibold">{r.rate}%</td>
                      <td>{r.name || "—"}</td>
                      <td>{r.priority}</td>
                      <td className="text-xs text-rm-muted">{[r.compound ? tr("compound") : "", r.shipping ? tr("shipping") : ""].filter(Boolean).join(", ") || "—"}</td>
                      <td className="whitespace-nowrap">
                        <button className="text-rm-blue hover:underline text-sm me-3" onClick={() => setEditing({ ...r })}>{tr("Edit")}</button>
                        <button className="text-rm-red hover:underline text-sm" onClick={() => removeRate(r)}>{tr("Delete")}</button>
                      </td>
                    </tr>))}
                  {!rates.length && <tr><td colSpan={7} className="text-center text-rm-muted py-8">{tr("No tax rates yet. Add a rate for Iran to start collecting tax.")}</td></tr>}
                </tbody>
              </table>
            </div>)}
          <p className="text-xs text-rm-muted mt-2">{tr("Tax calculations must also be enabled in Commerce → Settings → Tax. Without location rates the store falls back to the single standard rate set there.")}</p>
        </>)}

      {tab === "classes" && (<>
          <div className="flex justify-end mb-3">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} onClick={() => setEditingClass({ id: 0, name: "" })}>{tr("Add tax class")}</button>
          </div>

          {editingClass && (<div className="rm-admin-card p-4 mb-5 border-t-4" style={{ borderTopColor: "#656080" }}>
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{editingClass.id ? tr("Edit class: {0}", { "0": editingClass.name }) : tr("New tax class")}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <L label={tr("Class name")}><input className="rm-input mt-1" value={editingClass.name} onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })} placeholder={tr("Reduced rate")}/></L>
              </div>
              <p className="text-xs text-rm-muted mt-2">{tr("Assign a tax class to a product, then define its rates under Tax rates.")}</p>
              <div className="flex gap-2 mt-4 pt-3 border-t border-rm-border">
                <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !editingClass.name.trim()} onClick={saveClass}>{busy ? tr("Saving…") : tr("Save class")}</button>
                <button className="rm-btn rm-btn-secondary" onClick={() => setEditingClass(null)}>{tr("Cancel")}</button>
              </div>
            </div>)}

          {!classes ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
              <table className="rm-table min-w-[420px]">
                <thead><tr><th>{tr("Class")}</th><th>{tr("Slug")}</th><th>{tr("Actions")}</th></tr></thead>
                <tbody>
                  <tr>
                    <td className="font-semibold">{tr("Standard rate")}</td>
                    <td className="font-mono text-xs text-rm-muted">—</td>
                    <td className="text-xs text-rm-muted">{tr("Built in")}</td>
                  </tr>
                  {classes.map((c) => (<tr key={c.id}>
                      <td className="font-semibold">{c.name}</td>
                      <td className="font-mono text-xs text-rm-muted">{c.slug}</td>
                      <td className="whitespace-nowrap">
                        <button className="text-rm-blue hover:underline text-sm me-3" onClick={() => setEditingClass({ ...c })}>{tr("Edit")}</button>
                        <button className="text-rm-red hover:underline text-sm" onClick={() => removeClass(c)}>{tr("Delete")}</button>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </>)}
    </div>);
}
