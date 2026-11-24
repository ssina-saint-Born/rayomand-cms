"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useState } from "react";
export const CHART_HUES = ["#817b9b", "#aa8694", "#b6a17a", "#849e83", "#839baa", "#b38379", "#63687b", "#a6a395"];
export function TrendChart({ points, height = 220, money, }: {
    points: {
        date: string;
        sales: number;
        orders: number;
        downloads: number;
    }[];
    height?: number;
    money?: (n: number) => string;
}) {
    const { t: tr } = useI18n();
    const [hover, setHover] = useState<number | null>(null);
    const W = 760, H = height, padL = 46, padR = 14, padT = 14, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxSales = Math.max(1, ...points.map((p) => p.sales));
    const maxCount = Math.max(1, ...points.map((p) => Math.max(p.orders, p.downloads)));
    const x = (i: number) => padL + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const yS = (v: number) => padT + ih - (v / maxSales) * ih;
    const yC = (v: number) => padT + ih - (v / maxCount) * ih;
    const line = (get: (p: any) => number, y: (v: number) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");
    const area = `${line((p) => p.sales, yS)} L${x(points.length - 1).toFixed(1)},${padT + ih} L${x(0).toFixed(1)},${padT + ih} Z`;
    const fmt = money || ((n: number) => String(n));
    const labelEvery = Math.max(1, Math.ceil(points.length / 8));
    const hp = hover != null ? points[hover] : null;
    return (<div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={tr("Sales and activity trend")} onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - padL) / iw) * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}>
        <defs>
          <linearGradient id="wooSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#817b9b" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#817b9b" stopOpacity="0.03"/>
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (<g key={t}>
            <line x1={padL} x2={W - padR} y1={padT + ih * t} y2={padT + ih * t} stroke="#e4dcee" strokeWidth="1"/>
            <text x={padL - 6} y={padT + ih * t + 4} textAnchor="end" fontSize="10" fill="#6f6480">{fmt(maxSales * (1 - t))}</text>
          </g>))}
        <path d={area} fill="url(#wooSalesFill)"/>
        <path d={line((p) => p.sales, yS)} fill="none" stroke="#817b9b" strokeWidth="2.5" strokeLinejoin="round"/>
        <path d={line((p) => p.downloads, yC)} fill="none" stroke="#849e83" strokeWidth="2" strokeDasharray="1 0" strokeLinejoin="round"/>
        <path d={line((p) => p.orders, yC)} fill="none" stroke="#aa8694" strokeWidth="2" strokeLinejoin="round"/>
        {points.map((p, i) => i % labelEvery === 0 ? (<text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6f6480">{p.date.slice(5)}</text>) : null)}
        {hover != null && hp && (<g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#63687b" strokeWidth="1" strokeDasharray="3 3"/>
            <circle cx={x(hover)} cy={yS(hp.sales)} r="4" fill="#817b9b" stroke="#fff" strokeWidth="1.5"/>
            <circle cx={x(hover)} cy={yC(hp.downloads)} r="4" fill="#849e83" stroke="#fff" strokeWidth="1.5"/>
            <circle cx={x(hover)} cy={yC(hp.orders)} r="4" fill="#aa8694" stroke="#fff" strokeWidth="1.5"/>
          </g>)}
      </svg>
      <div className="flex flex-wrap items-center gap-4 text-xs mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#817b9b" }}/> {" "}{tr("Net sales")}{hp ? `: ${fmt(hp.sales)}` : ""}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#aa8694" }}/> {" "}{tr("Orders")}{hp ? `: ${hp.orders}` : ""}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#849e83" }}/> {" "}{tr("Downloads")}{hp ? `: ${hp.downloads}` : ""}</span>
        {hp && <span className="ms-auto font-semibold text-rm-dark">{hp.date}</span>}
      </div>
    </div>);
}
export function HBars({ items, money, }: {
    items: {
        label: string;
        value: number;
        extra?: string;
    }[];
    money?: (n: number) => string;
}) {
    const { t: tr } = useI18n();
    const max = Math.max(1, ...items.map((i) => i.value));
    const fmt = money || ((n: number) => String(n));
    if (!items.length)
        return <p className="text-sm text-rm-muted py-6 text-center">{tr("No data yet.")}</p>;
    return (<div className="space-y-2.5">
      {items.map((it, i) => (<div key={it.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-semibold text-rm-dark truncate pe-2">{it.label}{it.extra ? <span className="text-rm-muted font-normal"> · {it.extra}</span> : null}</span>
            <span className="text-rm-muted whitespace-nowrap">{fmt(it.value)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#f1ebf8] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(it.value / max) * 100}%`, background: CHART_HUES[i % CHART_HUES.length] }}/>
          </div>
        </div>))}
    </div>);
}
export function Donut({ items, centerLabel }: {
    items: {
        label: string;
        value: number;
    }[];
    centerLabel?: string;
}) {
    const { t: tr } = useI18n();
    const total = items.reduce((a, i) => a + i.value, 0);
    const R = 54, C = 2 * Math.PI * R;
    let acc = 0;
    return (<div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label={tr("Distribution chart")}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1ebf8" strokeWidth="18"/>
        {total > 0 && items.map((it, i) => {
            const frac = it.value / total;
            const dash = `${frac * C} ${C}`;
            const off = -acc * C;
            acc += frac;
            return (<circle key={it.label} cx="70" cy="70" r={R} fill="none" stroke={CHART_HUES[i % CHART_HUES.length]} strokeWidth="18" strokeDasharray={dash} strokeDashoffset={off} transform="rotate(-90 70 70)">
              <title>{`${tr(it.label)}: ${it.value}`}</title>
            </circle>);
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill="#2b2135">{total}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="9" fill="#6f6480">{tr(centerLabel || "total")}</text>
      </svg>
      <ul className="space-y-1.5 text-sm min-w-0">
        {items.map((it, i) => (<li key={it.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CHART_HUES[i % CHART_HUES.length] }}/>
            <span className="text-rm-dark truncate">{tr(it.label)}</span>
            <span className="ms-auto font-bold text-rm-dark ps-3">{it.value}</span>
            <span className="text-xs text-rm-muted w-10 text-end">{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </li>))}
      </ul>
    </div>);
}
