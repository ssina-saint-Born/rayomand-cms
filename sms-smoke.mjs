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
const dbName = `noma_sms_${randomBytes(8).toString('hex')}`;
const control = new pg.Pool({ connectionString: source.href });
await control.query(`CREATE DATABASE "${dbName}"`);
source.pathname = '/' + dbName;
const testDb = new pg.Pool({ connectionString: source.href });
const port = Number(process.env.SMS_TEST_PORT || 3007);
const origin = `http://localhost:${port}`;
const setupToken = randomBytes(32).toString('hex');
const password = randomBytes(20).toString('hex');
const cookies = new Map();
let app;

const billing = { first_name: 'Test', last_name: 'Customer', phone: '09123456789', email: 'buyer@example.test', address_1: 'Test address', city: 'Test city', country: 'IR' };
// Checkout stores the canonical +98 form, so SMS recipients use it too.
const billingCanonical = '+989123456789';
const adminPhone = '09351111111';
const managerPhone = '09222222222';

async function start() {
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: source.href, SETUP_TOKEN: setupToken, NEXT_DIST_DIR: process.env.SMS_TEST_DIST_DIR || '.next-sms', SMTP_HOST: '', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_FROM: '', SMTP_USER: '', SMTP_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next startup deadline')), 90000);
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
async function archiveRows() {
  const r = await testDb.query('SELECT * FROM sms_archive ORDER BY id');
  return r.rows;
}

try {
  await start();
  await pass('setup owner', async () => {
    await api('/api/auth/setup', 'POST', { setup_token: setupToken, username: 'smsowner', email: 'owner@example.test', password });
  });

  await pass('enable the newsletter and manager settings, choose the test gateway', async () => {
    const s = await api('/api/commerce/sms/settings', 'GET');
    assert(s.settings && s.gateways.length, 'gateway list returned');
    assert(s.gateways.some(g => g.id === 'logger'), 'test (logger) gateway is offered');
    const patch = await api('/api/commerce/sms/settings', 'POST', {
      sms_gateway: 'logger',
      enable_notif_sms_main: 1,
      enable_notif_sms: 'on',
      notif_title: 'Notify me about this product',
      enable_onsale: 1,
      notif_onsale_text: 'When the product is on sale',
      enable_notif_no_stock: 1,
      notif_no_stock_text: 'When the product is in stock',
      enable_notif_low_stock: 1,
      notif_low_stock_text: 'When the product is low on stock',
      super_admin_phone: adminPhone,
      super_admin_order_status: ['created', 'processing'],
      order_status: ['created', 'processing', 'completed'],
      product_admin_meta_order_status: ['created', 'processing'],
      stock_low_amount: 3,
      admin_low_stock: 'Low stock: {product_title}',
      admin_out_stock: 'Out of stock: {product_title}',
    });
    assert.equal(patch.settings.sms_gateway, 'logger');
    await api('/api/commerce/settings', 'POST', { payment_cod_enabled: 1, enable_coupons: 1 });
  });

  let product;
  await pass('create a product and configure its SMS tab + managers', async () => {
    product = await api('/api/commerce/products', 'POST', {
      name: 'SMS Test Product', slug: 'sms-test-product', status: 'publish', type: 'simple',
      regular_price: 50, sale_price: 40, manage_stock: 1, stock_quantity: 5, stock_status: 'instock',
    });
    await api(`/api/commerce/products/${product.id}/sms`, 'PATCH', {
      enable_onsale: '1',
      notif_onsale_text: 'Product is on sale now',
      admins: [{ mobile: managerPhone, statuses: ['created', 'processing'] }],
    });
    const tab = await api(`/api/commerce/products/${product.id}/sms`, 'GET');
    assert.equal(tab.admins.length, 1, 'manager saved');
    assert.equal(tab.admins[0].mobile, managerPhone);
  });

  let subscribedGroup;
  await pass('storefront newsletter groups + subscribe a contact', async () => {
    const groups = await api(`/api/storefront/newsletter/groups?product_id=${product.id}`, 'GET', undefined, true);
    assert.equal(groups.enabled, true);
    assert(groups.groups.length > 0, 'at least one group offered');
    const code = groups.groups[0].code;
    subscribedGroup = code;
    const r = await request('/api/storefront/newsletter/subscribe', 'POST', { product_id: product.id, sms_mobile: '09120000000', sms_group: [code] }, true);
    assert.equal(r.status, 200, `subscribe status ${r.status}`);
    assert.equal(r.data.success, true, `subscribe message: ${r.data.message}`);
    const list = await api('/api/commerce/sms/contacts?product_id=' + product.id, 'GET');
    assert.equal(list.items.length, 1, 'contact stored');
    assert(list.items[0].groups.includes(code), 'group stored');
  });

  await pass('checkout fires customer + super admin + product manager SMS into the archive', async () => {
    await api('/api/storefront/cart', 'POST', { product_id: product.id, quantity: 1 });
    await api('/api/storefront/checkout', 'POST', { billing, payment_method: 'cod', sms_opt_in: true });
    const senders = (await archiveRows()).map(r => [r.type, r.reciever]);
    assert(senders.some(([t, r]) => t === 2 && r === billingCanonical), `no customer SMS (type 2): ${JSON.stringify(senders)}`);
    assert(senders.some(([t, r]) => t === 4 && r === adminPhone), `no super-admin SMS (type 4): ${JSON.stringify(senders)}`);
    assert(senders.some(([t, r]) => t === 5 && r === managerPhone), `no product-manager SMS (type 5): ${JSON.stringify(senders)}`);
  });

  await pass('status change to processing re-sends customer + managers', async () => {
    const order = (await testDb.query('SELECT id FROM orders ORDER BY id DESC LIMIT 1')).rows[0];
    await api(`/api/commerce/orders/${order.id}`, 'PATCH', { status: 'processing' });
    const count = (await archiveRows()).filter(r => r.type === 2 && r.reciever === billingCanonical).length;
    assert(count >= 2, `customer SMS not re-sent on processing: ${count}`);
  });

  await pass('single + bulk send from the send screen', async () => {
    const bulk = await api('/api/commerce/sms/send', 'POST', { mobile: '09350000000', message: 'Hello from the test gateway' });
    assert.equal(bulk.success, true, 'bulk send recorded');
    assert.equal(bulk.count, 1);
  });

  await pass('archive list, filter and delete by period', async () => {
    const list = await api('/api/commerce/sms/archive?per_page=20', 'GET');
    assert(list.items.length > 0, 'archive has rows');
    const byType = await api('/api/commerce/sms/archive?type=4&per_page=20', 'GET');
    assert(byType.items.every(r => r.type === 4), 'type filter works');
    const del = await api('/api/commerce/sms/archive?period=all', 'DELETE');
    assert(del.deleted > 0, `deleted ${del.deleted} rows`);
    assert.equal((await archiveRows()).length, 0, 'archive emptied');
  });

  await pass('newsletter group send to subscribers lands in archive', async () => {
    // Contacts survived the archive wipe (only the archive was emptied).
    const sent = await api(`/api/commerce/products/${product.id}/sms`, 'POST', { group: subscribedGroup, message: 'Group update: {product_title}' });
    assert.equal(sent.sent, 1, 'sent to 1 subscriber');
    const rows = await archiveRows();
    assert(rows.some(x => x.reciever === '09120000000'), 'subscriber received the group message');
  });

  console.log('\nAll SMS smoke checks passed.');
  await stop();
  await testDb.end().catch(() => { });
  await control.end().catch(() => { });
  await control.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => { });
  process.exit(0);
}
catch (e) {
  console.error(e && e.stack || e);
  await stop().catch(() => { });
  await testDb.end().catch(() => { });
  await control.end().catch(() => { });
  await control.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => { });
  process.exit(1);
}