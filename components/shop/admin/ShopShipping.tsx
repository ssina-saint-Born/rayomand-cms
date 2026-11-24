"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, L, OkNote, Toggle, useMoney, ShopHeader } from "./shared";

interface ZoneLoc { location_type: string; location_code: string }
interface ZoneMethod { id?: number; method_type: string; title: string; enabled: number; settings: Record<string, any> }
interface Zone { id: number; name: string; zone_order: number; locations: ZoneLoc[]; methods: ZoneMethod[] }
interface ShipClass { id: number; name: string; slug: string; description: string }
interface GeoProvince { code: string; name: string; cityCount: number }
interface GeoCity { name: string; code: string }

const EMPTY_ZONE = (): any => ({
    id: 0, name: "", zone_order: 0,
    locations: [{ location_type: "country", location_code: "IR" }] as ZoneLoc[],
    methods: [{ method_type: "flat_rate", title: "", enabled: 1, settings: { cost: "", type: "order" } }] as ZoneMethod[],
});

const METHOD_LABEL: Record<string, string> = {
    flat_rate: "Flat rate",
    free_shipping: "Free shipping",
    local_pickup: "Local pickup",
};

export default function ShopShipping() {
    const { t: tr } = useI18n();
    const money = useMoney();
    const [tab, setTab] = useState<"zones" | "classes">("zones");
    const [zones, setZones] = useState<Zone[] | null>(null);
    const [classes, setClasses] = useState<ShipClass[] | null>(null);
    const [editing, setEditing] = useState<any | null>(null);
    const [editingClass, setEditingClass] = useState<any | null>(null);
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const [z, c] = await Promise.all([
                api<{ zones: Zone[] }>("/api/commerce/shipping?kind=zones"),
                api<{ classes: ShipClass[] }>("/api/commerce/shipping?kind=classes"),
            ]);
            setZones(z.zones);
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

    async function saveZone() {
        if (!editing)
            return;
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const body = {
                kind: "zone",
                id: editing.id || undefined,
                name: editing.name,
                zone_order: Number(editing.zone_order) || 0,
                locations: editing.locations.filter((l: ZoneLoc) => l.location_code),
                methods: editing.methods.map((m: ZoneMethod) => ({
                    method_type: m.method_type,
                    title: m.title,
                    enabled: m.enabled,
                    settings: m.settings,
                })),
            };
            await api("/api/commerce/shipping", { method: "POST", body: JSON.stringify(body) });
            setMsg(tr("Shipping zone saved."));
            setEditing(null);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function removeZone(z: Zone) {
        if (!confirm(tr("Delete shipping zone “{0}”?", { "0": z.name })))
            return;
        try {
            await api(`/api/commerce/shipping?kind=zone&id=${z.id}`, { method: "DELETE" });
            setMsg(tr("Shipping zone deleted."));
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
            await api("/api/commerce/shipping", {
                method: "POST",
                body: JSON.stringify({ kind: "class", id: editingClass.id || undefined, name: editingClass.name, description: editingClass.description }),
            });
            setMsg(tr("Shipping class saved."));
            setEditingClass(null);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function removeClass(c: ShipClass) {
        if (!confirm(tr("Delete shipping class “{0}”? Products using it will fall back to no class.", { "0": c.name })))
            return;
        try {
            await api(`/api/commerce/shipping?kind=class&id=${c.id}`, { method: "DELETE" });
            setMsg(tr("Shipping class deleted."));
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }

    return (<div>
      <ShopHeader title={tr("Shipping")} sub={tr("Zones, delivery methods and shipping classes — Iran provinces and cities included")}/>

      <div className="flex gap-1 border-b border-rm-border mb-4">
        {[["zones", "Shipping zones"], ["classes", "Shipping classes"]].map(([id, label]) => (
            <button key={id} className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === id ? "text-rm-dark border-rm-blue" : "text-rm-muted border-transparent hover:text-rm-dark"}`} onClick={() => setTab(id as any)}>{tr(label)}</button>
        ))}
      </div>

      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      {tab === "zones" && (<>
          <div className="flex justify-end mb-3">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} onClick={() => setEditing(EMPTY_ZONE())} disabled={!classes}>{tr("Add shipping zone")}</button>
          </div>

          {editing && (<div className="rm-admin-card p-4 mb-5 border-t-4" style={{ borderTopColor: "#656080" }}>
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{editing.id ? tr("Edit zone: {0}", { "0": editing.name }) : tr("New shipping zone")}</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <L label={tr("Zone name")}><input className="rm-input mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={tr("Tehran province")}/></L>
                <L label={tr("Zone order")} hint={tr("Lower numbers win when zones overlap")}><input className="rm-input mt-1" type="number" value={editing.zone_order} onChange={(e) => setEditing({ ...editing, zone_order: e.target.value })}/></L>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-rm-dark mb-2">{tr("Zone locations")}</p>
                <div className="space-y-2">
                  {editing.locations.map((loc: ZoneLoc, i: number) => (
                      <div key={i} className="flex flex-wrap gap-2 items-start">
                        <select className="rm-input !w-auto" value={loc.location_type} onChange={(e) => {
                            const locations = editing.locations.map((x: ZoneLoc, j: number) => j === i ? { location_type: e.target.value, location_code: "" } : x);
                            setEditing({ ...editing, locations });
                        }}>
                          <option value="country">{tr("Country")}</option>
                          <option value="state">{tr("Province / State")}</option>
                          <option value="city">{tr("City")}</option>
                          <option value="postcode">{tr("Postcode")}</option>
                        </select>
                        <LocationValue loc={loc} provinces={provinces} onChange={(code) => {
                            const locations = editing.locations.map((x: ZoneLoc, j: number) => j === i ? { ...x, location_code: code } : x);
                            setEditing({ ...editing, locations });
                        }}/>
                        <button className="rm-btn rm-btn-ghost !text-rm-red" onClick={() => setEditing({ ...editing, locations: editing.locations.filter((_: any, j: number) => j !== i) })}>✕</button>
                      </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="rm-btn rm-btn-secondary" onClick={() => setEditing({ ...editing, locations: [...editing.locations, { location_type: "state", location_code: "" }] })}>{tr("Add province")}</button>
                  <button className="rm-btn rm-btn-secondary" onClick={() => setEditing({ ...editing, locations: [...editing.locations, { location_type: "city", location_code: "" }] })}>{tr("Add city")}</button>
                  <button className="rm-btn rm-btn-secondary" onClick={() => setEditing({ ...editing, locations: [...editing.locations, { location_type: "postcode", location_code: "" }] })}>{tr("Add postcode")}</button>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-sm font-semibold text-rm-dark mb-2">{tr("Shipping methods")}</p>
                <div className="space-y-3">
                  {editing.methods.map((m: ZoneMethod, i: number) => (
                      <MethodEditor key={i} method={m} classes={classes || []} money={money}
                        onChange={(next: ZoneMethod) => setEditing({ ...editing, methods: editing.methods.map((x: ZoneMethod, j: number) => j === i ? next : x) })}
                        onRemove={() => setEditing({ ...editing, methods: editing.methods.filter((_: any, j: number) => j !== i) })}/>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  {Object.keys(METHOD_LABEL).map((type) => (
                      <button key={type} className="rm-btn rm-btn-secondary" onClick={() => setEditing({
                          ...editing,
                          methods: [...editing.methods, { method_type: type, title: "", enabled: 1, settings: type === "flat_rate" ? { cost: "", type: "order" } : type === "free_shipping" ? { requires: "", min_amount: "" } : { cost: "" } }],
                      })}>{tr("Add {0}", { "0": tr(METHOD_LABEL[type]) })}</button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-rm-border">
                <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !editing.name.trim()} onClick={saveZone}>{busy ? tr("Saving…") : tr("Save zone")}</button>
                <button className="rm-btn rm-btn-secondary" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
              </div>
            </div>)}

          {!zones ? <Spinner /> : (<div className="space-y-3">
              {zones.map((z) => (<div key={z.id} className="rm-admin-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-rm-dark">{z.name} <span className="text-xs text-rm-muted">#{z.zone_order}</span></p>
                      <p className="text-xs text-rm-muted mt-1">
                        {z.locations.length ? z.locations.map((l) => locLabel(l, provinces)).join(" · ") : tr("No locations — this zone never matches")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {z.methods.map((m) => (<span key={m.id} className={`rm-badge ${m.enabled ? "bg-rm-gray text-rm-dark" : "bg-rm-gray text-rm-muted line-through"}`}>
                            {tr(METHOD_LABEL[m.method_type] || m.method_type)}{m.method_type === "flat_rate" && m.settings?.cost ? `: ${m.settings.cost}` : ""}
                          </span>))}
                        {!z.methods.length && <span className="text-xs text-rm-red">{tr("No methods — no rates offered")}</span>}
                      </div>
                    </div>
                    <div className="whitespace-nowrap">
                      <button className="text-rm-blue hover:underline text-sm me-3" onClick={() => setEditing(JSON.parse(JSON.stringify(z)))}>{tr("Edit")}</button>
                      <button className="text-rm-red hover:underline text-sm" onClick={() => removeZone(z)}>{tr("Delete")}</button>
                    </div>
                  </div>
                </div>))}
              {!zones.length && <div className="rm-admin-card p-8 text-center text-rm-muted text-sm">{tr("No shipping zones yet. Add a zone covering Iran to start offering delivery rates.")}</div>}
              <p className="text-xs text-rm-muted">{tr("Without a matching zone the store falls back to the legacy flat-rate settings in Commerce → Settings → Shipping.")}</p>
            </div>)}
        </>)}

      {tab === "classes" && (<>
          <div className="flex justify-end mb-3">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} onClick={() => setEditingClass({ id: 0, name: "", description: "" })}>{tr("Add shipping class")}</button>
          </div>

          {editingClass && (<div className="rm-admin-card p-4 mb-5 border-t-4" style={{ borderTopColor: "#656080" }}>
              <h2 className="font-semibold text-sm text-rm-dark mb-3">{editingClass.id ? tr("Edit class: {0}", { "0": editingClass.name }) : tr("New shipping class")}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <L label={tr("Class name")}><input className="rm-input mt-1" value={editingClass.name} onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })} placeholder={tr("Bulky items")}/></L>
                <L label={tr("Description")}><input className="rm-input mt-1" value={editingClass.description} onChange={(e) => setEditingClass({ ...editingClass, description: e.target.value })}/></L>
              </div>
              <p className="text-xs text-rm-muted mt-2">{tr("Assign a shipping class to a product in the product editor, then add a per-class cost to a flat-rate method.")}</p>
              <div className="flex gap-2 mt-4 pt-3 border-t border-rm-border">
                <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !editingClass.name.trim()} onClick={saveClass}>{busy ? tr("Saving…") : tr("Save class")}</button>
                <button className="rm-btn rm-btn-secondary" onClick={() => setEditingClass(null)}>{tr("Cancel")}</button>
              </div>
            </div>)}

          {!classes ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
              <table className="rm-table min-w-[520px]">
                <thead><tr><th>{tr("Class")}</th><th>{tr("Slug")}</th><th>{tr("Description")}</th><th>{tr("Actions")}</th></tr></thead>
                <tbody>
                  {classes.map((c) => (<tr key={c.id}>
                      <td className="font-semibold">{c.name}</td>
                      <td className="font-mono text-xs text-rm-muted">{c.slug}</td>
                      <td className="text-rm-muted">{c.description || "—"}</td>
                      <td className="whitespace-nowrap">
                        <button className="text-rm-blue hover:underline text-sm me-3" onClick={() => setEditingClass({ ...c })}>{tr("Edit")}</button>
                        <button className="text-rm-red hover:underline text-sm" onClick={() => removeClass(c)}>{tr("Delete")}</button>
                      </td>
                    </tr>))}
                  {!classes.length && <tr><td colSpan={4} className="text-center text-rm-muted py-8">{tr("No shipping classes yet.")}</td></tr>}
                </tbody>
              </table>
            </div>)}
        </>)}
    </div>);
}

const COUNTRY_NAMES: Record<string, string> = { IR: "Iran", US: "United States", GB: "United Kingdom", DE: "Germany", AE: "United Arab Emirates" };

function locLabel(loc: ZoneLoc, provinces: GeoProvince[]): string {
    const code = String(loc.location_code || "");
    if (loc.location_type === "country") return COUNTRY_NAMES[code] || code;
    if (loc.location_type === "state") {
        const province = code.split(":").pop() || "";
        return provinces.find((p) => p.code === province)?.name || province;
    }
    if (loc.location_type === "city") {
        const [province, city] = code.split(":");
        const provinceName = provinces.find((p) => p.code === province)?.name;
        return provinceName ? `${city} (${provinceName})` : city;
    }
    return code;
}

function LocationValue({ loc, provinces, onChange }: { loc: ZoneLoc; provinces: GeoProvince[]; onChange: (code: string) => void }) {
    const { t: tr } = useI18n();
    const [cities, setCities] = useState<GeoCity[]>([]);
    const provinceCode = loc.location_type === "city" || loc.location_type === "state" ? String(loc.location_code || "").split(":")[0] : "";

    useEffect(() => {
        if (loc.location_type !== "city" || !provinceCode) { setCities([]); return; }
        api<{ cities: GeoCity[] }>(`/api/storefront/geo?state=${encodeURIComponent(provinceCode)}`)
            .then((r) => setCities(r.cities)).catch(() => setCities([]));
    }, [loc.location_type, provinceCode]);

    if (loc.location_type === "country") {
        return (<select className="rm-input !w-40" value={loc.location_code} onChange={(e) => onChange(e.target.value)}>
            <option value="IR">{tr("Iran")}</option>
            <option value="US">{tr("United States")}</option>
            <option value="GB">{tr("United Kingdom")}</option>
            <option value="DE">{tr("Germany")}</option>
            <option value="AE">{tr("United Arab Emirates")}</option>
          </select>);
    }
    if (loc.location_type === "state") {
        const current = String(loc.location_code || "").split(":").pop() || "";
        return (<select className="rm-input !w-56" value={current} onChange={(e) => onChange(e.target.value)}>
            <option value="">{tr("Select a province…")}</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>);
    }
    if (loc.location_type === "city") {
        return (<>
            <select className="rm-input !w-56" value={provinceCode} onChange={(e) => onChange(e.target.value)}>
              <option value="">{tr("Province…")}</option>
              {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <select className="rm-input !w-56" value={String(loc.location_code || "").split(":")[1] || ""} onChange={(e) => onChange(`${provinceCode}:${e.target.value}`)} disabled={!provinceCode}>
              <option value="">{tr("City…")}</option>
              {cities.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
          </>);
    }
    return <input className="rm-input !w-40" value={loc.location_code} onChange={(e) => onChange(e.target.value)} placeholder={tr("e.g. 1000...1999 or 123*")}/>;
}

function MethodEditor({ method, classes, money, onChange, onRemove }: { method: ZoneMethod; classes: ShipClass[]; money: (n: number) => string; onChange: (m: ZoneMethod) => void; onRemove: () => void }) {
    const { t: tr } = useI18n();
    const [expanded, setExpanded] = useState(true);
    const s = method.settings || {};
    const setSetting = (k: string, v: any) => onChange({ ...method, settings: { ...s, [k]: v } });

    return (<div className="border border-rm-border rounded p-3 bg-rm-gray/40">
        <div className="flex flex-wrap items-center gap-2">
          <select className="rm-input !w-auto" value={method.method_type} onChange={(e) => onChange({ ...method, method_type: e.target.value })}>
            {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
          </select>
          <input className="rm-input !w-48" placeholder={tr("Method title (optional)")} value={method.title} onChange={(e) => onChange({ ...method, title: e.target.value })}/>
          <Toggle checked={!!method.enabled} onChange={(v) => onChange({ ...method, enabled: v ? 1 : 0 })} label={tr("Enabled")}/>
          <button className="ms-auto text-xs text-rm-blue hover:underline" onClick={() => setExpanded(!expanded)}>{expanded ? tr("Hide settings") : tr("Show settings")}</button>
          <button className="text-rm-red hover:underline" onClick={onRemove}>✕</button>
        </div>

        {expanded && method.method_type === "flat_rate" && (<div className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <L label={tr("Cost")} hint={tr("Number, [qty], [cost] or arithmetic, e.g. 5 + (2 * [qty])")}>
                <input className="rm-input mt-1" value={s.cost ?? ""} onChange={(e) => setSetting("cost", e.target.value)} placeholder="0"/>
              </L>
              <L label={tr("Class cost calculation")}>
                <select className="rm-input mt-1" value={s.type === "class" ? "class" : "order"} onChange={(e) => setSetting("type", e.target.value)}>
                  <option value="order">{tr("Per order: use the highest class cost")}</option>
                  <option value="class">{tr("Per class: sum each class cost")}</option>
                </select>
              </L>
            </div>
            {classes.length > 0 && (<div className="space-y-2">
                <p className="text-xs font-semibold text-rm-dark">{tr("Shipping class costs")}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="text-xs">
                    <span className="block text-rm-muted mb-1">{tr("No shipping class")}</span>
                    <input className="rm-input" value={s.class_cost_no_class ?? ""} onChange={(e) => setSetting("class_cost_no_class", e.target.value)} placeholder="0"/>
                  </label>
                  {classes.map((c) => (<label key={c.id} className="text-xs">
                      <span className="block text-rm-muted mb-1">{c.name}</span>
                      <input className="rm-input" value={s[`class_cost_${c.slug}`] ?? ""} onChange={(e) => setSetting(`class_cost_${c.slug}`, e.target.value)} placeholder="0"/>
                    </label>))}
                </div>
              </div>)}
          </div>)}

        {expanded && method.method_type === "free_shipping" && (<div className="mt-3 grid sm:grid-cols-2 gap-3">
            <L label={tr("Free shipping requires")}>
              <select className="rm-input mt-1" value={s.requires ?? ""} onChange={(e) => setSetting("requires", e.target.value)}>
                <option value="">{tr("No requirement")}</option>
                <option value="min_amount">{tr("A minimum order amount")}</option>
                <option value="coupon">{tr("A valid free-shipping coupon")}</option>
                <option value="both">{tr("Both")}</option>
              </select>
            </L>
            <L label={tr("Minimum order amount")} hint={money(Number(s.min_amount || 0))}>
              <input className="rm-input mt-1" type="number" step="0.01" min="0" value={s.min_amount ?? ""} onChange={(e) => setSetting("min_amount", e.target.value)} disabled={s.requires !== "min_amount" && s.requires !== "both"} placeholder="0"/>
            </L>
          </div>)}

        {expanded && method.method_type === "local_pickup" && (<div className="mt-3">
            <L label={tr("Pickup cost")} hint={tr("Leave empty for free pickup")}>
              <input className="rm-input mt-1" value={s.cost ?? ""} onChange={(e) => setSetting("cost", e.target.value)} placeholder="0"/>
            </L>
          </div>)}
      </div>);
}
