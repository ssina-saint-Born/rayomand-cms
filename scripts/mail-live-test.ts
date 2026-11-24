import { loadEnv } from "../lib/env";
import { getDb } from "../lib/db";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { authenticate } from "mailauth";
import net from "node:net";
import { readFile } from "node:fs/promises";
import { resolveStored } from "../lib/mail/engine/paths";

loadEnv();

const USER = "probe@example.com";
const PASS = "Probe-Pass-2026";
const SMTP_PORT = 2587;
const IMAP_PORT = 1143;
const POP3_PORT = 1100;

function log(step: string, ok: boolean, extra = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${step}${extra ? "  — " + extra : ""}`);
    if (!ok) process.exitCode = 1;
}

// Minimal line-based protocol driver. `until` scans only bytes that arrived
// after the previous call, so stale responses never satisfy a later predicate.
function proto(port: number): Promise<{
    send: (line: string) => void;
    until: (pred: (chunk: string) => boolean, timeoutMs?: number) => Promise<string>;
    close: () => void;
}> {
    return new Promise((resolve, reject) => {
        const sock = net.connect({ host: "127.0.0.1", port }, () => {
            let buffer = "";
            let pos = 0;
            const waiters: Array<{ pred: (s: string) => boolean; res: (s: string) => void; rej: (e: Error) => void; timer: NodeJS.Timeout }> = [];
            const pump = () => {
                while (waiters.length) {
                    const fresh = buffer.slice(pos);
                    const w = waiters[0];
                    if (w.pred(fresh)) { pos = buffer.length; clearTimeout(w.timer); waiters.shift(); w.res(fresh); }
                    else break;
                }
            };
            sock.on("data", (d) => { buffer += d.toString("utf8"); pump(); });
            resolve({
                send: (line) => sock.write(line + "\r\n"),
                until: (pred, timeoutMs = 8000) => new Promise((res, rej) => {
                    const timer = setTimeout(() => {
                        const i = waiters.findIndex((x) => x.timer === timer);
                        if (i >= 0) waiters.splice(i, 1);
                        rej(new Error("timeout waiting; fresh buffer:\n" + buffer.slice(pos, pos + 400)));
                    }, timeoutMs);
                    waiters.push({ pred, res, rej, timer });
                    pump();
                }),
                close: () => sock.destroy(),
            });
        });
        sock.once("error", reject);
    });
}

async function main() {
    // ── 1. SMTP submission (authenticated) ───────────────────────────────
    const transport = nodemailer.createTransport({
        host: "127.0.0.1", port: SMTP_PORT, secure: false,
        auth: { user: USER, pass: PASS },
        requireTLS: true,
        tls: { rejectUnauthorized: false },
    });
    const subject = `Live protocol test ${Date.now()}`;
    const info = await transport.sendMail({
        from: `Probe <${USER}>`,
        to: USER,
        subject,
        text: "Hello from a real SMTP client over submission port.",
        headers: { "X-Probe": "smtp-imap-pop3" },
    });
    log("SMTP submission accepted", !!info.messageId, info.response);

    // Wait briefly for local delivery to persist the message.
    await new Promise((r) => setTimeout(r, 1500));

    // ── 2. IMAP: login, select INBOX, fetch latest ──────────────────────
    const imap = await proto(IMAP_PORT);
    await imap.until((b) => b.includes("* OK"));
    imap.send('A1 LOGIN "' + USER + '" "' + PASS + '"');
    let r = await imap.until((b) => /A1 (OK|NO|BAD)/i.test(b));
    log("IMAP LOGIN", /A1 OK/i.test(r), r.split("\r\n").find((l) => /A1 /i.test(l)) || "");

    imap.send("A2 SELECT INBOX");
    r = await imap.until((b) => /A2 (OK|NO|BAD)/i.test(b));
    const exists = Number((r.match(/\* (\d+) EXISTS/i) || [])[1] || 0);
    log("IMAP SELECT INBOX", /A2 OK/i.test(r), `${exists} message(s) in INBOX`);

    imap.send("A3 FETCH * (BODY.PEEK[])");
    r = await imap.until((b) => /A3 (OK|NO|BAD)/i.test(b));
    const rawStart = r.indexOf("\r\n") + 2;
    const raw = r.slice(rawStart, r.search(/\r\n\)\r\nA3 /i) >= 0 ? r.search(/\r\n\)\r\nA3 /i) : undefined);
    log("IMAP FETCH message", /A3 OK/i.test(r) && raw.length > 100, `${raw.length} bytes`);

    const parsed = await simpleParser(raw);
    log("IMAP message content", parsed.subject === subject, `subject="${parsed.subject}"`);
    const hasDkim = !!(parsed.headerLines || []).find((h: any) => /^dkim-signature:/i.test(h.key + ":") || /dkim-signature/i.test(h.line));
    log("IMAP message carries DKIM-Signature header", hasDkim || /dkim-signature/i.test(raw), hasDkim ? "present" : "check");
    imap.send("A4 LOGOUT");
    await imap.until((b) => /A4 OK|\* BYE/i.test(b)).catch(() => "");
    imap.close();

    // ── 3. POP3: login, STAT, LIST ──────────────────────────────────────
    const pop = await proto(POP3_PORT);
    await pop.until((b) => b.includes("+OK"));
    pop.send("USER " + USER);
    await pop.until((b) => /\+OK|ERR/.test(b));
    pop.send("PASS " + PASS);
    r = await pop.until((b) => /\+OK|ERR/.test(b));
    log("POP3 USER/PASS", /\+OK/.test(r), r.trim());

    pop.send("STAT");
    r = await pop.until((b) => /\+OK|ERR/.test(b));
    log("POP3 STAT", /\+OK/.test(r), r.trim());

    pop.send("LIST");
    r = await pop.until((b) => /\r\n\.\r\n/.test(b), 6000);
    log("POP3 LIST", /\+OK/.test(r) && /\r\n\.\r\n/.test(r), `${(r.match(/^\d+ \d+/gm) || []).length} message row(s)`);

    pop.send("RETR 1");
    r = await pop.until((b) => /\r\n\.\r\n/.test(b), 8000);
    const retrBody = r.slice(r.indexOf("\r\n") + 2);
    log("POP3 RETR 1", /\+OK/.test(r) && retrBody.length > 100, `${retrBody.length} bytes`);
    pop.send("QUIT");
    pop.close();

    // ── 4. DKIM verification on the exact stored message bytes ──────────
    const stored = await getDb().one(
        "SELECT m.raw_path FROM mail_messages m JOIN mail_accounts a ON a.id=m.account_id WHERE lower(a.address)=lower($1) ORDER BY m.id DESC LIMIT 1",
        USER,
    );
    let rawForDkim = raw;
    if (stored?.raw_path) {
        try { rawForDkim = await readFile(resolveStored(stored.raw_path)); }
        catch { /* fall back to IMAP body */ }
    }
    const dom = await getDb().one("SELECT name, dkim_selector, dkim_public_key FROM mail_domains WHERE lower(name)='example.com'");
    if (dom?.dkim_public_key) {
        const resolver: any = async (name: string, type: string) =>
            (String(type).toUpperCase() === "TXT" && String(name).includes("_domainkey")) ? [[Buffer.from(dom.dkim_public_key)]] : [];
        try {
            const res: any = await authenticate(rawForDkim, { resolver, sender: USER, mta: "127.0.0.1" });
            const r0 = res?.dkim?.results?.[0];
            log("DKIM verify", r0?.status?.result === "pass", `dkim=${r0?.status?.result} domain=${r0?.signingDomain}`);
        }
        catch (e: any) {
            log("DKIM verify", false, e.message);
        }
    } else {
        log("DKIM verify", false, "no public key stored");
    }

    // ── 5. Outgoing message must NOT carry a pre-signing dkim=none stamp ──
    const authResults = (raw.match(/^Authentication-Results:.*$/gim) || []).join(" | ");
    const forged = /Authentication-Results:.*dkim=none.*dmarc=fail/i.test(raw);
    log("Outgoing message has no bogus Authentication-Results", !forged, authResults || "none present");

    process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error("ERROR", e); process.exit(1); });
