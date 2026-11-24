import net from "node:net";
import tls from "node:tls";
import { getMailSettings, logMailEvent } from "../settings";
import { authenticateMailbox, type AuthenticatedMailbox } from "./accounts";
import {
    appendMessage, clearRecent, copyMessages, createFolder, deleteFolder, expungeFolder,
    folderByName, folderStats, listFolders, messagesInFolder, moveMessages,
    readRaw, renameFolder, setFlags, type MailFolder, type StoredMessage,
} from "./store";
import { parseMessage } from "./mime";
import { buildFetch } from "./imap-format";
import { ImapParser, parseSequenceSet, quote } from "./imap-parse";
import { decodeMailboxName, encodeMailboxName } from "./imap-utf7";
import { applyFlagChange, flagNames, parseFetchItems, runSearch } from "./imap-search";
import { loadTlsOptions } from "./tls";

// IMAP4rev1 server covering the command set real clients use: authentication,
// mailbox management, selection, search, fetch, flag changes, copy/move,
// append, expunge and IDLE.

const MAX_LINE = 64 * 1024;
const MAX_LITERAL = 50 * 1024 * 1024;

type State = "not-authenticated" | "authenticated" | "selected";

export class ImapServer {
    private servers: net.Server[] = [];
    private sessions = new Set<ImapSession>();
    private running = false;

    async start(): Promise<void> {
        if (this.running)
            return;
        const settings = await getMailSettings();
        if (!settings.mail_hostname) {
            await logMailEvent("imap", "IMAP not started: mail hostname is not configured", "", "warn");
            return;
        }
        const port = Number(process.env.MAIL_IMAP_PORT || 143);
        const securePort = Number(process.env.MAIL_IMAPS_PORT || 993);
        const tlsOptions = await loadTlsOptions();

        this.servers.push(await this.listen(port, false, tlsOptions));
        if (tlsOptions)
            this.servers.push(await this.listen(securePort, true, tlsOptions));
        this.running = true;
        await logMailEvent("imap", "IMAP daemon listening", { imap: port, imaps: tlsOptions ? securePort : null });
    }

    private listen(port: number, implicitTls: boolean, tlsOptions: Awaited<ReturnType<typeof loadTlsOptions>>): Promise<net.Server> {
        return new Promise((resolve, reject) => {
            const handler = (socket: net.Socket) => {
                const session: ImapSession = new ImapSession(socket, () => this.sessions.delete(session));
                this.sessions.add(session);
                void session.begin();
            };
            const server = implicitTls && tlsOptions
                ? tls.createServer({ key: tlsOptions.key, cert: tlsOptions.cert, minVersion: "TLSv1.2" }, handler as any)
                : net.createServer(handler);
            server.once("error", reject);
            server.listen(port, () => resolve(server));
        });
    }

    async stop(): Promise<void> {
        for (const session of this.sessions)
            session.destroy();
        await Promise.all(this.servers.map((s) => new Promise<void>((done) => s.close(() => done()))));
        this.servers = [];
        this.running = false;
    }
}

interface Selected {
    folder: MailFolder;
    readOnly: boolean;
}

class ImapSession {
    private state: State = "not-authenticated";
    private mailbox: AuthenticatedMailbox | null = null;
    private selected: Selected | null = null;
    private buffer = "";
    private pendingLiteral: { size: number; prefix: string } | null = null;
    private continuation: ((line: string) => void) | null = null;
    private idle = false;
    private idleTimer: NodeJS.Timeout | null = null;
    private idleSnapshot = "";
    private closed = false;

    constructor(private socket: net.Socket, private onClose: () => void) {
        socket.setEncoding("binary");
        socket.setTimeout(30 * 60 * 1000);
        socket.on("timeout", () => this.destroy());
        socket.on("close", () => this.teardown());
        socket.on("error", () => this.teardown());
    }

    destroy(): void {
        this.closed = true;
        this.stopIdleTimer();
        try { this.socket.destroy(); } catch { /* already closed */ }
        this.onClose();
    }

    private teardown(): void {
        if (this.closed)
            return;
        this.closed = true;
        this.stopIdleTimer();
        this.onClose();
    }

    private stopIdleTimer(): void {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
    }

    async begin(): Promise<void> {
        this.send(`* OK [CAPABILITY ${this.capabilities()}] Rayomand Mail IMAP4rev1 ready`);
        this.socket.on("data", (chunk: string | Buffer) => this.onData(chunk.toString()));
    }

    private capabilities(): string {
        const caps = ["IMAP4rev1", "AUTH=PLAIN", "AUTH=LOGIN", "UIDPLUS", "MOVE", "IDLE", "NAMESPACE", "UNSELECT"];
        if (!this.isEncrypted())
            caps.push("STARTTLS");
        return caps.join(" ");
    }

    private isEncrypted(): boolean {
        return !!(this.socket as any).encrypted;
    }

    private onData(chunk: string): void {
        if (this.closed)
            return;
        if (this.continuation) {
            const resolver = this.continuation;
            this.continuation = null;
            resolver(chunk.toString().replace(/\r?\n$/, "").trim());
            return;
        }
        this.buffer += chunk;
        this.processBuffer();
    }

    private processBuffer(): void {
        for (;;) {
            if (this.pendingLiteral) {
                const { size, prefix } = this.pendingLiteral;
                if (this.buffer.length < size)
                    return;
                const literal = this.buffer.slice(0, size);
                this.pendingLiteral = null;
                this.buffer = this.buffer.slice(size);
                if (this.buffer.startsWith("\r\n"))
                    this.buffer = this.buffer.slice(2);
                else if (this.buffer.startsWith("\n"))
                    this.buffer = this.buffer.slice(1);
                void this.handleLine(`${prefix}{${size}}\r\n${literal}`);
                continue;
            }
            const newline = this.buffer.indexOf("\n");
            if (newline === -1)
                return;
            let line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            if (line.endsWith("\r"))
                line = line.slice(0, -1);
            if (!line.length)
                continue;

            const literalMatch = /\{(\d+)\+?\}$/.exec(line);
            if (literalMatch) {
                const size = Number(literalMatch[1]);
                if (size > MAX_LITERAL) {
                    this.send("* NO Literal too large");
                    continue;
                }
                this.pendingLiteral = { size, prefix: line.slice(0, literalMatch.index) };
                this.send("+ Ready for literal data");
                continue;
            }
            if (line.length > MAX_LINE) {
                this.send("* BAD Command line too long");
                continue;
            }
            void this.handleLine(line);
        }
    }

    private send(line: string): void {
        if (this.closed)
            return;
        try { this.socket.write(line + "\r\n", "binary"); } catch { /* peer gone */ }
    }

    private async handleLine(line: string): Promise<void> {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        if (this.idle) {
            if (/^DONE$/i.test(trimmed)) {
                this.finishIdle("");
                return;
            }
            this.send("* BAD Only DONE is accepted while idling");
            return;
        }

        const space = trimmed.indexOf(" ");
        const tag = space === -1 ? trimmed : trimmed.slice(0, space);
        const rest = space === -1 ? "" : trimmed.slice(space + 1);
        if (!tag || tag.length > 48 || /[^A-Za-z0-9._-]/.test(tag)) {
            this.send("* BAD Invalid tag");
            return;
        }
        const cmdSpace = rest.indexOf(" ");
        const command = (cmdSpace === -1 ? rest : rest.slice(0, cmdSpace)).toUpperCase();
        const args = cmdSpace === -1 ? "" : rest.slice(cmdSpace + 1);

        try {
            await this.dispatch(tag, command, args);
        }
        catch (error) {
            await logMailEvent("imap", `Command ${command} failed`, (error as Error).message, "warn");
            this.send(`${tag} NO ${sanitize((error as Error).message || "Command failed")}`);
        }
    }

    private async dispatch(tag: string, command: string, args: string): Promise<void> {
        switch (command) {
            case "CAPABILITY":
                this.send(`* CAPABILITY ${this.capabilities()}`);
                this.send(`${tag} OK CAPABILITY completed`);
                return;
            case "NOOP":
                this.send(`${tag} OK NOOP completed`);
                return;
            case "LOGOUT":
                this.send("* BYE Rayomand Mail logging out");
                this.send(`${tag} OK LOGOUT completed`);
                this.destroy();
                return;
            case "STARTTLS":
                await this.startTls(tag);
                return;
            case "LOGIN":
                await this.login(tag, args);
                return;
            case "AUTHENTICATE":
                await this.authenticate(tag, args);
                return;
            case "LIST":
            case "LSUB":
                await this.listMailboxes(tag, args, command === "LSUB");
                return;
            case "CREATE":
                await this.createMailbox(tag, args);
                return;
            case "DELETE":
                await this.deleteMailbox(tag, args);
                return;
            case "RENAME":
                await this.renameMailbox(tag, args);
                return;
            case "SUBSCRIBE":
            case "UNSUBSCRIBE":
                await this.subscribe(tag, args, command === "SUBSCRIBE");
                return;
            case "STATUS":
                await this.status(tag, args);
                return;
            case "APPEND":
                await this.append(tag, args);
                return;
            case "SELECT":
            case "EXAMINE":
                await this.select(tag, args, command === "EXAMINE");
                return;
            case "UNSELECT":
                this.selected = null;
                this.state = "authenticated";
                this.send(`${tag} OK UNSELECT completed`);
                return;
            case "CHECK":
                if (!this.requireSelected(tag)) return;
                this.send(`${tag} OK CHECK completed`);
                return;
            case "CLOSE":
                await this.closeMailbox(tag);
                return;
            case "EXPUNGE":
                await this.expunge(tag);
                return;
            case "SEARCH":
                await this.search(tag, args, false);
                return;
            case "FETCH":
                await this.fetch(tag, args, false);
                return;
            case "STORE":
                await this.store(tag, args, false);
                return;
            case "COPY":
                await this.copy(tag, args, false, false);
                return;
            case "MOVE":
                await this.copy(tag, args, false, true);
                return;
            case "UID":
                await this.uid(tag, args);
                return;
            case "IDLE":
                this.startIdle(tag);
                return;
            case "NAMESPACE":
                this.send(`* NAMESPACE (("" "/")) NIL NIL`);
                this.send(`${tag} OK NAMESPACE completed`);
                return;
            case "ID":
                this.send(`* ID ("name" "Rayomand Mail" "version" "1.0")`);
                this.send(`${tag} OK ID completed`);
                return;
            default:
                this.send(`${tag} BAD Unknown command`);
        }
    }

    private requireAuth(tag: string): boolean {
        if (!this.mailbox) {
            this.send(`${tag} NO Authenticate first`);
            return false;
        }
        return true;
    }

    private requireSelected(tag: string): boolean {
        if (!this.requireAuth(tag))
            return false;
        if (!this.selected) {
            this.send(`${tag} BAD Select a mailbox first`);
            return false;
        }
        return true;
    }

    // ── Authentication ───────────────────────────────────────────────────────
    private async startTls(tag: string): Promise<void> {
        if (this.isEncrypted()) {
            this.send(`${tag} BAD Already using TLS`);
            return;
        }
        const options = await loadTlsOptions();
        if (!options) {
            this.send(`${tag} NO TLS is not available`);
            return;
        }
        this.send(`${tag} OK Begin TLS negotiation`);
        this.socket.removeAllListeners("data");
        const secured = new tls.TLSSocket(this.socket, {
            isServer: true, key: options.key, cert: options.cert, minVersion: "TLSv1.2",
        } as any);
        await new Promise<void>((resolve) => secured.once("secure", () => resolve()));
        this.socket = secured as unknown as net.Socket;
        this.buffer = "";
        this.socket.setEncoding("binary");
        this.socket.on("data", (chunk: string | Buffer) => this.onData(chunk.toString()));
        this.socket.on("close", () => this.teardown());
        this.socket.on("error", () => this.teardown());
    }

    private async login(tag: string, args: string): Promise<void> {
        if (this.mailbox) {
            this.send(`${tag} BAD Already authenticated`);
            return;
        }
        const parser = new ImapParser(args);
        const username = parser.readToken().value;
        const password = parser.readToken().value;
        await this.completeLogin(tag, username, password);
    }

    private async authenticate(tag: string, args: string): Promise<void> {
        if (this.mailbox) {
            this.send(`${tag} BAD Already authenticated`);
            return;
        }
        const mechanism = (args.split(" ")[0] || "").toUpperCase();
        let initial = args.split(" ").slice(1).join(" ").trim();
        if (mechanism === "PLAIN") {
            if (!initial) {
                this.send("+ ");
                initial = await this.readContinuation();
            }
            const decoded = Buffer.from(initial, "base64").toString("utf8");
            const parts = decoded.split("\0");
            await this.completeLogin(tag, parts[1] || "", parts[2] || "");
            return;
        }
        if (mechanism === "LOGIN") {
            if (!initial) {
                this.send("+ VXNlcm5hbWU6");
                initial = await this.readContinuation();
            }
            const username = Buffer.from(initial, "base64").toString("utf8");
            this.send("+ UGFzc3dvcmQ6");
            const password = Buffer.from(await this.readContinuation(), "base64").toString("utf8");
            await this.completeLogin(tag, username, password);
            return;
        }
        this.send(`${tag} NO Unsupported authentication mechanism`);
    }

    private readContinuation(): Promise<string> {
        return new Promise((resolve) => { this.continuation = resolve; });
    }

    private async completeLogin(tag: string, username: string, password: string): Promise<void> {
        const ip = this.socket.remoteAddress || "";
        const mailbox = await authenticateMailbox(username, password, ip);
        if (!mailbox) {
            await logMailEvent("imap", "Login failed", { user: username, ip }, "warn");
            this.send(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`);
            return;
        }
        this.mailbox = mailbox;
        this.state = "authenticated";
        this.send(`${tag} OK [CAPABILITY ${this.capabilities()}] Logged in`);
    }

    // ── Mailboxes ────────────────────────────────────────────────────────────
    private async listMailboxes(tag: string, args: string, subscribedOnly: boolean): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const parser = new ImapParser(args);
        parser.readToken(); // reference
        const pattern = parser.readToken().value || "*";
        const matcher = globToRegex(pattern);
        const label = subscribedOnly ? "LSUB" : "LIST";
        this.send(`* ${label} (\\HasNoChildren) "/" ""`);
        for (const folder of await listFolders(this.mailbox!.id)) {
            if (subscribedOnly && !folder.subscribed)
                continue;
            const name = encodeMailboxName(folder.name);
            if (!matcher.test(name))
                continue;
            const attrs = folder.special_use || "\\HasNoChildren";
            this.send(`* ${label} (${attrs}) "/" ${quote(name)}`);
        }
        this.send(`${tag} OK ${label} completed`);
    }

    private async createMailbox(tag: string, args: string): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const name = decodeMailboxName(new ImapParser(args).readToken().value);
        await createFolder(this.mailbox!.id, name);
        this.send(`${tag} OK CREATE completed`);
    }

    private async deleteMailbox(tag: string, args: string): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const name = decodeMailboxName(new ImapParser(args).readToken().value);
        const folder = await folderByName(this.mailbox!.id, name);
        if (!folder) {
            this.send(`${tag} NO No such mailbox`);
            return;
        }
        await deleteFolder(this.mailbox!.id, folder.id);
        if (this.selected?.folder.id === folder.id) {
            this.selected = null;
            this.state = "authenticated";
        }
        this.send(`${tag} OK DELETE completed`);
    }

    private async renameMailbox(tag: string, args: string): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const parser = new ImapParser(args);
        const from = decodeMailboxName(parser.readToken().value);
        const to = decodeMailboxName(parser.readToken().value);
        const folder = await folderByName(this.mailbox!.id, from);
        if (!folder) {
            this.send(`${tag} NO No such mailbox`);
            return;
        }
        await renameFolder(this.mailbox!.id, folder.id, to);
        this.send(`${tag} OK RENAME completed`);
    }

    private async subscribe(tag: string, args: string, subscribe: boolean): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const name = decodeMailboxName(new ImapParser(args).readToken().value);
        const folder = await folderByName(this.mailbox!.id, name);
        if (!folder) {
            this.send(`${tag} NO No such mailbox`);
            return;
        }
        const { getDb } = await import("../../db");
        await getDb().execute("UPDATE mail_folders SET subscribed=$1 WHERE id=$2", subscribe ? 1 : 0, folder.id);
        this.send(`${tag} OK ${subscribe ? "SUBSCRIBE" : "UNSUBSCRIBE"} completed`);
    }

    private async status(tag: string, args: string): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const parser = new ImapParser(args);
        const name = decodeMailboxName(parser.readToken().value);
        const items = parser.readList().map((t) => t.value.toUpperCase());
        const folder = await folderByName(this.mailbox!.id, name);
        if (!folder) {
            this.send(`${tag} NO No such mailbox`);
            return;
        }
        const stats = await folderStats(this.mailbox!.id, folder.id);
        const values: string[] = [];
        for (const item of items) {
            if (item === "MESSAGES") values.push(`MESSAGES ${stats.messages}`);
            else if (item === "RECENT") values.push(`RECENT ${stats.recent}`);
            else if (item === "UIDNEXT") values.push(`UIDNEXT ${folder.uidnext}`);
            else if (item === "UIDVALIDITY") values.push(`UIDVALIDITY ${folder.uidvalidity}`);
            else if (item === "UNSEEN") values.push(`UNSEEN ${stats.unseen}`);
            else if (item === "SIZE") values.push(`SIZE ${stats.size}`);
        }
        this.send(`* STATUS ${quote(encodeMailboxName(folder.name))} (${values.join(" ")})`);
        this.send(`${tag} OK STATUS completed`);
    }

    private async append(tag: string, args: string): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const parser = new ImapParser(args);
        const name = decodeMailboxName(parser.readToken().value);
        let flags: string[] = [];
        if (parser.peek() === "(")
            flags = parser.readList().map((t) => t.value);
        if (parser.peek() === '"')
            parser.readToken();
        const literal = parser.readToken();
        if (literal.type !== "literal") {
            this.send(`${tag} BAD APPEND requires a literal message`);
            return;
        }
        const folder = await folderByName(this.mailbox!.id, name);
        if (!folder) {
            this.send(`${tag} NO [TRYCREATE] No such mailbox`);
            return;
        }
        const raw = Buffer.from(literal.value, "binary");
        const parsed = await parseMessage(raw).catch(() => null);
        const created = await appendMessage({
            accountId: this.mailbox!.id,
            folderId: folder.id,
            raw,
            flags: {
                seen: flags.some((f) => /^\\seen$/i.test(f)),
                flagged: flags.some((f) => /^\\flagged$/i.test(f)),
                answered: flags.some((f) => /^\\answered$/i.test(f)),
                draft: flags.some((f) => /^\\draft$/i.test(f)),
            },
            meta: parsed ? {
                messageId: parsed.messageId, inReplyTo: parsed.inReplyTo, refs: parsed.references.join(" "),
                from: parsed.from, to: parsed.to, cc: parsed.cc, bcc: parsed.bcc, replyTo: parsed.replyTo,
                subject: parsed.subject, sentAt: parsed.date.toISOString(), snippet: parsed.snippet,
                hasAttachments: parsed.attachments.length > 0,
            } : {},
        });
        this.send(`${tag} OK [APPENDUID ${folder.uidvalidity} ${created.uid}] APPEND completed`);
    }

    private async select(tag: string, args: string, readOnly: boolean): Promise<void> {
        if (!this.requireAuth(tag))
            return;
        const name = decodeMailboxName(new ImapParser(args).readToken().value);
        const folder = await folderByName(this.mailbox!.id, name);
        if (!folder) {
            this.send(`${tag} NO No such mailbox`);
            return;
        }
        this.selected = { folder, readOnly };
        this.state = "selected";
        const stats = await folderStats(this.mailbox!.id, folder.id);
        this.send("* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft \\Recent)");
        this.send("* OK [PERMANENTFLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft \\*)] Flags permitted");
        this.send(`* ${stats.messages} EXISTS`);
        this.send(`* ${stats.recent} RECENT`);
        this.send(`* OK [UIDVALIDITY ${folder.uidvalidity}] UIDs valid`);
        this.send(`* OK [UIDNEXT ${folder.uidnext}] Predicted next UID`);
        this.send(`${tag} OK [READ-${readOnly ? "ONLY" : "WRITE"}] ${readOnly ? "EXAMINE" : "SELECT"} completed`);
        if (!readOnly)
            await clearRecent(this.mailbox!.id, folder.id);
    }

    private async closeMailbox(tag: string): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        if (!this.selected!.readOnly)
            await expungeFolder(this.mailbox!.id, this.selected!.folder.id);
        this.selected = null;
        this.state = "authenticated";
        this.send(`${tag} OK CLOSE completed`);
    }

    private async expunge(tag: string): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        if (this.selected!.readOnly) {
            this.send(`${tag} NO Mailbox is read-only`);
            return;
        }
        const rows = await messagesInFolder(this.mailbox!.id, this.selected!.folder.id, 5000);
        const removed: number[] = [];
        rows.forEach((m, index) => { if (m.deleted) removed.push(index + 1); });
        await expungeFolder(this.mailbox!.id, this.selected!.folder.id);
        for (const position of removed.reverse())
            this.send(`* ${position} EXPUNGE`);
        this.send(`${tag} OK EXPUNGE completed`);
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    private async loadMessages(): Promise<StoredMessage[]> {
        return messagesInFolder(this.mailbox!.id, this.selected!.folder.id, 5000);
    }

    private resolveTargets(messages: StoredMessage[], sequence: string, useUid: boolean): StoredMessage[] {
        if (useUid) {
            const max = messages.length ? messages[messages.length - 1].uid : 0;
            const set = new Set(parseSequenceSet(sequence, max));
            return messages.filter((m) => set.has(m.uid));
        }
        return parseSequenceSet(sequence, messages.length).map((p) => messages[p - 1]).filter(Boolean);
    }

    private async search(tag: string, args: string, useUid: boolean): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        const messages = await this.loadMessages();
        const matched = await runSearch(messages, args.replace(/\s+CHARSET\s+\S+/i, ""));
        const out = matched
            .map((m) => (useUid ? m.uid : messages.indexOf(m) + 1))
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
        this.send(`* SEARCH${out.length ? " " + out.join(" ") : ""}`);
        this.send(`${tag} OK ${useUid ? "UID SEARCH" : "SEARCH"} completed`);
    }

    private async fetch(tag: string, args: string, useUid: boolean): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        const parser = new ImapParser(args);
        const sequence = parser.readToken().value;
        const request = parseFetchItems(new ImapParser(parser.rest().trim()));
        const messages = await this.loadMessages();
        const targets = this.resolveTargets(messages, sequence, useUid);

        for (const message of targets) {
            const raw = await readRaw(message);
            const body = await buildFetch(message, message.uid, request, raw);
            const seq = useUid ? message.uid : messages.indexOf(message) + 1;
            this.send(`* ${seq} FETCH (${body})`);
            if (!this.selected!.readOnly && !message.seen) {
                await setFlags(this.mailbox!.id, [message.id], { seen: true });
                message.seen = true;
            }
        }
        this.send(`${tag} OK ${useUid ? "UID FETCH" : "FETCH"} completed`);
    }

    private async store(tag: string, args: string, useUid: boolean): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        if (this.selected!.readOnly) {
            this.send(`${tag} NO Mailbox is read-only`);
            return;
        }
        const parser = new ImapParser(args);
        const sequence = parser.readToken().value;
        let operation = parser.readAtom().toUpperCase();
        const silent = /\.SILENT$/.test(operation);
        operation = operation.replace(/\.SILENT$/, "");
        const tokens = parser.peek() === "(" ? parser.readList().map((t) => t.value) : [parser.readToken().value];
        const mode = operation.startsWith("+") ? "add" : operation.startsWith("-") ? "remove" : "replace";

        const messages = await this.loadMessages();
        for (const message of this.resolveTargets(messages, sequence, useUid)) {
            const flags = applyFlagChange(message, tokens, mode);
            await setFlags(this.mailbox!.id, [message.id], flags);
            if (!silent) {
                const seq = useUid ? message.uid : messages.indexOf(message) + 1;
                this.send(`* ${seq} FETCH (${useUid ? `UID ${message.uid} ` : ""}FLAGS (${flagNames(flags).join(" ")}))`);
            }
        }
        this.send(`${tag} OK ${useUid ? "UID STORE" : "STORE"} completed`);
    }

    private async copy(tag: string, args: string, useUid: boolean, move: boolean): Promise<void> {
        if (!this.requireSelected(tag))
            return;
        const parser = new ImapParser(args);
        const sequence = parser.readToken().value;
        const destName = decodeMailboxName(parser.readToken().value);
        const dest = await folderByName(this.mailbox!.id, destName);
        if (!dest) {
            this.send(`${tag} NO [TRYCREATE] No such mailbox`);
            return;
        }
        const messages = await this.loadMessages();
        const ids = this.resolveTargets(messages, sequence, useUid).map((m) => m.id);
        if (!ids.length) {
            this.send(`${tag} OK ${useUid ? "UID " : ""}${move ? "MOVE" : "COPY"} completed`);
            return;
        }
        const created = move
            ? await moveMessages(this.mailbox!.id, ids, dest.id)
            : await copyMessages(this.mailbox!.id, ids, dest.id);
        if (move) {
            for (const message of messages.filter((m) => ids.includes(m.id)))
                this.send(`* ${messages.indexOf(message) + 1} EXPUNGE`);
        }
        this.send(`${tag} OK [COPYUID ${dest.uidvalidity} ${ids.join(",")} ${created.join(",")}] ${move ? "MOVE" : "COPY"} completed`);
    }

    private async uid(tag: string, args: string): Promise<void> {
        const space = args.indexOf(" ");
        const sub = (space === -1 ? args : args.slice(0, space)).toUpperCase();
        const rest = space === -1 ? "" : args.slice(space + 1);
        switch (sub) {
            case "FETCH": return this.fetch(tag, rest, true);
            case "STORE": return this.store(tag, rest, true);
            case "SEARCH": return this.search(tag, rest, true);
            case "COPY": return this.copy(tag, rest, true, false);
            case "MOVE": return this.copy(tag, rest, true, true);
            case "EXPUNGE": {
                if (!this.requireSelected(tag)) return;
                const set = new Set(parseSequenceSet(rest, 999999));
                const rows = await messagesInFolder(this.mailbox!.id, this.selected!.folder.id, 5000);
                const ids = rows.filter((m) => set.has(m.uid)).map((m) => m.id);
                const { purgeMessages } = await import("./store");
                await purgeMessages(this.mailbox!.id, ids);
                this.send(`${tag} OK UID EXPUNGE completed`);
                return;
            }
            default:
                this.send(`${tag} BAD Unsupported UID command`);
        }
    }

    // ── IDLE ─────────────────────────────────────────────────────────────────
    private startIdle(tag: string): void {
        if (!this.requireSelected(tag))
            return;
        this.idle = true;
        this.send("+ idling");
        void this.snapshot().then((snapshot) => { this.idleSnapshot = snapshot; });
        this.idleTimer = setInterval(() => {
            void (async () => {
                if (!this.selected || !this.idle)
                    return;
                const snapshot = await this.snapshot();
                if (snapshot !== this.idleSnapshot) {
                    this.idleSnapshot = snapshot;
                    const stats = await folderStats(this.mailbox!.id, this.selected.folder.id);
                    this.send(`* ${stats.messages} EXISTS`);
                    this.send(`* ${stats.recent} RECENT`);
                }
            })();
        }, 15_000);
    }

    private finishIdle(tag: string): void {
        this.idle = false;
        this.stopIdleTimer();
        this.send(`${tag} OK IDLE terminated`);
    }

    private async snapshot(): Promise<string> {
        if (!this.selected)
            return "";
        const stats = await folderStats(this.mailbox!.id, this.selected.folder.id);
        return `${stats.messages}:${stats.unseen}:${stats.recent}:${stats.lastUid}`;
    }
}

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
}

function sanitize(value: string): string {
    return (value || "").replace(/[\r\n]/g, " ").slice(0, 300);
}
