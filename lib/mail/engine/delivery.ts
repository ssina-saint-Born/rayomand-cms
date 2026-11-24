import { promises as dns } from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getDb, now } from "../../db";
import { getMailSettings, logMailEvent } from "../settings";
import { appendMessage, folderByName } from "./store";
import { messagePath, resolveStored } from "./paths";
import { parseMessage } from "./mime";
import { resolveRecipients, isLocalAddress, isLocalDomain } from "./accounts";
import { signMessage } from "./dkim";
import { domainOf } from "./address";
import { readFile } from "node:fs/promises";

// Delivery: store locally, or queue for remote transport. The queue is the only
// thing the SMTP daemon and the CMS webmail share, so a message sent from the
// webmail and one relayed from the internet follow the same path.

const MAX_ATTEMPTS = 12;
const RETRY_DELAYS_MIN = [1, 5, 15, 30, 60, 120, 240, 480, 720, 1440];

export interface InboundResult {
    delivered: number;
    rejected: string[];
    spamScore: number;
}

// Store a message for every local recipient of the envelope. Recipients that
// are not local are ignored here (the SMTP daemon only accepts local ones on
// port 25, and the submission port queues remote ones itself).
export async function deliverLocally(input: {
    raw: Buffer;
    envelopeTo: string[];
    spamScore?: number;
    authResults?: string;
}): Promise<InboundResult> {
    const parsed = await parseMessage(input.raw);
    let delivered = 0;
    const rejected: string[] = [];
    const seen = new Set<string>();

    for (const rcpt of input.envelopeTo) {
        const targets = await resolveRecipients(rcpt);
        if (!targets.length) {
            rejected.push(rcpt);
            continue;
        }
        for (const account of targets) {
            if (seen.has(`${account.id}|${rcpt}`))
                continue;
            seen.add(`${account.id}|${rcpt}`);
            const inbox = await folderByName(account.id, "INBOX");
            if (!inbox) {
                rejected.push(rcpt);
                continue;
            }
            const junk = await folderByName(account.id, "Junk");
            const score = input.spamScore || 0;
            const target = score >= 5 && junk ? junk : inbox;
            await appendMessage({
                accountId: account.id,
                folderId: target.id,
                raw: input.raw,
                meta: {
                    messageId: parsed.messageId,
                    inReplyTo: parsed.inReplyTo,
                    refs: parsed.references.join(" "),
                    from: parsed.from,
                    to: parsed.to,
                    cc: parsed.cc,
                    bcc: parsed.bcc,
                    replyTo: parsed.replyTo,
                    subject: parsed.subject,
                    sentAt: parsed.date.toISOString(),
                    snippet: parsed.snippet,
                    hasAttachments: parsed.attachments.length > 0,
                    spamScore: score,
                    authResults: input.authResults || "",
                },
            });
            delivered++;
        }
    }
    return { delivered, rejected, spamScore: input.spamScore || 0 };
}

// ── Outbound ─────────────────────────────────────────────────────────────────
export interface QueueInput {
    accountId: number;
    envelopeFrom: string;
    envelopeTo: string[];
    raw: Buffer;
    signDomain?: { domain: string; selector: string; privateKey: string };
}

// Queue one message per recipient. Local recipients are delivered immediately
// and never touch the network. Remote recipients get a row the worker picks up.
export async function submitOutgoing(input: QueueInput): Promise<{ queued: number; deliveredLocal: number }> {
    let raw = input.raw;
    if (input.signDomain && input.signDomain.privateKey) {
        const signed = await signMessage(raw, input.signDomain);
        if (!signed.signed)
            await logMailEvent("dkim", "Signing failed; sending unsigned", signed.error || "", "warn");
        raw = signed.raw;
    }

    let queued = 0;
    let deliveredLocal = 0;
    for (const rcpt of input.envelopeTo) {
        if (await isLocalAddress(rcpt)) {
            await deliverLocally({ raw, envelopeTo: [rcpt] });
            deliveredLocal++;
            continue;
        }
        const id = randomUUID();
        const { absolute, relative } = messagePath(input.accountId, id);
        await writeFile(absolute, raw, { mode: 0o600 });
        await getDb().execute(
            `INSERT INTO mail_outbox (account_id,envelope_from,envelope_to,raw_path,status,attempts,next_attempt_at,created_at)
             VALUES ($1,$2,$3,$4,'queued',0,$5,$5)`,
            input.accountId, input.envelopeFrom, rcpt, relative, now(),
        );
        queued++;
    }

    if (queued || deliveredLocal)
        await saveToSent(input.accountId, raw);
    return { queued, deliveredLocal };
}

export interface OutboxRow {
    id: number;
    account_id: number;
    envelope_from: string;
    envelope_to: string;
    raw_path: string;
    status: string;
    attempts: number;
    next_attempt_at: string;
    last_error: string;
}

export async function dueOutbox(limit = 20): Promise<OutboxRow[]> {
    const rows = await getDb().many(
        "SELECT * FROM mail_outbox WHERE status='queued' AND next_attempt_at <= $1 ORDER BY id ASC LIMIT $2",
        now(), limit,
    );
    return rows as OutboxRow[];
}

// Process the queue once. Returns how many messages were attempted.
export async function processOutbox(limit = 20): Promise<number> {
    const rows = await dueOutbox(limit);
    for (const row of rows)
        await attemptDelivery(row);
    return rows.length;
}

async function attemptDelivery(row: OutboxRow): Promise<void> {
    const db = getDb();
    let raw: Buffer;
    try {
        raw = await readFile(resolveStored(row.raw_path));
    }
    catch (error) {
        await db.execute("UPDATE mail_outbox SET status='failed', last_error=$1 WHERE id=$2", `Message file is missing: ${(error as Error).message}`, row.id);
        return;
    }
    try {
        await deliverRemote(row.envelope_from, row.envelope_to, raw);
        await db.execute("UPDATE mail_outbox SET status='sent', sent_at=$1, attempts=attempts+1 WHERE id=$2", now(), row.id);
        await logMailEvent("delivery", `Delivered to ${row.envelope_to}`, { id: row.id });
    }
    catch (error) {
        const attempts = row.attempts + 1;
        const message = (error as Error).message;
        if (attempts >= MAX_ATTEMPTS) {
            await db.execute("UPDATE mail_outbox SET status='failed', attempts=$1, last_error=$2 WHERE id=$3", attempts, message, row.id);
            await logMailEvent("delivery", `Giving up on ${row.envelope_to}`, message, "error");
            return;
        }
        const delay = RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)] * 60_000;
        const next = new Date(Date.now() + delay).toISOString();
        await db.execute("UPDATE mail_outbox SET attempts=$1, next_attempt_at=$2, last_error=$3 WHERE id=$4", attempts, next, message, row.id);
        await logMailEvent("delivery", `Retry ${attempts} for ${row.envelope_to}`, message, "warn");
    }
}

// ── SMTP client ──────────────────────────────────────────────────────────────
async function mxFor(domain: string): Promise<Array<{ host: string; priority: number }>> {
    try {
        const records = await dns.resolveMx(domain);
        if (records.length)
            return records.map((r) => ({ host: r.exchange, priority: r.priority })).sort((a, b) => a.priority - b.priority);
    }
    catch { /* fall through to A record */ }
    // RFC 5321: no MX means try the host itself.
    return [{ host: domain, priority: 0 }];
}

async function deliverRemote(from: string, to: string, raw: Buffer): Promise<void> {
    const hosts = await mxFor(domainOf(to));
    let lastError: Error | null = null;
    for (const entry of hosts) {
        try {
            await smtpTransaction(entry.host, from, to, raw);
            return;
        }
        catch (error) {
            lastError = error as Error;
        }
    }
    throw new Error(lastError ? lastError.message : "No mail exchanger answered.");
}

const HOSTNAME_FALLBACK = "localhost";

async function smtpTransaction(host: string, from: string, to: string, raw: Buffer): Promise<void> {
    const helo = (await getMailSettings()).mail_hostname || HOSTNAME_FALLBACK;
    const port = 25;
    const timeoutMs = 30_000;

    const socket = await connectWithStartTls(host, port, timeoutMs);
    try {
        const session = new SmtpSession(socket, timeoutMs);
        await session.expect(220);
        await session.command(`EHLO ${helo}`, 250);
        // Opportunistic TLS when offered.
        if (session.supports("STARTTLS") && !session.secure) {
            await session.startTls(host);
            await session.command(`EHLO ${helo}`, 250);
        }
        await session.command(`MAIL FROM:<${from}>`, 250);
        await session.command(`RCPT TO:<${to}>`, [250, 251]);
        await session.command("DATA", 354);
        await session.data(raw);
        await session.command("QUIT", [221, 250], true);
    }
    finally {
        socket.destroy();
    }
}

function connectWithStartTls(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => resolve(socket));
        socket.once("timeout", () => { socket.destroy(); reject(new Error(`Connection to ${host} timed out.`)); });
        socket.once("error", (error) => reject(new Error(`${host}: ${error.message}`)));
    });
}

// Small line-oriented SMTP client used only for outbound relay.
class SmtpSession {
    private buffer = "";
    private waiters: Array<(line: string) => void> = [];
    secure = false;

    constructor(private socket: net.Socket, private timeoutMs: number) {
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => this.onData(chunk));
        socket.on("error", () => { /* surfaced by the pending read timing out */ });
    }

    private onData(chunk: string): void {
        this.buffer += chunk;
        let index: number;
        while ((index = this.buffer.indexOf("\r\n")) !== -1) {
            const line = this.buffer.slice(0, index);
            this.buffer = this.buffer.slice(index + 2);
            const waiter = this.waiters.shift();
            if (waiter)
                waiter(line);
        }
    }

    private readLine(): Promise<string> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter((w) => w !== waiter);
                reject(new Error("The remote server stopped responding."));
            }, this.timeoutMs);
            const waiter = (line: string) => { clearTimeout(timer); resolve(line); };
            this.waiters.push(waiter);
        });
    }

    private async readReply(): Promise<{ code: number; lines: string[] }> {
        const lines: string[] = [];
        let code = 0;
        for (;;) {
            const line = await this.readLine();
            lines.push(line);
            const match = /^(\d{3})([ -])/.exec(line);
            if (!match) {
                if (lines.length === 1)
                    continue;
                break;
            }
            code = Number(match[1]);
            if (match[2] === " ")
                break;
        }
        return { code, lines };
    }

    supports(feature: string): boolean {
        return this.ehloFeatures.some((f) => f.toUpperCase().startsWith(feature.toUpperCase()));
    }

    private ehloFeatures: string[] = [];

    async expect(code: number | number[]): Promise<void> {
        const { code: got, lines } = await this.readReply();
        const allowed = Array.isArray(code) ? code : [code];
        if (!allowed.includes(got))
            throw new Error(lines.join(" ").slice(0, 200) || `Unexpected reply ${got}`);
    }

    async command(line: string, expect: number | number[], quiet = false): Promise<void> {
        this.socket.write(line + "\r\n");
        const { code, lines } = await this.readReply();
        const allowed = Array.isArray(expect) ? expect : [expect];
        if (!allowed.includes(code))
            throw new Error(lines.join(" ").slice(0, 200) || `Unexpected reply ${code}`);
        if (line.startsWith("EHLO")) {
            this.ehloFeatures = lines.slice(1).map((l) => l.slice(4).trim()).filter(Boolean);
        }
        void quiet;
    }

    async data(raw: Buffer): Promise<void> {
        // Dot-stuff lines that begin with a period.
        const body = raw.toString("binary").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
        this.socket.write(body + "\r\n.\r\n", "binary");
        await this.expect(250);
    }

    async startTls(host: string): Promise<void> {
        this.socket.write("STARTTLS\r\n");
        await this.expect(220);
        const secured = await new Promise<tls.TLSSocket>((resolve, reject) => {
            const socket: tls.TLSSocket = tls.connect({ socket: this.socket, servername: host }, () => resolve(socket));
            socket.once("error", (error: Error) => reject(new Error(`TLS with ${host} failed: ${error.message}`)));
        });
        this.socket = secured as unknown as net.Socket;
        this.socket.setEncoding("utf8");
        this.socket.on("data", (chunk: string) => this.onData(chunk));
        this.secure = true;
        this.buffer = "";
    }
}

// Save a copy of a sent message in the sender's Sent folder.
export async function saveToSent(accountId: number, raw: Buffer, seen = true): Promise<void> {
    const folder = await folderByName(accountId, "Sent");
    if (!folder)
        return;
    const parsed = await parseMessage(raw);
    await appendMessage({
        accountId,
        folderId: folder.id,
        raw,
        flags: { seen },
        meta: {
            messageId: parsed.messageId,
            inReplyTo: parsed.inReplyTo,
            refs: parsed.references.join(" "),
            from: parsed.from,
            to: parsed.to,
            cc: parsed.cc,
            bcc: parsed.bcc,
            replyTo: parsed.replyTo,
            subject: parsed.subject,
            sentAt: parsed.date.toISOString(),
            snippet: parsed.snippet,
            hasAttachments: parsed.attachments.length > 0,
        },
    });
}

export async function isLocalRecipient(address: string): Promise<boolean> {
    if (await isLocalAddress(address))
        return true;
    return isLocalDomain(domainOf(address));
}
