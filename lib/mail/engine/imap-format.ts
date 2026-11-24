import type { StoredMessage } from "./store";
import { imapDateTime } from "./imap-parse";
import { parseMimeTree, type MimePart } from "./mime-tree";

// Serialisation of message metadata into the exact shapes IMAP clients expect.
// These are fiddly but fully specified; getting a parenthesis wrong makes a
// client refuse the whole mailbox.

function nstring(value: string | null | undefined): string {
    if (value === null || value === undefined || value === "")
        return "NIL";
    return quoteOrLiteral(value);
}

function quoteOrLiteral(value: string): string {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    if (/[\r\n]/.test(escaped))
        return `{${Buffer.byteLength(escaped, "utf8")}}\r\n${escaped}`;
    return `"${escaped}"`;
}

function addressList(list: Array<{ name: string; address: string }>): string {
    if (!list.length)
        return "NIL";
    const parts = list.map((a) => {
        const at = a.address.lastIndexOf("@");
        const mailbox = at === -1 ? a.address : a.address.slice(0, at);
        const host = at === -1 ? "" : a.address.slice(at + 1);
        return `(${nstring(a.name)} NIL ${nstring(mailbox)} ${nstring(host)})`;
    });
    return `(${parts.join(" ")})`;
}

export function envelope(m: StoredMessage): string {
    const from = m.sender_addr ? [{ name: m.sender_name, address: m.sender_addr }] : [];
    const to = splitStored(m.to_addrs);
    const cc = splitStored(m.cc_addrs);
    const bcc = splitStored(m.bcc_addrs);
    const replyTo = splitStored(m.reply_to);
    const date = `"${imapDateTime(m.sent_at)}"`;
    return [
        "(",
        date,
        nstring(m.subject),
        addressList(from),
        addressList(from),
        addressList(from),
        addressList(to),
        addressList(cc),
        addressList(bcc),
        nstring(m.in_reply_to || ""),
        nstring(m.message_id || ""),
        ")",
    ].join(" ");
}

function splitStored(value: string): Array<{ name: string; address: string }> {
    if (!value)
        return [];
    const out: Array<{ name: string; address: string }> = [];
    for (const chunk of value.split(",")) {
        const match = chunk.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/) || chunk.match(/^\s*([^\s<>,]+@[^\s<>,]+)\s*$/);
        if (!match)
            continue;
        if (match.length === 3)
            out.push({ name: match[1].trim(), address: match[2].trim() });
        else
            out.push({ name: "", address: match[1].trim() });
    }
    return out;
}

export function flagsFor(m: StoredMessage): string[] {
    const flags: string[] = [];
    if (m.seen)
        flags.push("\\Seen");
    if (m.flagged)
        flags.push("\\Flagged");
    if (m.answered)
        flags.push("\\Answered");
    if (m.draft)
        flags.push("\\Draft");
    if (m.deleted)
        flags.push("\\Deleted");
    if (m.recent)
        flags.push("\\Recent");
    return flags;
}

export function flagList(m: StoredMessage): string {
    const flags = flagsFor(m);
    return flags.length ? `(${flags.join(" ")})` : "()";
}

// BODYSTRUCTURE from the real MIME tree. Clients rely on this to decide which
// part to render and to build attachment lists.
export function bodyStructure(raw: Buffer, extended: boolean): string {
    const tree = parseMimeTree(raw);
    return describe(tree, extended);
}

// RFC 3501 §7.4.2 (BODY) and RFC 3501 §9 / RFC 2045 extended form
// (BODYSTRUCTURE). A text leaf carries a line count before the extension
// fields; every extension field is NIL here because we do not index MD5,
// language tags or content-location.
function describe(part: MimePart, extended: boolean): string {
    if (part.children.length) {
        const kids = part.children.map((c) => describe(c, extended)).join(" ");
        const subtype = quoteOrLiteral(part.subtype.toUpperCase());
        if (!extended)
            return `(${kids} ${subtype})`;
        return `(${kids} ${subtype} ${serializeParams(part.params)} ${describeDisposition(part)} NIL NIL)`;
    }

    const [mainType, subType] = splitType(part.type);
    const params = serializeParams(part.params);
    const id = part.id ? quoteOrLiteral(`<${part.id}>`) : "NIL";
    const description = part.description ? quoteOrLiteral(part.description) : "NIL";
    const encoding = quoteOrLiteral(part.encoding.toUpperCase());
    const isText = mainType === "TEXT";

    const head = `${quoteOrLiteral(mainType)} ${quoteOrLiteral(subType)} ${params} ${id} ${description} ${encoding} ${part.size}`;
    const lines = isText ? ` ${part.lines}` : "";

    if (!extended)
        return `(${head}${lines})`;

    // md5, disposition, language, location
    return `(${head}${lines} NIL ${describeDisposition(part)} NIL NIL)`;
}

function splitType(type: string): [string, string] {
    const [a, b] = type.split("/");
    return [(a || "text").toUpperCase(), (b || "plain").toUpperCase()];
}

function serializeParams(params: Record<string, string>): string {
    const entries = Object.entries(params);
    if (!entries.length)
        return "NIL";
    return `(${entries.map(([k, v]) => `${quoteOrLiteral(k.toUpperCase())} ${quoteOrLiteral(v)}`).join(" ")})`;
}

function describeDisposition(part: MimePart): string {
    if (!part.disposition)
        return "NIL";
    const params = Object.keys(part.dispositionParams).length ? serializeParams(part.dispositionParams) : "NIL";
    return `(${quoteOrLiteral(part.disposition.toUpperCase())} ${params})`;
}

export interface FetchRequest {
    envelope?: boolean;
    flags?: boolean;
    uid?: boolean;
    internalDate?: boolean;
    size?: boolean;
    bodyStructure?: boolean;
    bodySections: Array<{ section: string; peek: boolean; partial?: { start: number; length: number } }>;
}

// Build one FETCH response body (without the tag).
export async function buildFetch(m: StoredMessage, uid: number, req: FetchRequest, raw: Buffer): Promise<string> {
    const parts: string[] = [];
    if (req.uid)
        parts.push(`UID ${uid}`);
    if (req.flags)
        parts.push(`FLAGS ${flagList(m)}`);
    if (req.internalDate)
        parts.push(`INTERNALDATE "${imapDateTime(m.sent_at)}"`);
    if (req.size)
        parts.push(`RFC822.SIZE ${m.size}`);
    if (req.envelope)
        parts.push(`ENVELOPE ${envelope(m)}`);
    if (req.bodyStructure)
        parts.push(`BODYSTRUCTURE ${bodyStructure(raw, true)}`);

    for (const section of req.bodySections) {
        const content = await sectionContent(section.section, raw);
        const item = section.peek ? "BODY.PEEK" : "BODY";
        let value = content;
        let suffix = "";
        if (section.partial) {
            const start = Math.max(0, section.partial.start);
            const length = Math.max(0, section.partial.length);
            value = content.subarray(start, start + length);
            suffix = `<${start}>`;
        }
        parts.push(`${item}[${section.section}]${suffix} {${value.length}}\r\n${value.toString("binary")}`);
    }
    return parts.join(" ");
}

// Extract the bytes for a BODY[...] section, resolving real part numbers.
async function sectionContent(section: string, raw: Buffer): Promise<Buffer> {
    const normalized = section.toUpperCase();
    if (normalized === "")
        return raw;
    if (normalized === "HEADER")
        return splitHeaderBody(raw).header;
    if (normalized === "TEXT")
        return splitHeaderBody(raw).body;
    if (normalized.startsWith("HEADER.FIELDS")) {
        const invert = normalized.startsWith("HEADER.FIELDS.NOT");
        return filterHeaders(splitHeaderBody(raw).header, extractFieldNames(section), invert);
    }

    // Optional numeric part path, optionally followed by .HEADER / .TEXT.
    const match = /^(\d+(?:\.\d+)*)(?:\.(HEADER|TEXT|MIME))?$/i.exec(normalized);
    if (!match)
        return raw;
    const path = match[1].split(".").map(Number);
    const suffix = (match[2] || "").toUpperCase();
    const located = locatePart(raw, path);
    if (!located)
        return Buffer.alloc(0);
    if (suffix === "HEADER")
        return splitHeaderBody(located).header;
    if (suffix === "TEXT")
        return splitHeaderBody(located).body;
    if (suffix === "MIME")
        return splitHeaderBody(located).header;
    return located;
}

// Walk the part tree to return the raw bytes of a leaf part. IMAP numbers the
// leaves depth-first; a single-part message is part 1.
function locatePart(raw: Buffer, path: number[]): Buffer | null {
    const tree = parseMimeTree(raw);
    if (!tree.children.length)
        return path.length === 1 && path[0] === 1 ? raw : null;
    let node: MimePart = tree;
    let current: Buffer = raw;
    for (let i = 0; i < path.length; i++) {
        const index = path[i] - 1;
        if (!node.children[index])
            return null;
        node = node.children[index];
        current = extractChildRaw(current, index);
    }
    return current;
}

// Re-extract a child's raw bytes; the tree does not retain byte offsets, so we
// split again. Bounded by the parent boundary.
function extractChildRaw(parent: Buffer, index: number): Buffer {
    const headers = parseHeaderValue(parent, "content-type");
    const boundary = /boundary="?([^";]+)"?/i.exec(headers || "")?.[1];
    if (!boundary)
        return parent;
    const text = parent.toString("binary");
    const { body } = splitHeaderBody(parent);
    const bodyText = body.toString("binary");
    const delimiter = `--${boundary}`;
    const parts: string[] = [];
    let cursor = 0;
    while (true) {
        const start = bodyText.indexOf(delimiter, cursor);
        if (start === -1)
            break;
        const after = start + delimiter.length;
        if (bodyText.slice(after, after + 2) === "--")
            break;
        const next = bodyText.indexOf(delimiter, after);
        let chunk = bodyText.slice(after, next === -1 ? bodyText.length : next);
        if (chunk.startsWith("\r\n"))
            chunk = chunk.slice(2);
        else if (chunk.startsWith("\n"))
            chunk = chunk.slice(1);
        if (chunk.endsWith("\r\n"))
            chunk = chunk.slice(0, -2);
        else if (chunk.endsWith("\n"))
            chunk = chunk.slice(0, -1);
        parts.push(chunk);
        if (next === -1)
            break;
        cursor = next;
    }
    void text;
    const chosen = parts[index];
    return chosen === undefined ? parent : Buffer.from(chosen, "binary");
}

function parseHeaderValue(raw: Buffer, name: string): string {
    const header = splitHeaderBody(raw).header.toString("binary");
    const lines = header.split(/\r?\n/);
    for (const line of lines) {
        const colon = line.indexOf(":");
        if (colon === -1)
            continue;
        if (line.slice(0, colon).trim().toLowerCase() === name)
            return line.slice(colon + 1).trim();
    }
    return "";
}

function extractFieldNames(section: string): string[] {
    const match = /\(([^)]*)\)/.exec(section);
    if (!match)
        return [];
    return match[1].split(/\s+/).filter(Boolean).map((f) => f.toUpperCase());
}

function splitHeaderBody(raw: Buffer): { header: Buffer; body: Buffer } {
    const text = raw.toString("binary");
    const idx = text.indexOf("\r\n\r\n");
    if (idx === -1) {
        const lf = text.indexOf("\n\n");
        if (lf === -1)
            return { header: raw, body: Buffer.alloc(0) };
        return { header: raw.subarray(0, lf + 2), body: raw.subarray(lf + 2) };
    }
    return { header: raw.subarray(0, idx + 4), body: raw.subarray(idx + 4) };
}

function filterHeaders(header: Buffer, fields: string[], invert: boolean): Buffer {
    const lines = header.toString("binary").split(/\r\n/);
    const out: string[] = [];
    let include = false;
    for (const line of lines) {
        if (/^[ \t]/.test(line)) {
            if (include)
                out.push(line);
            continue;
        }
        if (!line)
            continue;
        const name = line.split(":")[0].toUpperCase();
        include = invert ? !fields.includes(name) : fields.includes(name);
        if (include)
            out.push(line);
    }
    return Buffer.from(out.join("\r\n") + "\r\n\r\n", "binary");
}
