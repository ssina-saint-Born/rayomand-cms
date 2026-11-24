import { getDb, withTransaction } from "../db";

// Access options are stored as JSON objects keyed by section under
// `access_<section>`: general / sms / messengers / zohal / design / advanced,
// plus one `access_gateway_<class>` object per gateway.
export type AccessSettings = Record<string, any>;

export const ACCESS_SECTIONS = [
    "general",
    "sms",
    "messengers",
    "zohal",
    "design",
    "advanced",
] as const;

const DEFAULTS: Record<string, Record<string, any>> = {
    general: {
        core_users_can_register: true,
        core_default_role: "subscriber",
        commerce_checkout_registration_required: "no",
    },
    sms: {
        gateway: "none",
        message_code: "کد تایید شما: {{otp}}\nلطفاً آن را با دیگران به اشتراک نگذارید.",
        test_mobile: "",
    },
    messengers: {
        bale_api_token: "",
        bale_bot_id: "",
    },
    zohal: {
        api_key: "",
    },
    design: {
        logo: "",
    },
    advanced: {
        mobile_possible_meta_keys: "digits_phone\ndigits_phone_no",
        code_length: 4,
        default_login_method: "otp",
    },
};

export async function getAccessSection(section: string): Promise<Record<string, any>> {
    const row = await getDb().one("SELECT value FROM options WHERE name=$1", `access_${section}`);
    let stored: Record<string, any> = {};
    try {
        stored = row ? JSON.parse(row.value) : {};
    }
    catch {
        stored = {};
    }
    return { ...(DEFAULTS[section] || {}), ...stored };
}

// Mirrors Access::get_option("section.key", default).
export async function getAccessOption(option: string, fallback: any = null): Promise<any> {
    const [section, key] = option.split(".");
    if (!section || !key)
        return fallback;
    const all = await getAccessSection(section);
    return all[key] !== undefined ? all[key] : fallback;
}

export async function setAccessSection(section: string, patch: Record<string, any>): Promise<Record<string, any>> {
    return withTransaction(async () => {
        await getDb().one("SELECT pg_advisory_xact_lock(7845234)");
        const next = { ...(await getAccessSection(section)), ...patch };
        await getDb().execute("INSERT INTO options (name,value) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", `access_${section}`, JSON.stringify(next));
        return next;
    });
}

// Mirror of Access::users_can_register() with core fallback.
export async function accessUsersCanRegister(): Promise<boolean> {
    const v = await getAccessOption("general.core_users_can_register", null);
    if (v === null) {
        const core = await getDb().one("SELECT value FROM options WHERE name='users_can_register'");
        return (core && core.value === "1") || false;
    }
    return !!v;
}

export async function defaultNewRole(): Promise<string> {
    const v = await getAccessOption("general.core_default_role", null);
    if (v === null) {
        const core = await getDb().one("SELECT value FROM options WHERE name='default_role'");
        return (core && core.value) || "subscriber";
    }
    return String(v) || "subscriber";
}