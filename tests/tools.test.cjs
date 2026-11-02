// Browser tests for the tools, run with Playwright (not a dependency of the
// site; see README "Tests"). Serves the repo on a free local port, blocks
// every request that is not to that server or to the mocked Azure account,
// and exits 1 on any failure, 2 if the checks did not all run.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript' };

let passed = 0, failed = 0, planned = 0;
const tests = [];
function test(name, fn) { planned++; tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---- Azure mock ----
const ACCOUNT = 'acct1';
const SIG = 'c2VjcmV0LXNpZ25hdHVyZQ%3D%3D';
const SAS = 'sv=2022-11-02&ss=b&srt=sco&sp=rl&se=2030-01-01T00%3A00%3A00Z&spr=https&sig=' + SIG;
const RES_A = '/SUBSCRIPTIONS/0000-1111/RESOURCEGROUPS/RG-WEB/PROVIDERS/MICROSOFT.WEB/SITES/SHOP-API';
const RES_B = '/SUBSCRIPTIONS/0000-1111/RESOURCEGROUPS/RG-DATA/PROVIDERS/MICROSOFT.KEYVAULT/VAULTS/KV-MAIN';
const C = 'insights-logs-appservicehttplogs';
const blobName = (res, h) => 'resourceId=' + res + '/y=2026/m=11/d=02/h=' + h + '/m=00/PT1H.json';
const BLOBS = [blobName(RES_A, '09'), blobName(RES_A, '10'), blobName(RES_B, '10')];
const rec = (res, time, category, op, level, extra) => JSON.stringify({ time, resourceId: res, category, operationName: op, level, properties: extra || {} });
const BODIES = {
  [BLOBS[0]]: [rec(RES_A, '2026-11-02T09:10:00Z', 'AppServiceHTTPLogs', 'GET /a', 'Informational'),
    rec(RES_A, '2026-11-02T09:20:00Z', 'AppServiceHTTPLogs', 'GET /b', 'Error', { msg: '<img src=x onerror="window.__xss=1">' }),
    'not json at all'].join('\n'),
  [BLOBS[1]]: rec(RES_A, '2026-11-02T10:05:00Z', 'AppServiceConsoleLogs', 'Write', 'Warning') + '\n',
  // The {"records":[...]} form some categories still use.
  [BLOBS[2]]: JSON.stringify({ records: [JSON.parse(rec(RES_B, '2026-11-02T10:30:00Z', 'AuditEvent', 'SecretGet', 'Informational'))] }),
};
const xml = s => '<?xml version="1.0" encoding="utf-8"?>' + s;
const listXml = (names, next) => xml('<EnumerationResults><Blobs>' + names.map(n =>
  '<Blob><Name>' + n + '</Name><Properties><Last-Modified>Mon, 02 Nov 2026 10:00:00 GMT</Last-Modified><Content-Length>' + (BODIES[n] || '').length + '</Content-Length></Properties></Blob>').join('') +
  '</Blobs><NextMarker>' + (next || '') + '</NextMarker></EnumerationResults>');

async function mockAzure(page, opts = {}) {
  const seen = [];
  await page.route('https://' + ACCOUNT + '.blob.core.windows.net/**', route => {
    const u = new URL(route.request().url());
    seen.push(u);
    const cors = { 'access-control-allow-origin': '*' };
    if (opts.network) return route.abort('failed');
    if (u.searchParams.get('sig') !== decodeURIComponent(SIG)) {
      return route.fulfill({ status: 403, headers: cors, body: xml('<Error><Code>AuthenticationFailed</Code><Message>Server failed to authenticate.\nRequestId:x</Message></Error>') });
    }
    const p = decodeURIComponent(u.pathname);
    if (p === '/' && u.searchParams.get('comp') === 'list') {
      if (opts.noServiceType) return route.fulfill({ status: 403, headers: cors, body: xml('<Error><Code>AuthorizationResourceTypeMismatch</Code><Message>This request is not authorized.</Message></Error>') });
      return route.fulfill({ headers: cors, body: xml('<EnumerationResults><Containers><Container><Name>backups</Name></Container><Container><Name>' + C + '</Name></Container></Containers><NextMarker/></EnumerationResults>') });
    }
    if (p === '/' + C && u.searchParams.get('comp') === 'list') {
      const marker = u.searchParams.get('marker');
      return route.fulfill({ headers: cors, body: marker === 'm2' ? listXml(BLOBS.slice(2), '') : listXml(BLOBS.slice(0, 2), 'm2') });
    }
    const name = p.slice(C.length + 2);
    if (BODIES[name] != null) return route.fulfill({ headers: cors, body: BODIES[name] });
    return route.fulfill({ status: 404, headers: cors, body: xml('<Error><Code>BlobNotFound</Code><Message>nope</Message></Error>') });
  });
  return seen;
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();

  async function open(url, opts = {}) {
    const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, colorScheme: opts.scheme || 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Offline: only the local server and the mocked account are reachable.
    await context.route(u => !u.href.startsWith(base) && !u.hostname.endsWith('.blob.core.windows.net'), r => r.abort());
    if (opts.init) await page.addInitScript(opts.init);
    page.__errors = errors;
    page.__ctx = context;
    if (opts.before) await opts.before(page);
    await page.goto(base + url);
    return page;
  }
  const realErrors = page => page.__errors.filter(e => !/net::ERR_FAILED|ERR_BLOCKED|fonts\.g/.test(e));
  async function noHScroll(page) {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(w <= 0, 'horizontal scroll of ' + w + 'px');
  }

  // ---------- pwd-gen ----------
  test('pwd-gen never calls Math.random and makes a 20-character password', async () => {
    const page = await open('/pwd-gen/index.html?lang=en', { init: () => { Math.random = () => { window.__mathRandom = true; throw new Error('Math.random used'); }; } });
    const pw = await page.inputValue('#output');
    eq(pw.length, 20, 'default length');
    await page.click('#regen');
    assert(await page.inputValue('#output') !== pw, 'regenerate gives a new password');
    eq(await page.evaluate(() => window.__mathRandom || false), false, 'Math.random called');
    eq(realErrors(page).length, 0, 'page errors: ' + realErrors(page).join(' | '));
    await page.__ctx.close();
  });

  test('pwd-gen randomInt rejects the biased tail instead of using modulo', async () => {
    const page = await open('/pwd-gen/index.html?lang=en');
    const out = await page.evaluate(() => {
      const real = crypto.getRandomValues.bind(crypto);
      const feed = [0xFFFFFFFF, 7]; // 0xFFFFFFFF is past the last full block for n = 3
      let calls = 0;
      crypto.getRandomValues = a => { a[0] = feed[calls++]; return a; };
      const v = window.pwdGen.randomInt(3);
      crypto.getRandomValues = real;
      return { v, calls };
    });
    eq(out.calls, 2, 'draws until a value below the limit');
    eq(out.v, 1, 'value from the accepted draw (7 % 3)');
    const chi = await page.evaluate(() => {
      const n = 6, N = 60000, c = new Array(n).fill(0);
      for (let i = 0; i < N; i++) c[window.pwdGen.randomInt(n)]++;
      return c.reduce((s, x) => s + (x - N / n) ** 2 / (N / n), 0);
    });
    assert(chi < 25, 'chi-square of a fair die should be small, got ' + chi); // df=5, p≈0.0001
    await page.__ctx.close();
  });

  test('pwd-gen honours sets, each-set rule and look-alike filter', async () => {
    const page = await open('/pwd-gen/index.html?lang=en');
    const r = await page.evaluate(() => {
      const g = window.pwdGen;
      const all = { length: 4, lower: true, upper: true, digits: true, symbols: true, eachSet: true };
      let eachOk = true;
      for (let i = 0; i < 500; i++) {
        const p = g.generate(all);
        const has = s => [...p].some(ch => g.SETS[s].includes(ch));
        if (!(has('lower') && has('upper') && has('digits') && has('symbols'))) eachOk = false;
      }
      let ambOk = true;
      for (let i = 0; i < 200; i++) {
        const p = g.generate({ length: 64, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: true });
        if ([...p].some(ch => g.AMBIGUOUS.includes(ch))) ambOk = false;
      }
      const digitsOnly = g.generate({ length: 30, digits: true });
      return { eachOk, ambOk, digitsOnly, bits: g.entropyBits({ length: 20, lower: true, upper: true, digits: true, symbols: true }) };
    });
    assert(r.eachOk, 'each-set rule broken');
    assert(r.ambOk, 'look-alike character present');
    assert(/^\d{30}$/.test(r.digitsOnly), 'digits only: ' + r.digitsOnly);
    assert(Math.abs(r.bits - 20 * Math.log2(90)) < 1e-9, 'entropy of 20 chars from 90: ' + r.bits);
    await page.__ctx.close();
  });

  test('pwd-gen UI: no set → warning; options stored, password never stored', async () => {
    const page = await open('/pwd-gen/index.html?lang=en');
    for (const id of ['lower', 'upper', 'digits', 'symbols']) await page.uncheck('#' + id);
    eq(await page.inputValue('#output'), '', 'no password without a set');
    assert((await page.textContent('#warn')).includes('at least one'), 'warning shown');
    eq(await page.isDisabled('#copy'), true, 'copy disabled');
    await page.check('#digits');
    await page.fill('#lengthNum', '12');
    await page.dispatchEvent('#lengthNum', 'change');
    const pw = await page.inputValue('#output');
    assert(/^\d{12}$/.test(pw), 'digits-only 12: ' + pw);
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    assert(!stored.includes(pw), 'password found in localStorage');
    assert(stored.includes('pwd-gen:options'), 'options not stored');
    eq(await page.getAttribute('#strength', 'data-level'), 'weak', '12 digits is weak');
    await page.__ctx.close();
  });

  // ---------- azure-logs ----------
  test('azure-logs helpers: SAS URL, resource id, records formats', async () => {
    const page = await open('/azure-logs/index.html?lang=en');
    const r = await page.evaluate(({ SAS, RES_A }) => {
      const a = window.azureLogs;
      return {
        url: a.parseSasInput('https://acct1.blob.core.windows.net/insights-logs-x?' + SAS),
        bare: a.parseSasInput('?' + SAS).sas === SAS,
        fromPath: a.resourceFromPath('resourceId=' + RES_A + '/y=2026/m=11/d=02/h=09/m=00/PT1H.json'),
        info: a.parseResourceId(RES_A),
        lines: a.parseRecords('{"a":1}\n\n{"b":2}\nbroken\n'),
        wrapped: a.parseRecords('\uFEFF{"records":[{"a":1},{"b":2}]}'),
      };
    }, { SAS, RES_A });
    eq(r.url.account, 'acct1', 'account from URL');
    eq(r.url.container, 'insights-logs-x', 'container from URL');
    eq(r.url.sas, SAS, 'token from URL');
    assert(r.bare, 'leading ? stripped');
    eq(r.fromPath, RES_A, 'resource from blob path');
    eq(r.info.name, 'SHOP-API', 'resource name');
    eq(r.info.type, 'MICROSOFT.WEB/SITES', 'resource type');
    eq(r.info.group, 'RG-WEB', 'resource group');
    eq(r.lines.records.length, 2, 'JSON lines');
    eq(r.lines.bad, 1, 'bad line counted');
    eq(r.wrapped.records.length, 2, '{"records":[...]} form');
    await page.__ctx.close();
  });

  test('azure-logs end to end: connect, page through blobs, load, group, filter', async () => {
    let seen;
    const page = await open('/azure-logs/index.html?lang=en', { before: async p => { seen = await mockAzure(p); } });
    // Pasting the whole SAS URL fills the account too.
    await page.fill('#sas', 'https://' + ACCOUNT + '.blob.core.windows.net/?' + SAS);
    await page.click('#connect');
    await page.waitForSelector('#browseCard:not([hidden])');
    eq(await page.inputValue('#account'), ACCOUNT, 'account taken from the URL');
    eq(await page.inputValue('#sas'), '', 'token field emptied after connect');
    eq(await page.inputValue('#containerSel'), C, 'insights-logs container listed first');
    await page.selectOption('#pageSize', '25');
    await page.click('#list');
    await page.waitForFunction(() => document.querySelectorAll('#blobs li').length === 2);
    assert(await page.isVisible('#more'), 'next page offered');
    const listReq = seen.find(u => u.searchParams.get('restype') === 'container');
    eq(listReq.searchParams.get('maxresults'), '25', 'page size sent');
    await page.click('#more');
    await page.waitForFunction(() => document.querySelectorAll('#blobs li').length === 3);
    eq(seen.some(u => u.searchParams.get('marker') === 'm2'), true, 'marker sent for page 2');
    eq(await page.isVisible('#more'), false, 'no next page after the last');
    eq(seen.some(u => u.pathname.endsWith('PT1H.json')), false, 'listing must not download blobs');
    await page.click('#loadAll');
    await page.waitForFunction(() => /4 of 4 records/.test(document.getElementById('recordCount').textContent));
    // Grouped by resource: "All" plus two resources.
    const chips = await page.$$eval('.res-chip .name', els => els.map(e => e.textContent));
    eq(chips.length, 3, 'resource chips: ' + chips.join(', '));
    assert(chips[1].startsWith('SHOP-API (3)'), 'busiest resource first: ' + chips[1]);
    // Newest first.
    const times = await page.$$eval('#records .time', els => els.map(e => e.textContent));
    eq(times[0], '2026-11-02 10:30:00 UTC', 'newest record first');
    // The malformed line is reported on its blob.
    assert((await page.textContent('#blobs')).includes('1 unreadable lines'), 'bad line reported');
    // Filters.
    await page.click('.res-chip:nth-child(3)');
    await page.waitForFunction(() => /1 of 4 records/.test(document.getElementById('recordCount').textContent));
    await page.click('.res-chip:nth-child(1)');
    await page.selectOption('#fLevel', 'Error');
    await page.waitForFunction(() => /1 of 4 records/.test(document.getElementById('recordCount').textContent));
    await page.selectOption('#fLevel', '');
    await page.fill('#q', 'consolelogs');
    await page.waitForFunction(() => /1 of 4 records/.test(document.getElementById('recordCount').textContent));
    await page.fill('#q', 'onerror');
    await page.click('#records summary');
    // Log content is shown as text, never run as HTML.
    assert((await page.textContent('#records pre')).includes('<img src=x onerror='), 'payload shown as text');
    eq(await page.evaluate(() => window.__xss || 0), 0, 'payload executed');
    eq(await page.$$eval('#records img', els => els.length), 0, 'payload became an element');
    // The token went only to the account, and is kept nowhere.
    assert(seen.length >= 6 && seen.every(u => u.hostname === ACCOUNT + '.blob.core.windows.net' && u.protocol === 'https:'), 'requests only to the account over https');
    const leak = await page.evaluate(sig => {
      const s = decodeURIComponent(sig);
      return [JSON.stringify(localStorage), JSON.stringify(sessionStorage), location.href, document.documentElement.outerHTML, document.title]
        .some(x => x.includes(s) || x.includes(sig));
    }, SIG);
    eq(leak, false, 'SAS signature found in storage, URL or DOM');
    eq(realErrors(page).length, 0, 'page errors: ' + realErrors(page).join(' | '));
    // Disconnect forgets everything.
    await page.click('#disconnect');
    eq(await page.isHidden('#browseCard'), true, 'browse hidden after disconnect');
    eq(await page.isHidden('#logsCard'), true, 'records hidden after disconnect');
    await page.__ctx.close();
  });

  test('azure-logs errors: CORS/network, bad token, container SAS without Service type', async () => {
    let page = await open('/azure-logs/index.html?lang=en', { before: p => mockAzure(p, { network: true }) });
    await page.fill('#account', ACCOUNT);
    await page.fill('#sas', SAS);
    await page.click('#connect');
    await page.waitForFunction(() => /CORS/.test(document.getElementById('connectMsg').textContent));
    eq(await page.isHidden('#browseCard'), true, 'not connected after a network error');
    await page.__ctx.close();

    page = await open('/azure-logs/index.html?lang=en', { before: p => mockAzure(p) });
    await page.fill('#account', ACCOUNT);
    await page.fill('#sas', SAS.replace(SIG, 'd3Jvbmc%3D'));
    await page.click('#connect');
    await page.waitForFunction(() => /signature was not accepted/.test(document.getElementById('connectMsg').textContent));
    await page.fill('#sas', 'sv=2022-11-02&sp=rl');
    await page.click('#connect');
    await page.waitForFunction(() => /no sig parameter/.test(document.getElementById('connectMsg').textContent));
    await page.__ctx.close();

    // A container SAS URL: no container listing is tried, the container comes from the URL.
    let seen;
    page = await open('/azure-logs/index.html?lang=en', { before: async p => { seen = await mockAzure(p); } });
    await page.fill('#sas', 'https://' + ACCOUNT + '.blob.core.windows.net/' + C + '?sv=2022-11-02&sr=c&sp=rl&sig=' + SIG);
    await page.click('#connect');
    await page.waitForSelector('#browseCard:not([hidden])');
    eq(await page.inputValue('#containerSel'), C, 'container from the SAS URL');
    eq(seen.some(u => u.pathname === '/' && u.searchParams.get('comp') === 'list'), false, 'no container listing with a container SAS');
    await page.__ctx.close();

    page = await open('/azure-logs/index.html?lang=en', { before: p => mockAzure(p, { noServiceType: true }) });
    await page.fill('#account', ACCOUNT);
    await page.fill('#sas', SAS);
    await page.click('#connect');
    await page.waitForSelector('#containerName:not([hidden])');
    await page.fill('#containerName', C);
    await page.click('#list');
    await page.waitForFunction(() => document.querySelectorAll('#blobs li').length === 2);
    await page.__ctx.close();
  });

  // ---------- hardening (#24) ----------
  test('azure-logs keeps the token out of global scope and drops loads cut off by Disconnect', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const page = await open('/azure-logs/index.html?lang=en', { before: async p => {
      await mockAzure(p);
      // Blob bodies wait until the test lets them through, so Disconnect lands mid-load.
      await p.route(u => u.pathname.endsWith('PT1H.json'), async r => { await gate; r.fallback(); });
    } });
    eq(await page.evaluate(() => typeof conn), 'undefined', 'connection object reachable as a global');
    await page.fill('#account', ACCOUNT);
    await page.fill('#sas', SAS);
    await page.click('#connect');
    await page.waitForSelector('#browseCard:not([hidden])');
    await page.click('#list');
    await page.waitForFunction(() => document.querySelectorAll('#blobs li').length === 2);
    await page.click('#loadAll');
    await page.click('#disconnect');
    release();
    await page.waitForTimeout(500);
    eq(await page.isHidden('#logsCard'), true, 'records from before Disconnect shown');
    await page.__ctx.close();
  });

  test('tools ignore tools:lang from a parent on another origin', async () => {
    const other = base.replace('127.0.0.1', 'localhost');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(other + '/index.html');
    for (const tool of ['pwd-gen', 'azure-logs', 'reader']) {
      const res = await page.evaluate(async src => {
        const f = document.createElement('iframe');
        f.src = src;
        document.body.append(f);
        await new Promise(r => f.onload = r);
        f.contentWindow.postMessage({ type: 'tools:lang', lang: 'fa' }, '*');
        await new Promise(r => setTimeout(r, 300));
        return f.contentWindow.location.href; // throws if cross-origin, so read lang another way
      }, base + '/' + tool + '/index.html?lang=en').catch(e => 'cross-origin');
      eq(res, 'cross-origin', 'frame should be cross-origin');
      const frame = page.frames().find(f => f.url().startsWith(base + '/' + tool + '/'));
      eq(await frame.evaluate(() => document.documentElement.lang), 'en', tool + ' switched language for a foreign parent');
    }
    await context.close();
  });

  // ---------- shared: languages, layout, tabs ----------
  for (const tool of ['pwd-gen', 'azure-logs']) {
    for (const width of [1280, 390]) {
      for (const l of ['fa', 'en']) {
        test(tool + ' ' + l + ' at ' + width + 'px: direction, strings, no horizontal scroll', async () => {
          const page = await open('/' + tool + '/index.html?lang=' + l, { width, scheme: 'dark' });
          eq(await page.getAttribute('html', 'dir'), l === 'fa' ? 'rtl' : 'ltr', 'dir');
          eq(await page.getAttribute('html', 'lang'), l, 'lang');
          const h1 = await page.textContent('h1');
          assert(l === 'fa' ? /[\u0600-\u06FF]/.test(h1[0]) : /^[A-Z]/.test(h1), 'title in ' + l + ': ' + h1);
          await noHScroll(page);
          eq(realErrors(page).length, 0, 'page errors: ' + realErrors(page).join(' | '));
          await page.__ctx.close();
        });
      }
    }
  }

  test('root page lists both tools and opens them in tabs, embedded', async () => {
    const page = await open('/index.html');
    await page.evaluate(() => localStorage.setItem('tools:lang', 'en'));
    await page.reload();
    for (const key of ['pwd-gen', 'azure-logs']) {
      const card = page.locator('.card[data-tool="' + key + '"]');
      assert(await card.count() === 1, 'card for ' + key);
      await page.click('#tab-home');
      await card.click();
    }
    const tabs = await page.$$eval('.tab-select', els => els.map(e => e.textContent));
    assert(tabs.includes('Password generator') && tabs.includes('Azure logs'), 'tabs: ' + tabs.join(', '));
    const frame = page.frames().find(f => f.url().includes('/pwd-gen/'));
    await frame.waitForSelector('html.embedded', { state: 'attached' });
    eq(await frame.isHidden('.back'), true, 'back link hidden when embedded');
    eq(await frame.getAttribute('html', 'lang'), 'en', 'tab opened in the bar language');
    await page.click('#langToggle');
    await frame.waitForFunction(() => document.documentElement.lang === 'fa');
    await page.__ctx.close();
  });

  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('ok   ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); }
  }
  await browser.close();
  server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + planned + ' planned');
  if (planned === 0 || passed + failed !== planned) process.exit(2);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
