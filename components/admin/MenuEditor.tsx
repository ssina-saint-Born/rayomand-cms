"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Menu, MenuItem, Post, Term } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";
interface DraftItem {
    label: string;
    url: string;
    type: string;
    object_id?: number | null;
}
export default function MenuEditor() {
    const { t: tr } = useI18n();
    const [menus, setMenus] = useState<Menu[]>([]);
    const [pages, setPages] = useState<Post[]>([]);
    const [categories, setCategories] = useState<Term[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [name, setName] = useState("");
    const [location, setLocation] = useState("primary");
    const [items, setItems] = useState<DraftItem[]>([]);
    const [custom, setCustom] = useState({ label: "", url: "" });
    const [msg, setMsg] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [newMenuName, setNewMenuName] = useState("");
    async function load() {
        setLoading(true);
        try {
            const [m, p, c] = await Promise.all([
                api<Menu[]>("/api/content/menus"),
                api<{
                    items: Post[];
                }>("/api/content/pages?status=publish&per_page=100"),
                api<Term[]>("/api/content/categories"),
            ]);
            setMenus(m);
            setPages(p.items);
            setCategories(c);
            if (m.length && activeId === null)
                selectMenu(m[0]);
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);
    function selectMenu(m: Menu) {
        setActiveId(m.id);
        setName(m.name);
        setLocation(m.location || "primary");
        setItems((m.items || []).map((it) => ({ label: it.label, url: it.url, type: it.type, object_id: it.object_id })));
    }
    async function createMenu() {
        if (!newMenuName.trim())
            return;
        try {
            const m = await api<Menu>("/api/content/menus", { method: "POST", body: JSON.stringify({ name: newMenuName, location: "" }) });
            setNewMenuName("");
            await load();
            selectMenu(m);
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }
    async function save() {
        if (!activeId)
            return;
        try {
            await api(`/api/content/menus/${activeId}`, { method: "PUT", body: JSON.stringify({ name, location, items }) });
            setMsg({ type: "success", text: "Menu saved." });
            await load();
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }
    async function deleteMenu() {
        if (!activeId || !confirm(tr("Delete this menu?")))
            return;
        try {
            await api(`/api/content/menus/${activeId}`, { method: "DELETE" });
            setActiveId(null);
            setItems([]);
            setName("");
            await load();
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= items.length)
            return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        setItems(next);
    };
    if (loading)
        return <Spinner />;
    return (<div>
      <PageHeader title={tr("Menus")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="w-full xl:w-72 shrink-0 space-y-4">
          <div className="rm-admin-card p-4">
            <h3 className="font-semibold text-sm mb-2">{tr("Select a menu")}</h3>
            <select className="rm-input" value={activeId ?? ""} onChange={(e) => {
            const m = menus.find((x) => x.id === Number(e.target.value));
            if (m)
                selectMenu(m);
        }}>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="flex gap-1 mt-2">
              <input className="rm-input min-w-0" placeholder={tr("New menu name")} value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)}/>
              <button className="rm-btn rm-btn-ghost" onClick={createMenu}>{tr("Create")}</button>
            </div>
          </div>

          <div className="rm-admin-card p-4">
            <h3 className="font-semibold text-sm mb-2">{tr("Add custom link")}</h3>
            <input className="rm-input mb-2" placeholder={tr("Label")} value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })}/>
            <input className="rm-input mb-2" placeholder={tr("https:// or /path")} dir="ltr" value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })}/>
            <button className="rm-btn rm-btn-secondary" onClick={() => {
            if (custom.label && custom.url) {
                setItems([...items, { ...custom, type: "custom" }]);
                setCustom({ label: "", url: "" });
            }
        }}>{tr("Add to Menu")}</button>
          </div>

          <div className="rm-admin-card p-4">
            <h3 className="font-semibold text-sm mb-2">{tr("Pages")}</h3>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {pages.map((p) => (<button key={p.id} className="block text-sm text-rm-blue hover:underline" onClick={() => setItems([...items, { label: p.title, url: `/read/${p.slug}`, type: "page", object_id: p.id }])}>{p.title}</button>))}
            </div>
          </div>

          <div className="rm-admin-card p-4">
            <h3 className="font-semibold text-sm mb-2">{tr("Categories")}</h3>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {categories.map((c) => (<button key={c.id} className="block text-sm text-rm-blue hover:underline" onClick={() => setItems([...items, { label: c.name, url: `/topics/${c.slug}`, type: "category", object_id: c.id }])}>{c.name}</button>))}
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 rm-admin-card p-4">
          {!activeId ? (<p className="text-sm text-rm-muted">{tr("Create or select a menu to edit it.")}</p>) : (<>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <label className="min-w-0 flex-1 text-xs text-rm-muted">{tr("Menu name")}<input className="rm-input mt-1" value={name} onChange={(e) => setName(e.target.value)}/></label>
                <label className="w-full sm:w-48 text-xs text-rm-muted">{tr("Display location")}<select className="rm-input mt-1" value={location} onChange={(e) => setLocation(e.target.value)}>
                    <option value="primary">{tr("Primary")}</option>
                    <option value="footer">{tr("Footer")}</option>
                    <option value="">{tr("None")}</option>
                  </select>
                </label>
              </div>
              <h3 className="font-semibold text-sm mb-2">{tr("Menu structure")}</h3>
              {items.length === 0 ? <p className="text-sm text-rm-muted mb-3">{tr("Add items from the left panel.")}</p> : (<div className="space-y-2 mb-4">
                  {items.map((it, i) => (<div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border border-rm-border rounded px-3 py-2 bg-rm-gray">
                      <span className="col-span-4 xl:col-span-1 text-xs text-rm-muted uppercase">{tr(it.type)}</span>
                      <input aria-label={tr("Navigation label")} className="rm-input min-w-0 col-span-4 xl:col-span-1" value={it.label} onChange={(e) => { const n = [...items]; n[i] = { ...it, label: e.target.value }; setItems(n); }}/>
                      <input aria-label={tr("Navigation URL")} className="rm-input min-w-0" value={it.url} onChange={(e) => { const n = [...items]; n[i] = { ...it, url: e.target.value }; setItems(n); }}/>
                      <button title={tr("Move up")} onClick={() => move(i, -1)} disabled={i === 0} className="px-1 hover:text-rm-blue">↑</button>
                      <button title={tr("Move down")} onClick={() => move(i, 1)} disabled={i === items.length - 1} className="px-1 hover:text-rm-blue">↓</button>
                      <button title={tr("Remove")} onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-1 hover:text-rm-red">×</button>
                    </div>))}
                </div>)}
              <div className="flex gap-2">
                <button className="rm-btn rm-btn-primary" onClick={save}>{tr("Save Menu")}</button>
                <button className="rm-btn rm-btn-danger" onClick={deleteMenu}>{tr("Delete Menu")}</button>
              </div>
            </>)}
        </div>
      </div>
    </div>);
}
