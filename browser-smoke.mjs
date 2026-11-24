import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function runBrowserSmoke({ origin, username, password, productId, slug, orderId }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'noma-pg-browser-'));
  const executable = process.env.TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const chrome = spawn(executable, ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws, nextId = 0;
  const pending = new Map(), exceptions = [], layouts = [], languageAudit = [], obsoleteRequests = [];
  const obsoletePath = /^\/(rm-admin|rm-login|api\/(?:wp|wc)|shop|product|cart|checkout|my-account|order-received|download-link|download-ready|category|tag|author|feed)(?:\/|$)/;
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP deadline: ' + method)); }, 60000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function wait(predicate) {
    return evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(${predicate})resolve(true);else if(Date.now()-start>45000)reject(new Error('UI wait: '+${JSON.stringify(predicate)}));else setTimeout(check,80)};check()})`);
  }
  async function navigate(route, predicate = 'document.querySelector("main") && !document.querySelector("main .animate-pulse, main .animate-spin")') {
    await command('Page.navigate', { url: origin + route });
    await wait(`location.pathname===${JSON.stringify(route.split('?')[0])} && document.readyState==='complete' && (${predicate})`);
  }
  async function fill(selector, value) {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing input '+${JSON.stringify(selector)});const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  }
  async function click(text) {
    await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw new Error('Missing button '+${JSON.stringify(text)});e.click()})()`);
  }
  async function api(url, method = 'GET', body) {
    return evaluate(`fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body === undefined ? '' : `body:${JSON.stringify(JSON.stringify(body))},`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d})`);
  }
  async function layout(route) {
    const r = await evaluate(`({route:${JSON.stringify(route)},width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);
    layouts.push(r); assert(r.scroll <= r.width + 1, 'Horizontal overflow ' + JSON.stringify(r));
    const links = await evaluate('[...document.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>h.startsWith(location.origin)).map(h=>new URL(h).pathname)');
    assert.deepEqual(links.filter(url=>obsoletePath.test(url)), [], 'Obsolete links at ' + route);
    assert(await evaluate('[...document.querySelectorAll(".noma-mark")].every(e=>getComputedStyle(e).backgroundColor==="rgba(0, 0, 0, 0)")'), 'Logo background at ' + route);
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup deadline')), 20000);
      chrome.once('error', reject);
      chrome.stderr.on('data', b => { text += b; const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    });
    const base = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
    const target = await fetch(base + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl); await once(ws, 'open');
    ws.addEventListener('message', event => {
      const r = JSON.parse(event.data);
      if (r.method === 'Runtime.exceptionThrown') exceptions.push(r.params.exceptionDetails.exception?.description || r.params.exceptionDetails.text);
      if (r.method === 'Network.requestWillBeSent') {
        const url = new URL(r.params.request.url);
        if (url.origin === origin && obsoletePath.test(url.pathname)) obsoleteRequests.push(url.pathname);
      }
      const p = pending.get(r.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(r.id);
      if (r.error) p.reject(new Error(JSON.stringify(r.error))); else p.resolve(r.result);
    });
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate('/auth/sign-in', 'document.querySelector(".noma-login")?.dataset.authReady==="1"');
    await fill('#sentinel-identifier', username);
    await click('Continue');
    await wait('document.querySelector("#sentinel-password")');
    await fill('#sentinel-password', 'wrong-password'); await click('Sign in');
    await wait('document.querySelector("[role=alert]")');
    await fill('#sentinel-password', password); await click('Sign in');    await wait('location.pathname==="/studio" && document.querySelector(".noma-admin")');
    console.log('PASS browser invalid login and actual PostgreSQL session');
    await navigate('/studio/editor/new', 'document.querySelector(".noma-editor-title")');
    await fill('.noma-editor-title', 'Browser PostgreSQL draft');
    await fill('textarea[placeholder="Start writing…"]', 'Text saved through the real editor.');
    await click('Save Draft');
    await wait('location.pathname!=="/studio/editor/new"');
    assert((await api('/api/content/posts?search=Browser')).items.some(p => p.title === 'Browser PostgreSQL draft'));
    console.log('PASS browser editor writes actual PostgreSQL draft');
    const routes = ['/studio', '/studio/posts', '/studio/pages', '/studio/media', '/studio/categories', '/studio/tags', '/studio/comments', '/studio/users', '/studio/profile', '/studio/menus', '/studio/themes', '/studio/settings', '/studio/tools', '/studio/extensions', '/studio/updates', '/studio/commerce', '/studio/commerce/products', '/studio/commerce/orders', '/studio/commerce/coupons', '/studio/commerce/customers', '/studio/commerce/reviews', '/studio/commerce/reports', '/studio/commerce/settings', '/studio/downloads', '/studio/downloads/settings', '/studio/downloads/subscribers', '/studio/downloads/emails', '/studio/access/settings', '/studio/access/blocks'];
    for (const route of routes) {
      await navigate(route); await layout(route); console.log('PASS browser route ' + route);
      assert(!(await evaluate('document.body.innerText.includes("Application error:")')), route);
      if (route.endsWith('/tools')) { await wait('document.body.innerText.includes("PostgreSQL")'); assert((await evaluate('document.body.innerText')).includes('PostgreSQL')); }
      if (route.endsWith('/updates')) assert((await evaluate('document.body.innerText')).includes('not configured'));
    }
    console.log('PASS browser 27 admin screens without runtime exceptions');
    await navigate('/studio/extensions');
    await click('Disable purchases');
    await wait('document.body.innerText.includes("Enable purchases")');
    assert.equal((await api('/api/downloads/settings')).disable_ecommerce, 1);
    await click('Enable purchases'); await wait('document.body.innerText.includes("Disable purchases")');
    await api('/api/commerce/settings', 'POST', { payment_cod_enabled: 0 });
    await navigate('/collection/items/' + slug, 'document.querySelector("h1") && [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Add to cart")');
    await click('Add to cart');
    await wait('document.body.innerText.includes("Added to your cart.")');
    await navigate('/basket'); await layout('/basket');
    await navigate('/purchase', 'document.body.innerText.includes("No payment method is configured")');
    assert(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Place order")).disabled'));
    await api('/api/commerce/settings', 'POST', { payment_cod_enabled: 1 });
    await navigate('/purchase', 'document.querySelector("input[name=payment]")');
    const addresses = { 'Country': 'US', 'First name': 'Browser', 'Last name': 'Test', 'Street address': 'Browser test address', 'State / County': 'CA', 'Town / City': 'Test city', 'Phone': '09120000000', 'Email address': 'browser@example.test' };
    for (const [label, value] of Object.entries(addresses)) {
      const found = await evaluate(`(()=>{const els=[...document.querySelectorAll('input,select')];const e=els.find(x=>x.closest('label')?.textContent.includes(${JSON.stringify(label)}));if(!e)return false;const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
      assert(found, label);
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    }
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Place order")).click()');
    await wait('location.pathname.startsWith("/purchase/receipt/") && document.body.innerText.toLowerCase().includes("on-hold")');
    if (orderId) {
      await navigate(`/purchase/receipt/${orderId}?email=owner%40example.test&email_not_sent=1`, 'document.querySelector("[role=alert]")');
      assert((await evaluate('document.querySelector("[role=alert]").textContent')).includes('could not be sent'));
    }
    console.log('PASS browser real cart, payment gate, unpaid order and receipt');
    await api(`/api/commerce/products/${productId}`, 'PATCH', { regular_price: 0 });
    await api('/api/downloads/settings', 'POST', { capture_email_enable: 1, capture_email_users_enable: 1 });
    await navigate('/collection/items/' + slug, '[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Download Now")');
    await click('Download Now'); await wait('document.querySelector("[role=dialog]")');
    await click('Get my download'); await wait('document.querySelector("[role=dialog] [role=alert]")');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait('!document.querySelector("[role=dialog]")');
    console.log('PASS browser download capture validation and Escape');
    async function auditLanguage(route) {
      const text = await evaluate(`(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const out=[];while(w.nextNode()){const n=w.currentNode,p=n.parentElement;if(p&&!p.closest('script,style,textarea,nextjs-portal')&&p.getClientRects().length&&/[A-Za-z]{3}/.test(n.textContent))out.push(n.textContent.trim())}return [...new Set(out)]})()`);
      languageAudit.push({ route, text });
      const missing = text.filter(value => /\b(Category|Tag|Writing|Reading|Permalinks|Privacy|Account details|in stock|In stock|simple)\b/.test(value) || /^(orders|downloads|custom|configured|not configured|not required|This download link is invalid\.|\d+ sold)$/.test(value));
      assert.deepEqual(missing, [], 'Untranslated interface text at ' + route);
    }
    async function screenshot(name) {
      if (process.env.TEST_SCREENSHOT_DIR) {
        await evaluate('document.fonts.ready');
        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(process.env.TEST_SCREENSHOT_DIR, name + '.png'), Buffer.from(shot.data, 'base64'));
      }
    }
    await navigate('/studio');
    assert.equal(await evaluate('document.title'), 'Rayomand CMS');
    assert(await evaluate('[...document.querySelectorAll("link[rel=icon]")].some(e=>e.href.endsWith("/rayomand-icon-32.png")&&e.sizes.value==="32x32")'));
    assert(await evaluate('[...document.querySelectorAll("link[rel=icon]")].some(e=>new URL(e.href).pathname==="/favicon.ico")'));
    assert(await evaluate('document.querySelector(".noma-mark img").naturalWidth > 0'));
    assert(await evaluate('[...document.querySelectorAll(".noma-mark")].every(e=>getComputedStyle(e).backgroundColor==="rgba(0, 0, 0, 0)"&&getComputedStyle(e).padding==="0px")'));
    const icons = await evaluate(`(async()=>{const result=[];for(const url of ['/favicon.ico','/rayomand-icon-32.png','/rayomand-icon-192.png','/rayomand-apple-icon.png','/rayomand-logo.png']){const r=await fetch(url);if(!r.ok)throw new Error('Icon HTTP '+r.status);const image=new Image();image.src=URL.createObjectURL(await r.blob());await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let visible=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>0)visible++;else transparent++;}result.push({url,width:c.width,height:c.height,corner:pixels[3],visible,transparent});URL.revokeObjectURL(image.src)}return result})()`);
    for (const icon of icons) { assert.equal(icon.corner, 0, icon.url); assert(icon.visible > 0 && icon.transparent > 0, icon.url); }
    assert.equal(icons.find(i=>i.url.endsWith('32.png')).width, 32);
    console.log('PASS browser standard favicon decode and transparent logo backgrounds');
    await screenshot('rayomand-admin-en');
    await click('فارسی');
    await wait('document.documentElement.lang==="fa" && document.documentElement.dir==="rtl" && document.querySelector(".rayomand-language").textContent.includes("English")');
    assert(await evaluate('document.cookie.includes("rayomand_locale=fa")'));
    assert(await evaluate('getComputedStyle(document.body).fontFamily.includes("Vazirmatn")'));
    for (const route of [...routes, '/', '/collection', '/account', '/basket', '/purchase', '/search?s=none', '/files/ready', '/files/access', '/collection/items/' + slug, '/studio/commerce/products/' + productId]) {
      await navigate(route);
      if (route === '/studio/tools') await wait('document.body.innerText.includes("PostgreSQL")');
      await layout(route); await auditLanguage(route);
      assert.equal(await evaluate('document.documentElement.lang'), 'fa', route);
      assert.equal(await evaluate('document.documentElement.dir'), 'rtl', route);
      assert(!(await evaluate('document.body.innerText.includes("Application error:")')), route);
      if (route === '/studio') {
        const geometry = await evaluate('(()=>{const d=document.querySelector(".noma-drawer").getBoundingClientRect(),b=document.querySelector(".noma-admin-body").getBoundingClientRect();return {left:d.left,right:d.right,bodyRight:b.right,width:innerWidth}})()');
        assert(geometry.right <= geometry.width && geometry.left > geometry.width - 280 && geometry.bodyRight <= geometry.left, JSON.stringify(geometry));
        await screenshot('rayomand-admin-fa');
      }
      if (route === '/collection') await screenshot('rayomand-shop-fa');
    }
    for (const route of ['/studio/settings', '/studio/commerce/settings', '/studio/downloads/settings', '/account', '/studio/commerce/products/' + productId]) {
      await navigate(route);
      const tabs = await evaluate('[...document.querySelectorAll("button.noma-tab")].map(b=>b.textContent.trim())');
      for (const tab of tabs) { await click(tab); await auditLanguage(route + '#' + tab); }
    }
    await navigate('/studio/commerce/products/' + productId);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("select")].map(e=>e.value).filter(v=>["publish","instock"].includes(v))'), ['publish']);
    await navigate('/studio/editor/new', 'document.querySelector(".noma-editor-title")');
    await fill('.noma-editor-title', 'یادداشت فارسی — English content preserved');
    await fill('textarea[placeholder="شروع به نوشتن کنید…"]', 'متن فارسی برای آزمایش ذخیره‌سازی واقعی.');
    await click('ذخیرهٔ پیش‌نویس');
    await wait('location.pathname!=="/studio/editor/new"');
    assert((await api('/api/content/posts?search=' + encodeURIComponent('یادداشت فارسی'))).items.some(p=>p.title==='یادداشت فارسی — English content preserved'));
    await api(`/api/commerce/products/${productId}`, 'PATCH', { name: 'Free', regular_price: 0 });
    await navigate('/collection/items/' + slug, 'document.querySelector("h1")?.textContent==="Free"');
    await click('دانلود اکنون'); await wait('document.querySelector("[role=dialog]")');
    assert((await evaluate('document.querySelector("[role=dialog]").textContent')).includes('ایمیل'));
    await click('دریافت دانلود من'); await wait('document.querySelector("[role=dialog] [role=alert]")');
    assert(!/[A-Za-z]/.test(await evaluate('document.querySelector("[role=dialog] [role=alert]").textContent')));
    await screenshot('rayomand-download-fa');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait('!document.querySelector("[role=dialog]")');
    await api(`/api/commerce/products/${productId}`, 'PATCH', { regular_price: 12 });
    await navigate('/collection/items/' + slug, '[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="افزودن به سبد خرید")');
    await click('افزودن به سبد خرید');
    await wait('document.body.innerText.includes("به سبد خرید شما اضافه شد.")');
    await api('/api/commerce/settings', 'POST', { payment_cod_enabled: 0 });
    await navigate('/purchase', 'document.querySelector("[role=alert]")');
    assert(await evaluate('[...document.querySelectorAll("button")].some(b=>b.disabled&&b.textContent.includes("ثبت سفارش"))'));
    await screenshot('rayomand-checkout-fa');
    await auditLanguage('/purchase#payment-gate');
    await api('/api/commerce/settings', 'POST', { payment_cod_enabled: 1 });
    await navigate('/purchase', 'document.querySelector("input[name=payment]")');
    assert((await evaluate('document.body.innerText')).includes('پرداخت هنگام تحویل'));
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const route of ['/studio/posts', '/studio/categories', '/studio/tags', '/studio/menus', '/studio/extensions', '/collection', '/basket', '/purchase', '/collection/items/' + slug]) { await navigate(route); await layout(route); }
    await navigate('/studio');
    await evaluate('document.querySelector("#noma-menu-toggle").click()');
    await wait('document.querySelector(".noma-drawer").dataset.open==="true"');
    await evaluate('new Promise(r=>setTimeout(r,350))');
    assert(await evaluate('document.querySelector(".noma-drawer").getBoundingClientRect().right > innerWidth - 20'));
    await screenshot('rayomand-mobile-fa');
    await evaluate('document.querySelector(".noma-drawer-close").click()');
    await click('English');
    await wait('document.documentElement.dir==="ltr"');
    await navigate('/studio');
    assert.equal(await evaluate('document.documentElement.lang'), 'en');
    if (process.env.TEST_SCREENSHOT_DIR) fs.writeFileSync(path.join(process.env.TEST_SCREENSHOT_DIR, 'language-audit.json'), JSON.stringify(languageAudit, null, 2));
    console.log('PASS bilingual admin, settings tabs, editor, store, checkout, download dialog, user content, cookie persistence and RTL mobile drawer');
    await click('Sign out');
    await wait('location.pathname==="/auth/sign-in" && document.querySelector("#sentinel-identifier")');
    await layout('/auth/sign-in');
    await screenshot('rayomand-sign-in');
    await command('Page.navigate', { url: origin + '/studio' });
    await wait('location.pathname==="/auth/sign-in" && document.readyState==="complete"');
    assert.deepEqual(obsoleteRequests, []);
    assert.deepEqual(exceptions, []);
    console.log('PASS browser native navigation, sign-out, protected studio, mobile layouts and zero runtime exceptions');
  } catch (error) {
    if (ws?.readyState === WebSocket.OPEN) console.error('Browser failure state', await evaluate('({url:location.href,text:document.body.innerText,inputs:[...document.querySelectorAll("form input")].map(e=>({label:e.closest("label")?.textContent,value:e.type==="password"?"[redacted]":e.value,valid:e.validity.valid})),buttons:[...document.querySelectorAll("form button")].map(e=>({text:e.textContent,disabled:e.disabled}))})'));
    throw error;
  } finally {
    if (process.env.TEST_SCREENSHOT_DIR && languageAudit.length) fs.writeFileSync(path.join(process.env.TEST_SCREENSHOT_DIR, 'language-audit.json'), JSON.stringify(languageAudit, null, 2));
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Browser closed')); }
    ws?.close();
    if (chrome.exitCode === null) chrome.kill();
  }
}
