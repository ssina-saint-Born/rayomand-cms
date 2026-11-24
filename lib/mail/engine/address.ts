// Address parsing helpers. The engine stores the display name separately from
// the address so IMAP ENVELOPE and the webmail can render them independently.

export interface MailAddress {
    name: string;
    address: string;
}

const ADDR = /[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+/;

export function isValidAddress(value: string): boolean {
    const v = value.trim();
    if (!v || v.length > 254 || /[\r\n<>]/.test(v))
        return false;
    const at = v.lastIndexOf("@");
    if (at <= 0 || at === v.length - 1)
        return false;
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local))
        return false;
    if (local.startsWith(".") || local.endsWith(".") || local.includes(".."))
        return false;
    return /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(domain);
}

export function normalizeAddress(value: string): string {
    return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function domainOf(address: string): string {
    const at = address.lastIndexOf("@");
    return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

export function localPartOf(address: string): string {
    const at = address.lastIndexOf("@");
    return at === -1 ? address : address.slice(0, at);
}

// Parse one header value that may hold several addresses ("A <a@x>, B <b@y>").
export function parseAddressList(input: string | undefined | null): MailAddress[] {
    if (!input)
        return [];
    const out: MailAddress[] = [];
    for (const chunk of splitAddresses(input)) {
        const addr = chunk.match(ADDR);
        if (!addr)
            continue;
        const address = normalizeAddress(addr[0]);
        if (!isValidAddress(address))
            continue;
        let name = chunk.slice(0, addr.index).trim();
        name = name.replace(/^["']|["']$/g, "").replace(/,\s*$/, "").trim();
        out.push({ name, address });
    }
    return out;
}

function splitAddresses(input: string): string[] {
    const parts: string[] = [];
    let current = "";
    let quoted = false;
    let angle = 0;
    for (const ch of input) {
        if (ch === '"')
            quoted = !quoted;
        else if (!quoted && ch === "<")
            angle++;
        else if (!quoted && ch === ">")
            angle = Math.max(0, angle - 1);
        if (ch === "," && !quoted && angle === 0) {
            if (current.trim())
                parts.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    if (current.trim())
        parts.push(current);
    return parts;
}

export function formatAddress(a: MailAddress): string {
    if (!a.name)
        return a.address;
    const safe = /[",<>@;:]/.test(a.name) ? `"${a.name.replace(/"/g, '\\"')}"` : a.name;
    return `${safe} <${a.address}>`;
}

export function formatAddressList(list: MailAddress[]): string {
    return list.map(formatAddress).join(", ");
}
