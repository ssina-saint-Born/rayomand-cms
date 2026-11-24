"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";
import type { Media } from "@/lib/types";
import { ErrorNote, L, OkNote, Toggle, ShopHeader } from "./shared";
import ProductSmsTab from "./ProductSmsTab";
const TABS = [
    { id: "general", label: "General" },
    { id: "inventory", label: "Inventory" },
    { id: "shipping", label: "Shipping" },
    { id: "files", label: "Download files" },
    { id: "attributes", label: "Attributes" },
    { id: "variations", label: "Variations" },
    { id: "grouped", label: "Grouped products" },
    { id: "sms", label: "SMS newsletter" },
    { id: "free", label: "Free Download" },
];
const EMPTY_FORM = {
    name: "", slug: "", type: "simple", status: "publish", description: "", short_description: "",
    sku: "", regular_price: "", sale_price: "", tax_status: "taxable",
    manage_stock: false, stock_quantity: "", stock_status: "instock",
    weight: "", length: "", width: "", height: "", shipping_class: "", tax_class: "",
    virtual: false, downloadable: false, featured: false, catalog_visibility: "visible",
    images: [] as any[], attributes: [] as any[], children: [] as number[], files: [] as any[],
    download_limit: -1, download_expiry: -1,
};
const EMPTY_INDY = {
    exclude: false, exclude_email_capture: false, force_zip: false, download_type: -1,
    limit_enable: false, limit_amount: 5, limit_freq: "month", limit_error: "",
};
export default function ShopProductEditor({ id }: {
    id?: number;
}) {
    const { t: tr } = useI18n();
    const router = useRouter();
    const isNew = !id;
    const [form, setForm] = useState<any>({ ...EMPTY_FORM });
    const [variations, setVariations] = useState<any[]>([]);
    const [indy, setIndy] = useState<any>({ ...EMPTY_INDY });
    const [som, setSom] = useState<any>(null);
    const [cats, setCats] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [catIds, setCatIds] = useState<number[]>([]);
    const [tagText, setTagText] = useState("");
    const [newCat, setNewCat] = useState("");
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [tab, setTab] = useState("general");
    const [picker, setPicker] = useState<{
        kind: "image";
    } | {
        kind: "file";
        index: number;
    } | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [downloadCount, setDownloadCount] = useState(0);
    const [slug, setSlug] = useState("");
    const [shipClasses, setShipClasses] = useState<any[]>([]);
    const [taxClasses, setTaxClasses] = useState<any[]>([]);
    const [units, setUnits] = useState({ weight: "kg", dimension: "cm" });
    useEffect(() => {
        api<any>("/api/storefront/settings").then((s) => {
            setCats(s.categories || []);
            setTags(s.tags || []);
            setUnits({ weight: s.weight_unit || "kg", dimension: s.dimension_unit || "cm" });
        }).catch(() => { });
        api<any>("/api/commerce/shipping?kind=classes").then((r) => setShipClasses(r.classes || [])).catch(() => { });
        api<any>("/api/commerce/tax?kind=classes").then((r) => setTaxClasses(r.classes || [])).catch(() => { });
        api<any>("/api/commerce/products?per_page=100&status=any").then((r) => setAllProducts(r.items)).catch(() => { });
        api<any>("/api/downloads/settings").then(setSom).catch(() => { });
        if (id) {
            api<any>(`/api/commerce/products/${id}`).then((p) => {
                setForm({
                    ...EMPTY_FORM,
                    name: p.name, slug: p.slug, type: p.type, status: p.status,
                    description: p.description, short_description: p.short_description, sku: p.sku,
                    regular_price: p.regular_price ?? "", sale_price: p.sale_price ?? "", tax_status: p.tax_status,
                    manage_stock: !!p.manage_stock, stock_quantity: p.stock_quantity ?? "", stock_status: p.stock_status,
                    weight: p.weight, length: p.length ?? "", width: p.width ?? "", height: p.height ?? "",
                    shipping_class: p.shipping_class || "", tax_class: p.tax_class || "",
                    virtual: !!p.virtual, downloadable: !!p.downloadable, featured: !!p.featured,
                    catalog_visibility: p.catalog_visibility, images: p.images || [], attributes: p.attributes || [],
                    children: p.children || [], files: p.files || [], download_limit: p.download_limit, download_expiry: p.download_expiry,
                });
                setSlug(p.slug);
                setVariations((p.variations || []).map((v: any) => ({
                    id: v.id, name: v.name, sku: v.sku, regular_price: v.regular_price ?? "", sale_price: v.sale_price ?? "",
                    manage_stock: !!v.manage_stock, stock_quantity: v.stock_quantity ?? "", downloadable: !!v.downloadable,
                    virtual: !!v.virtual, files: v.files || [], attributes: v.attributes || [],
                })));
                setCatIds((p.categories || []).map((c: any) => c.id));
                setTagText((p.tags || []).map((t: any) => t.name).join(", "));
                setDownloadCount(p.download_count || 0);
                setLoading(false);
            })
                .catch((e) => { setError(e.message); setLoading(false); });
        }
    }, [id]);
    useEffect(() => {
        if (som && id) {
            const saved = (som.indy_items || {})[String(id)] || {};
            setIndy({ ...EMPTY_INDY, ...saved, download_type: saved.download_type ?? -1 });
        }
    }, [som, id]);
    const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
    const setI = (k: string, v: any) => setIndy((f: any) => ({ ...f, [k]: v }));
    const setV = (i: number, k: string, v: any) => setVariations((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
    function onPick(m: Media) {
        if (!picker)
            return;
        if (picker.kind === "image")
            set("images", [...form.images, { src: m.url, alt: m.alt || form.name }]);
        else {
            const files = [...form.files];
            files[picker.index] = { name: files[picker.index]?.name || m.title || m.filename, file: m.url };
            set("files", files);
        }
        setPicker(null);
    }
    async function save() {
        setSaving(true);
        setError("");
        setMsg("");
        try {
            const payload: any = {
                ...form,
                regular_price: form.regular_price === "" ? null : Number(form.regular_price),
                sale_price: form.sale_price === "" ? null : Number(form.sale_price),
                stock_quantity: form.stock_quantity === "" ? null : Number(form.stock_quantity),
                categories: catIds.map((cid) => cid < 0 ? { name: cats.find((c) => c.id === cid)?.name } : cid).filter(Boolean),
                tags: tagText.split(",").map((t) => t.trim()).filter(Boolean).map((name) => ({ name })),
            };
            delete payload.price;
            const saved = isNew
                ? await api<any>("/api/commerce/products", { method: "POST", body: JSON.stringify(payload) })
                : await api<any>(`/api/commerce/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
            const pid = saved.id;
            if (form.type === "variable") {
                const savedVariations = [];
                for (const v of variations) {
                    const vp: any = {
                        type: "variation", parent_id: pid, name: v.name || `${form.name} variation`, status: "publish",
                        sku: v.sku, regular_price: v.regular_price === "" ? null : Number(v.regular_price),
                        sale_price: v.sale_price === "" ? null : Number(v.sale_price),
                        manage_stock: v.manage_stock, stock_quantity: v.stock_quantity === "" ? null : Number(v.stock_quantity),
                        downloadable: v.downloadable, virtual: v.virtual, files: v.files, attributes: v.attributes,
                    };
                    if (v._delete) {
                        if (v.id)
                            await api(`/api/commerce/products/${v.id}`, { method: "DELETE" });
                    }
                    else {
                        const result = v.id
                            ? await api<any>(`/api/commerce/products/${v.id}`, { method: "PATCH", body: JSON.stringify(vp) })
                            : await api<any>("/api/commerce/products", { method: "POST", body: JSON.stringify(vp) });
                        savedVariations.push({ ...v, id: result.id });
                        setVariations((prev) => prev.map((x) => x === v ? { ...x, id: result.id } : x));
                    }
                }
                setVariations(savedVariations);
            }
            if (som) {
                const items = { ...(som.indy_items || {}) };
                const clean: any = {};
                if (indy.exclude)
                    clean.exclude = true;
                if (indy.exclude_email_capture)
                    clean.exclude_email_capture = true;
                if (indy.force_zip)
                    clean.force_zip = true;
                if (Number(indy.download_type) >= 0)
                    clean.download_type = Number(indy.download_type);
                if (indy.limit_enable) {
                    clean.limit_enable = true;
                    clean.limit_amount = Number(indy.limit_amount || 0);
                    clean.limit_freq = indy.limit_freq;
                    if (indy.limit_error)
                        clean.limit_error = indy.limit_error;
                }
                items[String(pid)] = clean;
                const nextSom = await api<any>("/api/downloads/settings", { method: "POST", body: JSON.stringify({ indy_items: items }) });
                setSom(nextSom);
            }
            setMsg("Product saved.");
            setDownloadCount(saved.download_count || 0);
            if (isNew)
                router.replace(`/studio/commerce/products/${pid}`);
        }
        catch (e: any) {
            setError(e.message);
        }
        setSaving(false);
    }
    async function remove() {
        if (!id || !confirm(tr("Delete this product permanently?")))
            return;
        try {
            await api(`/api/commerce/products/${id}`, { method: "DELETE" });
            router.push("/studio/commerce/products");
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    if (loading)
        return <Spinner label={tr("Loading product…")}/>;
    const visibleTabs = TABS.filter((t) => {
        if (t.id === "variations")
            return form.type === "variable";
        if (t.id === "grouped")
            return form.type === "grouped";
        if (t.id === "files")
            return true;
        return true;
    });
    const isFree = form.downloadable && (form.regular_price === "" || Number(form.regular_price) <= 0) && (form.sale_price === "" || Number(form.sale_price) <= 0);
    return (<div>
      <ShopHeader title={isNew ? tr("Add new product") : tr("Edit product — {0}", {"0": String(form.name ?? "")})} action={<Link href="/studio/commerce/products" className="rm-btn rm-btn-secondary">{tr("Back to products")}</Link>}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="rm-admin-card p-4 space-y-3">
            <input className="rm-input !text-lg font-semibold" placeholder={tr("Product name")} value={form.name} onChange={(e) => set("name", e.target.value)}/>
            {!isNew && <p className="text-xs text-rm-muted">{tr("Slug:")}{" "}<span className="font-mono">{slug}</span> · <Link href={`/collection/items/${slug}`} className="text-rm-blue hover:underline">{tr("View on store")}</Link></p>}
            <L label={tr("Description")}>
              <textarea className="rm-input mt-1" rows={7} value={form.description} onChange={(e) => set("description", e.target.value)}/>
            </L>
            <L label={tr("Short description")} hint={tr("Shown on the product page and in archives.")}>
              <textarea className="rm-input mt-1" rows={3} value={form.short_description} onChange={(e) => set("short_description", e.target.value)}/>
            </L>
          </div>

          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Product data")}</div>
            <div className="flex flex-col">
              <div className="noma-tab-strip" aria-label={tr("Product settings sections")}>
                {visibleTabs.map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className="noma-tab" aria-pressed={tab === t.id}>
                    {tr(t.label)}{t.id === "free" && isFree ? " ●" : ""}
                  </button>))}
              </div>
              <div className="flex-1 p-4 space-y-3 min-w-0">
                {tab === "general" && (<>
                    <L label={tr("Product type")}>
                      <select className="rm-input mt-1" value={form.type} onChange={(e) => set("type", e.target.value)}>
                        <option value="simple">{tr("Simple product")}</option>
                        <option value="variable">{tr("Variable product")}</option>
                        <option value="grouped">{tr("Grouped product")}</option>
                        <option value="external">{tr("External / affiliate")}</option>
                      </select>
                    </L>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <L label={tr("Regular price")}><input className="rm-input mt-1" type="number" step="0.01" min="0" value={form.regular_price} onChange={(e) => set("regular_price", e.target.value)} placeholder="0.00"/></L>
                      <L label={tr("Sale price")}><input className="rm-input mt-1" type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} placeholder={tr("Optional")}/></L>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <L label={tr("Tax status")}>
                        <select className="rm-input mt-1" value={form.tax_status} onChange={(e) => set("tax_status", e.target.value)}>
                          <option value="taxable">{tr("Taxable")}</option><option value="shipping">{tr("Shipping only")}</option><option value="none">{tr("None")}</option>
                        </select>
                      </L>
                      <L label={tr("Tax class")} hint={tr("Rates for this class apply at checkout")}>
                        <select className="rm-input mt-1" value={form.tax_class} onChange={(e) => set("tax_class", e.target.value)} disabled={form.tax_status !== "taxable"}>
                          <option value="">{tr("Standard rate")}</option>
                          {taxClasses.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                        </select>
                      </L>
                    </div>
                    <div className="flex gap-5">
                      <Toggle checked={form.virtual} onChange={(v) => set("virtual", v)} label={tr("Virtual (no shipping)")}/>
                      <Toggle checked={form.downloadable} onChange={(v) => set("downloadable", v)} label={tr("Downloadable")}/>
                    </div>
                    {isFree && form.status === "publish" && (<p className="text-xs rounded px-3 py-2" style={{ background: "#e2f5e7", color: "#405b49" }}>
                        {tr("This product is offered as a free download by the Free Downloads add-on. Configure per-product overrides in the “Free Download” tab.")}</p>)}
                  </>)}

                {tab === "inventory" && (<>
                    <L label={tr("SKU")}><input className="rm-input mt-1" value={form.sku} onChange={(e) => set("sku", e.target.value)}/></L>
                    <Toggle checked={form.manage_stock} onChange={(v) => set("manage_stock", v)} label={tr("Track stock quantity for this product")}/>
                    {form.manage_stock && (<L label={tr("Stock quantity")}><input className="rm-input mt-1" type="number" min="0" value={form.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)}/></L>)}
                    <L label={tr("Stock status")}>
                      <select className="rm-input mt-1" value={form.stock_status} onChange={(e) => set("stock_status", e.target.value)}>
                        <option value="instock">{tr("In stock")}</option><option value="outofstock">{tr("Out of stock")}</option><option value="onbackorder">{tr("On backorder")}</option>
                      </select>
                    </L>
                  </>)}

                {tab === "shipping" && (<>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <L label={tr("Weight ({0})", {"0": form.virtual ? tr("n/a — virtual") : units.weight})}>
                        <input className="rm-input mt-1" value={form.weight} onChange={(e) => set("weight", e.target.value)} disabled={form.virtual} placeholder="0.0"/>
                      </L>
                      <L label={tr("Shipping class")} hint={tr("Used to add extra costs on zone flat rates")}>
                        <select className="rm-input mt-1" value={form.shipping_class} onChange={(e) => set("shipping_class", e.target.value)} disabled={form.virtual}>
                          <option value="">{tr("No shipping class")}</option>
                          {shipClasses.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                        </select>
                      </L>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <L label={tr("Length ({0})", {"0": units.dimension})}><input className="rm-input mt-1" value={form.length} onChange={(e) => set("length", e.target.value)} disabled={form.virtual} placeholder="0"/></L>
                      <L label={tr("Width ({0})", {"0": units.dimension})}><input className="rm-input mt-1" value={form.width} onChange={(e) => set("width", e.target.value)} disabled={form.virtual} placeholder="0"/></L>
                      <L label={tr("Height ({0})", {"0": units.dimension})}><input className="rm-input mt-1" value={form.height} onChange={(e) => set("height", e.target.value)} disabled={form.virtual} placeholder="0"/></L>
                    </div>
                    {!shipClasses.length && <p className="text-xs text-rm-muted">{tr("No shipping classes defined yet. Create them under Commerce → Shipping → Shipping classes.")}</p>}
                  </>)}

                {tab === "files" && (<>
                    {!form.downloadable && <p className="text-sm text-rm-muted">{tr("Enable “Downloadable” on the General tab to attach files.")}</p>}
                    {form.files.map((f: any, i: number) => (<div key={i} className="flex gap-2 items-start border border-rm-border rounded p-2 bg-rm-gray/50">
                        <div className="flex-1 space-y-2 min-w-0">
                          <input className="rm-input" placeholder={tr("File name (shown to customers)")} value={f.name} onChange={(e) => set("files", form.files.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))}/>
                          <div className="flex gap-2">
                            <input className="rm-input font-mono !text-xs" placeholder="/downloads/file.zip" value={f.file} onChange={(e) => set("files", form.files.map((x: any, j: number) => j === i ? { ...x, file: e.target.value } : x))}/>
                            <button className="rm-btn rm-btn-secondary whitespace-nowrap" onClick={() => setPicker({ kind: "file", index: i })}>{tr("Choose")}</button>
                          </div>
                        </div>
                        <button className="rm-btn rm-btn-ghost !text-rm-red" onClick={() => set("files", form.files.filter((_: any, j: number) => j !== i))}>✕</button>
                      </div>))}
                    <button className="rm-btn rm-btn-secondary" disabled={!form.downloadable} onClick={() => set("files", [...form.files, { name: "", file: "" }])}>{tr("Add file")}</button>
                    <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-rm-border">
                      <L label={tr("Download limit")} hint={tr("-1 = unlimited re-downloads")}><input className="rm-input mt-1" type="number" value={form.download_limit} onChange={(e) => set("download_limit", Number(e.target.value))}/></L>
                      <L label={tr("Download expiry (days)")} hint={tr("-1 = never expires")}><input className="rm-input mt-1" type="number" value={form.download_expiry} onChange={(e) => set("download_expiry", Number(e.target.value))}/></L>
                    </div>
                  </>)}

                {tab === "attributes" && (<>
                    {form.attributes.map((a: any, i: number) => (<div key={i} className="border border-rm-border rounded p-3 space-y-2 bg-rm-gray/50">
                        <div className="flex gap-2">
                          <input className="rm-input" placeholder={tr("Attribute name, e.g. Edition")} value={a.name} onChange={(e) => set("attributes", form.attributes.map((x: any, j: number) => j === i ? { ...x, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") } : x))}/>
                          <button className="rm-btn rm-btn-ghost !text-rm-red" onClick={() => set("attributes", form.attributes.filter((_: any, j: number) => j !== i))}>✕</button>
                        </div>
                        <input className="rm-input" placeholder={tr("Values separated by |, e.g. Standard | Extended")} value={(a.options || []).join(" | ")} onChange={(e) => set("attributes", form.attributes.map((x: any, j: number) => j === i ? { ...x, options: e.target.value.split("|").map((s: string) => s.trim()).filter(Boolean) } : x))}/>
                        <Toggle checked={!!a.variation} onChange={(v) => set("attributes", form.attributes.map((x: any, j: number) => j === i ? { ...x, variation: v } : x))} label={tr("Used for variations")}/>
                      </div>))}
                    <button className="rm-btn rm-btn-secondary" onClick={() => set("attributes", [...form.attributes, { name: "", slug: "", options: [], variation: true }])}>{tr("Add attribute")}</button>
                  </>)}

                {tab === "variations" && (<>
                    {variations.map((v, i) => v._delete ? null : (<div key={v.id || `new-${i}`} className="border border-rm-border rounded p-3 space-y-2 bg-rm-gray/50">
                        <div className="flex gap-2 items-center">
                          <input className="rm-input flex-1" placeholder={tr("Variation name")} value={v.name} onChange={(e) => setV(i, "name", e.target.value)}/>
                          <button className="rm-btn rm-btn-ghost !text-rm-red" onClick={() => setVariations((vs) => vs.map((x, j) => j === i ? { ...x, _delete: true } : x))}>{tr("Remove")}</button>
                        </div>
                        {form.attributes.filter((a: any) => a.variation).map((a: any) => (<label key={a.name} className="block text-xs font-semibold">
                            {a.name}
                            <select className="rm-input mt-1" value={(v.attributes || []).find((x: any) => x.name === a.name)?.option || ""} onChange={(e) => setV(i, "attributes", [...(v.attributes || []).filter((x: any) => x.name !== a.name), { name: a.name, option: e.target.value }])}>
                              <option value="">{tr("Any")}{" "}{a.name}</option>
                              {(a.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </label>))}
                        <div className="grid grid-cols-2 gap-2">
                          <input className="rm-input" placeholder={tr("SKU")} value={v.sku} onChange={(e) => setV(i, "sku", e.target.value)}/>
                          <input className="rm-input" type="number" step="0.01" placeholder={tr("Regular price")} value={v.regular_price} onChange={(e) => setV(i, "regular_price", e.target.value)}/>
                          <input className="rm-input" type="number" step="0.01" placeholder={tr("Sale price")} value={v.sale_price} onChange={(e) => setV(i, "sale_price", e.target.value)}/>
                          <input className="rm-input" type="number" placeholder={tr("Stock qty (blank = unmanaged)")} value={v.stock_quantity} onChange={(e) => { setV(i, "stock_quantity", e.target.value); setV(i, "manage_stock", e.target.value !== ""); }}/>
                        </div>
                        <div className="flex gap-5">
                          <Toggle checked={v.downloadable} onChange={(x) => setV(i, "downloadable", x)} label={tr("Downloadable")}/>
                          <Toggle checked={v.virtual} onChange={(x) => setV(i, "virtual", x)} label={tr("Virtual")}/>
                        </div>
                        {v.downloadable && (<div className="space-y-1">
                            {(v.files || []).map((f: any, fi: number) => (<div key={fi} className="flex gap-2">
                                <input className="rm-input" placeholder={tr("File name")} value={f.name} onChange={(e) => setV(i, "files", v.files.map((x: any, j: number) => j === fi ? { ...x, name: e.target.value } : x))}/>
                                <input className="rm-input font-mono !text-xs" placeholder="/downloads/file.zip" value={f.file} onChange={(e) => setV(i, "files", v.files.map((x: any, j: number) => j === fi ? { ...x, file: e.target.value } : x))}/>
                                <button className="rm-btn rm-btn-ghost !text-rm-red" onClick={() => setV(i, "files", v.files.filter((_: any, j: number) => j !== fi))}>✕</button>
                              </div>))}
                            <button className="rm-btn rm-btn-secondary rm-btn-sm" onClick={() => setV(i, "files", [...(v.files || []), { name: "", file: "" }])}>{tr("Add file")}</button>
                          </div>)}
                      </div>))}
                    <button className="rm-btn rm-btn-secondary" onClick={() => setVariations((vs) => [...vs, { name: "", sku: "", regular_price: "", sale_price: "", manage_stock: false, stock_quantity: "", downloadable: form.downloadable, virtual: form.virtual, files: [], attributes: [] }])}>{tr("Add variation")}</button>
                    <p className="text-xs text-rm-muted">{tr("Variations are saved with the product. Define attributes first so each variation can pick its options.")}</p>
                  </>)}

                {tab === "grouped" && (<>
                    <p className="text-sm text-rm-muted">{tr("A grouped product is a collection of related products that can be purchased individually.")}</p>
                    <div className="max-h-64 overflow-y-auto border border-rm-border rounded divide-y divide-rm-gray">
                      {allProducts.filter((p) => p.id !== id && p.type !== "variation" && p.type !== "grouped").map((p) => (<label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-rm-gray/60">
                          <input type="checkbox" checked={form.children.includes(p.id)} onChange={(e) => set("children", e.target.checked ? [...form.children, p.id] : form.children.filter((x: number) => x !== p.id))}/>
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-rm-muted">{p.price == null ? "" : p.price === 0 ? tr("Free") : `$${p.price}`}</span>
                        </label>))}
                    </div>
                  </>)}

                {tab === "sms" && (
                    <ProductSmsTab productId={id || 0}/>
                )}

                {tab === "free" && (<>
                    <p className="text-sm text-rm-muted">
                      {tr("Individual download and delivery preferences for this product.")}{downloadCount > 0 && <span className="font-semibold" style={{ color: "#4c6c57" }}> {downloadCount} {" "}{tr("downloads recorded.")}</span>}
                    </p>
                    {!isFree && <p className="noma-notice bg-yellow-50 text-rm-yellow">{tr("Overrides apply once this product qualifies as a free download (downloadable, published, price 0).")}</p>}
                    <Toggle checked={indy.exclude} onChange={(v) => setI("exclude", v)} label={tr("Exclude this product from free downloads")}/>
                    <Toggle checked={indy.exclude_email_capture} onChange={(v) => setI("exclude_email_capture", v)} label={tr("Skip email capture for this product")}/>
                    <Toggle checked={indy.force_zip} onChange={(v) => setI("force_zip", v)} label={tr("Force ZIP when multiple files are attached")}/>
                    <L label={tr("Download method override")}>
                      <select className="rm-input mt-1" value={indy.download_type} onChange={(e) => setI("download_type", Number(e.target.value))}>
                        <option value={-1}>{tr("Use global setting")}</option>
                        <option value={0}>{tr("Direct download")}</option>
                        <option value={1}>{tr("Email a secure link")}</option>
                        <option value={2}>{tr("Redirect to download page")}</option>
                      </select>
                    </L>
                    <div className="border-t border-rm-border pt-3 space-y-3">
                      <Toggle checked={indy.limit_enable} onChange={(v) => setI("limit_enable", v)} label={tr("Override download limits for this product")}/>
                      {indy.limit_enable && (<>
                          <div className="grid grid-cols-2 gap-3">
                            <L label={tr("Allowed downloads")}><input className="rm-input mt-1" type="number" min="1" value={indy.limit_amount} onChange={(e) => setI("limit_amount", e.target.value)}/></L>
                            <L label={tr("Per period")}>
                              <select className="rm-input mt-1" value={indy.limit_freq} onChange={(e) => setI("limit_freq", e.target.value)}>
                                <option value="day">{tr("Day")}</option><option value="week">{tr("Week")}</option><option value="month">{tr("Month")}</option><option value="year">{tr("Year")}</option><option value="all">{tr("Lifetime")}</option>
                              </select>
                            </L>
                          </div>
                          <L label={tr("Limit reached message")} hint={tr("Blank uses the global message.")}>
                            <input className="rm-input mt-1" value={indy.limit_error} onChange={(e) => setI("limit_error", e.target.value)}/>
                          </L>
                        </>)}
                    </div>
                    <p className="text-xs text-rm-muted">{tr("Global rules live under")}{" "}<Link href="/studio/downloads/settings" className="text-rm-blue hover:underline">{tr("Free Downloads → Settings")}</Link>.</p>
                  </>)}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Publish")}</div>
            <div className="p-4 space-y-3">
              <L label={tr("Status")}>
                <select className="rm-input mt-1" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="publish">{tr("Published")}</option><option value="draft">{tr("Draft")}</option><option value="pending">{tr("Pending review")}</option><option value="private">{tr("Private")}</option>
                </select>
              </L>
              <L label={tr("Catalog visibility")}>
                <select className="rm-input mt-1" value={form.catalog_visibility} onChange={(e) => set("catalog_visibility", e.target.value)}>
                  <option value="visible">{tr("Shop and search")}</option><option value="catalog">{tr("Shop only")}</option><option value="search">{tr("Search only")}</option><option value="hidden">{tr("Hidden")}</option>
                </select>
              </L>
              <Toggle checked={form.featured} onChange={(v) => set("featured", v)} label={tr("Featured product")}/>
              <div className="flex gap-2 pt-2 border-t border-rm-border">
                <button className="rm-btn rm-btn-primary flex-1" style={{ background: "#656080", borderColor: "#656080" }} disabled={saving || !form.name.trim()} onClick={save}>
                  {saving ? tr("Saving…") : isNew ? tr("Publish product") : tr("Update")}
                </button>
                {!isNew && <button className="rm-btn rm-btn-danger" onClick={remove}>{tr("Delete")}</button>}
              </div>
            </div>
          </div>

          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Product image")}</div>
            <div className="p-4">
              {form.images.length ? (<div className="grid grid-cols-3 gap-2 mb-3">
                  {form.images.map((img: any, i: number) => (<div key={i} className="relative group">
                      <img src={img.src} alt={img.alt || ""} className="w-full h-20 object-cover rounded border border-rm-border"/>
                      <button className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-rm-red text-white text-xs leading-none opacity-0 group-hover:opacity-100" onClick={() => set("images", form.images.filter((_: any, j: number) => j !== i))}>✕</button>
                    </div>))}
                </div>) : <p className="text-sm text-rm-muted mb-3">{tr("No images yet.")}</p>}
              <button className="rm-btn rm-btn-secondary w-full" onClick={() => setPicker({ kind: "image" })}>{tr("Add / choose images")}</button>
            </div>
          </div>

          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Product categories")}</div>
            <div className="p-4">
              <div className="max-h-44 overflow-y-auto space-y-1.5 mb-3">
                {cats.map((c) => (<label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={catIds.includes(c.id)} onChange={(e) => setCatIds((s) => e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id))}/>
                    {c.name}
                  </label>))}
                {!cats.length && <p className="text-sm text-rm-muted">{tr("No categories yet.")}</p>}
              </div>
              <div className="flex gap-2">
                <input className="rm-input" placeholder={tr("New category")} value={newCat} onChange={(e) => setNewCat(e.target.value)}/>
                <button className="rm-btn rm-btn-secondary" onClick={() => {
            const name = newCat.trim();
            if (!name)
                return;
            const tempId = -(cats.length + 1);
            setCats((c) => [...c, { id: tempId, name, slug: name.toLowerCase().replace(/\s+/g, "-"), _new: true }]);
            setCatIds((s) => [...s, tempId]);
            setNewCat("");
        }}>{tr("Add")}</button>
              </div>
            </div>
          </div>

          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Product tags")}</div>
            <div className="p-4">
              <input className="rm-input" placeholder={tr("Separate tags with commas")} value={tagText} onChange={(e) => setTagText(e.target.value)}/>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tagText.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (<span key={t} className="rm-badge bg-rm-gray text-rm-text">{t}</span>))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MediaPicker open={!!picker} onClose={() => setPicker(null)} onSelect={onPick}/>
    </div>);
}
