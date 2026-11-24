import type { MailSettings } from "./settings";

// Desired DNS record for a mail domain. The plan is derived from the mail
// server's documented record set (MX, SPF, DKIM, DMARC, TLS-RPT, MTA-STS,
// AutoConfig/AutoDiscover, SRV, CAA) and pushed to whichever provider is set.
export interface DesiredRecord {
    record_type: "MX" | "TXT" | "CNAME" | "SRV" | "CAA";
    name: string;
    content: string;
    priority?: number;
    proxied?: boolean;
    ttl?: number;
}

export interface DnsZone {
    id: string;
    name: string;
}

export interface RemoteRecord {
    id: string;
    record_type: string;
    name: string;
    content: string;
    priority?: number;
}

export interface DnsProvider {
    readonly id: string;
    readonly label: string;
    verify(): Promise<{ ok: boolean; message: string }>;
    findZone(domain: string): Promise<DnsZone | null>;
    listRecords(zoneId: string): Promise<RemoteRecord[]>;
    createRecord(zoneId: string, record: DesiredRecord): Promise<string>;
    updateRecord(zoneId: string, remoteId: string, record: DesiredRecord): Promise<void>;
    deleteRecord(zoneId: string, remoteId: string): Promise<void>;
}

// ── Cloudflare ───────────────────────────────────────────────────────────────
const CF_API = "https://api.cloudflare.com/client/v4";

class CloudflareProvider implements DnsProvider {
    readonly id = "cloudflare";
    readonly label = "Cloudflare";
    constructor(private token: string) { }

    private async api(path: string, init: RequestInit = {}): Promise<any> {
        if (!this.token)
            throw new Error("Cloudflare API token is not configured.");
        const res = await fetch(CF_API + path, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
                ...(init.headers || {}),
            },
            cache: "no-store",
        });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        if (!res.ok || (json && json.success === false)) {
            const err = json?.errors?.[0]?.message || `Cloudflare HTTP ${res.status}`;
            throw new Error(err);
        }
        return json;
    }

    async verify(): Promise<{ ok: boolean; message: string }> {
        try {
            await this.api("/user/tokens/verify");
            return { ok: true, message: "Cloudflare token is valid." };
        }
        catch (e) {
            return { ok: false, message: (e as Error).message };
        }
    }

    async findZone(domain: string): Promise<DnsZone | null> {
        const json = await this.api(`/zones?name=${encodeURIComponent(domain)}`);
        const zone = (json?.result || [])[0];
        return zone ? { id: String(zone.id), name: String(zone.name) } : null;
    }

    async listRecords(zoneId: string): Promise<RemoteRecord[]> {
        const json = await this.api(`/zones/${zoneId}/dns_records?per_page=100`);
        return (json?.result || []).map((r: any) => ({
            id: String(r.id),
            record_type: String(r.type),
            name: String(r.name),
            content: String(r.content),
            priority: typeof r.priority === "number" ? r.priority : undefined,
        }));
    }

    private payload(record: DesiredRecord): Record<string, any> {
        const body: Record<string, any> = {
            type: record.record_type,
            name: record.name,
            content: record.content,
            ttl: record.ttl ?? 1,
        };
        if (record.record_type === "MX" && record.priority !== undefined)
            body.priority = record.priority;
        // Never proxy mail records: MX/SRV/CAA must be DNS-only.
        if (record.record_type === "CNAME")
            body.proxied = false;
        return body;
    }

    async createRecord(zoneId: string, record: DesiredRecord): Promise<string> {
        const json = await this.api(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(this.payload(record)) });
        return String(json?.result?.id || "");
    }

    async updateRecord(zoneId: string, remoteId: string, record: DesiredRecord): Promise<void> {
        await this.api(`/zones/${zoneId}/dns_records/${remoteId}`, { method: "PUT", body: JSON.stringify(this.payload(record)) });
    }

    async deleteRecord(zoneId: string, remoteId: string): Promise<void> {
        await this.api(`/zones/${zoneId}/dns_records/${remoteId}`, { method: "DELETE" });
    }
}

export function providerFor(settings: Pick<MailSettings, "dns_provider" | "dns_token">): DnsProvider | null {
    switch ((settings.dns_provider || "").toLowerCase()) {
        case "cloudflare":
            return new CloudflareProvider(settings.dns_token);
        default:
            return null;
    }
}

// Build the desired DNS record set for a domain, given the mail server's
// public hostnames. DKIM is added by the caller once the key is known.
export function buildRecordPlan(input: {
    domain: string;
    mailHost: string;
    publicHost: string;
    dkimSelector?: string;
    dkimKey?: string;
    catchAllReport?: string;
}): DesiredRecord[] {
    const d = input.domain.replace(/\.$/, "");
    const mail = (input.mailHost || "").replace(/\.$/, "");
    const host = (input.publicHost || mail).replace(/\.$/, "");
    const report = input.catchAllReport || `postmaster@${d}`;
    const records: DesiredRecord[] = [];

    if (mail)
        records.push({ record_type: "MX", name: d, content: mail, priority: 10 });

    records.push({ record_type: "TXT", name: d, content: "v=spf1 mx -all" });
    if (mail)
        records.push({ record_type: "TXT", name: mail, content: "v=spf1 a -all" });

    if (input.dkimKey) {
        const selector = input.dkimSelector || "mail";
        records.push({ record_type: "TXT", name: `${selector}._domainkey.${d}`, content: input.dkimKey });
    }

    records.push({ record_type: "TXT", name: `_dmarc.${d}`, content: `v=DMARC1; p=reject; rua=mailto:${report}` });
    records.push({ record_type: "TXT", name: `_smtp._tls.${d}`, content: `v=TLSRPTv1; rua=mailto:${report}` });

    if (host) {
        records.push({ record_type: "CNAME", name: `autoconfig.${d}`, content: host });
        records.push({ record_type: "CNAME", name: `autodiscover.${d}`, content: host });
        records.push({ record_type: "CNAME", name: `mta-sts.${d}`, content: host });
    }

    records.push({ record_type: "TXT", name: `_mta-sts.${d}`, content: "v=STSv1; id=1" });

    if (mail) {
        records.push({ record_type: "SRV", name: `_imaps._tcp.${d}`, content: mail, priority: 0 });
        records.push({ record_type: "SRV", name: `_submissions._tcp.${d}`, content: mail, priority: 0 });
        records.push({ record_type: "SRV", name: `_pop3s._tcp.${d}`, content: mail, priority: 0 });
    }

    return records;
}
