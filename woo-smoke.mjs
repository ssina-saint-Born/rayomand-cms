import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

const root = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(root, '.env'));
const source = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(source.hostname), 'Tests require local PostgreSQL.');
const dbName = `noma_test_${randomBytes(8).toString('hex')}`;
const control = new pg.Pool({ connectionString: source.href });
await control.query(`CREATE DATABASE "${dbName}"`);
source.pathname = '/' + dbName;
const testDb = new pg.Pool({ connectionString: source.href });
const port = Number(process.env.TEST_PORT || 3003);
const origin = `http://localhost:${port}`;
const setupToken = randomBytes(32).toString('hex');
const password = randomBytes(20).toString('hex');
const cookies = new Map();
const files = [0, 1].map(i => path.join(root, 'public/downloads', `${dbName}-${i}.txt`));
let app;
const billing = { first_name: 'Test', last_name: 'Owner', email: 'owner@example.test', address_1: 'Test address', city: 'Test city', country: 'US', phone: '09120000000' };
for (const [i, file] of files.entries()) fs.writeFileSync(file, `PostgreSQL test file ${i}`, { flag: 'wx' });

async function start() {
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), process.env.TEST_PRODUCTION === '1' ? 'start' : 'dev', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: source.href, SETUP_TOKEN: setupToken, NEXT_DIST_DIR: process.env.TEST_DIST_DIR || '.next-qa' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next startup deadline')), 60000);
    app.once('error', reject);
    app.once('exit', code => reject(new Error(`Next exited: ${code}`)));
    app.stdout.on('data', b => { if (b.toString().includes('Ready in')) { clearTimeout(timer); resolve(); } });
    app.stderr.on('data', b => process.stderr.write(b));
  });
}
async function stop() {
  if (app && app.exitCode === null) { const exited = once(app, 'exit'); app.kill(); await exited; }
}
async function request(url, method = 'GET', body, anonymous = false, extraHeaders = {}) {
  const r = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', ...(!anonymous ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!anonymous) for (const cookie of r.headers.getSetCookie()) { const [k, ...v] = cookie.split(';')[0].split('='); cookies.set(k, v.join('=')); }
  const data = r.headers.get('content-type')?.includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, headers: r.headers };
}
async function api(url, method = 'GET', body) {
  const r = await request(url, method, body);
  assert(r.status < 400, `${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
async function pass(name, work) { await work(); console.log(`PASS ${name}`); }
async function som(patch) { return api('/api/downloads/settings', 'POST', patch); }
async function woo(patch) { return api('/api/commerce/settings', 'POST', patch); }
async function product(name, patch = {}) { return api('/api/commerce/products', 'POST', { name, slug: name, status: 'publish', regular_price: 0, virtual: true, downloadable: true, files: files.map((f, i) => ({ name: `file-${i}.txt`, file: '/downloads/' + path.basename(f) })), ...patch }); }
async function download(id, extra = {}, anonymous = false) { return request('/api/downloads/download', 'POST', { product_id: id, email: billing.email, ...extra }, anonymous); }

try {
  await start();
  await pass('native routes, protected studio and removed legacy addresses', async () => {
    const studio = await fetch(origin + '/studio', { redirect: 'manual' });
    assert.equal(studio.status, 307);
    assert.equal(new URL(studio.headers.get('location'), origin).pathname, '/auth/sign-in');
    for (const route of ['/auth/sign-in', '/collection', '/basket', '/purchase', '/account', '/files/access', '/files/ready', '/journal/feed']) {
      assert.equal((await request(route, 'GET', undefined, true)).status, 200, route);
    }
    for (const route of ['/rm-login', '/rm-admin', '/rm-admin/woo/products', '/api/wp/v2/posts', '/api/wc/v3/products', '/api/wc/store/products', '/shop', '/product/test', '/cart', '/checkout', '/my-account', '/order-received/1', '/download-link', '/download-ready', '/category/test', '/tag/test', '/author/test', '/feed']) {
      assert.equal((await request(route, 'GET', undefined, true)).status, 404, route);
    }
    assert.equal((await request('/api/commerce/products', 'GET', undefined, true)).status, 401);
    assert.equal((await request('/api/downloads/settings', 'GET', undefined, true)).status, 401);
    assert.equal((await request('/api/downloads/settings', 'POST', {}, true)).status, 401);
    assert.equal((await request('/downloads/private.txt', 'GET', undefined, true)).status, 403);
    const icon = await request('/favicon.ico', 'GET', undefined, true);
    assert.equal(icon.status, 200);
    assert.equal(icon.data.readUInt16LE(2), 1);
    assert.equal(icon.data.readUInt16LE(4), 3);
  });
  await pass('empty PostgreSQL and protected first-owner setup', async () => {
    assert.equal((await api('/api/auth/setup')).required, true);
    assert.equal((await api('/api/storefront/products')).total, 0);
    assert.equal((await api('/api/content/posts')).total, 0);
    assert.equal((await request('/api/auth/setup', 'POST', { setup_token: 'invalid' })).status, 403);
    assert.equal((await request('/api/auth/setup', 'POST', {}, false, { Origin: 'http://invalid.test' })).status, 403);
    const owner = await api('/api/auth/setup', 'POST', { setup_token: setupToken, username: 'testowner', email: billing.email, password });
    assert(owner.id > 0);
    assert.equal((await api('/api/auth/setup')).required, false);
    assert.equal((await request('/api/auth/setup', 'POST', { setup_token: setupToken, username: 'otherowner', email: 'other@example.test', password })).status, 409);
    assert.equal((await api('/api/content/health')).database.engine, 'PostgreSQL');
  });
  let post, category, menu;
  await pass('CMS posts, terms, menus, settings, comments and import/export', async () => {
    category = await api('/api/content/categories', 'POST', { name: 'Test category', slug: 'test-category' });
    await api(`/api/content/categories/${category.id}`, 'PATCH', { name: 'Updated category' });
    post = await api('/api/content/posts', 'POST', { title: 'Test post', status: 'draft', content: [{ id: 'paragraph', type: 'paragraph', attrs: { text: 'Real stored text' } }], category_ids: [category.id] });
    post = await api(`/api/content/posts/${post.id}`, 'PATCH', { title: 'Updated post', status: 'publish' });
    assert.equal((await api('/api/content/posts?search=Updated')).total, 1);
    assert.equal((await request('/read/' + post.slug)).status, 200);
    assert.equal((await request('/' + post.slug)).status, 404);
    const search = await api('/api/content/search?search=Updated');
    assert(search.items.some(item => item.url === '/read/' + post.slug));
    const feed = await request('/journal/feed');
    assert(feed.data.toString().includes(`${origin}/read/${post.slug}`));
    for (const route of ['/topics/test-category', '/creators/testowner']) assert.equal((await request(route)).status, 200, route);
    menu = await api('/api/content/menus', 'POST', { name: 'Test menu', location: 'primary' });
    await api(`/api/content/menus/${menu.id}`, 'PUT', { name: 'Updated menu', items: [{ label: 'Test post', url: '/read/' + post.slug, type: 'custom', sort_order: 0 }] });
    await api('/api/content/settings', 'POST', { site_title: 'Test workspace' });
    await api('/api/content/comments', 'POST', { post_id: post.id, author_name: 'Test comment', author_email: billing.email, content: 'Stored comment' });
    const exported = await api('/api/content/tools/export');
    assert(exported.posts.length > 0);
    const imported = await api('/api/content/tools/import', 'POST', { posts: [{ id: 123, title: 'Imported', slug: 'imported', type: 'page', status: 'draft', content: '[]' }], terms: [], comments: [] });
    assert.equal(imported.importedPosts, 1);
    await api(`/api/content/posts/${post.id}`, 'DELETE');
    await api(`/api/content/posts/${post.id}?action=restore`, 'DELETE');
  });
  await som({ require_login: 0, capture_email_enable: 0, download_limits_active: 0, download_type_option: 0, included_products: [], included_categories: [], included_tags: [], include_purchased: 1 });
  await woo({ enable_downloads: 1, calc_taxes: 0, payment_cod_enabled: 0 });
  const p = await product('test-download');
  await pass('native product updates, selection and concurrent token replay', async () => {
    assert.equal((await api(`/api/commerce/products/${p.id}`, 'PATCH', { regular_price: 12 })).price, 12);
    assert.equal((await api(`/api/commerce/products/${p.id}`, 'PATCH', { regular_price: 0 })).price, 0);
    const r = await download(p.id, { files: [0] });
    assert.equal(r.status, 200);
    assert.equal((await request(r.data.files[0].url.replace('f=0', 'f=1'))).status, 410);
    const results = await Promise.all([request(r.data.files[0].url), request(r.data.files[0].url)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 410]);
    const zipped = await download(p.id);
    await som({ force_zip: 1 });
    const zip = await download(p.id);
    assert.equal((await request(zip.data.zip.url)).status, 200);
    await som({ force_zip: 0 });
    const token = new URL(zipped.data.files[0].url, origin).searchParams.get('token');
    await testDb.query('UPDATE download_tokens SET expires_at=$1 WHERE token=$2', ['2000-01-01T00:00:00.000Z', token]);
    assert.equal((await request(zipped.data.files[0].url)).status, 410);
  });
  await pass('native redirect download page and selected-file URLs', async () => {
    await som({ download_type_option: 2 });
    const r = await download(p.id, { files: [1] });
    assert.equal(r.status, 200);
    assert.equal(new URL(r.data.url, origin).pathname, '/files/ready');
    assert.equal((await request(r.data.url)).status, 200);
    const token = new URL(r.data.url, origin).searchParams.get('token');
    const detail = await api('/api/downloads/token?token=' + token);
    assert(detail.file_urls.every(url => url.startsWith('/api/downloads/file?')));
    await som({ download_type_option: 0 });
  });
  await pass('concurrent download limits and disabled master gates', async () => {
    const limited = await product('test-limited');
    await som({ download_limits_active: 1, indy_items: { [limited.id]: { limit_enable: true, limit_amount: 1, limit_freq: 'all' } } });
    const results = await Promise.all([download(limited.id), download(limited.id)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
    await som({ download_limits_active: 0, indy_items: {}, require_login: 1 });
    assert.equal((await download(p.id, {}, true)).status, 403);
    await som({ require_login: 0, capture_email_enable: 1, capture_email_users_enable: 1 });
    assert.equal((await download(p.id, { email: '' })).data.capture_required, true);
    assert.equal((await download(p.id, { email: 'invalid' })).status, 400);
    await som({ capture_email_enable: 0 });
    await woo({ enable_downloads: 0 });
    assert.equal((await download(p.id)).status, 400);
    await woo({ enable_downloads: 1 });
  });
  await pass('unconfigured SMTP fails without a token or fabricated success', async () => {
    await som({ download_type_option: 1 });
    const before = (await testDb.query('SELECT count(*)::int c FROM download_tokens')).rows[0].c;
    assert.equal((await download(p.id)).status, 503);
    assert.equal((await testDb.query('SELECT count(*)::int c FROM download_tokens')).rows[0].c, before);
    assert.equal((await testDb.query("SELECT status FROM email_log ORDER BY id DESC LIMIT 1")).rows[0].status, 'unconfigured');
    await som({ download_type_option: 0 });
  });
  let order;
  await pass('cart, coupon SQL, unpaid checkout, atomic confirmation and manual refund', async () => {
    await api(`/api/commerce/products/${p.id}`, 'PATCH', { regular_price: 12, manage_stock: 1, stock_quantity: 3 });
    const coupon = await api('/api/commerce/coupons', 'POST', { code: 'TEST10', discount_type: 'percent', amount: 10, enabled: true });
    await api(`/api/commerce/coupons/${coupon.id}`, 'PATCH', { ...coupon, amount: 10 });
    await api('/api/storefront/cart', 'POST', { product_id: p.id, quantity: 2 });
    assert.equal((await api('/api/storefront/cart/coupon', 'POST', { code: 'test10' })).totals.total, 21.6);
    assert.equal((await request('/api/storefront/checkout', 'POST', { billing, payment_method: 'cod' })).status, 400);
    assert.equal((await api('/api/storefront/cart')).count, 2);
    await woo({ payment_cod_enabled: 1 });
    const results = await Promise.all([request('/api/storefront/checkout', 'POST', { billing, payment_method: 'cod' }), request('/api/storefront/checkout', 'POST', { billing, payment_method: 'cod' })]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 400].sort());
    const result = results.find(r => r.status === 201).data;
    order = result.order;
    assert.equal(order.status, 'on-hold');
    assert.equal(order.transaction_id, '');
    assert.equal((await request(`/api/storefront/orders/${order.id}`, 'GET', undefined, true)).status, 403);
    assert.equal((await request(`/api/storefront/orders/${order.id}?email=owner%40example.test`, 'GET', undefined, true)).status, 403);
    assert.equal((await request(`/api/storefront/orders/${order.id}?key=${order.access_token}`, 'GET', undefined, true)).status, 200);
    assert(result.email_warning.includes('Mail is not set up'));
    assert.equal((await api(`/api/commerce/products/${p.id}`)).stock_quantity, 3);
    await api(`/api/commerce/orders/${order.id}`, 'PATCH', { status: 'completed' });
    assert.equal((await api(`/api/commerce/products/${p.id}`)).stock_quantity, 1);
    await api(`/api/commerce/orders/${order.id}/notes`, 'POST', { content: 'Payment manually confirmed' });
    await api(`/api/commerce/orders/${order.id}/refunds`, 'POST', { amount: 21.6, reason: 'Manual test refund' });
    assert.equal((await api(`/api/commerce/orders/${order.id}`)).status, 'refunded');
    assert.equal((await api('/api/storefront/cart')).count, 0);
    assert.equal((await api('/api/commerce/reports')).series.length, 30);
    assert.equal((await api('/api/downloads/stats')).series.length, 30);
  });
  await pass('registration validation and unprivileged roles', async () => {
    await api('/api/content/settings', 'POST', { users_can_register: 1, default_role: 'administrator' });
    assert.equal((await request('/api/auth/register', 'POST', { username: 'short', email: 'short@example.test', password: 'short' }, true)).status, 400);
    const r = await request('/api/auth/register', 'POST', { username: 'registered', email: 'registered@example.test', password }, true);
    assert.equal(r.status, 201);
    assert.equal((await testDb.query('SELECT role FROM users WHERE id=$1', [r.data.id])).rows[0].role, 'subscriber');
  });
  await stop();
  await start();
  // The CMS ships its own mail engine; there is no SMTP relay to point at a
  // fake server. Configure a domain + system mailbox, deliver to a local
  // mailbox, and assert the message lands in that mailbox's INBOX.
  await pass('native mail delivery and retained selected file link', async () => {
    await api('/api/mail/system-sender', 'POST', { hostname: 'example.test' });
    const acct = await api('/api/mail/accounts', 'POST', { domain_id: (await api('/api/mail/domains')).data.domains.find(d => d.name === 'example.test').id, local_part: 'buyer', display_name: 'Buyer', secret: 'buyer-secret-123456' });
    assert(acct.data.account.id);
    await api(`/api/commerce/products/${p.id}`, 'PATCH', { regular_price: 0 });
    await som({ download_type_option: 1 });
    const r = await download(p.id, { files: [1], email: 'buyer@example.test' });
    assert.equal(r.status, 200);
    assert.equal(r.data.type, 'email');
    const row = (await testDb.query('SELECT status,message_id,body FROM email_log ORDER BY id DESC LIMIT 1')).rows[0];
    assert.equal(row.status, 'accepted'); assert(row.message_id);
    assert(row.body.includes(`${origin}/files/access?token=`));
    const token = row.body.match(/token=([a-f0-9]+)/)[1];
    assert.equal((await request('/files/access?token=' + token)).status, 200);
    assert.equal((await api('/api/downloads/token?token=' + token)).product.files.length, 1);
    // The message is now in the buyer's INBOX (local delivery is synchronous).
    const inbox = await testDb.query(
      `SELECT m.id FROM mail_messages m JOIN mail_folders f ON f.id=m.folder_id
       WHERE f.account_id=$1 AND f.name='INBOX'`, [acct.data.account.id]);
    assert(inbox.rows.length >= 1, 'message delivered to local INBOX');
    await som({ download_type_option: 0 });
  });
  if (process.env.BROWSER_TEST === '1') {
    await api(`/api/commerce/products/${p.id}`, 'PATCH', { regular_price: 12 });
    const { runBrowserSmoke } = await import('./browser-smoke.mjs');
    await runBrowserSmoke({ origin, username: 'testowner', password, productId: p.id, slug: p.slug, orderId: order.id });
  }
  console.log('All isolated PostgreSQL checks passed. Main database was not modified.');
} finally {
  await stop();
  await testDb.end();
  await control.query(`DROP DATABASE "${dbName}"`);
  await control.end();
  for (const file of files) fs.unlinkSync(file);
}
