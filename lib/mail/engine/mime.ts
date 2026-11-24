import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { formatAddressList, type MailAddress } from "./address";

// MIME construction and parsing. Building is done by hand so we control the
// exact header set (important for DKIM stability); parsing delegates to
// mailparser, which handles the long tail of real-world messages.

export interface AttachmentInput {
    filename: string;
    contentType: string;
    content: Buffer;
    contentId?: string;
    inline?: boolean;
}

export interface ComposeInput {
    from: MailAddress;
    to: MailAddress[];
    cc?: MailAddress[];
    bcc?: MailAddress[];
    replyTo?: MailAddress[];
    subject: string;
    text: string;
    html?: string;
    attachments?: AttachmentInput[];
    inReplyTo?: string;
    references?: string[];
    date?: Date;
    messageId?: string;
}

export interface ParsedAttachment {
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
    inline: boolean;
}

export interface AttachmentBytes extends ParsedAttachment {
    content: Buffer;
}

export interface ParsedMessage {
    messageId: string;
    inReplyTo: string;
    references: string[];
    subject: string;
    date: Date;
    from: MailAddress | null;
    to: MailAddress[];
    cc: MailAddress[];
    bcc: MailAddress[];
    replyTo: MailAddress[];
    text: string;
    html: string;
    snippet: string;
    attachments: ParsedAttachment[];
    headerLines: string;
}

// A MIME entity is its own header block plus a body. Keeping the two apart is
// what makes nesting correct.
interface Entity {
    headers: string[];
    body: Buffer;
}

function foldHeader(name: string, value: string): string {
    const flat = value.replace(/\r?\n/g, " ");
    if (name.length + flat.length + 2 <= 78)
        return `${name}: ${flat}`;
    const words = flat.split(" ");
    const lines: string[] = [];
    let line = `${name}:`;
    for (const word of words) {
        if ((line + " " + word).length > 76) {
            lines.push(line);
            line = " " + word;
        }
        else {
            line += " " + word;
        }
    }
    lines.push(line);
    return lines.join("\r\n");
}

function base64Lines(buffer: Buffer): string {
    return buffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function encodeHeaderValue(value: string): string {
    if (/^[\x20-\x7e]*$/.test(value))
        return value;
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function boundary(tag: string): string {
    return `----=_Rayomand_${tag}_${randomUUID().replace(/-/g, "")}`;
}

function sanitizeFilename(name: string): string {
    return (name || "file").replace(/["\r\n\\]/g, "_").slice(0, 200);
}

function serialize(entity: Entity): Buffer {
    return Buffer.concat([
        Buffer.from(entity.headers.join("\r\n") + "\r\n\r\n", "utf8"),
        entity.body,
    ]);
}

function leaf(contentType: string, content: Buffer, disposition?: { type: string; filename: string; contentId?: string }): Entity {
    const headers = [
        `Content-Type: ${contentType}`,
        "Content-Transfer-Encoding: base64",
    ];
    if (disposition) {
        headers.push(`Content-Disposition: ${disposition.type}; filename="${sanitizeFilename(disposition.filename)}"`);
        if (disposition.contentId)
            headers.push(`Content-ID: <${disposition.contentId}>`);
    }
    return { headers, body: Buffer.from(base64Lines(content) + "\r\n", "utf8") };
}

// Join child entities under a multipart boundary. Children are serialized with
// their own headers, so nesting stays well-formed at any depth.
function multipart(type: string, children: Entity[]): Entity {
    const b = boundary(type);
    const chunks: Buffer[] = [];
    for (const child of children)
        chunks.push(Buffer.from(`--${b}\r\n`, "utf8"), serialize(child), Buffer.from("\r\n", "utf8"));
    chunks.push(Buffer.from(`--${b}--\r\n`, "utf8"));
    return {
        headers: [`Content-Type: multipart/${type}; boundary="${b}"`],
        body: Buffer.concat(chunks),
    };
}

export function buildMime(input: ComposeInput): Buffer {
    const date = input.date || new Date();
    const domain = input.from.address.split("@")[1] || "localhost";
    const messageId = input.messageId || `<${randomUUID()}@${domain}>`;

    const textLeaf = leaf("text/plain; charset=utf-8", Buffer.from(input.text || "", "utf8"));
    const htmlLeaf = input.html ? leaf("text/html; charset=utf-8", Buffer.from(input.html, "utf8")) : null;
    const attachments = input.attachments || [];

    let content: Entity;
    if (htmlLeaf) {
        content = multipart("alternative", [textLeaf, htmlLeaf]);
    }
    else {
        content = textLeaf;
    }

    if (attachments.length) {
        const attachmentParts = attachments.map((att) => leaf(
            att.contentType || "application/octet-stream",
            att.content,
            { type: att.inline ? "inline" : "attachment", filename: att.filename, contentId: att.contentId },
        ));
        content = multipart("mixed", [content, ...attachmentParts]);
    }

    const headers: string[] = [
        foldHeader("Date", date.toUTCString()),
        foldHeader("From", formatAddressList([input.from])),
    ];
    if (input.to.length)
        headers.push(foldHeader("To", formatAddressList(input.to)));
    if (input.cc?.length)
        headers.push(foldHeader("Cc", formatAddressList(input.cc)));
    if (input.bcc?.length)
        headers.push(foldHeader("Bcc", formatAddressList(input.bcc)));
    if (input.replyTo?.length)
        headers.push(foldHeader("Reply-To", formatAddressList(input.replyTo)));
    headers.push(foldHeader("Subject", encodeHeaderValue(input.subject || "")));
    headers.push(foldHeader("Message-ID", messageId));
    if (input.inReplyTo)
        headers.push(foldHeader("In-Reply-To", input.inReplyTo));
    if (input.references?.length)
        headers.push(foldHeader("References", input.references.join(" ")));
    headers.push("MIME-Version: 1.0");
    headers.push(...content.headers);

    return Buffer.concat([
        Buffer.from(headers.join("\r\n") + "\r\n\r\n", "utf8"),
        content.body,
    ]);
}

export async function parseMessage(raw: Buffer): Promise<ParsedMessage> {
    const parsed = await simpleParser(raw, { skipImageLinks: true });
    const text = parsed.text || "";
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const snippetSource = (text || stripTags(html)).replace(/\s+/g, " ").trim();
    const headerLines = raw.toString("utf8").split(/\r?\n\r?\n/)[0] || "";
    const attachments: ParsedAttachment[] = (parsed.attachments || []).map((a) => ({
        filename: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        size: a.size || a.content?.length || 0,
        contentId: a.cid || undefined,
        inline: a.contentDisposition === "inline",
    }));
    return {
        messageId: parsed.messageId || "",
        inReplyTo: (parsed.inReplyTo as string) || "",
        references: Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [String(parsed.references)] : []),
        subject: parsed.subject || "",
        date: parsed.date || new Date(),
        from: parsed.from?.value?.[0] ? { name: parsed.from.value[0].name || "", address: String(parsed.from.value[0].address || "").toLowerCase() } : null,
        to: addressList(parsed.to),
        cc: addressList(parsed.cc),
        bcc: addressList(parsed.bcc),
        replyTo: addressList(parsed.replyTo),
        text,
        html,
        snippet: snippetSource.slice(0, 200),
        attachments,
        headerLines,
    };
}

export async function parseMessageWithAttachments(raw: Buffer): Promise<{ parsed: ParsedMessage; attachments: AttachmentBytes[] }> {
    const source = await simpleParser(raw, { skipImageLinks: true });
    const parsed = await parseMessage(raw);
    const attachments: AttachmentBytes[] = (source.attachments || []).map((a) => ({
        filename: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        size: a.size || a.content?.length || 0,
        contentId: a.cid || undefined,
        inline: a.contentDisposition === "inline",
        content: a.content,
    }));
    return { parsed, attachments };
}

function addressList(value: any): MailAddress[] {
    if (!value)
        return [];
    const arr = Array.isArray(value) ? value : [value];
    const out: MailAddress[] = [];
    for (const entry of arr) {
        for (const v of entry?.value || []) {
            if (v.address)
                out.push({ name: v.name || "", address: String(v.address).toLowerCase() });
        }
    }
    return out;
}

export function stripTags(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export function replySubject(subject: string): string {
    const s = (subject || "").trim();
    if (/^re:/i.test(s))
        return s;
    return `Re: ${s}`.trim();
}

export function forwardSubject(subject: string): string {
    const s = (subject || "").trim();
    if (/^fwd?:/i.test(s))
        return s;
    return `Fwd: ${s}`.trim();
}
