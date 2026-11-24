"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";
import { ROLES } from "@/lib/types";

const TABS = [
    { id: "general", label: "General" },
    { id: "sms", label: "SMS" },
    { id: "gateways", label: "Gateways" },
    { id: "messengers", label: "Messengers" },
    { id: "zohal", label: "Voice call" },
    { id: "advanced", label: "Advanced" },
    { id: "design", label: "Design" },
];

const GATEWAY_META: Record<string, { label: string; fields: { key: string; label: string; desc?: string; placeholder?: string }[] }> = {
    logger: { label: "Logger (test)", fields: [] },
    kavenegar: {
        label: "KaveNegar",
        fields: [
            { key: "api_key", label: "API Key" },
            { key: "sender", label: "Sender number" },
        ],
    },
    maxsms: {
        label: "MaxSMS (ippanel)",
        fields: [
            { key: "api_key", label: "Access key" },
            { key: "sender", label: "Sender number" },
        ],
    },
    melipayamak: {
        label: "MeliPayamak",
        fields: [
            { key: "username", label: "Username" },
            { key: "password", label: "API Key" },
            { key: "sender", label: "Sender number" },
        ],
    },
    iranpayamak: {
        label: "IranPayamak (Faraz)",
        fields: [
            { key: "api_key", label: "Access key" },
            { key: "sender", label: "Sender number" },
        ],
    },
    panelchi: {
        label: "PanelChi",
        fields: [
            { key: "api_key", label: "API key" },
            { key: "source_number", label: "Source number", placeholder: "10001" },
        ],
    },
    pwsms: { label: "Persian Commerce SMS", fields: [] },
};

export default function AccessSettings() {
    const { t: tr } = useI18n();
    const [tab, setTab] = useState("general");
    const [sections, setSections] = useState<Record<string, any>>({});
    const [gateways, setGateways] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [testMobile, setTestMobile] = useState("");
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const data = await api<{ success: boolean; data: { sections: any; gateways: any } }>("/api/access/settings");
                setSections(data.data.sections || {});
                setGateways(data.data.gateways || {});
            }
            catch (e: any) {
                setMsg({ type: "error", text: e.message });
            }
            setLoading(false);
        })();
    }, []);

    const setS = (section: string, key: string, value: any) =>
        setSections((prev) => ({ ...prev, [section]: { ...(prev[section] || {}), [key]: value } }));
    const setG = (gateway: string, key: string, value: any) =>
        setGateways((prev) => ({ ...prev, [gateway]: { ...(prev[gateway] || {}), [key]: value } }));

    async function save() {
        setBusy(true); setMsg(null);
        try {
            const data = await api<{ success: boolean; message: string }>("/api/access/settings", {
                method: "POST",
                body: JSON.stringify({ sections, gateways }),
            });
            setMsg({ type: data.success ? "success" : "error", text: data.message });
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setBusy(false);
    }

    async function testSms() {
        setTesting(true); setMsg(null);
        try {
            const data = await api<{ success: boolean; message: string }>("/api/access/settings", {
                method: "PUT",
                body: JSON.stringify({ action: "test_sms", identifier: testMobile }),
            });
            setMsg({ type: data.success ? "success" : "error", text: data.message });
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setTesting(false);
    }

    if (loading)
        return <Spinner />;

    const g = (section: string, key: string, fallback: any = "") => sections[section]?.[key] ?? fallback;
    const gw = (gateway: string, key: string, fallback: any = "") => gateways[gateway]?.[key] ?? fallback;
    const Field = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
        <div className="py-3 border-b border-rm-border/60 last:border-0">
            <label className="block text-sm font-medium text-rm-text mb-2">{tr(label)}</label>
            {children}
            {desc && <p className="text-xs text-rm-muted mt-1.5">{tr(desc)}</p>}
        </div>
    );

    return (<div>
      <PageHeader title={tr("Sentinel authentication")} action={<button className="rm-btn rm-btn-primary" onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save changes")}</button>}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`rm-btn ${tab === t.id ? "rm-btn-primary" : "rm-btn-secondary"}`}>{tr(t.label)}</button>)}
      </div>

      {tab === "general" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Rayomand Core")}</h3>
          <Field label="Allow registration" desc="Anyone can create an account.">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!g("general", "core_users_can_register", true)} onChange={(e) => setS("general", "core_users_can_register", e.target.checked)}/>{tr("Registration is open")}</label>
          </Field>
          <Field label="Default role for new users">
            <select className="rm-input" value={g("general", "core_default_role", "subscriber")} onChange={(e) => setS("general", "core_default_role", e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
            </select>
          </Field>
        </div>
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Commerce")}</h3>
          <Field label="Login / registration at checkout" desc="Should login or registration be required during checkout?">
            <select className="rm-input" value={g("general", "commerce_checkout_registration_required", "no")} onChange={(e) => setS("general", "commerce_checkout_registration_required", e.target.value)}>
              <option value="no">{tr("Disabled, allow guest checkout")}</option>
              <option value="yes_redirect">{tr("Enabled, sign in before viewing checkout")}</option>
              <option value="yes_automatic">{tr("Enabled, create the account automatically")}</option>
            </select>
          </Field>
        </div>
      </div>}

      {tab === "sms" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("SMS gateway")}</h3>
          <Field label="Service" desc="Choose the SMS provider used for verification codes.">
            <select className="rm-input" value={g("sms", "gateway", "none")} onChange={(e) => setS("sms", "gateway", e.target.value)}>
              <option value="none">{tr("None")}</option>
              {Object.entries(GATEWAY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Verification code message" desc="Use {{otp}} for the code. Pattern: pattern:Code then Param:{{otp}}.">
            <textarea className="rm-input font-mono text-xs" rows={4} dir="ltr" value={g("sms", "message_code", "")} onChange={(e) => setS("sms", "message_code", e.target.value)}/>
          </Field>
        </div>
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Test SMS")}</h3>
          <Field label="Mobile number" desc="Send a test verification code to this number.">
            <input className="rm-input" dir="ltr" inputMode="tel" placeholder="0912…" value={testMobile} onChange={(e) => setTestMobile(e.target.value)}/>
          </Field>
          <button className="rm-btn rm-btn-primary mt-3" onClick={testSms} disabled={testing || !testMobile}>{testing ? tr("Sending…") : tr("Send test SMS")}</button>
        </div>
      </div>}

      {tab === "gateways" && <div className="grid md:grid-cols-2 gap-5">
        {Object.entries(GATEWAY_META).filter(([, m]) => m.fields.length).map(([key, meta]) => (
          <div key={key} className="rm-admin-card p-5">
            <h3 className="font-semibold text-sm mb-2">{meta.label}</h3>
            {meta.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <input className="rm-input" dir="ltr" placeholder={f.placeholder} value={gw(key, f.key, f.key === "source_number" ? "10001" : "")} onChange={(e) => setG(key, f.key, e.target.value)}/>
              </Field>
            ))}
          </div>
        ))}
      </div>}

      {tab === "messengers" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Bale messenger")}</h3>
          <Field label="API token" desc="From Send message » Web service » One-time password.">
            <input className="rm-input" dir="ltr" value={g("messengers", "bale_api_token", "")} onChange={(e) => setS("messengers", "bale_api_token", e.target.value)}/>
          </Field>
          <Field label="Bot id">
            <input className="rm-input" dir="ltr" value={g("messengers", "bale_bot_id", "")} onChange={(e) => setS("messengers", "bale_bot_id", e.target.value)}/>
          </Field>
        </div>
      </div>}

      {tab === "zohal" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Zohal voice call")}</h3>
          <p className="text-xs text-rm-muted mb-3">{tr("Enable one-time codes over a voice call.")}</p>
          <Field label="Token">
            <input className="rm-input" dir="ltr" value={g("zohal", "api_key", "")} onChange={(e) => setS("zohal", "api_key", e.target.value)}/>
          </Field>
        </div>
      </div>}

      {tab === "advanced" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Verification")}</h3>
          <Field label="Code length">
            <select className="rm-input" value={Number(g("advanced", "code_length", 4))} onChange={(e) => setS("advanced", "code_length", Number(e.target.value))}>
              <option value={4}>{tr("4 digits — default")}</option>
              <option value={5}>{tr("5 digits")}</option>
              <option value={6}>{tr("6 digits")}</option>
            </select>
          </Field>
          <Field label="Default login method">
            <select className="rm-input" value={g("advanced", "default_login_method", "otp")} onChange={(e) => setS("advanced", "default_login_method", e.target.value)}>
              <option value="otp">{tr("One-time code (OTP)")}</option>
              <option value="password">{tr("Password")}</option>
            </select>
          </Field>
        </div>
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Mobile meta keys")}</h3>
          <Field label="User mobile meta keys" desc="Meta keys that may contain a mobile, one per line.">
            <textarea className="rm-input font-mono text-xs" rows={4} dir="ltr" value={g("advanced", "mobile_possible_meta_keys", "")} onChange={(e) => setS("advanced", "mobile_possible_meta_keys", e.target.value)}/>
          </Field>
        </div>
      </div>}

      {tab === "design" && <div className="grid md:grid-cols-2 gap-5">
        <div className="rm-admin-card p-5">
          <h3 className="font-semibold text-sm mb-2">{tr("Logo")}</h3>
          <Field label="Logo URL" desc="Shown in the verification email.">
            <input className="rm-input" dir="ltr" value={g("design", "logo", "")} onChange={(e) => setS("design", "logo", e.target.value)}/>
          </Field>
        </div>
      </div>}
    </div>);
}
