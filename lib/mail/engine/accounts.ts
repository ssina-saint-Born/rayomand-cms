import { getDb } from "../../db";
import { verifyPassword } from "./password";
import { ensureDefaultFolders } from "./store";

// Mailbox identity for the protocol servers. This is the only place that turns
// a username and password into an account row, so SMTP, IMAP and POP3 all
// authenticate identically.

export interface MailboxAccount {
    id: number;
    domain_id: number;
    address: string;
    local_part: string;
    display_name: string;
    quota_mb: number;
    linked_user_id: number | null;
    enabled: boolean;
    domain: string;
    dkim_selector: string;
    dkim_private_key: string;
}

export interface AuthenticatedMailbox extends MailboxAccount {
    folderId: number;
}

const AUTH_FAILURE_LIMIT = 8;
const AUTH_FAILURE_WINDOW_MS = 10 * 60 * 1000;

const failures = new Map<string, { count: number; first: number }>();

// Slow down online password guessing. Keyed by address + client IP so one
// abusive client cannot lock out the real owner from elsewhere.
export function noteAuthFailure(key: string): void {
    const nowMs = Date.now();
    const entry = failures.get(key);
    if (!entry || nowMs - entry.first > AUTH_FAILURE_WINDOW_MS) {
        failures.set(key, { count: 1, first: nowMs });
        return;
    }
    entry.count++;
}

export function isAuthThrottled(key: string): boolean {
    const entry = failures.get(key);
    if (!entry)
        return false;
    if (Date.now() - entry.first > AUTH_FAILURE_WINDOW_MS) {
        failures.delete(key);
        return false;
    }
    return entry.count >= AUTH_FAILURE_LIMIT;
}

export function clearAuthFailures(key: string): void {
    failures.delete(key);
}

export async function findMailboxByAddress(address: string): Promise<(MailboxAccount & { password_hash: string }) | null> {
    const row = await getDb().one(
        `SELECT a.*, d.name AS domain_name, d.dkim_selector, d.dkim_private_key
         FROM mail_accounts a JOIN mail_domains d ON d.id = a.domain_id
         WHERE lower(a.address)=lower($1) AND a.enabled=1 AND d.enabled=1`,
        address.trim(),
    );
    if (!row)
        return null;
    return {
        id: Number(row.id),
        domain_id: Number(row.domain_id),
        address: String(row.address),
        local_part: String(row.local_part),
        display_name: String(row.display_name || ""),
        quota_mb: Number(row.quota_mb || 0),
        linked_user_id: row.linked_user_id == null ? null : Number(row.linked_user_id),
        enabled: !!row.enabled,
        domain: String(row.domain_name),
        dkim_selector: String(row.dkim_selector || "mail"),
        dkim_private_key: String(row.dkim_private_key || ""),
        password_hash: String(row.password_hash || ""),
    };
}

// Authenticate a mailbox. `key` scopes the failure counter; pass a client IP.
export async function authenticateMailbox(
    address: string,
    password: string,
    key = "",
): Promise<AuthenticatedMailbox | null> {
    const throttleKey = `${address.toLowerCase()}|${key}`;
    if (isAuthThrottled(throttleKey))
        return null;
    const mailbox = await findMailboxByAddress(address);
    if (!mailbox || !mailbox.password_hash) {
        noteAuthFailure(throttleKey);
        return null;
    }
    const ok = await verifyPassword(password, mailbox.password_hash);
    if (!ok) {
        noteAuthFailure(throttleKey);
        return null;
    }
    clearAuthFailures(throttleKey);
    await ensureDefaultFolders(mailbox.id);
    const inbox = await getDb().one(
        "SELECT id FROM mail_folders WHERE account_id=$1 AND special_use=$2",
        mailbox.id, "\\Inbox",
    );
    const { password_hash: _omit, ...rest } = mailbox;
    return { ...rest, folderId: Number(inbox?.id || 0) };
}

// Resolve the local accounts that should receive a message for an address,
// including catch-all handling on the domain.
export async function resolveRecipients(address: string): Promise<MailboxAccount[]> {
    const direct = await findMailboxByAddress(address);
    if (direct) {
        const { password_hash: _omit, ...rest } = direct;
        return [rest];
    }
    const domain = address.split("@")[1] || "";
    if (!domain)
        return [];
    const domainRow = await getDb().one("SELECT * FROM mail_domains WHERE lower(name)=lower($1) AND enabled=1", domain);
    if (!domainRow)
        return [];
    const catchAll = String(domainRow.catch_all || "").trim().toLowerCase();
    if (!catchAll)
        return [];
    const target = await findMailboxByAddress(catchAll.includes("@") ? catchAll : `${catchAll}@${domain}`);
    if (!target)
        return [];
    const { password_hash: _omit, ...rest } = target;
    return [rest];
}

export async function isLocalDomain(domain: string): Promise<boolean> {
    const row = await getDb().one("SELECT id FROM mail_domains WHERE lower(name)=lower($1) AND enabled=1", domain);
    return !!row;
}

export async function isLocalAddress(address: string): Promise<boolean> {
    const row = await getDb().one("SELECT id FROM mail_accounts WHERE lower(address)=lower($1) AND enabled=1", address);
    return !!row;
}
