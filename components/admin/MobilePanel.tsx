"use client";
import { useI18n } from "@/components/LanguageProvider";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";

interface TokenRow {
    id: number; user_id: number; name: string; kind: string; scopes: string;
    expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string;
}
interface DeviceRow {
    id: number; user_id: number; device_id: string; platform: string; label: string;
    app_version: string; last_seen_at: string; created_at: string;
}

// Mobile access screen: shows the API endpoints the app uses, issues/revokes
// bearer tokens, and lists registered devices. This is how an operator hands a
// scripted client a token, or cuts off a lost phone.
export default function MobilePanel() {
    const { t: tr } = useI18n();
    const [tokens, setTokens] = useState<TokenRow[]>([]);
    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [name, setName] = useState("");
    const [ttl, setTtl] = useState(90);
    const [issued, setIssued] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const data = await api<{ tokens: TokenRow[]; devices: DeviceRow[] }>("/api/admin/api-tokens");
            setTokens(data.tokens);
            setDevices(data.devices);
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    async function issue() {
        try {
            const res = await api<{ token: string; note: string }>("/api/admin/api-tokens", {
                method: "POST",
                body: JSON.stringify({ name: name || "API token", kind: "script", ttl_days: ttl, scopes: ["content", "notifications"] }),
            });
            setIssued(res.token);
            setName("");
            await load();
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }

    async function revoke(id: number) {
        if (!confirm("Revoke this token? Any client using it will be signed out immediately."))
            return;
        try {
            await api(`/api/admin/api-tokens?id=${id}`, { method: "DELETE" });
            await load();
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
    }

    return (<div>
      <PageHeader title={tr("Mobile app & API")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}

      <div className="rm-admin-card p-5 mb-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-2">{tr("How the mobile app connects")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("The app signs in once and receives a bearer token. Every request then sends it in the Authorization header. No cookies are used.")}</p>
        <ul className="text-xs font-mono space-y-1 text-rm-dark" dir="ltr">
          <li>POST /api/mobile/auth  →  {`{ token }`}</li>
          <li>GET  /api/mobile/bootstrap</li>
          <li>GET  /api/mobile/notifications?since=&lt;id&gt;</li>
          <li>GET  /api/mobile/content?status=draft</li>
          <li>GET  /api/mobile/moderation?status=pending</li>
        </ul>
      </div>

      <div className="rm-admin-card p-5 mb-5">
        <h3 className="font-semibold text-rm-dark text-sm mb-2">{tr("Issue a token")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("For a script or a client that cannot use the app's own sign-in. The token is shown once.")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="rm-input flex-1 text-sm" placeholder={tr("Label (for example: build script)")} value={name} onChange={(e) => setName(e.target.value)}/>
          <input className="rm-input w-28 text-sm" type="number" min={1} max={3650} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}/>
          <button className="rm-btn rm-btn-primary" onClick={issue}>{tr("Create token")}</button>
        </div>
        {issued && (<div className="mt-3 p-3 rounded" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p className="text-xs text-rm-muted mb-1">{tr("Copy this now — it will not be shown again.")}</p>
            <code className="block text-xs break-all" dir="ltr">{issued}</code>
          </div>)}
      </div>

      {loading ? <Spinner/> : (<>
        <div className="rm-admin-card mb-5">
          <div className="noma-card-heading text-rm-dark">{tr("API tokens")}</div>
          {tokens.length === 0 ? <div className="p-5 text-sm text-rm-muted">{tr("No tokens issued.")}</div> : (
            <table className="rm-table">
              <thead><tr><th>{tr("Name")}</th><th>{tr("Kind")}</th><th>{tr("Expires")}</th><th>{tr("Last used")}</th><th/></tr></thead>
              <tbody>
                {tokens.map((t) => (<tr key={t.id}>
                    <td className="text-sm">{t.name}{t.revoked_at && <span className="rm-badge bg-red-100 text-red-700 ms-2">{tr("revoked")}</span>}</td>
                    <td className="text-xs">{t.kind}</td>
                    <td className="text-xs">{t.expires_at ? t.expires_at.slice(0, 10) : tr("never")}</td>
                    <td className="text-xs">{t.last_used_at ? t.last_used_at.slice(0, 16).replace("T", " ") : "—"}</td>
                    <td>{!t.revoked_at && <button className="rm-btn rm-btn-ghost" onClick={() => revoke(t.id)}>{tr("Revoke")}</button>}</td>
                  </tr>))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rm-admin-card">
          <div className="noma-card-heading text-rm-dark">{tr("Registered devices")}</div>
          {devices.length === 0 ? <div className="p-5 text-sm text-rm-muted">{tr("No devices have signed in yet.")}</div> : (
            <table className="rm-table">
              <thead><tr><th>{tr("Device")}</th><th>{tr("Platform")}</th><th>{tr("App version")}</th><th>{tr("Last seen")}</th></tr></thead>
              <tbody>
                {devices.map((d) => (<tr key={d.id}>
                    <td className="font-mono text-xs">{d.label || d.device_id.slice(0, 16)}</td>
                    <td className="text-xs">{d.platform}</td>
                    <td className="text-xs">{d.app_version || "—"}</td>
                    <td className="text-xs">{d.last_seen_at.slice(0, 16).replace("T", " ")}</td>
                  </tr>))}
              </tbody>
            </table>
          )}
        </div>
      </>)}
    </div>);
}
