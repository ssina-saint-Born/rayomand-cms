import pg from "pg";
import fs from "fs";

const env = Object.fromEntries(
    fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();

const BASE = process.env.ACCESS_BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  PASS  ${n}`); } else { fail++; out.push(`  FAIL  ${n} ${d}`); } };

let cookie = "";
async function call(path, opts = {}) {
    const res = await fetch(BASE + path, {
        ...opts,
        headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
    });
    for (const c of res.headers.getSetCookie?.() || []) {
        const pair = c.split(";")[0];
        const name = pair.split("=")[0];
        const rest = cookie.split("; ").filter((p) => p && !p.startsWith(name + "="));
        rest.push(pair);
        cookie = rest.join("; ");
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
}

// Ensure COD is available, registration is open + auto mode.
const wooRow = await db.query("SELECT value FROM options WHERE name='shop_settings'");
let woo = {};
try { woo = wooRow.rows[0] ? JSON.parse(wooRow.rows[0].value) : {}; } catch {}
woo.payment_cod_enabled = true;
await db.query(
    "INSERT INTO options (name,value) VALUES ('shop_settings',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [JSON.stringify(woo)],
);
await db.query(
    `INSERT INTO options (name,value) VALUES ('access_general',$1)
     ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify({ core_users_can_register: true, core_default_role: "customer", commerce_checkout_registration_required: "yes_automatic" })],
);

const existing = await db.query("SELECT id,name,price FROM products WHERE type='simple' AND status='publish' LIMIT 1");
let product = existing.rows[0];
let tempProduct = null;
if (!product) {
    const ins = await db.query(
        `INSERT INTO products (name,slug,description,status,type,regular_price,price,created_at,updated_at)
         VALUES ('محصول آزمایشی پینوا','sentinel-test-product','تست','publish','simple',1000,1000,$1,$1) RETURNING id,name,price`,
        [new Date().toISOString()],
    );
    product = ins.rows[0];
    tempProduct = product.id;
}
console.log("using product:", product.id, product.name);

// Add to cart anonymously.
let r = await call("/api/storefront/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
check("cart add ok", r.status === 200, r.text.slice(0, 200));

const email = `sentinelcheckout${Date.now()}@example.com`;
const mobile = "09351234567";
await db.query("DELETE FROM users WHERE mobile=$1", ["+989351234567"]);

// Checkout with empty phone first.
r = await call("/api/storefront/checkout", {
    method: "POST",
    body: JSON.stringify({ billing: { first_name: "سارا", last_name: "احمدی", email, address_1: "خیابان ولیعصر", city: "تهران", country: "IR", phone: "" } }),
});
check("checkout requires phone", r.json?.error && /موبایل/.test(r.json.error), r.text.slice(0, 300));

// Checkout with valid phone -> auto register + order.
r = await call("/api/storefront/checkout", {
    method: "POST",
    body: JSON.stringify({
        billing: { first_name: "سارا", last_name: "احمدی", email, address_1: "خیابان ولیعصر", city: "تهران", country: "IR", phone: mobile },
        payment_method: "cod",
    }),
});
check("checkout auto-registers and creates order", r.status === 201 && !!r.json?.order?.id && r.json?.registered === true, r.text.slice(0, 400));

const created = await db.query("SELECT id,username,email,display_name,mobile,role FROM users WHERE mobile=$1", ["+989351234567"]);
check("auto-registered user exists with mobile", created.rows.length === 1 && created.rows[0].mobile === "+989351234567", JSON.stringify(created.rows));
check("auto-registered display name from billing", created.rows[0]?.display_name === "سارا احمدی", JSON.stringify(created.rows[0]));
check("auto-registered role is customer", created.rows[0]?.role === "customer", JSON.stringify(created.rows[0]));

const orderId = r.json?.order?.id;
if (orderId) {
    const ord = await db.query("SELECT customer_id,billing FROM orders WHERE id=$1", [orderId]);
    check("order linked to new customer", ord.rows[0]?.customer_id === created.rows[0]?.id, JSON.stringify(ord.rows[0]));
    const billing = ord.rows[0] ? JSON.parse(ord.rows[0].billing) : {};
    check("order billing stores canonical phone", billing.phone === "+989351234567", JSON.stringify(billing));
}

// Second checkout with the same mobile must be refused (account exists).
await call("/api/storefront/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
cookie = cookie.split("; ").filter((p) => !p.startsWith("rm_session=")).join("; ");
r = await call("/api/storefront/checkout", {
    method: "POST",
    body: JSON.stringify({
        billing: { first_name: "X", last_name: "Y", email: `other${Date.now()}@example.com`, address_1: "a", city: "b", country: "IR", phone: mobile },
        payment_method: "cod",
    }),
});
check("duplicate mobile checkout blocked", r.status !== 201 && /وجود دارد/.test(r.json?.error || ""), r.text.slice(0, 300));

// ---- yes_redirect must require sign-in instead of auto-creating an account.
await db.query(
    "INSERT INTO options (name,value) VALUES ('access_general',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [JSON.stringify({ core_users_can_register: true, core_default_role: "customer", commerce_checkout_registration_required: "yes_redirect" })],
);
cookie = cookie.split("; ").filter((p) => !p.startsWith("rm_session=")).join("; ");
await call("/api/storefront/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
const redirectMobile = "09361234567";
await db.query("DELETE FROM users WHERE mobile=$1", ["+989361234567"]);
r = await call("/api/storefront/checkout", {
    method: "POST",
    body: JSON.stringify({
        billing: { first_name: "رها", last_name: "کریمی", email: `redirect${Date.now()}@example.com`, address_1: "خیابان آزادی", city: "تهران", country: "IR", phone: redirectMobile },
        payment_method: "cod",
    }),
});
check("yes_redirect blocks anonymous checkout", r.status !== 201 && /وارد شوید|logged in/.test(r.json?.error || ""), r.text.slice(0, 300));
const redirectUser = await db.query("SELECT id FROM users WHERE mobile=$1", ["+989361234567"]);
check("yes_redirect does not create an account", redirectUser.rows.length === 0, JSON.stringify(redirectUser.rows));

// ---- "no" mode allows guest checkout without creating an account.
await db.query(
    "INSERT INTO options (name,value) VALUES ('access_general',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [JSON.stringify({ core_users_can_register: true, core_default_role: "customer", commerce_checkout_registration_required: "no" })],
);
cookie = cookie.split("; ").filter((p) => !p.startsWith("rm_session=")).join("; ");
await call("/api/storefront/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
const guestMobile = "09371234567";
await db.query("DELETE FROM users WHERE mobile=$1", ["+989371234567"]);
r = await call("/api/storefront/checkout", {
    method: "POST",
    body: JSON.stringify({
        billing: { first_name: "نیما", last_name: "رستمی", email: `guest${Date.now()}@example.com`, address_1: "خیابان انقلاب", city: "تهران", country: "IR", phone: guestMobile },
        payment_method: "cod",
    }),
});
check("no mode allows guest checkout", r.status === 201 && r.json?.registered === false, r.text.slice(0, 300));
const guestUser = await db.query("SELECT id FROM users WHERE mobile=$1", ["+989371234567"]);
check("no mode does not create an account", guestUser.rows.length === 0, JSON.stringify(guestUser.rows));
const guestOrderId = r.json?.order?.id;
if (guestOrderId) {
    const gb = await db.query("SELECT customer_id,billing FROM orders WHERE id=$1", [guestOrderId]);
    check("guest order keeps canonical phone and no customer", gb.rows[0]?.customer_id === 0 && JSON.parse(gb.rows[0].billing).phone === "+989371234567", JSON.stringify(gb.rows[0]));
    await db.query("DELETE FROM order_items WHERE order_id=$1", [guestOrderId]);
    await db.query("DELETE FROM orders WHERE id=$1", [guestOrderId]);
}

// Cleanup
await db.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id=$1)", [created.rows[0]?.id]);
await db.query("DELETE FROM orders WHERE customer_id=$1", [created.rows[0]?.id]);
await db.query("DELETE FROM customer_profiles WHERE user_id=$1", [created.rows[0]?.id]);
await db.query("DELETE FROM sessions WHERE user_id=$1", [created.rows[0]?.id]);
await db.query("DELETE FROM options WHERE name=$1", [`access_login_method_${created.rows[0]?.id}`]);
await db.query("DELETE FROM users WHERE id=$1", [created.rows[0]?.id]);
await db.query("DELETE FROM options WHERE name='access_general'");
woo.payment_cod_enabled = false;
await db.query(
    "INSERT INTO options (name,value) VALUES ('shop_settings',$1) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
    [JSON.stringify(woo)],
);
if (tempProduct) { await db.query("DELETE FROM cart_items WHERE product_id=$1", [tempProduct]).catch(() => {}); await db.query("DELETE FROM products WHERE id=$1", [tempProduct]); }
await db.end();

console.log(out.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
