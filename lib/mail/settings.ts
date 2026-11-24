import { getDb, now } from "../db";
import { sealSecret, openSecret } from "./secrets";

export interface MailSettings {
    public_hostname: string;
    mail_hostname: string;
    default_quota_mb: number;
    max_message_mb: number;
    spam_action: string;
    dns_provider: string;
    dns_token: string;
    dns_zone_id: string;
    dns_auto: boolean;
    tls_cert: string;
    tls_key: string;
    tls_expires_at: string;
    updated_at: string;
}

export interface MailSettingsPublic extends Omit<MailSettings, "dns_token" | "tls_key"> {
    dns_token_set: boolean;
    tls_key_set: boolean;
}

const DEFAULTS: MailSettings = {
    public_hostname: "",
    mail_hostname: "",
    default_quota_mb: 1024,
    max_message_mb: 25,
    spam_action: "mark",
    dns_provider: "cloudflare",
    dns_token: "",
    dns_zone_id: "",
    dns_auto: false,
    tls_cert: "",
    tls_key: "",
    tls_expires_at: "",
    updated_at: "",
};

function rowToSettings(row: any): MailSettings {
    if (!row)
        return { ...DEFAULTS };
    return {
        public_hostname: row.public_hostname || "",
        mail_hostname: row.mail_hostname || "",
        default_quota_mb: Number(row.default_quota_mb || 1024),
        max_message_mb: Number(row.max_message_mb || 25),
        spam_action: row.spam_action || "mark",
        dns_provider: row.dns_provider || "cloudflare",
        dns_token: openSecret(row.dns_token || ""),
        dns_zone_id: row.dns_zone_id || "",
        dns_auto: !!row.dns_auto,
        tls_cert: row.tls_cert || "",
        tls_key: openSecret(row.tls_key || ""),
        tls_expires_at: row.tls_expires_at || "",
        updated_at: row.updated_at || "",
    };
}

export async function getMailSettings(): Promise<MailSettings> {
    const row = await getDb().one("SELECT * FROM mail_settings WHERE id=1");
    return rowToSettings(row);
}

export function publicSettings(s: MailSettings): MailSettingsPublic {
    const { dns_token, tls_key, ...rest } = s;
    return {
        ...rest,
        dns_token_set: !!dns_token,
        tls_key_set: !!tls_key,
    };
}

export interface MailSettingsPatch {
    public_hostname?: string;
    mail_hostname?: string;
    default_quota_mb?: number;
    max_message_mb?: number;
    spam_action?: string;
    dns_provider?: string;
    dns_token?: string;
    dns_zone_id?: string;
    dns_auto?: boolean;
}

export async function saveMailSettings(patch: MailSettingsPatch): Promise<MailSettings> {
    const current = await getMailSettings();
    const next: MailSettings = {
        ...current,
        public_hostname: patch.public_hostname !== undefined ? String(patch.public_hostname).trim().toLowerCase() : current.public_hostname,
        mail_hostname: patch.mail_hostname !== undefined ? String(patch.mail_hostname).trim().toLowerCase() : current.mail_hostname,
        default_quota_mb: patch.default_quota_mb !== undefined ? Math.max(0, Math.round(Number(patch.default_quota_mb) || 0)) : current.default_quota_mb,
        max_message_mb: patch.max_message_mb !== undefined ? Math.min(100, Math.max(1, Math.round(Number(patch.max_message_mb) || 25))) : current.max_message_mb,
        spam_action: patch.spam_action !== undefined ? String(patch.spam_action).trim() : current.spam_action,
        dns_provider: patch.dns_provider !== undefined ? String(patch.dns_provider).trim() : current.dns_provider,
        dns_token: patch.dns_token !== undefined && patch.dns_token !== "" ? String(patch.dns_token) : current.dns_token,
        dns_zone_id: patch.dns_zone_id !== undefined ? String(patch.dns_zone_id).trim() : current.dns_zone_id,
        dns_auto: patch.dns_auto !== undefined ? !!patch.dns_auto : current.dns_auto,
        updated_at: now(),
    };
    await getDb().execute(
        `INSERT INTO mail_settings (id,public_hostname,mail_hostname,default_quota_mb,max_message_mb,spam_action,dns_provider,dns_token,dns_zone_id,dns_auto,updated_at)
         VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
            public_hostname=EXCLUDED.public_hostname, mail_hostname=EXCLUDED.mail_hostname,
            default_quota_mb=EXCLUDED.default_quota_mb, max_message_mb=EXCLUDED.max_message_mb,
            spam_action=EXCLUDED.spam_action, dns_provider=EXCLUDED.dns_provider,
            dns_token=EXCLUDED.dns_token, dns_zone_id=EXCLUDED.dns_zone_id,
            dns_auto=EXCLUDED.dns_auto, updated_at=EXCLUDED.updated_at`,
        next.public_hostname, next.mail_hostname, next.default_quota_mb, next.max_message_mb,
        next.spam_action, next.dns_provider, sealSecret(next.dns_token), next.dns_zone_id,
        next.dns_auto ? 1 : 0, next.updated_at,
    );
    return next;
}

export async function saveTlsCertificate(cert: string, key: string, expiresAt: string): Promise<void> {
    await getDb().execute(
        `INSERT INTO mail_settings (id,tls_cert,tls_key,tls_expires_at,updated_at) VALUES (1,$1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET tls_cert=EXCLUDED.tls_cert, tls_key=EXCLUDED.tls_key,
            tls_expires_at=EXCLUDED.tls_expires_at, updated_at=EXCLUDED.updated_at`,
        cert, sealSecret(key), expiresAt, now(),
    );
}

export async function logMailEvent(category: string, message: string, detail: unknown = "", level = "info"): Promise<void> {
    try {
        await getDb().execute(
            "INSERT INTO mail_events (category,level,message,detail,created_at) VALUES ($1,$2,$3,$4,$5)",
            category, level, message, typeof detail === "string" ? detail : JSON.stringify(detail), now(),
        );
    }
    catch { /* logging must never break a request */ }
}
