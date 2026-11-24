import { getDb, now } from "./db";

// Device registry for the mobile app. A device is identified by the app's own
// stable id; the same user may have several. We do not store push tokens here
// because the CMS does not send push — the app polls — but we track last-seen
// so an operator can see which installs are active.

export interface DeviceRow {
    id: number;
    user_id: number;
    device_id: string;
    platform: string;
    label: string;
    app_version: string;
    last_seen_at: string;
    created_at: string;
}

export async function registerDevice(input: {
    userId: number;
    deviceId: string;
    platform?: string;
    label?: string;
    appVersion?: string;
}): Promise<void> {
    const platform = input.platform === "ios" ? "ios" : "android";
    await getDb().execute(
        `INSERT INTO device_tokens (user_id,device_id,platform,label,app_version,last_seen_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (user_id,device_id) DO UPDATE SET
            platform=EXCLUDED.platform, label=EXCLUDED.label,
            app_version=EXCLUDED.app_version, last_seen_at=EXCLUDED.last_seen_at`,
        input.userId, input.deviceId, platform, input.label || "", input.appVersion || "", now(),
    );
}

export async function touchDevice(userId: number, deviceId: string): Promise<void> {
    await getDb().execute("UPDATE device_tokens SET last_seen_at=$1 WHERE user_id=$2 AND device_id=$3", now(), userId, deviceId);
}

export async function listDevices(userId?: number): Promise<DeviceRow[]> {
    return (await getDb().many(
        `SELECT id,user_id,device_id,platform,label,app_version,last_seen_at,created_at
         FROM device_tokens ${userId ? "WHERE user_id=$1" : ""} ORDER BY last_seen_at DESC`,
        ...(userId ? [userId] : []),
    )) as DeviceRow[];
}

export async function removeDevice(userId: number, deviceId: string): Promise<boolean> {
    const result = await getDb().execute("DELETE FROM device_tokens WHERE user_id=$1 AND device_id=$2", userId, deviceId);
    return result.changes > 0;
}
