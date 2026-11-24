import pg from "pg";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const env = Object.fromEntries(
    fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const BASE = process.env.ACCESS_BASE || "http://localhost:3000";
const LOG_PATH = process.env.ACCESS_LOG || path.join(os.tmpdir(), "next-sentinel.log");
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = "") {
    if (cond) { pass++; results.push(`  PASS  ${name}`); }
    else { fail++; results.push(`  FAIL  ${name} ${detail}`); }
}

function scrypt(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

// A cookie jar so the admin session persists between requests.
let cookie = "";
async function call(path, opts = {}) {
    const res = await fetch(BASE + path, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            ...(opts.headers || {}),
        },
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) {
        const pair = c.split(";")[0];
        if (pair.startsWith("rm_session=")) {
            const name = pair.split("=")[0];
            const others = cookie.split("; ").filter((p) => p && !p.startsWith(name + "="));
            others.push(pair);
            cookie = others.join("; ");
        }
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
}

// ---- 1. Create a throwaway administrator so the test never touches real
// accounts, and remember it for cleanup.
const adminPassword = "Admin!Pass123";
const adminName = `access_admin_${Date.now()}`;
const adminId = (await db.query(
    "INSERT INTO users (username,email,password_hash,display_name,role,created_at) VALUES ($1,$2,$3,$4,'administrator',$5) RETURNING id",
    [adminName, `${adminName}@example.test`, scrypt(adminPassword), adminName, new Date().toISOString()],
)).rows[0].id;

// ---- 2. Configure the logger SMS gateway so OTPs are captured in the server log.
const previousSms = (await db.query("SELECT value FROM options WHERE name='access_sms'")).rows[0]?.value ?? null;
const previousGeneral = (await db.query("SELECT value FROM options WHERE name='access_general'")).rows[0]?.value ?? null;
const loggerCfg = JSON.stringify({ gateway: "logger", message_code: "کد تایید شما: {{otp}}" });
await db.query(
    "INSERT INTO options (name,value) VALUES ('access_sms',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [loggerCfg],
);
await db.query("DELETE FROM access_otp");
await db.query("DELETE FROM access_blocks WHERE blocked_by IS NOT NULL OR identifier='10.9.9.9'");
await db.query("DELETE FROM users WHERE mobile='+989121234567'");

// ---- 3. Admin password login via the Sentinel endpoint.
let r = await call("/api/access/login/password", {
    method: "POST",
    body: JSON.stringify({ identifier: adminName, password: adminPassword }),
});
check("admin password login", r.json?.success === true, r.text);
const adminCookie = cookie;

// ---- 4. Admin settings read.
r = await call("/api/access/settings");
check("settings GET returns sections+gateways", r.json?.success === true && !!r.json.data?.sections?.sms && !!r.json.data?.gateways, r.text);

// ---- 5. Save settings (switch gateway + registration open).
r = await call("/api/access/settings", {
    method: "POST",
    body: JSON.stringify({
        sections: { general: { core_users_can_register: true, commerce_checkout_registration_required: "no" }, sms: { gateway: "logger" } },
    }),
});
check("settings POST saves", r.json?.success === true, r.text);
r = await call("/api/access/settings");
check("settings persisted gateway=logger", r.json?.data?.sections?.sms?.gateway === "logger", r.text);

// ---- 6. Registration via OTP: new mobile with no account.
const mobile = "09121234567";
cookie = "";
r = await call("/api/access/authenticate", { method: "POST", body: JSON.stringify({ identifier: mobile }) });
check("authenticate new mobile -> otp", r.json?.success === true && r.json.data?.login_method === "otp" && !!r.json.data?.jwt, r.text);
const hasAccount = r.json?.data?.has_account;
check("new mobile reports has_account=false", hasAccount === false, JSON.stringify(r.json?.data));
const otpJwt = r.json?.data?.jwt;

// Read the code from the server log line "[sentinel:sms] +98... code"
await new Promise((res) => setTimeout(res, 500));
const log = fs.readFileSync(LOG_PATH, "utf8").split("\n").reverse().find((l) => l.includes("[sentinel:sms]") && l.includes("+98"));
const code = log ? (log.match(/(\d{4,6})\s*$/)?.[1] || log.match(/: (\d{4,6})/)?.[1]) : null;
check("OTP code logged by logger gateway", !!code, log || "no log line");

// ---- 7. Verify OTP -> creates user + session.
r = await call("/api/access/login/otp", { method: "POST", body: JSON.stringify({ jwt: otpJwt, code }) });
check("OTP verify logs in", r.json?.success === true, r.text);
const otpUserId = r.json?.data?.user_id;
const newUser = await db.query("SELECT id,username,mobile,role FROM users WHERE id=$1", [otpUserId]);
check("user created with mobile + username", !!newUser.rows[0] && newUser.rows[0].mobile === "+989121234567" && newUser.rows[0].username === "989121234567", JSON.stringify(newUser.rows[0]));

// ---- 8. Existing account with password -> authenticate returns password method.
cookie = "";
r = await call("/api/access/authenticate", { method: "POST", body: JSON.stringify({ identifier: adminName }) });
check("existing admin via email -> password method", r.json?.success === true && r.json.data?.login_method === "password" && r.json.data?.has_password === true, r.text);

// ---- 9. Wrong password rejected.
r = await call("/api/access/login/password", { method: "POST", body: JSON.stringify({ identifier: adminName, password: "wrong" }) });
check("wrong password rejected", r.json?.success === false, r.text);

// ---- 10. Forgot-password flow (mobile account created above).
// Clear the still-live OTP so the flow issues a fresh "forget" code, as it
// would after the 3-minute window expires in real use.
await db.query("DELETE FROM access_otp");
cookie = "";
r = await call("/api/access/authenticate", { method: "POST", body: JSON.stringify({ identifier: mobile, forget: 1 }) });
check("forgot authenticate -> otp", r.json?.success === true && r.json.data?.login_method === "otp" && !!r.json.data?.jwt, r.text);
const forgotJwt = r.json?.data?.jwt;
await new Promise((res) => setTimeout(res, 400));
const log2 = fs.readFileSync(LOG_PATH, "utf8").split("\n").reverse().find((l) => l.includes("[sentinel:sms]") && l.includes("+989121234567"));
const code2 = log2 ? (log2.match(/(\d{4,6})\s*$/)?.[1] || null) : null;
check("forgot OTP code captured", !!code2, log2 || "no log");

r = await call("/api/access/auth/forgot/verify", { method: "POST", body: JSON.stringify({ jwt: forgotJwt, code: code2 }) });
check("forgot verify returns reset_key", r.json?.success === true && !!r.json.data?.reset_key, r.text);
const resetJwt = r.json?.data?.jwt;
const resetKey = r.json?.data?.reset_key;

r = await call("/api/access/auth/forgot/change", {
    method: "POST",
    body: JSON.stringify({ jwt: resetJwt, reset_key: resetKey, password_1: "NewPass!123", password_2: "NewPass!123" }),
});
check("forgot change sets password + logs in", r.json?.success === true, r.text);

cookie = "";
r = await call("/api/access/login/password", { method: "POST", body: JSON.stringify({ identifier: mobile, password: "NewPass!123" }) });
check("login with newly reset password", r.json?.success === true, r.text);

// Reset key is single-use.
r = await call("/api/access/auth/forgot/change", {
    method: "POST",
    body: JSON.stringify({ jwt: resetJwt, reset_key: resetKey, password_1: "Another!123", password_2: "Another!123" }),
});
check("reset key single-use (second use rejected)", r.json?.success === false, r.text);

// ---- 11. Blocks: add, list, delete.
cookie = adminCookie;
r = await call("/api/access/blocks", { method: "POST", body: JSON.stringify({ action: "add", identifier: mobile }) });
check("block add", r.json?.success === true, r.text);
const blockId = r.json?.data?.block?.id;

r = await call("/api/access/blocks?page=1&per_page=20");
const listed = r.json?.data?.blocks || [];
check("block appears in list", listed.some((b) => b.identifier === "+989121234567"), r.text);

// Blocked identifier cannot authenticate.
cookie = "";
r = await call("/api/access/authenticate", { method: "POST", body: JSON.stringify({ identifier: mobile }) });
check("blocked mobile rejected at authenticate", r.json?.success === false && /مسدود/.test(r.json?.message || ""), r.text);

// System blocks cannot be deleted.
const sysBlock = await db.query(
    "INSERT INTO access_blocks (identifier,blocked_by,blocked_until,created_at) VALUES ('10.9.9.9',NULL,NULL,$1) RETURNING id",
    [new Date().toISOString()],
);
cookie = adminCookie;
r = await call("/api/access/blocks", { method: "POST", body: JSON.stringify({ action: "delete", block_id: sysBlock.rows[0].id }) });
check("system block delete rejected", r.json?.success === false, r.text);

r = await call("/api/access/blocks", { method: "POST", body: JSON.stringify({ action: "delete", block_id: blockId }) });
check("user block delete ok", r.json?.success === true, r.text);

// Invalid identifier rejected.
r = await call("/api/access/blocks", { method: "POST", body: JSON.stringify({ action: "add", identifier: "not-an-identifier!!" }) });
check("invalid block identifier rejected", r.json?.success === false, r.text);

// ---- 12. Users list includes mobile.
r = await call("/api/access/users");
check("users list includes mobile column", r.json?.success === true && Array.isArray(r.json.data?.users) && r.json.data.users.some((u) => "mobile" in u), r.text);

// ---- 13. Excel export is a valid xlsx zip.
let res = await fetch(BASE + "/api/access/export/excel", { headers: { Cookie: adminCookie } });
const xbuf = Buffer.from(await res.arrayBuffer());
check("excel export 200 + PK zip header", res.status === 200 && xbuf.slice(0, 2).toString() === "PK", `status ${res.status} len ${xbuf.length}`);
check("excel export content-type xlsx", (res.headers.get("content-type") || "").includes("spreadsheetml"), res.headers.get("content-type"));
check("excel filename attachment", (res.headers.get("content-disposition") || "").includes(".xlsx"), res.headers.get("content-disposition"));

// ---- 14. VCF export.
res = await fetch(BASE + "/api/access/export/vcf", { headers: { Cookie: adminCookie } });
const vcf = await res.text();
check("vcf export has BEGIN:VCARD", res.status === 200 && vcf.includes("BEGIN:VCARD") && vcf.includes("END:VCARD"), `status ${res.status}`);
check("vcf includes created mobile", vcf.includes("+989121234567"), "mobile missing");

// ---- 15. Unauthenticated admin routes are blocked.
res = await fetch(BASE + "/api/access/settings");
check("settings blocked without session", res.status === 401 || res.status === 403, `status ${res.status}`);

// ---- 16. Checkout requires a valid mobile (guest checkout).
res = await fetch(BASE + "/api/storefront/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billing: { first_name: "A", last_name: "B", email: "a@b.co", address_1: "x", city: "y", country: "IR", phone: "" } }),
});
const chk = await res.json();
check("checkout rejects empty phone", /موبایل/.test(chk.error || ""), JSON.stringify(chk));

// ---- 17. Clean up everything this run created.
await db.query("DELETE FROM sessions WHERE user_id=$1", [adminId]);
await db.query("DELETE FROM users WHERE id=$1", [adminId]);
await db.query("DELETE FROM options WHERE name LIKE 'access_login_method_%'");
await db.query("DELETE FROM access_blocks WHERE blocked_by IS NOT NULL OR identifier='10.9.9.9'");
await db.query("DELETE FROM access_otp");
await db.query("DELETE FROM users WHERE mobile='+989121234567'");
if (previousSms === null)
    await db.query("DELETE FROM options WHERE name='access_sms'");
else
    await db.query("UPDATE options SET value=$1 WHERE name='access_sms'", [previousSms]);
if (previousGeneral === null)
    await db.query("DELETE FROM options WHERE name='access_general'");
else
    await db.query("UPDATE options SET value=$1 WHERE name='access_general'", [previousGeneral]);

await db.end();
console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
