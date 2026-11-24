import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, now } from "../../db";
import { currentUser } from "../../auth";
import { authenticateMailbox, findMailboxByAddress, type MailboxAccount } from "./accounts";

// Webmail access. A signed-in CMS user whose account owns a mailbox goes
// straight in — one login for the whole product. The HMAC cookie remains as a
// fallback for a mailbox that has no linked CMS user (for example a shared
// support inbox), so that case still requires its own password.

const COOKIE = "rm_webmail";
const TTL_HOURS = 12;

function secret(): string {
    return process.env.MAIL_SESSION_SECRET || process.env.SETUP_TOKEN || "rayomand-mail-session";
}

function sign(value: string): string {
    return createHmac("sha256", secret()).update(value).digest("base64url");
}

export interface WebmailSession {
    accountId: number;
    address: string;
    via: "cms" | "mailbox";
}

// The mailbox that belongs to a CMS user: linked by id, or by matching the
// user's email address. Returns null when the user has no mailbox.
async function mailboxForUser(userId: number, email: string): Promise<MailboxAccount | null> {
    let row = await getDb().one(
        `SELECT a.*, d.name AS domain_name, d.dkim_selector, d.dkim_private_key
         FROM mail_accounts a JOIN mail_domains d ON d.id=a.domain_id
         WHERE a.linked_user_id=$1 AND a.enabled=1 AND d.enabled=1 ORDER BY a.id LIMIT 1`,
        userId,
    );
    if (!row && email)
        row = await getDb().one(
            `SELECT a.*, d.name AS domain_name, d.dkim_selector, d.dkim_private_key
             FROM mail_accounts a JOIN mail_domains d ON d.id=a.domain_id
             WHERE lower(a.address)=lower($1) AND a.enabled=1 AND d.enabled=1 LIMIT 1`,
            email,
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
    };
}

export async function openWebmailSession(username: string, password: string, ip: string): Promise<WebmailSession | null> {
    const mailbox = await authenticateMailbox(username, password, ip);
    if (!mailbox)
        return null;
    const id = randomBytes(24).toString("base64url");
    const expires = new Date(Date.now() + TTL_HOURS * 3600_000).toISOString();
    await getDb().execute(
        "INSERT INTO mail_web_sessions (id,account_id,expires_at,created_at) VALUES ($1,$2,$3,$4)",
        id, mailbox.id, expires, now(),
    );
    const token = `${id}.${sign(id)}`;
    cookies().set(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TTL_HOURS * 3600,
    });
    return { accountId: mailbox.id, address: mailbox.address, via: "mailbox" };
}

async function readCookieSession(): Promise<WebmailSession | null> {
    const token = cookies().get(COOKIE)?.value;
    if (!token)
        return null;
    const [id, signature] = token.split(".");
    if (!id || !signature)
        return null;
    const expected = sign(id);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
        return null;
    const row = await getDb().one(
        "SELECT s.account_id, a.address FROM mail_web_sessions s JOIN mail_accounts a ON a.id=s.account_id WHERE s.id=$1 AND s.expires_at>$2 AND a.enabled=1",
        id, now(),
    );
    if (!row)
        return null;
    return { accountId: Number(row.account_id), address: String(row.address), via: "mailbox" };
}

export async function readWebmailSession(): Promise<WebmailSession | null> {
    const user = await currentUser();
    if (user) {
        const mailbox = await mailboxForUser(user.id, user.email);
        if (mailbox)
            return { accountId: mailbox.id, address: mailbox.address, via: "cms" };
    }
    return readCookieSession();
}

export async function closeWebmailSession(): Promise<void> {
    const token = cookies().get(COOKIE)?.value;
    if (token) {
        const id = token.split(".")[0];
        if (id)
            await getDb().execute("DELETE FROM mail_web_sessions WHERE id=$1", id);
    }
    cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function requireMailbox(): Promise<{ session: WebmailSession; mailbox: MailboxAccount } | null> {
    const session = await readWebmailSession();
    if (!session)
        return null;
    const mailbox = await findMailboxByAddress(session.address);
    if (!mailbox || !mailbox.enabled)
        return null;
    const { password_hash, ...rest } = mailbox;
    void password_hash;
    return { session, mailbox: rest };
}

/** True when the signed-in CMS user can open webmail without a second login. */
export async function cmsUserHasMailbox(): Promise<boolean> {
    const user = await currentUser();
    if (!user)
        return false;
    return !!(await mailboxForUser(user.id, user.email));
}
