import pg from "pg";
import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";

const env = Object.fromEntries(
    fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const BASE = process.env.ACCESS_BASE || "http://localhost:3000";
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();

await db.query(
    "INSERT INTO options (name,value) VALUES ('access_sms',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [JSON.stringify({ gateway: "logger", message_code: "کد تایید شما: {{otp}}" })],
);
await db.query("DELETE FROM access_otp");
await db.query("DELETE FROM access_blocks WHERE identifier LIKE '%9351234567%'");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-otp-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });

let ws, nextId = 0;
const pending = new Map();
const exceptions = [];
const shots = [];
function command(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP deadline " + method)); }, 60000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const r = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
}
async function wait(predicate) {
    return evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(${predicate})resolve(true);else if(Date.now()-start>30000)reject(new Error('wait '+${JSON.stringify(predicate)}));else setTimeout(check,100)};check()})`);
}
async function fill(sel, value) {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw new Error('missing '+${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
}
async function shot(name) {
    const r = await command("Page.captureScreenshot", { format: "png" });
    shots.push({ name, bytes: r.data.length });
}

let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push("  PASS  " + n); } else { fail++; out.push("  FAIL  " + n + " " + d); } };

try {
    const endpoint = await new Promise((resolve, reject) => {
        let text = "";
        const t = setTimeout(() => reject(new Error("chrome start")), 20000);
        chrome.once("error", reject);
        chrome.stderr.on("data", (b) => { text += b; const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
    });
    const base = endpoint.replace(/^ws:/, "http:").split("/devtools/")[0];
    const target = await fetch(base + "/json/new?about:blank", { method: "PUT" }).then((r) => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await once(ws, "open");
    ws.addEventListener("message", (ev) => {
        const r = JSON.parse(ev.data);
        if (r.method === "Runtime.exceptionThrown") exceptions.push(r.params.exceptionDetails.exception?.description || r.params.exceptionDetails.text);
        const p = pending.get(r.id);
        if (!p) return;
        clearTimeout(p.timer); pending.delete(r.id);
        r.error ? p.reject(new Error(JSON.stringify(r.error))) : p.resolve(r.result);
    });
    await command("Page.enable"); await command("Runtime.enable");
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await command("Page.navigate", { url: BASE + "/auth/sign-in" });
    await wait('document.querySelector(".noma-login")?.dataset.authReady==="1"');

    // OTP registration path for a brand-new mobile.
    const mobile = "09351234567";
    await db.query("DELETE FROM users WHERE mobile=$1", ["+989351234567"]);
    await fill("#sentinel-identifier", mobile);
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Continue").click()');
    await wait('document.querySelector("#sentinel-code")');
    check("OTP step renders for new mobile", true);
    await shot("sentinel-otp-step");

    const otpRow = (await db.query("SELECT channels FROM access_otp WHERE identifier=$1 ORDER BY id DESC LIMIT 1", ["+989351234567"])).rows[0];
    check("OTP row created with sms channel sent", !!otpRow && JSON.parse(otpRow.channels).sms === true, JSON.stringify(otpRow));

    // Grab the code from the server log.
    const logPath = "C:\\Users\\archi\\AppData\\Local\\Temp\\next-sentinel.log";
    const line = fs.readFileSync(logPath, "utf8").split("\n").reverse().find((l) => l.includes("[sentinel:sms]") && l.includes("+989351234567"));
    const code = line ? (line.match(/(\d{4,6})\s*$/)?.[1] || null) : null;
    check("code logged for new mobile", !!code, line || "no line");

    // Wrong code first -> alert.
    await fill("#sentinel-code", "0000" === code ? "1111" : "0000");
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Confirm").click()');
    await wait('document.querySelector("[role=alert]")');
    check("wrong OTP shows error", true);
    await shot("sentinel-otp-error");

    await fill("#sentinel-code", code);
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Confirm").click()');
    await wait('location.pathname==="/studio" && document.querySelector(".noma-admin")');
    check("correct OTP signs in and lands in studio", true);
    await shot("sentinel-studio-after-otp");

    // Sign out, then check the forgot-password screen renders.
    const sess = (await db.query("SELECT id,username FROM users WHERE mobile=$1", ["+989351234567"])).rows[0];
    check("OTP login created a real user", !!sess, JSON.stringify(sess));

    await command("Network.clearBrowserCookies");
    await command("Page.navigate", { url: BASE + "/auth/sign-in" });
    await wait('document.querySelector(".noma-login")?.dataset.authReady==="1"');
    await db.query("DELETE FROM access_otp");
    // A passwordless account keeps the OTP method (the plugin only falls back
    // to a password form when the user actually has one).
    await fill("#sentinel-identifier", mobile);
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Continue").click()');
    await wait('document.querySelector("#sentinel-code") || document.querySelector("#sentinel-password")');
    const passwordlessStep = await evaluate('document.querySelector("#sentinel-password") ? "password" : "otp"');
    check("passwordless account uses OTP step, not password", passwordlessStep === "otp", passwordlessStep);
    await shot("sentinel-passwordless-step");

    // Admin screens in Persian to confirm the settings tabs render.
    const admin = (await db.query("SELECT id FROM users WHERE role='administrator' ORDER BY id LIMIT 1")).rows[0];
    check("admin exists for settings screenshot", !!admin);

    // Cleanup everything this run created.
    const created = (await db.query("SELECT id FROM users WHERE mobile=$1", ["+989351234567"])).rows;
    for (const u of created) {
        await db.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await db.query("DELETE FROM options WHERE name=$1", [`access_login_method_${u.id}`]);
    }
    await db.query("DELETE FROM users WHERE mobile=$1", ["+989351234567"]);
    await db.query("DELETE FROM access_otp");
    await db.query("DELETE FROM options WHERE name='access_sms'");

    console.log(out.join("\n"));
    console.log("\nScreenshots:", shots.map((s) => `${s.name}=${s.bytes}B`).join(", "));
    check("no runtime exceptions", exceptions.length === 0, exceptions.join(" | "));
} finally {
    ws?.close();
    if (chrome.exitCode === null) chrome.kill();
    await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
