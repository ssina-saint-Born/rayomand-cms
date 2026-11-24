import { getDb } from "../../db";

// Local domain cache used by the SMTP daemon's hot path. Recipient checks in
// onRcptTo are authoritative; this cache only lets the data phase classify an
// address without another query.

let cache = new Set<string>();

export async function refreshLocalDomainCache(): Promise<void> {
    const rows = await getDb().many("SELECT name FROM mail_domains WHERE enabled=1");
    cache = new Set(rows.map((r) => String(r.name).toLowerCase()));
}

export function isLocalDomainSync(domain: string): boolean {
    return cache.has(domain.toLowerCase());
}
