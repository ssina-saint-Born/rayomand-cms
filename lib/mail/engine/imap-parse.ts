// IMAP argument parsing helpers. IMAP has three string forms — atom, quoted
// and literal — and clients mix them freely, so every tokenizer here handles
// all three.

export interface ImapToken {
    value: string;
    type: "atom" | "quoted" | "literal" | "list" | "number";
    items?: ImapToken[];
}

export class ImapParser {
    private index = 0;
    constructor(private input: string) { }

    atEnd(): boolean {
        this.skipSpaces();
        return this.index >= this.input.length;
    }

    peek(): string {
        this.skipSpaces();
        return this.input[this.index] || "";
    }

    private skipSpaces(): void {
        while (this.index < this.input.length && this.input[this.index] === " ")
            this.index++;
    }

    // Read a parenthesised list, returning its tokens.
    readList(): ImapToken[] {
        this.skipSpaces();
        if (this.input[this.index] !== "(")
            throw new Error("Expected '('");
        this.index++;
        const items: ImapToken[] = [];
        for (;;) {
            this.skipSpaces();
            const ch = this.input[this.index];
            if (ch === ")") {
                this.index++;
                break;
            }
            if (ch === undefined)
                throw new Error("Unterminated list");
            items.push(this.readToken());
        }
        return items;
    }

    readToken(): ImapToken {
        this.skipSpaces();
        const ch = this.input[this.index];
        if (ch === "(") {
            const items = this.readList();
            return { value: "", type: "list", items };
        }
        if (ch === '"') {
            this.index++;
            let value = "";
            while (this.index < this.input.length) {
                const c = this.input[this.index];
                if (c === "\\") {
                    value += this.input[this.index + 1] || "";
                    this.index += 2;
                    continue;
                }
                if (c === '"') {
                    this.index++;
                    break;
                }
                value += c;
                this.index++;
            }
            return { value, type: "quoted" };
        }
        if (ch === "{") {
            const close = this.input.indexOf("}", this.index);
            if (close === -1)
                throw new Error("Bad literal");
            const length = Number(this.input.slice(this.index + 1, close));
            const start = close + 1;
            const value = this.input.slice(start, start + length);
            this.index = start + length;
            return { value, type: "literal" };
        }
        // Atom: read until space or delimiter.
        let value = "";
        while (this.index < this.input.length) {
            const c = this.input[this.index];
            if (c === " " || c === ")" || c === "(")
                break;
            value += c;
            this.index++;
        }
        const type = /^\d+$/.test(value) ? "number" : "atom";
        return { value, type };
    }

    readAtom(): string {
        return this.readToken().value;
    }

    readNumber(): number {
        const token = this.readToken();
        const n = Number(token.value);
        if (!Number.isFinite(n))
            throw new Error("Expected a number");
        return n;
    }

    // Read the rest of the line (used for SEARCH criteria we do not model).
    rest(): string {
        const value = this.input.slice(this.index);
        this.index = this.input.length;
        return value;
    }
}

// Split a comma-separated sequence set into numbers and ranges.
export function parseSequenceSet(set: string, max: number): number[] {
    const out = new Set<number>();
    for (const part of set.split(",")) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        if (trimmed.includes(":")) {
            const [a, b] = trimmed.split(":");
            let start = a === "*" ? max : Number(a);
            let end = b === "*" ? max : Number(b);
            if (!Number.isFinite(start) || !Number.isFinite(end))
                continue;
            if (start > end)
                [start, end] = [end, start];
            for (let i = start; i <= end && out.size < 5000; i++)
                if (i > 0 && i <= max)
                    out.add(i);
        }
        else {
            const n = trimmed === "*" ? max : Number(trimmed);
            if (Number.isFinite(n) && n > 0 && n <= max)
                out.add(n);
        }
    }
    return Array.from(out).sort((a, b) => a - b);
}

// IMAP requires literals for strings containing CR, LF or non-ASCII unless the
// client negotiated UTF8=ACCEPT.
export function needsLiteral(value: string): boolean {
    return /[\r\n]/.test(value) || Buffer.byteLength(value, "utf8") > 1000;
}

export function quote(value: string): string {
    if (!value)
        return '""';
    if (!/[\x00-\x1f"\\\x80-\xff]/.test(value) && value.length < 500)
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return `{${Buffer.byteLength(value, "utf8")}}\r\n${value}`;
}

export function formatFlags(flags: string[]): string {
    return `(${flags.join(" ")})`;
}

// Build an IMAP date-time: 22-Nov-2026 16:04:49 +0000
export function imapDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "01-Jan-1970 00:00:00 +0000";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

// Generate the INTERNALDATE form: "22-Nov-2026 16:04:49 +0000"
export function internalDate(iso: string): string {
    return `"${imapDateTime(iso)}"`;
}
