import { SMTPServer, type SMTPServerSession, type SMTPServerAuthentication } from "smtp-server";
import type { TLSSocketOptions } from "node:tls";
import { getMailSettings, logMailEvent } from "../settings";
import { authenticateMailbox, findMailboxByAddress, resolveRecipients, type AuthenticatedMailbox } from "./accounts";
import { checkInbound, heuristicScore } from "./inbound-check";
import { deliverLocally, submitOutgoing } from "./delivery";
import { loadTlsOptions } from "./tls";

// SMTP daemon. Three listeners share one implementation:
//   25  inbound    — no authentication, recipients must be local
//   587 submission — authentication required, may relay to remote domains
//   465 submission — same as 587 but over implicit TLS

interface Listener {
    close(): Promise<void>;
    port: number;
}

type Mode = "inbound" | "submission";

type SessionState = SMTPServerSession & { mailbox?: AuthenticatedMailbox; maxSize?: number };

const MAX_ATTEMPTS_BEFORE_TEMPFAIL = 0;

class SmtpDaemon {
    private listeners: Listener[] = [];
    private running = false;

    async start(): Promise<void> {
        if (this.running)
            return;
        const settings = await getMailSettings();
        if (!settings.mail_hostname) {
            await logMailEvent("smtp", "SMTP not started: mail hostname is not configured", "", "warn");
            return;
        }
        const tls = await loadTlsOptions();
        const inboundPort = Number(process.env.MAIL_SMTP_PORT || 25);
        const submissionPort = Number(process.env.MAIL_SUBMISSION_PORT || 587);
        const smtpsPort = Number(process.env.MAIL_SMTPS_PORT || 465);

        this.listeners.push(await this.listen(inboundPort, "inbound", tls, false, false));
        this.listeners.push(await this.listen(submissionPort, "submission", tls, true, false));
        if (tls)
            this.listeners.push(await this.listen(smtpsPort, "submission", tls, true, true));
        this.running = true;
        await logMailEvent("smtp", "SMTP daemon listening", {
            inbound: inboundPort, submission: submissionPort, smtps: tls ? smtpsPort : null,
        });
    }

    private listen(port: number, mode: Mode, tls: TLSSocketOptions | null, requireAuth: boolean, implicitTls: boolean): Promise<Listener> {
        const maxBytes = () => Math.max(1, Number(process.env.MAIL_MAX_MESSAGE_MB || 25)) * 1024 * 1024;
        return new Promise((resolve, reject) => {
            const server = new SMTPServer({
                name: "Rayomand Mail",
                banner: "Rayomand Mail ready",
                authMethods: ["PLAIN", "LOGIN"],
                authOptional: !requireAuth,
                allowInsecureAuth: !requireAuth,
                secure: implicitTls,
                hideSTARTTLS: !tls,
                ...(tls ? { key: tls.key, cert: tls.cert } : {}),
                disabledCommands: implicitTls || !tls ? ["STARTTLS"] : [],
                size: 0,
                onConnect: (session: any, callback: (error?: Error | null) => void) => {
                    (session as SessionState).maxSize = maxBytes();
                    callback();
                },
                onAuth: (auth: any, session: any, callback: (error: Error | null, response?: any) => void) => this.onAuth(auth, session as SessionState, callback),
                onMailFrom: (address: any, session: any, callback: (error?: Error | null) => void) => {
                    if (requireAuth && !(session as SessionState).mailbox)
                        return callback(Object.assign(new Error("Authentication required."), { responseCode: 530 }));
                    void address;
                    callback();
                },
                onRcptTo: (address: any, session: any, callback: (error?: Error | null) => void) => {
                    void (async () => {
                        const rcpt = String(address.address).toLowerCase();
                        if (requireAuth && !(session as SessionState).mailbox)
                            return callback(Object.assign(new Error("Authentication required."), { responseCode: 530 }));
                        if (mode === "inbound") {
                            const targets = await resolveRecipients(rcpt);
                            if (!targets.length)
                                return callback(Object.assign(new Error("No mailbox exists for that address."), { responseCode: 550 }));
                        }
                        callback();
                    })().catch(() => callback(Object.assign(new Error("Temporary failure."), { responseCode: 451 })));
                },
                onData: (stream: any, session: any, callback: (error: Error | null, message?: string) => void) => this.onData(stream, session as SessionState, mode, requireAuth, callback),
                onError: (error: Error) => { void logMailEvent("smtp", "SMTP connection error", error.message, "warn"); },
            } as any);

            server.once("error", reject);
            server.listen(port, () => {
                this.listeners.length; // no-op, kept for clarity
                resolve({
                    port,
                    close: () => new Promise<void>((done) => server.close(() => done())),
                });
            });
        });
    }

    private async onAuth(auth: SMTPServerAuthentication, session: SessionState, callback: (error: Error | null, response?: any) => void): Promise<void> {
        if (!auth.username || !auth.password)
            return callback(Object.assign(new Error("Username and password are required."), { responseCode: 535 }));
        try {
            const mailbox = await authenticateMailbox(auth.username, auth.password, session.remoteAddress);
            if (!mailbox) {
                await logMailEvent("smtp", "Authentication failed", { user: auth.username, ip: session.remoteAddress }, "warn");
                return callback(Object.assign(new Error("Invalid username or password."), { responseCode: 535 }));
            }
            session.mailbox = mailbox;
            callback(null, { user: mailbox.address });
        }
        catch (error) {
            callback(Object.assign(new Error("Authentication is temporarily unavailable."), { responseCode: 454, cause: error }));
        }
    }

    private async onData(stream: NodeJS.ReadableStream, session: SessionState, mode: Mode, requireAuth: boolean, callback: (error: Error | null, message?: string) => void): Promise<void> {
        const maxSize = session.maxSize || 25 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;

        stream.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxSize)
                tooLarge = true;
            else
                chunks.push(chunk);
        });
        await new Promise<void>((done) => {
            stream.once("end", done);
            stream.once("error", done);
        });

        if (tooLarge) {
            callback(Object.assign(new Error(`Message exceeds the ${Math.round(maxSize / 1048576)} MB limit.`), { responseCode: 552 }));
            return;
        }

        const envelopeFrom = session.envelope.mailFrom ? session.envelope.mailFrom.address.toLowerCase() : "";
        const rcpts = session.envelope.rcptTo.map((r) => r.address.toLowerCase());

        try {
            const settings = await getMailSettings();
            const host = settings.mail_hostname || "localhost";
            let raw = Buffer.concat(chunks);

            raw = prependHeader(raw, "Received", receivedValue({
                from: session.hostNameAppearsAs || `[${session.remoteAddress}]`,
                by: host,
                ip: session.remoteAddress,
                proto: requireAuth ? (session.secure ? "ESMTPSA" : "ESMTPSA") : session.secure ? "ESMTPS" : "ESMTP",
                forAddr: rcpts[0],
            }));

            const mailbox = session.mailbox;
            if (requireAuth && mailbox) {
                // Verify the sender belongs to the authenticated account, unless it
                // is a configured alias on one of the local domains. This blocks an
                // authenticated user from sending as an arbitrary local address.
                const allowed = await canSendAs(mailbox, envelopeFrom);
                if (!allowed) {
                    callback(Object.assign(new Error("You are not allowed to send from that address."), { responseCode: 553 }));
                    return;
                }
                const outcome = await submitOutgoing({
                    accountId: mailbox.id,
                    envelopeFrom: envelopeFrom || mailbox.address,
                    envelopeTo: rcpts,
                    raw,
                    signDomain: mailbox.dkim_private_key
                        ? { domain: mailbox.domain, selector: mailbox.dkim_selector, privateKey: mailbox.dkim_private_key }
                        : undefined,
                });
                callback(null, `Message accepted: ${outcome.queued} queued, ${outcome.deliveredLocal} delivered locally.`);
                await logMailEvent("smtp", "Outgoing message submitted", { from: envelopeFrom, rcpts });
                return;
            }

            // Inbound only: run SPF/DKIM/DMARC and stamp the result. Submission
            // messages are ours, so pre-signing them with dkim=none would be wrong.
            const auth = await checkInbound({
                raw, clientIp: session.remoteAddress, helo: session.hostNameAppearsAs || "",
                envelopeFrom, mailHostname: host,
            });
            const heuristics = await heuristicScore(raw, envelopeFrom);
            const score = auth.score + heuristics.score;
            raw = prependHeader(raw, "Authentication-Results", `${host}; spf=${auth.spf}; dkim=${auth.dkim}; dmarc=${auth.dmarc}`);

            const result = await deliverLocally({ raw, envelopeTo: rcpts, spamScore: score, authResults: auth.header });
            if (!result.delivered) {
                callback(Object.assign(new Error("The message could not be stored."), { responseCode: 451 }));
                return;
            }
            callback(null, "Message accepted for delivery.");
            await logMailEvent("smtp", "Inbound message stored", { from: envelopeFrom, rcpts, score, reasons: auth.reasons });
        }
        catch (error) {
            await logMailEvent("smtp", "Message handling failed", (error as Error).message, "error");
            callback(Object.assign(new Error("The message could not be stored. Try again later."), { responseCode: 451 }));
        }
    }

    async stop(): Promise<void> {
        for (const listener of this.listeners)
            await listener.close();
        this.listeners = [];
        this.running = false;
    }
}

async function canSendAs(mailbox: AuthenticatedMailbox, from: string): Promise<boolean> {
    if (!from)
        return true; // null sender for bounces
    if (from === mailbox.address.toLowerCase())
        return true;
    const other = await findMailboxByAddress(from);
    return other?.id === mailbox.id;
}

function prependHeader(raw: Buffer, name: string, value: string): Buffer {
    return Buffer.concat([Buffer.from(`${name}: ${value}\r\n`, "utf8"), raw]);
}

function receivedValue(input: { from: string; by: string; ip: string; proto: string; forAddr?: string }): string {
    const date = new Date().toUTCString();
    const parts = [
        `from ${clean(input.from)} ([${input.ip}])`,
        `by ${clean(input.by)} with ${input.proto}`,
        input.forAddr ? `for <${clean(input.forAddr)}>` : "",
        `; ${date}`,
    ];
    return parts.filter(Boolean).join(" ");
}

function clean(value: string): string {
    return (value || "").replace(/[\r\n<>]/g, "").slice(0, 200);
}

export const smtpDaemon = new SmtpDaemon();
