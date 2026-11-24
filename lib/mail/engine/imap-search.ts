import type { StoredMessage } from "./store";
import type { FetchRequest } from "./imap-format";
import { ImapParser } from "./imap-parse";

// SEARCH criteria and FETCH item parsing. Kept apart from the session class so
// the protocol grammar lives in one place and stays testable on its own.

export async function runSearch(messages: StoredMessage[], criteria: string): Promise<StoredMessage[]> {
    const parser = new ImapParser(criteria);
    const predicates: Array<(m: StoredMessage, seq: number) => boolean> = [];

    while (!parser.atEnd()) {
        const token = parser.peek();
        if (token === "(") {
            // A parenthesised group means "any of these"; nested groups are rare
            // and are flattened with AND semantics, which is what clients expect
            // in practice.
            const group = parser.readList();
            const text = group.map((t) => t.value || serialize(t)).join(" ");
            const inner = await runSearch(messages, text);
            const allowed = new Set(inner.map((m) => m.id));
            predicates.push((m) => allowed.has(m.id));
            continue;
        }
        const key = parser.readAtom().toUpperCase();
        switch (key) {
            case "ALL":
                predicates.push(() => true);
                break;
            case "ANSWERED":
                predicates.push((m) => m.answered);
                break;
            case "UNANSWERED":
                predicates.push((m) => !m.answered);
                break;
            case "DELETED":
                predicates.push((m) => m.deleted);
                break;
            case "UNDELETED":
                predicates.push((m) => !m.deleted);
                break;
            case "DRAFT":
                predicates.push((m) => m.draft);
                break;
            case "UNDRAFT":
                predicates.push((m) => !m.draft);
                break;
            case "FLAGGED":
                predicates.push((m) => m.flagged);
                break;
            case "UNFLAGGED":
                predicates.push((m) => !m.flagged);
                break;
            case "SEEN":
                predicates.push((m) => m.seen);
                break;
            case "UNSEEN":
                predicates.push((m) => !m.seen);
                break;
            case "RECENT":
                predicates.push((m) => m.recent);
                break;
            case "OLD":
                predicates.push((m) => !m.recent);
                break;
            case "NEW":
                predicates.push((m) => m.recent && !m.seen);
                break;
            case "FROM": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.sender_addr.includes(value) || m.sender_name.toLowerCase().includes(value));
                break;
            }
            case "TO": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.to_addrs.toLowerCase().includes(value));
                break;
            }
            case "CC": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.cc_addrs.toLowerCase().includes(value));
                break;
            }
            case "BCC": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.bcc_addrs.toLowerCase().includes(value));
                break;
            }
            case "SUBJECT": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.subject.toLowerCase().includes(value));
                break;
            }
            case "BODY":
            case "TEXT": {
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => m.snippet.toLowerCase().includes(value) || m.subject.toLowerCase().includes(value));
                break;
            }
            case "HEADER": {
                const name = readValue(parser).toLowerCase();
                const value = readValue(parser).toLowerCase();
                predicates.push((m) => matchHeader(m, name, value));
                break;
            }
            case "KEYWORD":
            case "UNKEYWORD": {
                const keyword = readValue(parser).toUpperCase();
                const wanted = keyword === "\\SEEN" || keyword === "\\FLAGGED" || keyword === "\\ANSWERED" || keyword === "\\DRAFT" || keyword === "\\DELETED";
                const positive = key === "KEYWORD";
                predicates.push((m) => {
                    if (!wanted)
                        return !positive;
                    const has = keyword === "\\SEEN" ? m.seen
                        : keyword === "\\FLAGGED" ? m.flagged
                            : keyword === "\\ANSWERED" ? m.answered
                                : keyword === "\\DRAFT" ? m.draft
                                    : m.deleted;
                    return positive ? has : !has;
                });
                break;
            }
            case "BEFORE":
            case "SINCE":
            case "ON":
            case "SENTBEFORE":
            case "SENTSINCE":
            case "SENTON": {
                const date = parseImapDate(readValue(parser));
                predicates.push((m) => {
                    const sent = new Date(m.sent_at).getTime();
                    if (Number.isNaN(sent) || !date)
                        return false;
                    if (key === "BEFORE" || key === "SENTBEFORE")
                        return sent < date.getTime();
                    if (key === "SINCE" || key === "SENTSINCE")
                        return sent >= date.getTime();
                    return sameDay(new Date(sent), date);
                });
                break;
            }
            case "LARGER": {
                const size = Number(readValue(parser)) || 0;
                predicates.push((m) => m.size > size);
                break;
            }
            case "SMALLER": {
                const size = Number(readValue(parser)) || 0;
                predicates.push((m) => m.size < size);
                break;
            }
            case "UID": {
                const set = readValue(parser);
                const ranges = set.split(",").map((part) => part.split(":").map(Number));
                predicates.push((m) => ranges.some(([a, b]) => {
                    if (!Number.isFinite(a))
                        return false;
                    if (b === undefined)
                        return m.uid === a;
                    const lo = Math.min(a, b || a);
                    const hi = Math.max(a, b || a);
                    return m.uid >= lo && m.uid <= hi;
                }));
                break;
            }
            case "NOT": {
                const inner = await runSearch(messages, parser.rest());
                const allowed = new Set(inner.map((m) => m.id));
                predicates.push((m) => !allowed.has(m.id));
                parser.rest();
                break;
            }
            case "OR": {
                const rest = parser.rest();
                const [left, right] = splitOr(rest);
                const a = new Set((await runSearch(messages, left)).map((m) => m.id));
                const b = new Set((await runSearch(messages, right)).map((m) => m.id));
                predicates.push((m) => a.has(m.id) || b.has(m.id));
                break;
            }
            case "CHARSET":
                readValue(parser);
                break;
            default: {
                // A bare sequence set is a valid criterion.
                if (/^[\d*:,]+$/.test(key)) {
                    const ranges = key.split(",").map((part) => part.split(":").map((v) => (v === "*" ? messages.length : Number(v))));
                    predicates.push((m, seq) => ranges.some(([a, b]) => {
                        if (b === undefined)
                            return seq === a;
                        const lo = Math.min(a, b);
                        const hi = Math.max(a, b);
                        return seq >= lo && seq <= hi;
                    }));
                }
                break;
            }
        }
    }

    const out: StoredMessage[] = [];
    messages.forEach((m, index) => {
        if (predicates.every((p) => p(m, index + 1)))
            out.push(m);
    });
    return out;
}

function serialize(token: any): string {
    if (token.type === "list")
        return `(${(token.items || []).map(serialize).join(" ")})`;
    return token.value;
}

function readValue(parser: ImapParser): string {
    if (parser.atEnd())
        return "";
    return parser.readToken().value;
}

function splitOr(input: string): [string, string] {
    // OR takes exactly two criteria; the second may itself be parenthesised.
    const parser = new ImapParser(input);
    const start = parser["index"] ?? 0;
    void start;
    const first = readOneCriterion(input);
    const rest = input.slice(first.length).trim();
    return [first, rest];
}

function readOneCriterion(input: string): string {
    const trimmed = input.trim();
    if (trimmed.startsWith("(")) {
        let depth = 0;
        for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === "(")
                depth++;
            else if (trimmed[i] === ")") {
                depth--;
                if (depth === 0)
                    return trimmed.slice(0, i + 1);
            }
        }
        return trimmed;
    }
    const parts = trimmed.split(/\s+/);
    const key = parts[0].toUpperCase();
    const withValue = new Set(["FROM", "TO", "CC", "BCC", "SUBJECT", "BODY", "TEXT", "BEFORE", "SINCE", "ON", "SENTBEFORE", "SENTSINCE", "SENTON", "LARGER", "SMALLER", "UID", "KEYWORD", "UNKEYWORD"]);
    return withValue.has(key) ? parts.slice(0, 2).join(" ") : parts[0];
}

function matchHeader(m: StoredMessage, name: string, value: string): boolean {
    if (name === "message-id")
        return m.message_id.toLowerCase().includes(value);
    if (name === "in-reply-to")
        return m.in_reply_to.toLowerCase().includes(value);
    if (name === "references")
        return m.thread_refs.toLowerCase().includes(value);
    if (name === "subject")
        return m.subject.toLowerCase().includes(value);
    if (name === "from")
        return m.sender_addr.toLowerCase().includes(value);
    if (name === "to")
        return m.to_addrs.toLowerCase().includes(value);
    return false;
}

function parseImapDate(value: string): Date | null {
    const clean = value.replace(/"/g, "");
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(clean);
    if (!match)
        return null;
    const month = months[match[2].toLowerCase()];
    if (month === undefined)
        return null;
    return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

function sameDay(a: Date, b: Date): boolean {
    return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

// ── FETCH item parsing ───────────────────────────────────────────────────────
export function parseFetchItems(parser: ImapParser): FetchRequest {
    const request: FetchRequest = { bodySections: [] };
    if (parser.atEnd()) {
        request.flags = true;
        return request;
    }
    // The spec is either a parenthesised list or a single item; normalise both
    // into a flat array of item strings, keeping section brackets intact.
    const items: string[] = [];
    if (parser.peek() === "(") {
        const inner = parser.rest().trim();
        items.push(...splitItems(inner.slice(1, inner.lastIndexOf(")"))));
    }
    else {
        items.push(...splitItems(parser.rest()));
    }

    for (const raw of items) {
        const item = raw.trim();
        if (!item)
            continue;
        const upper = item.toUpperCase();
        if (upper === "ALL")
            request.envelope = request.flags = request.internalDate = request.size = true;
        else if (upper === "FAST")
            request.flags = request.internalDate = request.size = true;
        else if (upper === "FULL")
            request.envelope = request.flags = request.internalDate = request.size = request.bodyStructure = true;
        else if (upper === "ENVELOPE")
            request.envelope = true;
        else if (upper === "FLAGS")
            request.flags = true;
        else if (upper === "UID")
            request.uid = true;
        else if (upper === "INTERNALDATE")
            request.internalDate = true;
        else if (upper === "RFC822.SIZE")
            request.size = true;
        else if (upper === "BODYSTRUCTURE" || upper === "BODY")
            request.bodyStructure = true;
        else if (upper === "RFC822" || upper === "RFC822.HEADER" || upper === "RFC822.TEXT")
            request.bodySections.push({ section: upper === "RFC822" ? "" : upper === "RFC822.HEADER" ? "HEADER" : "TEXT", peek: false });
        else if (/^BODY(\.PEEK)?\[/i.test(item))
            request.bodySections.push(parseBodySection(item));
    }
    return request;
}

function parseBodySection(item: string): { section: string; peek: boolean; partial?: { start: number; length: number } } {
    const peek = /^BODY\.PEEK/i.test(item);
    const open = item.indexOf("[");
    const close = item.indexOf("]", open);
    let section = open === -1 || close === -1 ? "" : item.slice(open + 1, close);
    const partialMatch = /<(\d+)\.(\d+)>/.exec(item);
    const partial = partialMatch ? { start: Number(partialMatch[1]), length: Number(partialMatch[2]) } : undefined;
    // Strip any embedded partial marker from the section name.
    section = section.replace(/<\d+\.\d+>$/, "");
    return { section, peek, partial };
}

function splitItems(input: string): string[] {
    const out: string[] = [];
    let current = "";
    let depth = 0;
    let bracket = 0;
    for (const ch of input) {
        if (ch === "(")
            depth++;
        else if (ch === ")")
            depth--;
        else if (ch === "[")
            bracket++;
        else if (ch === "]")
            bracket--;
        if (/\s/.test(ch) && depth === 0 && bracket === 0) {
            if (current.trim())
                out.push(current.trim());
            current = "";
            continue;
        }
        current += ch;
    }
    if (current.trim())
        out.push(current.trim());
    return out;
}

// ── Flag mutation ────────────────────────────────────────────────────────────
export function applyFlagChange(
    message: StoredMessage,
    tokens: string[],
    mode: "add" | "remove" | "replace",
): { seen: boolean; flagged: boolean; answered: boolean; draft: boolean; deleted: boolean } {
    const current = { seen: message.seen, flagged: message.flagged, answered: message.answered, draft: message.draft, deleted: message.deleted };
    const map: Record<string, keyof typeof current> = {
        "\\SEEN": "seen", "\\FLAGGED": "flagged", "\\ANSWERED": "answered", "\\DRAFT": "draft", "\\DELETED": "deleted",
    };
    const present = new Set<string>();
    for (const token of tokens) {
        const key = map[token.toUpperCase()];
        if (key)
            present.add(key);
    }
    if (mode === "replace") {
        for (const key of Object.values(map))
            current[key] = present.has(key);
    }
    else {
        for (const key of Object.values(map))
            current[key] = mode === "add" ? current[key] || present.has(key) : present.has(key) ? false : current[key];
    }
    return current;
}

export function flagNames(flags: { seen: boolean; flagged: boolean; answered: boolean; draft: boolean; deleted: boolean }): string[] {
    const out: string[] = [];
    if (flags.seen)
        out.push("\\Seen");
    if (flags.flagged)
        out.push("\\Flagged");
    if (flags.answered)
        out.push("\\Answered");
    if (flags.draft)
        out.push("\\Draft");
    if (flags.deleted)
        out.push("\\Deleted");
    return out;
}
