"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

interface GroupsPayload {
    enabled: boolean;
    groups: { code: string; text: string }[];
    mode: string;
    title: string;
    logged_in_only: boolean;
    login_text: string;
    logged_in: boolean;
    mobile: string;
}

// Subscription/Widget.php::display_form() — the product-page newsletter box.
// The plugin hooks the form to the thumbnails or the summary depending on the
// "enable_notif_sms" mode ("thumbnail" / "on"), so callers mount it in both
// slots and the component shows itself only in the matching slot.
export default function ProductNewsletter({ productId, slot }: {
    productId: number;
    slot: "thumbnail" | "on";
}) {
    const { t: tr } = useI18n();
    const [data, setData] = useState<GroupsPayload | null>(null);
    const [groups, setGroups] = useState<string[]>([]);
    const [mobile, setMobile] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [ok, setOk] = useState(false);

    useEffect(() => {
        setData(null);
        setGroups([]);
        setMessage("");
        api<GroupsPayload>(`/api/storefront/newsletter/groups?product_id=${productId}`)
            .then((r) => { setData(r); setMobile(r.mobile || ""); })
            .catch(() => { });
    }, [productId]);

    if (!data || !data.enabled || data.mode === "no" || !data.groups.length || data.mode !== slot)
        return null;

    const blocked = data.logged_in_only && !data.logged_in;
    const toggle = (code: string) => setGroups((g) => g.includes(code) ? g.filter((x) => x !== code) : [...g, code]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
            const r = await api<any>("/api/storefront/newsletter/subscribe", {
                method: "POST",
                body: JSON.stringify({ product_id: productId, sms_mobile: mobile, sms_group: groups }),
            });
            setOk(!!r?.success);
            setMessage(r?.message || "");
        }
        catch (err: any) {
            setOk(false);
            setMessage(err.message);
        }
        setBusy(false);
    }

    return (<div className="shop-card p-4 space-y-3">
      <p className="font-bold text-sm">{tr(data.title || "Notify me about this product")}</p>
      {blocked ? (<p className="text-sm text-shop-muted">
          {data.login_text || tr("Only signed-in customers can subscribe.")}{" "}
          <Link href="/account/login" className="text-shop-purple font-semibold hover:underline">{tr("Sign in")}</Link>
        </p>) : (<form onSubmit={submit} className="space-y-2">
          <div className="space-y-1">
            {data.groups.map((g) => (<label key={g.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={groups.includes(g.code)} onChange={() => toggle(g.code)}/> {g.text}
              </label>))}
          </div>
          <input className="shop-input" dir="ltr" placeholder={tr("Mobile number")} value={mobile} onChange={(e) => setMobile(e.target.value)}/>
          <button className="shop-btn shop-btn-primary shop-btn-sm" disabled={busy}>{busy ? tr("Sending…") : tr("Subscribe")}</button>
        </form>)}
      {message && <p className={`text-sm font-semibold ${ok ? "text-shop-green" : "text-shop-red"}`}>{message}</p>}
    </div>);
}
