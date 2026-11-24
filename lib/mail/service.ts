import { getDb, now } from "../db";
import { getMailSettings, logMailEvent, type MailSettings } from "./settings";
import { providerFor, buildRecordPlan, type DesiredRecord } from "./dns";
import { generateDkimKey } from "./engine/dkim";
import { hashPassword } from "./engine/password";
import { ensureDefaultFolders, SPECIAL_USE } from "./engine/store";
import { isLocalDomain } from "./engine/accounts";

// Domain and mailbox administration. There is no remote mail server any more:
// a domain is a row, a mailbox is a row plus a password hash, and the protocol
// daemons read the same tables. This module is the only writer of both.

export interface MailDomain {
    id: number;
    name: string;
    dkim_selector: string;
    dkim_public_key: string;
    dns_zone_id: string;
    dns_synced_at: string | null;
    catch_all: string;
    enabled: boolean;
    created_at: string;
}

export interface MailAccount {
    id: number;
    domain_id: number;
    address: string;
    local_part: string;
    display_name: string;
    quota_mb: number;
    linked_user_id: number | null;
    enabled: boolean;
    created_at: string;
}

export async function listDomains(): Promise<MailDomain[]> {
    const rows = await getDb().many("SELECT * FROM mail_domains ORDER BY name ASC");
    return rows.map(normalizeDomain);
}

function normalizeDomain(r: any): MailDomain {
    return {
        id: Number(r.id),
        name: String(r.name),
        dkim_selector: String(r.dkim_selector || "mail"),
        dkim_public_key: String(r.dkim_public_key || ""),
        dns_zone_id: String(r.dns_zone_id || ""),
        dns_synced_at: r.dns_synced_at || null,
        catch_all: String(r.catch_all || ""),
        enabled: !!r.enabled,
        created_at: String(r.created_at),
    };
}

export async function addDomain(name: string): Promise<MailDomain> {
    const clean = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(clean))
        throw new Error("Enter a valid domain, for example example.com.");
    const existing = await getDb().one("SELECT id FROM mail_domains WHERE lower(name)=lower($1)", clean);
    if (existing)
        throw new Error("This domain is already added.");

    // Every domain gets its own signing key. The selector includes the key
    // generation so rotating is just adding a second record.
    const selector = `mail${Date.now().toString(36).slice(-4)}`;
    const key = generateDkimKey(selector);

    const id = (await getDb().execute(
        "INSERT INTO mail_domains (name,dkim_selector,dkim_public_key,dkim_private_key,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        clean, key.selector, key.dnsValue, key.privateKey, now(),
    )).id;
    await logMailEvent("domain", `Domain ${clean} added`, { selector: key.selector });
    return normalizeDomain(await getDb().one("SELECT * FROM mail_domains WHERE id=$1", id));
}

export async function removeDomain(id: number): Promise<void> {
    const row = await getDb().one("SELECT * FROM mail_domains WHERE id=$1", id);
    if (!row)
        throw new Error("Domain not found.");
    const accounts = await getDb().many("SELECT id FROM mail_accounts WHERE domain_id=$1", id);
    for (const a of accounts)
        await removeAccount(Number(a.id));
    await getDb().execute("DELETE FROM mail_dns_records WHERE domain_id=$1", id);
    await getDb().execute("DELETE FROM mail_domains WHERE id=$1", id);
    await logMailEvent("domain", `Domain ${row.name} removed`, { id });
}

export async function rotateDkim(domainId: number): Promise<MailDomain> {
    const row = await getDb().one("SELECT * FROM mail_domains WHERE id=$1", domainId);
    if (!row)
        throw new Error("Domain not found.");
    const selector = `mail${Date.now().toString(36).slice(-4)}`;
    const key = generateDkimKey(selector);
    await getDb().execute(
        "UPDATE mail_domains SET dkim_selector=$1, dkim_public_key=$2, dkim_private_key=$3 WHERE id=$4",
        key.selector, key.dnsValue, key.privateKey, domainId,
    );
    await logMailEvent("domain", `DKIM rotated for ${row.name}`, { selector: key.selector });
    return normalizeDomain(await getDb().one("SELECT * FROM mail_domains WHERE id=$1", domainId));
}

export async function setCatchAll(domainId: number, address: string): Promise<void> {
    const clean = address.trim().toLowerCase();
    if (clean && !/^[a-z0-9._+-]+@/.test(clean))
        throw new Error("Catch-all must be a local part or a full address.");
    await getDb().execute("UPDATE mail_domains SET catch_all=$1 WHERE id=$2", clean, domainId);
}

// ── Accounts ─────────────────────────────────────────────────────────────────
export async function listAccounts(domainId?: number): Promise<MailAccount[]> {
    const rows = domainId
        ? await getDb().many("SELECT * FROM mail_accounts WHERE domain_id=$1 ORDER BY address ASC", domainId)
        : await getDb().many("SELECT * FROM mail_accounts ORDER BY address ASC");
    return rows.map(normalizeAccount);
}

function normalizeAccount(r: any): MailAccount {
    return {
        id: Number(r.id),
        domain_id: Number(r.domain_id),
        address: String(r.address),
        local_part: String(r.local_part),
        display_name: String(r.display_name || ""),
        quota_mb: Number(r.quota_mb || 0),
        linked_user_id: r.linked_user_id == null ? null : Number(r.linked_user_id),
        enabled: !!r.enabled,
        created_at: String(r.created_at),
    };
}

export async function addAccount(input: {
    domainId: number;
    localPart: string;
    displayName?: string;
    secret: string;
    quotaMb?: number;
    linkedUserId?: number | null;
}): Promise<MailAccount> {
    const domain = await getDb().one("SELECT * FROM mail_domains WHERE id=$1", input.domainId);
    if (!domain)
        throw new Error("Domain not found.");
    const local = String(input.localPart || "").trim().toLowerCase();
    if (!/^[a-z0-9._+-]{1,64}$/.test(local))
        throw new Error("Enter a valid mailbox name (letters, digits, dot, dash, underscore).");
    if (local.startsWith(".") || local.endsWith(".") || local.includes(".."))
        throw new Error("Mailbox name cannot start or end with a dot, or contain two dots in a row.");
    const address = `${local}@${String(domain.name).toLowerCase()}`;
    const existing = await getDb().one("SELECT id FROM mail_accounts WHERE lower(address)=lower($1)", address);
    if (existing)
        throw new Error("This mailbox already exists.");

    const passwordHash = await hashPassword(input.secret);
    const id = (await getDb().execute(
        `INSERT INTO mail_accounts (domain_id,address,local_part,display_name,password_hash,quota_mb,linked_user_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        input.domainId, address, local, input.displayName || "", passwordHash, input.quotaMb || 0, input.linkedUserId ?? null, now(),
    )).id;
    await ensureDefaultFolders(id);
    await logMailEvent("account", `Mailbox ${address} created`, { id });
    return normalizeAccount(await getDb().one("SELECT * FROM mail_accounts WHERE id=$1", id));
}

export async function removeAccount(id: number): Promise<void> {
    const row = await getDb().one("SELECT * FROM mail_accounts WHERE id=$1", id);
    if (!row)
        throw new Error("Mailbox not found.");
    const { deleteAccountData } = await import("./engine/store-maintenance");
    await deleteAccountData(id);
    await getDb().execute("DELETE FROM mail_accounts WHERE id=$1", id);
    await logMailEvent("account", `Mailbox ${row.address} removed`, { id });
}

export async function setAccountSecret(id: number, secret: string): Promise<void> {
    const row = await getDb().one("SELECT id FROM mail_accounts WHERE id=$1", id);
    if (!row)
        throw new Error("Mailbox not found.");
    const hash = await hashPassword(secret);
    await getDb().execute("UPDATE mail_accounts SET password_hash=$1 WHERE id=$2", hash, id);
    await logMailEvent("account", `Password updated for mailbox #${id}`, { id });
}

export async function setAccountEnabled(id: number, enabled: boolean): Promise<void> {
    await getDb().execute("UPDATE mail_accounts SET enabled=$1 WHERE id=$2", enabled ? 1 : 0, id);
}

export async function setAccountQuota(id: number, quotaMb: number): Promise<void> {
    await getDb().execute("UPDATE mail_accounts SET quota_mb=$1 WHERE id=$2", Math.max(0, Math.floor(quotaMb)), id);
}

// Ties a mailbox to a CMS user so that user reaches webmail with the single
// CMS login (no second password).
export async function setAccountUser(id: number, userId: number | null): Promise<void> {
    const row = await getDb().one("SELECT id FROM mail_accounts WHERE id=$1", id);
    if (!row)
        throw new Error("Mailbox not found.");
    if (userId) {
        const user = await getDb().one("SELECT id FROM users WHERE id=$1", userId);
        if (!user)
            throw new Error("User not found.");
    }
    await getDb().execute("UPDATE mail_accounts SET linked_user_id=$1 WHERE id=$2", userId, id);
    await logMailEvent("account", `Mailbox #${id} linked to user ${userId ?? "none"}`, { id, userId });
}

export async function accountForUser(user: { id: number; email: string }): Promise<MailAccount | null> {
    let row = await getDb().one("SELECT * FROM mail_accounts WHERE linked_user_id=$1 AND enabled=1 ORDER BY id LIMIT 1", user.id);
    if (!row && user.email)
        row = await getDb().one("SELECT * FROM mail_accounts WHERE lower(address)=lower($1) AND enabled=1 LIMIT 1", user.email);
    return row ? normalizeAccount(row) : null;
}

// ── DNS ──────────────────────────────────────────────────────────────────────
export async function domainRecords(domainId: number) {
    return getDb().many("SELECT * FROM mail_dns_records WHERE domain_id=$1 ORDER BY record_type, name", domainId);
}

export async function planForDomain(domainId: number): Promise<DesiredRecord[]> {
    const settings = await getMailSettings();
    const domain = await getDb().one("SELECT * FROM mail_domains WHERE id=$1", domainId);
    if (!domain)
        throw new Error("Domain not found.");
    return buildRecordPlan({
        domain: String(domain.name),
        mailHost: settings.mail_hostname || settings.public_hostname,
        publicHost: settings.public_hostname || settings.mail_hostname,
        dkimSelector: String(domain.dkim_selector || "mail"),
        dkimKey: String(domain.dkim_public_key || ""),
        catchAllReport: `postmaster@${domain.name}`,
    });
}

export interface ApplyResult {
    applied: number;
    skipped: number;
    failed: Array<{ record: DesiredRecord; error: string }>;
}

export async function applyDnsForDomain(domainId: number, options: { prune?: boolean } = {}): Promise<ApplyResult> {
    const settings = await getMailSettings();
    const provider = providerFor(settings);
    if (!provider)
        throw new Error("No DNS provider is configured. Add a Cloudflare API token in settings.");
    const domain = await getDb().one("SELECT * FROM mail_domains WHERE id=$1", domainId);
    if (!domain)
        throw new Error("Domain not found.");

    const zone = await provider.findZone(String(domain.name));
    if (!zone)
        throw new Error(`DNS zone for ${domain.name} was not found in ${provider.label}.`);

    const plan = await planForDomain(domainId);
    const remote = await provider.listRecords(zone.id);
    const byKey = new Map<string, any>();
    for (const r of remote)
        byKey.set(`${r.record_type}|${r.name}`.toLowerCase(), r);

    const result: ApplyResult = { applied: 0, skipped: 0, failed: [] };
    const keepIds = new Set<string>();

    for (const record of plan) {
        const key = `${record.record_type}|${record.name}`.toLowerCase();
        const match = byKey.get(key);
        try {
            if (match) {
                const same = String(match.content) === String(record.content);
                const remoteId = match.id;
                keepIds.add(remoteId);
                if (!same) {
                    await provider.updateRecord(zone.id, remoteId, record);
                    await upsertLocal(domainId, record, "synced", "", remoteId);
                    result.applied++;
                }
                else {
                    await upsertLocal(domainId, record, "synced", "", remoteId);
                    result.skipped++;
                }
            }
            else {
                const remoteId = await provider.createRecord(zone.id, record);
                keepIds.add(remoteId);
                await upsertLocal(domainId, record, "synced", "", remoteId);
                result.applied++;
            }
        }
        catch (e) {
            await upsertLocal(domainId, record, "error", (e as Error).message, match?.id || "");
            result.failed.push({ record, error: (e as Error).message });
        }
    }

    if (options.prune) {
        for (const r of remote) {
            if (keepIds.has(r.id))
                continue;
            const ours = await getDb().one("SELECT id FROM mail_dns_records WHERE domain_id=$1 AND remote_id=$2", domainId, r.id);
            if (!ours)
                continue;
            try {
                await provider.deleteRecord(zone.id, r.id);
                await getDb().execute("DELETE FROM mail_dns_records WHERE domain_id=$1 AND remote_id=$2", domainId, r.id);
            }
            catch { /* retry next run */ }
        }
    }

    await getDb().execute("UPDATE mail_domains SET dns_zone_id=$1, dns_synced_at=$2 WHERE id=$3", zone.id, now(), domainId);
    await logMailEvent("dns", `DNS applied for ${domain.name}`, result);
    return result;
}

async function upsertLocal(domainId: number, record: DesiredRecord, status: string, error: string, remoteId: string): Promise<void> {
    await getDb().execute(
        `INSERT INTO mail_dns_records (domain_id,record_type,name,content,priority,managed,remote_id,status,last_error,updated_at)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9)
         ON CONFLICT (domain_id,record_type,name,content) DO UPDATE SET
            status=EXCLUDED.status, last_error=EXCLUDED.last_error, remote_id=EXCLUDED.remote_id, updated_at=EXCLUDED.updated_at`,
        domainId, record.record_type, record.name, record.content, record.priority ?? null, remoteId, status, error, now(),
    );
}

// ── Status ───────────────────────────────────────────────────────────────────
export async function mailStatus(): Promise<{
    domains: number;
    accounts: number;
    messages: number;
    queued: number;
    failed: number;
    storageBytes: number;
}> {
    const db = getDb();
    const domains = await db.one("SELECT count(*) AS c FROM mail_domains WHERE enabled=1");
    const accounts = await db.one("SELECT count(*) AS c FROM mail_accounts WHERE enabled=1");
    const messages = await db.one("SELECT count(*) AS c FROM mail_messages");
    const queued = await db.one("SELECT count(*) AS c FROM mail_outbox WHERE status='queued'");
    const failed = await db.one("SELECT count(*) AS c FROM mail_outbox WHERE status='failed'");
    const storage = await db.one("SELECT coalesce(sum(size),0) AS s FROM mail_messages");
    return {
        domains: Number(domains?.c || 0),
        accounts: Number(accounts?.c || 0),
        messages: Number(messages?.c || 0),
        queued: Number(queued?.c || 0),
        failed: Number(failed?.c || 0),
        storageBytes: Number(storage?.s || 0),
    };
}

// ── Connection test ──────────────────────────────────────────────────────────
// Kept for the admin UI, but now it verifies local state and DNS instead of a
// remote server.
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
    const settings = await getMailSettings();
    if (!settings.mail_hostname)
        return { ok: false, message: "Set the mail hostname first (for example mail.example.com)." };
    const domains = await getDb().many("SELECT name FROM mail_domains WHERE enabled=1");
    if (!domains.length)
        return { ok: false, message: "No domain is added yet." };
    const local = await isLocalDomain(String(domains[0].name));
    await logMailEvent("connection", "Local mail engine check", { domains: domains.length, local });
    return {
        ok: local,
        message: `Local mail engine ready. ${domains.length} domain(s), host ${settings.mail_hostname}.`,
    };
}

// ── Port 25 preflight ────────────────────────────────────────────────────────
// Outbound port 25 is the one thing a self-hosted mail server cannot fix in
// code: many VPS providers block it. This check reports the truth so the
// operator knows to ask their provider, instead of chasing a phantom bug.
export interface Port25Report {
    outbound: "open" | "blocked" | "unknown";
    detail: string;
    checked_at: string;
}

let port25Cache: { value: Port25Report; at: number } | null = null;

export async function checkPort25(): Promise<Port25Report> {
    if (port25Cache && Date.now() - port25Cache.at < 300_000)
        return port25Cache.value;
    const net = await import("node:net");
    const report = await new Promise<Port25Report>((resolve) => {
        // gmail's MX is a stable, widely reachable target for a TCP reach test.
        const socket = net.createConnection({ host: "gmail-smtp-in.l.google.com", port: 25 });
        const done = (outbound: Port25Report["outbound"], detail: string) => {
            socket.destroy();
            resolve({ outbound, detail, checked_at: now() });
        };
        const timer = setTimeout(() => done("unknown", "The check timed out after 8 seconds."), 8000);
        socket.once("connect", () => { clearTimeout(timer); done("open", "Outbound port 25 is reachable to remote mail servers."); });
        socket.once("error", (error: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            const blocked = ["ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].includes(String(error.code));
            done(blocked ? "blocked" : "unknown", blocked
                ? "Outbound port 25 is blocked. Ask your hosting provider to unblock it; until then the CMS cannot deliver mail to Gmail/Outlook, though local mailboxes still receive internal mail."
                : `Could not determine port 25 state: ${error.message}`);
        });
    });
    port25Cache = { value: report, at: Date.now() };
    return report;
}

export { SPECIAL_USE };
