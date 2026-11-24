"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatMoney, StoreSettings } from "@/components/shop/StoreContext";
export function useShopSettings(): StoreSettings | null {
    const [s, setS] = useState<StoreSettings | null>(null);
    useEffect(() => {
        api<StoreSettings>("/api/storefront/settings").then(setS).catch(() => { });
    }, []);
    return s;
}
export function useMoney() {
    const s = useShopSettings();
    return (n: number) => formatMoney(n, s);
}
export const fmtDate = (iso: string, locale: "en" | "fa" = "en") => iso ? new Date(iso).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
export const fmtDateTime = (iso: string, locale: "en" | "fa" = "en") => iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const ORDER_STATUS_META: Record<string, {
    label: string;
    bg: string;
    fg: string;
}> = {
    pending: { label: "Pending payment", bg: "#edf0e8", fg: "#5e6b5c" },
    processing: { label: "Processing", bg: "#e0ebdd", fg: "#405b49" },
    "on-hold": { label: "On hold", bg: "#f1e9d7", fg: "#75603c" },
    completed: { label: "Completed", bg: "#e2eaf0", fg: "#405968" },
    cancelled: { label: "Cancelled", bg: "#ebeee8", fg: "#65756d" },
    refunded: { label: "Refunded", bg: "#ece8f1", fg: "#5d5774" },
    failed: { label: "Failed", bg: "#f1dfda", fg: "#7e4842" },
};
export function StatusBadge({ status }: {
    status: string;
}) {
    const { t: tr } = useI18n();
    const m = ORDER_STATUS_META[status] || { label: status, bg: "#f0f0f1", fg: "#50575e" };
    return (<span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: m.bg, color: m.fg }}>
      {tr(m.label)}
    </span>);
}
export function Pager({ page, pages, onPage }: {
    page: number;
    pages: number;
    onPage: (p: number) => void;
}) {
    const { t: tr } = useI18n();
    if (pages <= 1)
        return null;
    return (<div className="flex items-center gap-2 text-sm">
      <button className="rm-btn rm-btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{tr("‹ Prev")}</button>
      <span className="text-rm-muted">{tr("Page {0} of {1}", { "0": page, "1": pages })}</span>
      <button className="rm-btn rm-btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{tr("Next ›")}</button>
    </div>);
}
export function L({ label, hint, children }: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    return (<label className="block text-sm">
      <span className="font-semibold text-rm-dark">{tr(label)}</span>
      {children}
      {hint && <span className="block text-xs text-rm-muted mt-1">{tr(hint)}</span>}
    </label>);
}
export function Toggle({ checked, onChange, label }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    const { t: tr } = useI18n();
    return (<label className="noma-switch select-none">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}/>
      <span className="noma-switch-track" aria-hidden="true"/>
      <span>{tr(label)}</span>
    </label>);
}
export function ShopHeader({ title, sub, action }: {
    title: string;
    sub?: string;
    action?: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    return (<div className="noma-page-heading">
      <div>
        <p className="noma-eyebrow">{tr("Rayomand CMS commerce")}</p>
        <h1 className="text-rm-dark">{tr(title)}</h1>
        {sub && <p className="text-sm text-rm-muted mt-2">{tr(sub)}</p>}
      </div>
      {action}
    </div>);
}
export function StatCard({ label, value, tone = "#656080", sub }: {
    label: string;
    value: React.ReactNode;
    tone?: string;
    sub?: string;
}) {
    const { t: tr } = useI18n();
    return (<div className="rm-admin-card noma-stat">
      <span className="noma-stat-tone" style={{ background: tone }} aria-hidden="true"/>
      <p className="text-xs font-medium text-rm-muted pe-8">{tr(label)}</p>
      <p className="text-rm-dark mt-3">{value}</p>
      {sub && <p className="text-xs text-rm-muted mt-2 leading-relaxed">{tr(sub)}</p>}
    </div>);
}
export function ErrorNote({ error }: {
    error: string;
}) {
    const { t: tr } = useI18n();
    if (!error)
        return null;
    return <div className="noma-notice bg-red-50 text-rm-red" role="alert"><span className="noma-notice-dot" aria-hidden="true"/>{tr(error)}</div>;
}
export function OkNote({ msg }: {
    msg: string;
}) {
    const { t: tr } = useI18n();
    if (!msg)
        return null;
    return <div className="noma-notice bg-green-50 text-rm-green" role="status"><span className="noma-notice-dot" aria-hidden="true"/>{tr(msg)}</div>;
}
