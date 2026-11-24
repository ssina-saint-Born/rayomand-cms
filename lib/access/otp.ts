import { randomInt } from "node:crypto";
import { getDb, now } from "../db";
import { getClientIp } from "./ip";
import { jwtDecode, jwtEncode } from "./jwt";
import { hashPassword, verifyPassword } from "../password";
import { Identifier } from "./identifier";
import { Mobile } from "./mobile";
import { block as firewallBlock } from "./firewall";
import { sendOtp } from "./channels";
import { getOrCreateByMobile, getUser, updateUserMobileUsername } from "./users";
import { getAccessOption } from "./settings";

export const OTP_TYPE_LOGIN = "login";
export const OTP_TYPE_REGISTER = "register";
export const OTP_TYPE_FORGET = "forget";

export interface OtpRow {
    id: number;
    user_id: number | null;
    identifier: string;
    code: string;
    ip_address: string | null;
    attempts: number;
    type: string;
    channels: string;
    expires_at: string;
    verified_at: string | null;
}

function minutesFromNow(min: number): string {
    return new Date(Date.now() + min * 60000).toISOString();
}

export async function generateCode(): Promise<number> {
    const n = Number(await getAccessOption("advanced.code_length", 4));
    const len = [4, 5, 6].includes(n) ? n : 4;
    const min = Number("1" + "0".repeat(len - 1));
    const max = Number("9".repeat(len));
    return randomInt(min, max + 1);
}

// Mirrors OTPService::create() including IP/identifier rate limits.
// Returns [jwt, successfulChannels].
export async function createOtp(identifier: Identifier, channels: string[], type: string, userId: number | null): Promise<[string, string[]]> {
    const ip = await getClientIp();
    const db = getDb();

    const ipHourly = Number((await db.one(
        "SELECT COUNT(*) c FROM access_otp WHERE ip_address=$1 AND expires_at >= $2",
        ip, new Date(Date.now() - 3600000).toISOString(),
    )).c);
    if (ipHourly >= 8) {
        await firewallBlock(ip || "", 60);
        throw new Error("آدرس آی.پی شما مسدود شده است.");
    }

    const ipWeekly = Number((await db.one(
        "SELECT COUNT(*) c FROM access_otp WHERE ip_address=$1 AND expires_at >= $2 AND verified_at IS NULL",
        ip, new Date(Date.now() - 7 * 86400000).toISOString(),
    )).c);
    if (ipWeekly >= 12) {
        await firewallBlock(ip || "", 24 * 60);
        throw new Error("آدرس آی.پی شما مسدود شده است.");
    }

    const idHourly = Number((await db.one(
        "SELECT COUNT(*) c FROM access_otp WHERE identifier=$1 AND expires_at >= $2",
        identifier.getValue(), new Date(Date.now() - 3600000).toISOString(),
    )).c);
    if (idHourly >= 5) {
        await firewallBlock(identifier.getValue(), 60);
        throw new Error("ایمیل یا تلفن همراه مسدود شده است.");
    }

    const code = await generateCode();
    const channelsObj: Record<string, boolean> = {};
    for (const c of channels)
        channelsObj[c] = false;

    const insert = await db.execute(
        "INSERT INTO access_otp (user_id,identifier,code,ip_address,attempts,type,channels,expires_at) VALUES ($1,$2,$3,$4,0,$5,$6,$7) RETURNING id",
        userId, identifier.getValue(), hashPassword(String(code)), ip, type, JSON.stringify(channelsObj), minutesFromNow(3),
    );
    const otpId = Number(insert.id);

    try {
        const result = await sendOtp(otpId, identifier.getValue(), code, channelsObj);
        await db.execute("UPDATE access_otp SET channels=$1 WHERE id=$2", JSON.stringify(result.updated), otpId);
        return [jwtEncode({ otp_id: otpId }), result.sent];
    }
    catch (e) {
        await db.execute("DELETE FROM access_otp WHERE id=$1", otpId);
        throw e;
    }
}

// Mirrors OTPService::verify(). Returns the matched/created user id.
export async function verifyOtp(jwt: string, code: string): Promise<number> {
    let payload: Record<string, any>;
    try {
        payload = jwtDecode(jwt);
    }
    catch {
        throw new Error("کد تایید معتبر نمی‌باشد.");
    }
    const otp = (await getDb().one("SELECT * FROM access_otp WHERE id=$1", Number(payload.otp_id))) as OtpRow | undefined;
    if (!otp)
        throw new Error("کد تایید معتبر نمی‌باشد.");
    if (new Date(otp.expires_at).getTime() < Date.now() || otp.verified_at || otp.attempts >= 5)
        throw new Error("کد تایید معتبر نمی‌باشد.");
    const ip = await getClientIp();
    if (otp.ip_address && otp.ip_address !== ip)
        throw new Error("شما به این کد دسترسی ندارید.");
    if (!verifyPassword(String(code), otp.code)) {
        await getDb().execute("UPDATE access_otp SET attempts=attempts+1 WHERE id=$1", otp.id);
        throw new Error("کد تایید معتبر نمی‌باشد.");
    }
    await getDb().execute("UPDATE access_otp SET verified_at=$1 WHERE id=$2", now(), otp.id);
    const identifier = new Identifier(otp.identifier);
    const userId = await getOrCreateByMobile(otp.identifier, otp.user_id);
    if (identifier.isMobile() && userId) {
        const u = await getUser(userId);
        const target = new Mobile(otp.identifier).getSanitizedUsername();
        if (u && u.username !== target)
            await updateUserMobileUsername(userId, target);
    }
    return userId;
}

// Returns the OTP row for an identifier that is still pending (unexpired),
// used by authenticate() to reuse an in-flight OTP.
export async function findCurrentOtp(identifierValue: string): Promise<OtpRow | null> {
    const row = await getDb().one(
        "SELECT * FROM access_otp WHERE identifier=$1 AND expires_at > $2 ORDER BY id DESC LIMIT 1",
        identifierValue, now(),
    );
    return (row as OtpRow) || null;
}