"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useStore } from "@/components/shop/StoreContext";
import FreeDownloadButton from "@/components/shop/FreeDownloadButton";
const TABS = ["Dashboard", "Orders", "Downloads", "Addresses", "Account details"];
function AddrForm({ kind, title, addr, setField }: {
    kind: "billing" | "shipping";
    title: string;
    addr: any;
    setField: (kind: "billing" | "shipping", k: string, v: string) => void;
}) {
    const { t: tr } = useI18n();
    return (<div className="shop-card p-5">
      <h3 className="font-bold mb-3">{tr(title)}</h3>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", ...(kind === "billing" ? ["email", "phone"] : [])].map((k) => (<label key={k} className={["company", "address_1", "address_2"].includes(k) ? "sm:col-span-2" : ""}>
            <span className="text-shop-muted capitalize">{tr(k.replace(/_/g, " "))}</span>
            <input className="shop-input mt-1" value={addr[kind][k] || ""} onChange={(e) => setField(kind, k, e.target.value)}/>
          </label>))}
      </div>
    </div>);
}
export default function MyAccount() {
    const { t: tr, locale } = useI18n();
    const { money } = useStore();
    const [data, setData] = useState<any>(null);
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [tab, setTab] = useState("Dashboard");
    const [login, setLogin] = useState({ username: "", password: "" });
    const [loginErr, setLoginErr] = useState("");
    const [addr, setAddr] = useState<any>({ billing: {}, shipping: {} });
    const [addrMsg, setAddrMsg] = useState("");
    const [mobile, setMobile] = useState("");
    const [mobileMsg, setMobileMsg] = useState("");
    const [mobileErr, setMobileErr] = useState(false);
    async function load() {
        try {
            const d = await api("/api/storefront/account");
            setData(d);
            setAddr({ billing: { ...d.profile.billing }, shipping: { ...d.profile.shipping } });
            setAuthed(true);
            try {
                const m = await api<{ success: boolean; data: { mobile: string } }>("/api/access/account/mobile");
                setMobile(m.data?.mobile || d.profile?.billing?.phone || "");
            }
            catch { setMobile(d.profile?.billing?.phone || ""); }
        }
        catch {
            setAuthed(false);
        }
    }
    useEffect(() => { load(); }, []);
    async function saveMobile(e: React.FormEvent) {
        e.preventDefault();
        setMobileMsg(""); setMobileErr(false);
        try {
            const res = await api<{ success: boolean; message: string }>("/api/access/account/mobile", {
                method: "POST",
                body: JSON.stringify({ mobile }),
            });
            setMobileErr(!res.success);
            setMobileMsg(res.message);
            if (res.success) await load();
        }
        catch (err: any) {
            setMobileErr(true);
            setMobileMsg(err.message);
        }
    }
    async function doLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoginErr("");
        try {
            await api("/api/auth/login", { method: "POST", body: JSON.stringify(login) });
            await load();
        }
        catch (err: any) {
            setLoginErr(err.message);
        }
    }
    async function saveAddresses(e: React.FormEvent) {
        e.preventDefault();
        try {
            await api("/api/storefront/account", { method: "PUT", body: JSON.stringify(addr) });
            setAddrMsg("Addresses saved.");
            load();
        }
        catch (err: any) {
            setAddrMsg(err.message);
        }
    }
    if (authed === null)
        return <div className="shop-card h-64 animate-pulse bg-shop-border/40"/>;
    if (!authed) {
        return (<div className="max-w-md mx-auto shop-card p-8 space-y-4">
        <h1 className="text-2xl font-extrabold">{tr("My account")}</h1>
        <p className="text-sm text-shop-muted">{tr("Log in to see your orders, free downloads and addresses.")}</p>
        <form onSubmit={doLogin} className="space-y-3">
          <input className="shop-input" placeholder={tr("Username or email")} value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })}/>
          <input className="shop-input" type="password" placeholder={tr("Password")} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })}/>
          {loginErr && <p className="text-sm font-semibold text-shop-red">{tr(loginErr)}</p>}
          <button className="shop-btn shop-btn-primary w-full">{tr("Log in")}</button>
        </form>
        <p className="text-xs text-shop-muted">{tr("Or use the full")}{" "}<Link href="/auth/sign-in" className="text-shop-purple font-semibold underline">{tr("workspace sign-in page")}</Link>.</p>
      </div>);
    }
    const u = data.user;
    const setAddrField = (kind: "billing" | "shipping", k: string, v: string) => setAddr((a: any) => ({ ...a, [kind]: { ...a[kind], [k]: v } }));
    return (<div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold">{tr("My account")}</h1>
        <p className="text-sm text-shop-muted">{tr("Hello")}{" "}<strong className="text-shop-ink">{u.display_name}</strong> · <button className="text-shop-purple font-semibold hover:underline" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); window.location.href = "/collection"; }}>{tr("Log out")}</button></p>
      </div>
      <div className="noma-tab-strip" aria-label={tr("Account sections")}>
        {TABS.map((t) => (<button key={t} onClick={() => setTab(t)} className="noma-tab" aria-pressed={tab === t}>{tr(t)}</button>))}
      </div>

      {tab === "Dashboard" && (<div className="grid sm:grid-cols-3 gap-4">
          <div className="shop-card p-5"><p className="text-shop-muted text-sm">{tr("Orders")}</p><p className="text-3xl font-extrabold text-shop-purple">{data.orders.length}</p><button className="text-sm font-semibold text-shop-purple hover:underline mt-1" onClick={() => setTab("Orders")}>{tr("View orders")}</button></div>
          <div className="shop-card p-5"><p className="text-shop-muted text-sm">{tr("Downloads available")}</p><p className="text-3xl font-extrabold text-shop-green">{data.freeDownloads.length}</p><button className="text-sm font-semibold text-shop-purple hover:underline mt-1" onClick={() => setTab("Downloads")}>{tr("Go to downloads")}</button></div>
          <div className="shop-card p-5"><p className="text-shop-muted text-sm">{tr("Total spent")}</p><p className="text-3xl font-extrabold text-shop-magenta">{money(data.orders.filter((o: any) => ["processing", "completed"].includes(o.status)).reduce((a: number, o: any) => a + o.total, 0))}</p></div>
        </div>)}

      {tab === "Orders" && (<div className="shop-card overflow-x-auto">
          {data.orders.length === 0 ? <p className="p-8 text-shop-muted text-sm">{tr("No orders yet.")}</p> : (<table className="shop-table min-w-[560px]">
              <thead><tr><th>{tr("Order")}</th><th>{tr("Date")}</th><th>{tr("Status")}</th><th>{tr("Total")}</th><th /></tr></thead>
              <tbody>
                {data.orders.map((o: any) => (<tr key={o.id}>
                    <td className="font-bold text-shop-purple">#{o.number}</td>
                    <td>{new Date(o.created_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")}</td>
                    <td><span className="shop-badge bg-shop-purple/10 text-shop-purple capitalize">{tr(o.status)}</span></td>
                    <td className="font-semibold">{money(o.total)} {" "}{tr("for")}{" "}{o.items.reduce((a: number, i: any) => a + i.quantity, 0)} {" "}{tr("item(s)")}</td>
                    <td><Link className="text-sm font-semibold text-shop-purple hover:underline" href={`/purchase/receipt/${o.id}`}>{tr("View")}</Link></td>
                  </tr>))}
              </tbody>
            </table>)}
        </div>)}

      {tab === "Downloads" && (<div className="space-y-6">
          <div className="shop-card p-5">
            <h2 className="font-extrabold text-lg mb-1">{tr("Available downloads")}</h2>
            <p className="text-sm text-shop-muted mb-4">{tr("Free products and eligible purchases, ready for you.")}</p>
            {data.freeDownloads.length === 0 ? <p className="text-sm text-shop-muted">{tr("No free downloads are currently available.")}</p> : (<div className="grid sm:grid-cols-2 gap-4">
                {data.freeDownloads.map(({ product, state }: any) => (<div key={product.id} className="border border-shop-border rounded-lg p-4 flex gap-3">
                    {product.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0].src} alt="" className="w-16 h-16 rounded object-cover"/>)}
                    <div className="flex-1 space-y-2">
                      <Link href={`/collection/items/${product.slug}`} className="font-bold hover:text-shop-purple block">{product.name}</Link>
                      <FreeDownloadButton product={product} state={state} compact/>
                    </div>
                  </div>))}
              </div>)}
          </div>
          {data.historyEnabled && (<div className="shop-card p-5">
              <h2 className="font-extrabold text-lg mb-1">{tr(data.historyTitle)}</h2>
              <p className="text-sm text-shop-muted mb-3">{tr(data.historyMessage)}</p>
              {data.history.length === 0 ? <p className="text-sm text-shop-muted">{tr("You haven't downloaded anything yet.")}</p> : (<table className="shop-table">
                  <thead><tr><th>{tr("Product")}</th><th>{tr("Date")}</th><th>{tr("Method")}</th></tr></thead>
                  <tbody>
                    {data.history.map((h: any) => (<tr key={h.id}>
                        <td><Link href={`/collection/items/${h.product_slug}`} className="font-semibold text-shop-purple hover:underline">{h.product_name}</Link></td>
                        <td>{new Date(h.created_at).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</td>
                        <td className="capitalize">{tr(h.method)}</td>
                      </tr>))}
                  </tbody>
                </table>)}
            </div>)}
        </div>)}

      {tab === "Addresses" && (<form onSubmit={saveAddresses} className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <AddrForm kind="billing" title={tr("Billing address")} addr={addr} setField={setAddrField}/>
            <AddrForm kind="shipping" title={tr("Shipping address")} addr={addr} setField={setAddrField}/>
          </div>
          {addrMsg && <p className="text-sm font-semibold text-shop-green">{tr(addrMsg)}</p>}
          <button className="shop-btn shop-btn-primary">{tr("Save addresses")}</button>
        </form>)}

      {tab === "Account details" && (<div className="shop-card p-5 max-w-lg space-y-3 text-sm">
          <p><span className="text-shop-muted">{tr("Username:")}</span> <strong>{u.username}</strong></p>
          <p><span className="text-shop-muted">{tr("Display name:")}</span> <strong>{u.display_name}</strong></p>
          <p><span className="text-shop-muted">{tr("Email:")}</span> <strong>{u.email}</strong></p>
          <form onSubmit={saveMobile} className="pt-3 border-t border-shop-border space-y-2">
            <label className="block">
              <span className="text-shop-muted">{tr("Mobile number")} <span className="text-shop-red">*</span></span>
              <input className="shop-input mt-1" dir="ltr" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} required/>
            </label>
            <p className="text-xs text-shop-muted">{tr("Changing your mobile also changes your username. Sign in with the new number afterwards.")}</p>
            {mobileMsg && <p className={`text-sm font-semibold ${mobileErr ? "text-shop-red" : "text-shop-green"}`}>{tr(mobileMsg)}</p>}
            <button className="shop-btn shop-btn-primary" type="submit">{tr("Save mobile")}</button>
          </form>
          <p className="text-xs text-shop-muted pt-2">{tr("Profile fields are managed on your workspace")}{" "}<Link href="/studio/profile" className="text-shop-purple underline">{tr("profile screen")}</Link>.</p>
        </div>)}
    </div>);
}
