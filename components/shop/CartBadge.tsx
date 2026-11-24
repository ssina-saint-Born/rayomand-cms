"use client";
import { useI18n } from "@/components/LanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
export default function CartBadge({ color }: {
    color: string;
}) {
    const { t: tr } = useI18n();
    const [count, setCount] = useState(0);
    useEffect(() => {
        const load = () => {
            fetch("/api/storefront/cart").then((r) => r.json()).then((c) => setCount(c.count || 0)).catch(() => { });
        };
        load();
        window.addEventListener("wc-cart", load);
        return () => window.removeEventListener("wc-cart", load);
    }, []);
    return (<Link href="/basket" className="relative inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      {tr("Cart")}{count > 0 && (<span className="absolute -top-2 -end-3 min-w-[18px] h-[18px] px-1 rounded-full bg-shop-magenta text-white text-[10px] font-bold flex items-center justify-center">{count}</span>)}
    </Link>);
}
