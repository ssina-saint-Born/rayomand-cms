import crypto from "node:crypto";
import { getDb, now } from "./db";
import { buildMime, stripTags } from "./mail/engine/mime";
import { submitOutgoing } from "./mail/engine/delivery";
import { parseAddressList } from "./mail/engine/address";
import { logMailEvent } from "./mail/settings";

// Application email (OTP, password reset, order receipts) is delivered by the
// built-in mail engine, not an external SMTP relay. That keeps mailbox setup to
// a single step: once the operator adds a domain in Studio → Mail, the CMS can
// send from it. If port 25 is closed the message waits in mail_outbox and the
// failure is visible in the mail panel instead of silently disappearing.

const SYSTEM_LOCAL_PART = "no-reply";

export interface SystemSender {
    accountId: number;
    address: string;
    domain: string;
    selector: string;
    privateKey: string;
}

// Resolve (and cache) the address the CMS sends from. When it is missing the
// caller gets a clear, actionable error rather than a silent no-op.
let cachedSender: { value: SystemSender | null; at: number } | null = null;
const SENDER_TTL_MS = 60_000;

export function invalidateSystemSender(): void {
    cachedSender = null;
}

export async function getSystemSender(): Promise<SystemSender | null> {
    if (cachedSender && Date.now() - cachedSender.at < SENDER_TTL_MS)
        return cachedSender.value;
    const row = await getDb().one(
        `SELECT a.id, a.address, d.name AS domain, d.dkim_selector, d.dkim_private_key
         FROM mail_accounts a JOIN mail_domains d ON d.id=a.domain_id
         WHERE d.enabled=1 AND a.enabled=1 AND lower(a.local_part)=$1
         ORDER BY a.id LIMIT 1`,
        SYSTEM_LOCAL_PART,
    );
    const value = row
        ? {
            accountId: Number(row.id),
            address: String(row.address),
            domain: String(row.domain),
            selector: String(row.dkim_selector || "mail"),
            privateKey: String(row.dkim_private_key || ""),
        }
        : null;
    cachedSender = { value, at: Date.now() };
    return value;
}

export async function mailReady(): Promise<boolean> {
    return !!(await getSystemSender());
}

// Called by the installer and the mail settings screen: make sure a domain is
// present and that `no-reply@domain` exists so application mail can flow.
export async function ensureSystemMailbox(hostname: string): Promise<SystemSender> {
    const domain = hostname.trim().toLowerCase()
        .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
    if (!domain || !domain.includes("."))
        throw new Error("A valid domain is required to create the system mailbox.");

    const { addDomain, addAccount } = await import("./mail/service");
    let domainRow = await getDb().one("SELECT id FROM mail_domains WHERE lower(name)=lower($1)", domain);
    if (!domainRow) {
        const created = await addDomain(domain);
        domainRow = { id: created.id };
    }
    let account = await getDb().one(
        "SELECT id FROM mail_accounts WHERE lower(address)=lower($1)",
        `${SYSTEM_LOCAL_PART}@${domain}`,
    );
    if (!account) {
        const secret = crypto.randomBytes(24).toString("base64url");
        const created = await addAccount({
            domainId: Number(domainRow.id),
            localPart: SYSTEM_LOCAL_PART,
            displayName: "Automated mail",
            secret,
            quotaMb: 0,
        });
        account = { id: created.id };
    }
    await logMailEvent("account", `System sender ready: ${SYSTEM_LOCAL_PART}@${domain}`);
    invalidateSystemSender();
    const sender = await getSystemSender();
    if (!sender)
        throw new Error("The system mailbox could not be prepared.");
    return sender;
}

function looksLikeHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

export async function deliverEmail(to: string, subject: string, heading: string, body: string, type: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || /[\r\n]/.test(subject))
        throw new Error("Invalid email recipient or subject.");

    const db = getDb();
    const record = await db.execute(
        "INSERT INTO email_log (to_email,subject,heading,body,type,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        to, subject, heading, body, type, "pending", now(),
    );

    const sender = await getSystemSender();
    if (!sender) {
        await db.execute("UPDATE email_log SET status='unconfigured', error=$1 WHERE id=$2",
            "No sender mailbox is configured. Add a domain under Studio → Mail.", record.id);
        throw new Error("Mail is not set up yet: add a domain in Studio → Mail so the CMS can send email.");
    }

    const html = looksLikeHtml(body) ? body : undefined;
    const text = html ? stripTags(body) : `${heading}\n\n${body}`;
    const recipients = parseAddressList(to);
    if (!recipients.length)
        throw new Error("Invalid email recipient.");

    try {
        const raw = buildMime({
            from: { name: heading || sender.address, address: sender.address },
            to: recipients,
            subject,
            text: text || heading || subject,
            html,
        });
        const outcome = await submitOutgoing({
            accountId: sender.accountId,
            envelopeFrom: sender.address,
            envelopeTo: recipients.map((r) => r.address),
            raw,
            signDomain: sender.privateKey
                ? { domain: sender.domain, selector: sender.selector, privateKey: sender.privateKey }
                : undefined,
        });
        // Local delivery is immediate; remote delivery is queued and may still
        // fail later (port 25). Record it as accepted and let the outbox own it.
        await db.execute("UPDATE email_log SET status='accepted', message_id=$1 WHERE id=$2",
            `local:${outcome.deliveredLocal},queued:${outcome.queued}`, record.id);
        return { deliveredLocal: outcome.deliveredLocal, queued: outcome.queued };
    }
    catch (error: any) {
        await db.execute("UPDATE email_log SET status='failed', error=$1 WHERE id=$2", String(error?.message || error), record.id);
        throw new Error("Email delivery failed. The failure is recorded in the mail log.");
    }
}
