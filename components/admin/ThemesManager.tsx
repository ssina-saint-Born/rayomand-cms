"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";

interface ThemeListing {
    slug: string;
    name: string;
    description: string;
    version: string;
    source: "builtin" | "declarative" | "coded";
    license: "free" | "premium";
    product?: string;
    active: boolean;
    unlocked: boolean;
    tokens: Record<string, any>;
    layout: Record<string, any>;
}

const TABS = [
    { id: "themes", label: "Themes" },
    { id: "license", label: "Buy & install" },
    { id: "headless", label: "Headless & engine" },
];

export default function ThemesManager() {
    const { t: tr } = useI18n();
    const [tab, setTab] = useState("themes");
    const [themes, setThemes] = useState<ThemeListing[]>([]);
    const [active, setActive] = useState("");
    const [engine, setEngine] = useState("declarative");
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    async function load() {
        setLoading(true);
        try {
            const data = await api<{ themes: ThemeListing[]; active: string; engine: string }>("/api/content/themes");
            setThemes(data.themes);
            setActive(data.active);
            setEngine(data.engine);
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    async function activate(slug: string) {
        try {
            await api("/api/content/themes", { method: "POST", body: JSON.stringify({ activate: slug }) });
            setMsg({ type: "success", text: "Theme activated." });
            await load();
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }

    return (<div>
      <PageHeader title={tr("Themes")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rm-btn ${tab === t.id ? "rm-btn-primary" : "rm-btn-secondary"}`}>
            {tr(t.label)}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : (
        <>
          {tab === "themes" && <ThemesTab themes={themes} activate={activate} reload={load} flash={setMsg} goToLicense={() => setTab("license")}/>}
          {tab === "license" && <InstallTab reload={load} flash={setMsg}/>}
          {tab === "headless" && <HeadlessTab engine={engine} setEngine={setEngine} flash={setMsg}/>}
        </>
      )}
    </div>);
}

function ThemeSwatch({ theme }: { theme: ThemeListing }) {
    const t = theme.tokens || {};
    const radius = Number(t.radius ?? 20);
    return (<div className="h-36 flex flex-col overflow-hidden" style={{ background: t.bg || "#f3f5f1", borderRadius: 0 }}>
      <div className="h-9 flex items-center justify-between px-3 text-sm font-semibold" style={{ background: t.headerBg || "#fff", color: t.headerText || "#273c36" }}>
        <span>{theme.name}</span>
        {theme.license === "premium" && <span style={{ fontSize: 10, opacity: 0.7 }}>PRO</span>}
      </div>
      <div className="flex-1 p-3" style={{ background: t.bg || "#f3f5f1" }}>
        <div style={{ background: t.surface || "#fff", border: `1px solid ${t.border || "#dce3dc"}`, borderRadius: radius, padding: 10 }}>
          <div className="h-2.5 w-3/4 rounded mb-2" style={{ background: t.text || "#273c36", opacity: 0.8 }}/>
          <div className="h-2 w-full rounded mb-1" style={{ background: t.text || "#273c36", opacity: 0.25 }}/>
          <div className="h-2 w-5/6 rounded mb-2" style={{ background: t.text || "#273c36", opacity: 0.25 }}/>
          <div className="h-6 w-20 rounded-full" style={{ background: t.accent || "#45665b" }}/>
        </div>
      </div>
    </div>);
}

function ThemesTab({ themes, activate, reload, flash, goToLicense }: {
    themes: ThemeListing[];
    activate: (slug: string) => Promise<void>;
    reload: () => Promise<void>;
    flash: (m: { type: "success" | "error"; text: string }) => void;
    goToLicense: () => void;
}) {
    const { t: tr } = useI18n();
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    async function installPack(file: File) {
        setBusy(true);
        try {
            const text = await file.text();
            JSON.parse(text); // fail fast on malformed JSON before upload
            await api("/api/content/themes/packs", { method: "POST", body: JSON.stringify({ pack: text }) });
            flash({ type: "success", text: "Theme pack installed." });
            await reload();
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
        setBusy(false);
    }

    async function removePack(slug: string) {
        if (!confirm(`Remove theme pack "${slug}"?`))
            return;
        try {
            await api(`/api/content/themes/packs?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
            flash({ type: "success", text: "Theme pack removed." });
            await reload();
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
    }

    const groups: { title: string; source: ThemeListing["source"] }[] = [
        { title: "Built-in", source: "builtin" },
        { title: "Installed packs", source: "declarative" },
        { title: "Coded", source: "coded" },
    ];

    return (<div className="space-y-8">
      <div className="rm-admin-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-rm-dark text-sm">{tr("Install a declarative theme pack")}</p>
          <p className="text-xs text-rm-muted mt-1">{tr("A pack is a single JSON document — colors, layout and home sections. Nothing executable is installed.")}</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) installPack(f); e.target.value = ""; }}/>
          <button className="rm-btn rm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>{tr("Choose JSON…")}</button>
        </div>
      </div>

      {groups.map((g) => {
        const list = themes.filter((t) => t.source === g.source);
        if (!list.length) return null;
        return (<section key={g.source}>
          <h2 className="text-xs font-semibold tracking-widest uppercase text-rm-muted mb-3">{tr(g.title)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((t) => (<div key={t.slug} className="rm-admin-card overflow-hidden">
                <ThemeSwatch theme={t}/>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    <div className="flex items-center gap-1">
                      {t.active && <span className="rm-badge bg-green-100 text-green-700">{tr("Active")}</span>}
                      {t.license === "premium" && !t.unlocked && <span className="rm-badge bg-amber-100 text-amber-800">{tr("Locked")}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-rm-muted mb-3">{t.description}</p>
                  <p className="text-[11px] text-rm-muted mb-3">v{t.version}{t.product ? ` · ${t.product}` : ""}</p>
                  <div className="flex flex-wrap gap-2">
                    {!t.active && t.unlocked && <button className="rm-btn rm-btn-primary" onClick={() => activate(t.slug)}>{tr("Activate")}</button>}
                    {!t.active && !t.unlocked && <button className="rm-btn rm-btn-secondary" onClick={goToLicense}>{tr("Needs a serial")}</button>}
                    {t.active && <a href="/" target="_blank" rel="noreferrer" className="rm-btn rm-btn-secondary">{tr("Live Preview")}</a>}
                    {t.source === "declarative" && <button className="rm-btn rm-btn-ghost" onClick={() => removePack(t.slug)}>{tr("Remove")}</button>}
                  </div>
                </div>
              </div>))}
          </div>
        </section>);
      })}
    </div>);
}

function InstallTab({ reload, flash }: {
    reload: () => Promise<void>;
    flash: (m: { type: "success" | "error"; text: string }) => void;
}) {
    const { t: tr } = useI18n();
    const [vendorBase, setVendorBase] = useState("");
    const [fingerprint, setFingerprint] = useState("");
    const [installs, setInstalls] = useState<any[]>([]);
    const [serial, setSerial] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<string>("");
    const [pendingT3, setPendingT3] = useState<{ serial: string; message: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    async function loadVendor() {
        try {
            const data = await api<{ vendor_base: string; fingerprint: string; installs: any[] }>("/api/content/themes/vendor");
            setVendorBase(data.vendor_base);
            setFingerprint(data.fingerprint);
            setInstalls(data.installs || []);
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
    }
    useEffect(() => { loadVendor(); }, []);

    async function saveVendor() {
        setBusy(true);
        try {
            const res = await api<any>("/api/content/themes/vendor", { method: "POST", body: JSON.stringify({ vendor_base: vendorBase }) });
            flash({ type: "success", text: res.message || "Saved." });
            await loadVendor();
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
        setBusy(false);
    }

    async function redeem(confirmServerCode = false) {
        if (!serial.trim())
            return;
        setBusy(true);
        setPendingT3(null);
        setProgress(tr("Contacting the vendor…"));
        try {
            const res = await api<any>("/api/content/themes/install", {
                method: "POST",
                body: JSON.stringify({ serial, confirm_server_code: confirmServerCode }),
            });
            if (res?.needs_confirmation) {
                setPendingT3({ serial, message: res.message });
                setProgress("");
            }
            else {
                flash({ type: "success", text: res.message || "Installed." });
                setSerial("");
                setProgress("");
                await reload();
                await loadVendor();
            }
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
            setProgress("");
        }
        setBusy(false);
    }

    async function upload() {
        const file = fileRef.current?.files?.[0];
        if (!file)
            return;
        setBusy(true);
        setProgress(tr("Uploading and verifying…"));
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/content/themes/upload", { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok || data?.ok === false)
                throw new Error(data?.message || data?.error || "Upload failed.");
            if (data?.needs_confirmation) {
                flash({ type: "error", text: data.message });
            }
            else {
                flash({ type: "success", text: data.message || "Installed." });
                await reload();
                await loadVendor();
            }
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
        setProgress("");
        setBusy(false);
    }

    return (<div className="space-y-5 max-w-3xl">
      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-1">{tr("Install a frontend you bought")}</h3>
        <p className="text-xs text-rm-muted mb-3">
          {tr("Paste the serial from your purchase. The CMS downloads the frontend from the vendor, verifies every file, and installs it. Buying a frontend is optional — you can also use the built-in themes or build your own from the integration guide.")}
        </p>
        <label className="block text-xs text-rm-muted mb-1">{tr("Vendor address")}</label>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input className="rm-input flex-1 font-mono text-xs" dir="ltr" placeholder="https://store.example.com" value={vendorBase} onChange={(e) => setVendorBase(e.target.value)}/>
          <button className="rm-btn rm-btn-secondary" onClick={saveVendor} disabled={busy}>{tr("Save address")}</button>
        </div>
        <p className="text-[11px] text-rm-muted mb-3">{tr("This site's identity")}: <code dir="ltr">{fingerprint || "…"}</code></p>

        <label className="block text-xs text-rm-muted mb-1">{tr("Serial")}</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="rm-input flex-1 font-mono text-xs" dir="ltr" placeholder="RM1.…" value={serial} onChange={(e) => setSerial(e.target.value)}/>
          <button className="rm-btn rm-btn-primary" onClick={() => redeem(false)} disabled={busy || !serial.trim()}>{tr("Install")}</button>
        </div>
        {progress && <p className="text-xs text-rm-muted mt-2">{progress}</p>}

        {pendingT3 && (<div className="mt-4 p-3 rounded border" style={{ background: "#fff7ed", borderColor: "#fdba74" }}>
            <p className="text-sm font-semibold mb-1">{tr("This package runs its own server")}</p>
            <p className="text-xs text-rm-muted mb-2">{pendingT3.message}</p>
            <button className="rm-btn rm-btn-primary" onClick={() => redeem(true)} disabled={busy}>{tr("I trust this vendor — install anyway")}</button>
          </div>)}
      </div>

      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-1">{tr("Install from a file")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("Have the package ZIP already? Upload it here — it is verified the same way.")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input ref={fileRef} type="file" accept=".zip" className="rm-input flex-1 text-xs"/>
          <button className="rm-btn rm-btn-secondary" onClick={upload} disabled={busy}>{tr("Upload & install")}</button>
        </div>
      </div>

      <div className="rm-admin-card">
        <div className="noma-card-heading text-rm-dark">{tr("Recent installs")}</div>
        {installs.length === 0 ? <div className="p-5 text-sm text-rm-muted">{tr("No frontends installed from a vendor yet.")}</div> : (
          <table className="rm-table">
            <thead><tr><th>{tr("Theme")}</th><th>{tr("Type")}</th><th>{tr("Status")}</th><th>{tr("Host")}</th><th>{tr("When")}</th></tr></thead>
            <tbody>
              {installs.map((l, i) => (<tr key={i}>
                  <td className="font-mono text-xs">{l.slug || "—"}</td>
                  <td className="text-xs">{l.install_class || "—"}</td>
                  <td className="text-xs">{l.status}</td>
                  <td className="text-xs" dir="ltr">{l.host || "—"}</td>
                  <td className="text-xs">{String(l.installed_at || "").slice(0, 19).replace("T", " ")}</td>
                </tr>))}
            </tbody>
          </table>
        )}
      </div>
    </div>);
}

function HeadlessTab({ engine, setEngine, flash }: {
    engine: string;
    setEngine: (v: string) => void;
    flash: (m: { type: "success" | "error"; text: string }) => void;
}) {
    const { t: tr } = useI18n();
    const [busy, setBusy] = useState(false);
    const options = [
        { id: "declarative", title: "Declarative (JSON)", body: "Themes are pure data. Edit tokens, layout and home sections in JSON; no build step." },
        { id: "coded", title: "Coded (developer)", body: "A React layout registered by slug. Full control for teams that ship custom components." },
        { id: "headless", title: "Headless frontend", body: "Serve content over the public JSON API and render the site in a separate app." },
    ];

    async function choose(id: string) {
        setBusy(true);
        try {
            await api("/api/content/themes/licenses", { method: "PATCH", body: JSON.stringify({ engine: id }) });
            setEngine(id);
            flash({ type: "success", text: "Engine updated." });
        }
        catch (e: any) {
            flash({ type: "error", text: e.message });
        }
        setBusy(false);
    }

    return (<div className="space-y-5 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {options.map((o) => (<button key={o.id} onClick={() => choose(o.id)} disabled={busy}
            className={`rm-admin-card p-5 text-start ${engine === o.id ? "ring-2" : ""}`}
            style={engine === o.id ? { borderColor: "var(--noma-primary)" } : undefined}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-rm-dark">{tr(o.title)}</h3>
              {engine === o.id && <span className="rm-badge bg-green-100 text-green-700">{tr("In use")}</span>}
            </div>
            <p className="text-xs text-rm-muted leading-relaxed">{tr(o.body)}</p>
          </button>))}
      </div>

      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-2">{tr("Public content API")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("A separate frontend reads published content and the active theme's tokens from these endpoints.")}</p>
        <ul className="text-xs font-mono space-y-1 text-rm-dark">
          <li>GET /api/public/posts?page=1&amp;perPage=10&amp;q=…</li>
          <li>GET /api/public/post/&#123;slug&#125;</li>
          <li>GET /api/public/categories</li>
        </ul>
        <p className="text-[11px] text-rm-muted mt-3">{tr("Responses include theme tokens so the client can match the active design.")}</p>
      </div>

      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-2">{tr("Buying a frontend is optional")}</h3>
        <p className="text-xs text-rm-muted mb-2">{tr("This CMS is fully usable without any purchase: pick a built-in theme, or build your own frontend from the public integration guide. A serial is only needed for a frontend you bought from a vendor storefront.")}</p>
        <p className="text-[11px] text-rm-muted">{tr("The CMS is a consumer of frontends — it never sells or hosts them.")}</p>
      </div>
    </div>);
}
