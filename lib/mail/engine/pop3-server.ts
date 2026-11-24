import net from "node:net";
import tls from "node:tls";
import { getMailSettings, logMailEvent } from "../settings";
import { authenticateMailbox, type AuthenticatedMailbox } from "./accounts";
import { folderByName, messagesInFolder, readRaw, setFlags, type StoredMessage } from "./store";
import { loadTlsOptions } from "./tls";

// POP3 server. POP3 has no folder model: a session exposes the inbox as a flat
// numbered list. Deleting a message marks it \Deleted; QUIT commits the marks
// and the expunge runs on the next IMAP session or a maintenance pass.

type PopState = "authorization" | "transaction";

interface PopEntry {
    message: StoredMessage;
    number: number;
    deleted: boolean;
}

export class Pop3Server {
    private servers: net.Server[] = [];
    private sessions = new Set<PopSession>();
    private running = false;

    async start(): Promise<void> {
        if (this.running)
            return;
        const settings = await getMailSettings();
        if (!settings.mail_hostname) {
            await logMailEvent("pop3", "POP3 not started: mail hostname is not configured", "", "warn");
            return;
        }
        const port = Number(process.env.MAIL_POP3_PORT || 110);
        const securePort = Number(process.env.MAIL_POP3S_PORT || 995);
        const tlsOptions = await loadTlsOptions();
        this.servers.push(await this.listen(port, false, tlsOptions));
        if (tlsOptions)
            this.servers.push(await this.listen(securePort, true, tlsOptions));
        this.running = true;
        await logMailEvent("pop3", "POP3 daemon listening", { pop3: port, pop3s: tlsOptions ? securePort : null });
    }

    private listen(port: number, implicitTls: boolean, tlsOptions: Awaited<ReturnType<typeof loadTlsOptions>>): Promise<net.Server> {
        return new Promise((resolve, reject) => {
            const handler = (socket: net.Socket) => {
                const session: PopSession = new PopSession(socket, () => this.sessions.delete(session));
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

class PopSession {
    private state: PopState = "authorization";
    private mailbox: AuthenticatedMailbox | null = null;
    private entries: PopEntry[] = [];
    private buffer = "";
    private closed = false;
    private pendingUser = "";

    constructor(private socket: net.Socket, private onClose: () => void) {
        socket.setEncoding("utf8");
        socket.setTimeout(10 * 60 * 1000);
        socket.on("timeout", () => this.destroy());
        socket.on("close", () => this.teardown());
        socket.on("error", () => this.teardown());
    }

    destroy(): void {
        this.closed = true;
        try { this.socket.destroy(); } catch { /* already closed */ }
        this.onClose();
    }

    private teardown(): void {
        if (this.closed)
            return;
        this.closed = true;
        this.onClose();
    }

    async begin(): Promise<void> {
        this.reply(`+OK Rayomand Mail POP3 ready`);
        this.socket.on("data", (chunk: string | Buffer) => this.onData(chunk.toString()));
    }

    private reply(line: string): void {
        if (this.closed)
            return;
        try { this.socket.write(line + "\r\n"); } catch { /* peer gone */ }
    }

    private onData(chunk: string): void {
        if (this.closed)
            return;
        this.buffer += chunk;
        let newline: number;
        while ((newline = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, newline).replace(/\r$/, "");
            this.buffer = this.buffer.slice(newline + 1);
            void this.handle(line);
        }
    }

    private async handle(line: string): Promise<void> {
        const trimmed = line.trim();
        if (!trimmed) {
            this.reply("-ERR Empty command");
            return;
        }
        const space = trimmed.indexOf(" ");
        const command = (space === -1 ? trimmed : trimmed.slice(0, space)).toUpperCase();
        const args = space === -1 ? "" : trimmed.slice(space + 1);

        try {
            if (this.state === "authorization")
                await this.authorization(command, args);
            else
                await this.transaction(command, args);
        }
        catch (error) {
            await logMailEvent("pop3", `Command ${command} failed`, (error as Error).message, "warn");
            this.reply(`-ERR ${(error as Error).message || "Command failed"}`);
        }
    }

    private async authorization(command: string, args: string): Promise<void> {
        switch (command) {
            case "CAPA":
                this.reply("+OK Capability list follows");
                this.reply("USER");
                this.reply("UIDL");
                this.reply("TOP");
                this.reply("RESP-CODES");
                if (!(this.socket as any).encrypted)
                    this.reply("STLS");
                this.reply(".");
                return;
            case "STLS":
                await this.startTls();
                return;
            case "USER":
                this.pendingUser = args.trim();
                this.reply("+OK Password required");
                return;
            case "PASS": {
                if (!this.pendingUser) {
                    this.reply("-ERR Send USER first");
                    return;
                }
                const mailbox = await authenticateMailbox(this.pendingUser, args, this.socket.remoteAddress || "");
                if (!mailbox) {
                    this.reply("-ERR [AUTH] Invalid credentials");
                    return;
                }
                this.mailbox = mailbox;
                const inbox = await folderByName(mailbox.id, "INBOX");
                const messages = inbox ? await messagesInFolder(mailbox.id, inbox.id, 5000) : [];
                this.entries = messages
                    .filter((m) => !m.deleted)
                    .map((message, index) => ({ message, number: index + 1, deleted: false }));
                this.state = "transaction";
                this.reply(`+OK Mailbox locked and ready, ${this.entries.length} messages`);
                return;
            }
            case "QUIT":
                this.reply("+OK Bye");
                this.destroy();
                return;
            case "APOP":
                this.reply("-ERR APOP is not supported");
                return;
            default:
                this.reply("-ERR Unknown command");
        }
    }

    private async startTls(): Promise<void> {
        const options = await loadTlsOptions();
        if (!options) {
            this.reply("-ERR TLS is not available");
            return;
        }
        this.reply("+OK Begin TLS negotiation");
        this.socket.removeAllListeners("data");
        const secured = new tls.TLSSocket(this.socket, {
            isServer: true, key: options.key, cert: options.cert, minVersion: "TLSv1.2",
        } as any);
        await new Promise<void>((resolve) => secured.once("secure", () => resolve()));
        this.socket = secured as unknown as net.Socket;
        this.socket.setEncoding("utf8");
        this.buffer = "";
        this.socket.on("data", (chunk: string | Buffer) => this.onData(chunk.toString()));
        this.socket.on("close", () => this.teardown());
        this.socket.on("error", () => this.teardown());
    }

    private async transaction(command: string, args: string): Promise<void> {
        switch (command) {
            case "STAT": {
                const total = this.entries.filter((e) => !e.deleted).reduce((sum, e) => sum + e.message.size, 0);
                this.reply(`+OK ${this.entries.filter((e) => !e.deleted).length} ${total}`);
                return;
            }
            case "LIST": {
                if (args.trim()) {
                    const entry = this.lookup(args.trim());
                    if (!entry) return;
                    this.reply(`+OK ${entry.number} ${entry.message.size}`);
                    return;
                }
                this.reply(`+OK ${this.entries.filter((e) => !e.deleted).length} messages`);
                for (const entry of this.entries.filter((e) => !e.deleted))
                    this.reply(`${entry.number} ${entry.message.size}`);
                this.reply(".");
                return;
            }
            case "UIDL": {
                if (args.trim()) {
                    const entry = this.lookup(args.trim());
                    if (!entry) return;
                    this.reply(`+OK ${entry.number} ${uidlFor(entry)}`);
                    return;
                }
                this.reply("+OK unique-id listing follows");
                for (const entry of this.entries.filter((e) => !e.deleted))
                    this.reply(`${entry.number} ${uidlFor(entry)}`);
                this.reply(".");
                return;
            }
            case "RETR": {
                const entry = this.lookup(args.trim());
                if (!entry) return;
                const raw = await readRaw(entry.message);
                this.reply(`+OK ${entry.message.size} octets`);
                this.writeMessage(raw);
                return;
            }
            case "TOP": {
                const parts = args.trim().split(/\s+/);
                const entry = this.lookup(parts[0]);
                if (!entry) return;
                const lines = Math.max(0, Number(parts[1]) || 0);
                const raw = await readRaw(entry.message);
                const text = raw.toString("binary");
                const split = text.indexOf("\r\n\r\n");
                const header = split === -1 ? text : text.slice(0, split + 4);
                const bodyLines = (split === -1 ? "" : text.slice(split + 4)).split("\r\n").slice(0, lines).join("\r\n");
                this.reply("+OK Top of message follows");
                this.writeMessage(Buffer.from(header + bodyLines, "binary"));
                return;
            }
            case "DELE": {
                const entry = this.lookup(args.trim());
                if (!entry) return;
                entry.deleted = true;
                this.reply(`+OK Message ${entry.number} deleted`);
                return;
            }
            case "RSET":
                for (const entry of this.entries)
                    entry.deleted = false;
                this.reply("+OK Reset");
                return;
            case "NOOP":
                this.reply("+OK");
                return;
            case "QUIT":
                await this.commit();
                this.reply("+OK Bye");
                this.destroy();
                return;
            default:
                this.reply("-ERR Unknown command");
        }
    }

    private lookup(value: string): PopEntry | null {
        const number = Number(value);
        const entry = this.entries.find((e) => e.number === number && !e.deleted);
        if (!entry) {
            this.reply("-ERR No such message");
            return null;
        }
        return entry;
    }

    private writeMessage(raw: Buffer): void {
        // POP3 dot-stuffing: a line starting with "." is sent with an extra dot.
        const text = raw.toString("binary").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
        try {
            this.socket.write(text + "\r\n.\r\n", "binary");
        }
        catch { /* peer gone */ }
    }

    private async commit(): Promise<void> {
        if (!this.mailbox)
            return;
        const ids = this.entries.filter((e) => e.deleted).map((e) => e.message.id);
        if (ids.length)
            await setFlags(this.mailbox.id, ids, { deleted: true });
    }
}

function uidlFor(entry: PopEntry): string {
    return `${entry.message.id}-${entry.message.uid}`;
}
