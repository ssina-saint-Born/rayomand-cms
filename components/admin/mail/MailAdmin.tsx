"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "../ui";

type Msg = { type: "success" | "error"; text: string } | null;

interface Settings {
    public_hostname: string;
    mail_hostname: string;
    default_quota_mb: number;
    max_message_mb: number;
    spam_action: string;
    dns_provider: string;
    dns_zone_id: string;
    dns_auto: boolean;
    tls_expires_at: string;
    dns_token_set: boolean;
    tls_key_set: boolean;
}

interface Domain {
    id: number;
    name: string;
    dkim_selector: string;
    dkim_public_key: string;
    dns_synced_at: string | null;
    catch_all: string;
    enabled: boolean;
}

interface Account {
    id: number;
    domain_id: number;
    address: string;
    display_name: string;
    quota_mb: number;
    enabled: boolean;
}

interface DnsRecord {
    id: number;
    record_type: string;
    name: string;
    content: string;
    priority: number | null;
    status: string;
    last_error: string;
}

const TABS = [
    { id: "connection", label: "Connection" },
    { id: "domains", label: "Domains" },
    { id: "mailboxes", label: "Mailboxes" },
    { id: "dns", label: "DNS" },
    { id: "status", label: "Status" },
];

export default function MailAdmin() {
    const { t: tr } = useI18n();
    const [tab, setTab] = useState("connection");
    const [settings, setSettings] = useState<Settings | null>(null);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<Msg>(null);

    const loadSettings = useCallback(async () => {
        const data = await api<{ data: { settings: Settings } }>("/api/mail/settings");
        setSettings(data.data.settings);
    }, []);
    const loadDomains = useCallback(async () => {
        const data = await api<{ data: { domains: Domain[] } }>("/api/mail/domains");
        setDomains(data.data.domains || []);
    }, []);
    const loadAccounts = useCallback(async () => {
        const data = await api<{ data: { accounts: Account[] } }>("/api/mail/accounts");
        setAccounts(data.data.accounts || []);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                await Promise.all([loadSettings(), loadDomains(), loadAccounts()]);
            }
            catch (e: any) {
                setMsg({ type: "error", text: e.message });
            }
            setLoading(false);
        })();
    }, [loadSettings, loadDomains, loadAccounts]);

    const flash = (type: "success" | "error", text: string) => {
        setMsg({ type, text });
        window.setTimeout(() => setMsg(null), 6000);
    };

    if (loading)
        return <Spinner />;

    return (<div>
      <PageHeader title={tr("Mail server")} action={<span className="rm-badge">{tr("Control plane")}</span>}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`rm-btn ${tab === t.id ? "rm-btn-primary" : "rm-btn-secondary"}`}>{tr(t.label)}</button>)}
      </div>

      {tab === "connection" && settings && <ConnectionTab settings={settings} setSettings={setSettings} busy={busy} setBusy={setBusy} flash={flash}/>}
      {tab === "domains" && <DomainsTab domains={domains} reload={loadDomains} flash={flash} busy={busy} setBusy={setBusy}/>}
      {tab === "mailboxes" && <MailboxesTab domains={domains} accounts={accounts} reload={loadAccounts} flash={flash} busy={busy} setBusy={setBusy}/>}
      {tab === "dns" && <DnsTab domains={domains} reload={loadDomains} flash={flash}/>}
      {tab === "status" && <StatusTab/>}
    </div>);
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
    const { t: tr } = useI18n();
    return (<div className="py-3 border-b border-rm-border/60 last:border-0">
      <label className="block text-sm font-medium text-rm-text mb-2">{tr(label)}</label>
      {children}
      {desc && <p className="text-xs text-rm-muted mt-1.5">{tr(desc)}</p>}
    </div>);
}

function ConnectionTab({ settings, setSettings, busy, setBusy, flash }: {
    settings: Settings;
    setSettings: (s: Settings) => void;
    busy: boolean;
    setBusy: (b: boolean) => void;
    flash: (t: "success" | "error", m: string) => void;
}) {
    const { t: tr } = useI18n();
    const [dnsToken, setDnsToken] = useState("");
    const [testing, setTesting] = useState(false);
    const [issuing, setIssuing] = useState(false);

    const set = (k: keyof Settings, v: any) => setSettings({ ...settings, [k]: v });

    async function save() {
        setBusy(true);
        try {
            const body: any = { ...settings };
            if (dnsToken) body.dns_token = dnsToken;
            const data = await api<{ data: { settings: Settings }; message: string }>("/api/mail/settings", { method: "POST", body: JSON.stringify(body) });
            setSettings(data.data.settings);
            setDnsToken("");
            flash("success", data.message || "Saved.");
        }
        catch (e: any) { flash("error", e.message); }
        setBusy(false);
    }

    async function test() {
        setTesting(true);
        try {
            const data = await api<{ message?: string; data: { message: string } }>("/api/mail/settings", { method: "PUT", body: JSON.stringify({ action: "test_connection" }) });
            flash("success", data.data?.message || "Server is listening.");
        }
        catch (e: any) { flash("error", e.message); }
        setTesting(false);
    }

    async function testDns() {
        try {
            const data = await api<{ data: { message: string } }>("/api/mail/settings", { method: "PUT", body: JSON.stringify({ action: "test_dns" }) });
            flash("success", data.data?.message || "DNS token valid.");
        }
        catch (e: any) { flash("error", e.message); }
    }

    async function issueTls() {
        setIssuing(true);
        try {
            const data = await api<{ data: { message: string; expires?: string } }>("/api/mail/tls", { method: "POST", body: JSON.stringify({}) });
            flash("success", data.data?.message || "Certificate issued.");
            const refreshed = await api<{ data: { settings: Settings } }>("/api/mail/settings");
            setSettings(refreshed.data.settings);
        }
        catch (e: any) { flash("error", e.message); }
        setIssuing(false);
    }

    return (<div className="grid md:grid-cols-2 gap-5">
      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-sm mb-2">{tr("Mail server")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("Mail is served by the CMS itself. There is no separate server to configure.")}</p>
        <Field label="Mail hostname" desc="The MX target, e.g. mail.example.com">
          <input className="rm-input" dir="ltr" placeholder="mail.example.com" value={settings.mail_hostname} onChange={(e) => set("mail_hostname", e.target.value)}/>
        </Field>
        <Field label="Public hostname" desc="Hostname used for autoconfig/autodiscover/MTA-STS records.">
          <input className="rm-input" dir="ltr" placeholder="mail.example.com" value={settings.public_hostname} onChange={(e) => set("public_hostname", e.target.value)}/>
        </Field>
        <Field label="Default mailbox quota (MB)" desc="0 means unlimited.">
          <input className="rm-input" dir="ltr" type="number" min={0} value={settings.default_quota_mb} onChange={(e) => set("default_quota_mb", Number(e.target.value))}/>
        </Field>
        <Field label="Maximum message size (MB)">
          <input className="rm-input" dir="ltr" type="number" min={1} max={100} value={settings.max_message_mb} onChange={(e) => set("max_message_mb", Number(e.target.value))}/>
        </Field>
        <Field label="Spam handling" desc="What to do with messages that score as spam.">
          <select className="rm-input" value={settings.spam_action} onChange={(e) => set("spam_action", e.target.value)}>
            <option value="mark">{tr("Mark as spam")}</option>
            <option value="move">{tr("Move to Junk")}</option>
            <option value="reject">{tr("Reject")}</option>
          </select>
        </Field>
        <div className="flex gap-2 pt-3">
          <button className="rm-btn rm-btn-primary" onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
          <button className="rm-btn rm-btn-secondary" onClick={test} disabled={testing}>{testing ? tr("Testing…") : tr("Test server")}</button>
        </div>
      </div>

      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-sm mb-2">{tr("TLS certificate")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("Mail protocols need a certificate for the mail hostname. Without one the servers fall back to plaintext and refuse password login.")}</p>
        <Field label="Certificate status">
          <div className="text-sm">
            {settings.tls_expires_at
              ? <span className="rm-badge rm-badge-green">{tr("Valid until")} <span dir="ltr">{new Date(settings.tls_expires_at).toLocaleDateString()}</span></span>
              : <span className="rm-badge rm-badge-red">{tr("No certificate installed")}</span>}
          </div>
        </Field>
        <p className="text-xs text-rm-muted">{tr("Automatic issuance is handled by the setup command and renewed in the background.")}</p>
        <div className="flex gap-2 pt-3">
          <button className="rm-btn rm-btn-primary" onClick={issueTls} disabled={issuing || !settings.mail_hostname}>
            {issuing ? tr("Requesting…") : tr("Request certificate")}
          </button>
        </div>
      </div>

      <div className="rm-admin-card p-5 md:col-span-2">
        <h3 className="font-semibold text-sm mb-2">{tr("Automatic DNS")}</h3>
        <p className="text-xs text-rm-muted mb-3">{tr("Give the CMS an API token for your DNS provider and it will create the MX, SPF, DKIM, DMARC, TLS-RPT, MTA-STS and SRV records automatically.")}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="DNS provider">
            <select className="rm-input" value={settings.dns_provider} onChange={(e) => set("dns_provider", e.target.value)}>
              <option value="cloudflare">Cloudflare</option>
            </select>
          </Field>
          <Field label="API token" desc={settings.dns_token_set ? "Stored. Leave blank to keep." : "Create a token with Zone:DNS:Edit permission."}>
            <input className="rm-input" dir="ltr" type="password" autoComplete="new-password" placeholder={settings.dns_token_set ? "••••••••" : ""} value={dnsToken} onChange={(e) => setDnsToken(e.target.value)}/>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" checked={settings.dns_auto} onChange={(e) => set("dns_auto", e.target.checked)}/>
          {tr("Automatically apply DNS after adding a domain")}
        </label>
        <div className="flex gap-2 pt-3">
          <button className="rm-btn rm-btn-primary" onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
          <button className="rm-btn rm-btn-secondary" onClick={testDns}>{tr("Test DNS token")}</button>
        </div>
      </div>
    </div>);
}

function DomainsTab({ domains, reload, flash, busy, setBusy }: {
    domains: Domain[];
    reload: () => Promise<void>;
    flash: (t: "success" | "error", m: string) => void;
    busy: boolean;
    setBusy: (b: boolean) => void;
}) {
    const { t: tr } = useI18n();
    const [name, setName] = useState("");

    async function add() {
        if (!name.trim())
            return;
        setBusy(true);
        try {
            const data = await api<{ message: string }>("/api/mail/domains", { method: "POST", body: JSON.stringify({ name }) });
            setName("");
            await reload();
            flash("success", data.message || "Domain added.");
        }
        catch (e: any) { flash("error", e.message); }
        setBusy(false);
    }

    async function remove(d: Domain) {
        if (!window.confirm(tr("Remove this domain and all its mailboxes?")))
            return;
        try {
            await api(`/api/mail/domains?id=${d.id}`, { method: "DELETE" });
            await reload();
            flash("success", "Domain removed.");
        }
        catch (e: any) { flash("error", e.message); }
    }

    return (<div className="rm-admin-card p-5">
      <h3 className="font-semibold text-sm mb-2">{tr("Domains")}</h3>
      <div className="flex gap-2 mb-4">
        <input className="rm-input" dir="ltr" placeholder="example.com" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}/>
        <button className="rm-btn rm-btn-primary whitespace-nowrap" onClick={add} disabled={busy || !name.trim()}>{tr("Add domain")}</button>
      </div>
      {domains.length === 0 ? <p className="text-sm text-rm-muted">{tr("No domains yet.")}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-rm-muted border-b border-rm-border">
              <th className="py-2 pe-3">{tr("Domain")}</th>
              <th className="py-2 pe-3">{tr("DKIM selector")}</th>
              <th className="py-2 pe-3">{tr("DNS synced")}</th>
              <th className="py-2 pe-3">{tr("Status")}</th>
              <th className="py-2"></th>
            </tr></thead>
            <tbody>
              {domains.map((d) => (<tr key={d.id} className="border-b border-rm-border/60">
                <td className="py-2 pe-3 font-medium" dir="ltr">{d.name}</td>
                <td className="py-2 pe-3" dir="ltr">{d.dkim_selector}</td>
                <td className="py-2 pe-3 text-rm-muted" dir="ltr">{d.dns_synced_at ? new Date(d.dns_synced_at).toLocaleString() : "—"}</td>
                <td className="py-2 pe-3">{d.enabled ? <span className="rm-badge rm-badge-green">{tr("Active")}</span> : <span className="rm-badge">{tr("Disabled")}</span>}</td>
                <td className="py-2 text-right"><button className="rm-btn rm-btn-secondary" onClick={() => remove(d)}>{tr("Remove")}</button></td>
              </tr>))}
            </tbody>
          </table>
        </div>)}
    </div>);
}

function MailboxesTab({ domains, accounts, reload, flash, busy, setBusy }: {
    domains: Domain[];
    accounts: Account[];
    reload: () => Promise<void>;
    flash: (t: "success" | "error", m: string) => void;
    busy: boolean;
    setBusy: (b: boolean) => void;
}) {
    const { t: tr } = useI18n();
    const [domainId, setDomainId] = useState<number>(domains[0]?.id || 0);
    const [localPart, setLocalPart] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [secret, setSecret] = useState("");

    useEffect(() => { if (!domainId && domains[0]) setDomainId(domains[0].id); }, [domains, domainId]);

    const domainName = (id: number) => domains.find((d) => d.id === id)?.name || "";

    async function add() {
        if (!domainId || !localPart.trim() || secret.length < 8) {
            flash("error", "Enter a name and a password of at least 8 characters.");
            return;
        }
        setBusy(true);
        try {
            const data = await api<{ message: string }>("/api/mail/accounts", {
                method: "POST",
                body: JSON.stringify({ domain_id: domainId, local_part: localPart, display_name: displayName, secret }),
            });
            setLocalPart(""); setDisplayName(""); setSecret("");
            await reload();
            flash("success", data.message || "Mailbox created.");
        }
        catch (e: any) { flash("error", e.message); }
        setBusy(false);
    }

    async function remove(a: Account) {
        if (!window.confirm(tr("Remove this mailbox?")))
            return;
        try {
            await api(`/api/mail/accounts?id=${a.id}`, { method: "DELETE" });
            await reload();
            flash("success", "Mailbox removed.");
        }
        catch (e: any) { flash("error", e.message); }
    }

    return (<div className="space-y-5">
      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-sm mb-3">{tr("New mailbox")}</h3>
        {domains.length === 0 ? <p className="text-sm text-rm-muted">{tr("Add a domain first.")}</p> : (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Domain">
              <select className="rm-input" value={domainId} onChange={(e) => setDomainId(Number(e.target.value))}>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Mailbox name">
              <input className="rm-input" dir="ltr" placeholder="info" value={localPart} onChange={(e) => setLocalPart(e.target.value)}/>
            </Field>
            <Field label="Display name">
              <input className="rm-input" dir="ltr" value={displayName} onChange={(e) => setDisplayName(e.target.value)}/>
            </Field>
            <Field label="Password" desc="At least 8 characters.">
              <input className="rm-input" dir="ltr" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)}/>
            </Field>
            <div className="md:col-span-2">
              <button className="rm-btn rm-btn-primary" onClick={add} disabled={busy}>{busy ? tr("Creating…") : tr("Create mailbox")}</button>
            </div>
          </div>)}
      </div>

      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-sm mb-2">{tr("Mailboxes")}</h3>
        {accounts.length === 0 ? <p className="text-sm text-rm-muted">{tr("No mailboxes yet.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-rm-muted border-b border-rm-border">
                <th className="py-2 pe-3">{tr("Address")}</th>
                <th className="py-2 pe-3">{tr("Display name")}</th>
                <th className="py-2 pe-3">{tr("Quota (MB)")}</th>
                <th className="py-2"></th>
              </tr></thead>
              <tbody>
                {accounts.map((a) => (<tr key={a.id} className="border-b border-rm-border/60">
                  <td className="py-2 pe-3 font-medium" dir="ltr">{a.address}</td>
                  <td className="py-2 pe-3" dir="ltr">{a.display_name || "—"}</td>
                  <td className="py-2 pe-3" dir="ltr">{a.quota_mb || tr("default")}</td>
                  <td className="py-2 text-right"><button className="rm-btn rm-btn-secondary" onClick={() => remove(a)}>{tr("Remove")}</button></td>
                </tr>))}
              </tbody>
            </table>
          </div>)}
      </div>
    </div>);
}

function DnsTab({ domains, reload, flash }: {
    domains: Domain[];
    reload: () => Promise<void>;
    flash: (t: "success" | "error", m: string) => void;
}) {
    const { t: tr } = useI18n();
    const [domainId, setDomainId] = useState<number>(domains[0]?.id || 0);
    const [records, setRecords] = useState<DnsRecord[]>([]);
    const [plan, setPlan] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (!domainId && domains[0]) setDomainId(domains[0].id); }, [domains, domainId]);

    const preview = useCallback(async (id: number) => {
        if (!id)
            return;
        try {
            const data = await api<{ data: { plan: any[]; records: DnsRecord[] } }>("/api/mail/domains", { method: "PUT", body: JSON.stringify({ domain_id: id, action: "plan" }) });
            setPlan(data.data.plan || []);
            setRecords(data.data.records || []);
        }
        catch (e: any) { flash("error", e.message); }
    }, [flash]);

    useEffect(() => { preview(domainId); }, [domainId, preview]);

    async function apply() {
        setBusy(true);
        try {
            const data = await api<{ message: string; data: { records: DnsRecord[] } }>("/api/mail/domains", { method: "PUT", body: JSON.stringify({ domain_id: domainId, action: "apply" }) });
            setRecords(data.data.records || []);
            await reload();
            flash("success", data.message);
        }
        catch (e: any) { flash("error", e.message); }
        setBusy(false);
    }

    if (domains.length === 0)
        return <div className="rm-admin-card p-5"><p className="text-sm text-rm-muted">{tr("Add a domain first.")}</p></div>;

    return (<div className="rm-admin-card p-5">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Domain">
          <select className="rm-input" value={domainId} onChange={(e) => setDomainId(Number(e.target.value))}>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <button className="rm-btn rm-btn-primary mb-1" onClick={apply} disabled={busy || !domainId}>{busy ? tr("Applying…") : tr("Apply to DNS")}</button>
      </div>
      <p className="text-xs text-rm-muted mb-3">{tr("Records below are what the mail server needs. Applying pushes them to your DNS provider automatically.")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-rm-muted border-b border-rm-border">
            <th className="py-2 pe-3">{tr("Type")}</th>
            <th className="py-2 pe-3">{tr("Name")}</th>
            <th className="py-2 pe-3">{tr("Content")}</th>
            <th className="py-2 pe-3">{tr("Status")}</th>
          </tr></thead>
          <tbody>
            {records.length === 0 && plan.length === 0 && <tr><td colSpan={4} className="py-3 text-rm-muted">{tr("No records computed yet.")}</td></tr>}
            {records.map((r) => (<tr key={r.id} className="border-b border-rm-border/60">
              <td className="py-2 pe-3 font-mono text-xs" dir="ltr">{r.record_type}</td>
              <td className="py-2 pe-3 font-mono text-xs" dir="ltr">{r.name}</td>
              <td className="py-2 pe-3 font-mono text-xs break-all" dir="ltr">{r.content}</td>
              <td className="py-2 pe-3">{r.status === "synced" ? <span className="rm-badge rm-badge-green">{tr("Synced")}</span> : r.status === "error" ? <span className="rm-badge rm-badge-red" title={r.last_error}>{tr("Error")}</span> : <span className="rm-badge">{tr("Pending")}</span>}</td>
            </tr>))}
            {records.length === 0 && plan.map((r, i) => (<tr key={"p" + i} className="border-b border-rm-border/60 text-rm-muted">
              <td className="py-2 pe-3 font-mono text-xs" dir="ltr">{r.record_type}</td>
              <td className="py-2 pe-3 font-mono text-xs" dir="ltr">{r.name}</td>
              <td className="py-2 pe-3 font-mono text-xs break-all" dir="ltr">{r.content}</td>
              <td className="py-2 pe-3"><span className="rm-badge">{tr("Planned")}</span></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
}

function StatusTab() {
    const { t: tr } = useI18n();
    const [data, setData] = useState<any>(null);
    useEffect(() => {
        api<{ data: any }>("/api/mail/status").then((d) => setData(d.data)).catch(() => setData(null));
    }, []);
    if (!data)
        return <Spinner />;
    return (<div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { label: "Domains", value: data.counts.domains },
            { label: "Mailboxes", value: data.counts.accounts },
            { label: "DNS pending", value: data.counts.dns_pending },
            { label: "DNS errors", value: data.counts.dns_error },
        ].map((c) => (<div key={c.label} className="rm-admin-card p-4">
          <p className="text-xs text-rm-muted">{tr(c.label)}</p>
          <p className="text-2xl font-semibold text-rm-dark">{c.value}</p>
        </div>))}
      </div>
      <div className="rm-admin-card p-5">
        <h3 className="font-semibold text-sm mb-3">{tr("Recent activity")}</h3>
        {(!data.events || data.events.length === 0) ? <p className="text-sm text-rm-muted">{tr("No activity yet.")}</p> : (
          <ul className="text-sm space-y-2">
            {data.events.map((e: any, i: number) => (<li key={i} className="flex gap-3 border-b border-rm-border/60 pb-2">
              <span className="rm-badge shrink-0">{e.category}</span>
              <span className="flex-1">{e.message}</span>
              <span className="text-xs text-rm-muted shrink-0" dir="ltr">{new Date(e.created_at).toLocaleString()}</span>
            </li>))}
          </ul>)}
      </div>
    </div>);
}
