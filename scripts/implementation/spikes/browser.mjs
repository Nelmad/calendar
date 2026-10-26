import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';

const shadowDOM = process.env.CALENDAR_SHADOW_DOM === 'off' ? 'off' : 'on';
// Raw run output goes to the given directory or a fresh temporary one, never into the repository (process change 2026-10-22).
const output = pathToFileURL(`${resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), `calendar-spike-browser-${shadowDOM}-`)))}/`);
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 1000, height: 800}});
await context.tracing.start({screenshots: true, snapshots: true, sources: true});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const cases = [];
let step = 'navigate';
const check = async (name, fn, query = '') => {
    try { step = 'navigate'; await page.goto(`http://127.0.0.1:4178${query}${query ? '&' : '?'}shadowDOM=${shadowDOM}`); const observed = await fn(); cases.push({name, outcome: 'pass', observed: observed ?? true}); }
    catch (error) {
        const observed = await page.evaluate(() => {
            const active = []; let node = document.activeElement;
            while (node) { active.push({tag: node.tagName, id: node.id, text: node.textContent?.slice(0, 80)}); node = node.shadowRoot?.activeElement; }
            const scopes = [document, document.getElementById('app')?.shadowRoot, document.getElementById('portal-host')?.shadowRoot].filter(Boolean);
            return {active, portalHostInert: !!document.getElementById('portal-host')?.closest('[inert]'), menus: scopes.flatMap(root => [...root.querySelectorAll('[role=menu]')]).length};
        });
        cases.push({name, outcome: 'fail', step, error: String(error), observed});
    }
};
const isFocused = async id => { step = `focus:${id}`; return page.waitForFunction(id => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active?.id === id;
}, id); };
const openAgenda = async () => {
    await page.locator('#day').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', {name: 'Day agenda', exact: true}).waitFor();
    await isFocused('agenda-first');
};
await check('Own grid opens anchorless non-modal agenda with initial focus', async () => {
    await openAgenda();
    await isFocused('agenda-first');
});
await check('Nested menu Escape closes only the child and restores its trigger', async () => {
    await openAgenda();
    await page.getByRole('button', {name: 'Item actions', exact: true}).click();
    await page.getByRole('menu', {name: 'Item actions'}).waitFor();
    await page.waitForFunction(() => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return !!active?.closest('[role=menu]'); });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await page.getByRole('dialog', {name: 'Day agenda'}).count(), 1);
    await isFocused('item-actions');
});
await check('Explicit logical Tab exit reaches controls adjacent to the grid', async () => {
    await openAgenda();
    await page.locator('#agenda-last').focus();
    await page.keyboard.press('Tab');
    await isFocused('after-grid');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await openAgenda();
    await page.keyboard.press('Shift+Tab');
    await isFocused('before-grid');
});
await check('Pointer capture on a stable owner survives removal of a modal sheet', async () => {
    await page.getByRole('button', {name: 'Open sheet', exact: true}).click();
    const target = await page.locator('#handoff').boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.down();
    await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor({state: 'detached'});
    await page.mouse.move(400, 100);
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById('capture-events').textContent.includes('capture-ended'));
    const events = await page.locator('#capture-events').innerText();
    assert.match(events, /capture-before-close:true/);
    assert.match(events, /captured-move/);
    assert.match(events, /capture-ended/);
    assert.equal(await page.locator('main').getAttribute('aria-hidden'), null);
    return {events, caveat: 'Mouse capture probe; does not establish touch long-press/scroll or real-device conformance'};
});
await check('RAC modal background mechanism is recorded without assuming native inert', async () => {
    await page.getByRole('button', {name: 'Open sheet', exact: true}).click();
    await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor();
    const during = await page.evaluate(() => ({
        hidden: !!document.getElementById('before-grid').closest('[aria-hidden="true"]'),
        inert: !!document.getElementById('before-grid').closest('[inert]'),
        overflow: document.documentElement.style.overflow,
    }));
    assert.equal(during.inert, true, JSON.stringify(during));
    const cdp = await context.newCDPSession(page);
    const tree = await cdp.send('Accessibility.getFullAXTree');
    assert.ok(!tree.nodes.some(node => !node.ignored && node.name?.value === 'Before grid'));
    await cdp.detach();
    await page.locator('#before-grid').evaluate(button => button.focus());
    assert.equal(await page.evaluate(() => document.activeElement?.id === 'before-grid'), false);
    await page.getByRole('button', {name: 'Close sheet', exact: true}).click();
    await page.waitForFunction(() => !document.getElementById('before-grid').closest('[inert]'));
    await page.locator('#before-grid').focus();
    await isFocused('before-grid');
    return {during, decision: 'Native inert observed and background excluded from Chromium AX tree. T16 still owns calendar-specific nesting, preservation and endpoint scope; full matrix remains unverified'};
});
for (const root of ['document', 'shadow']) for (const portal of ['document', 'shadow']) {
    await check(`Root/portal scope ${root}/${portal}: agenda, child Escape and logical exit`, async () => {
        await openAgenda();
        await page.locator('#item-actions').click();
        await page.getByRole('menu', {name: 'Item actions'}).waitFor();
    await page.waitForFunction(() => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return !!active?.closest('[role=menu]'); });
        await page.keyboard.press('Escape');
        await isFocused('item-actions');
        assert.equal(await page.getByRole('dialog', {name: 'Day agenda'}).count(), 1);
        await page.locator('#agenda-last').focus();
        await page.keyboard.press('Tab');
        await isFocused('after-grid');
    }, `?root=${root}&portal=${portal}`);
    await check(`Root/portal scope ${root}/${portal}: modal nesting and restoration`, async () => {
        await page.locator('#open-sheet').click();
        await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor();
        await page.getByRole('button', {name: 'Nested dialog', exact: true}).click();
        await page.getByRole('dialog', {name: 'Nested', exact: true}).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog', {name: 'Nested', exact: true}).waitFor({state: 'detached'});
        await isFocused('nested-trigger');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor({state: 'detached'});
        await isFocused('open-sheet');
    }, `?root=${root}&portal=${portal}`);
}
await check('Nested modal Escape retains parent, then restores the original trigger', async () => {
    await page.locator('#open-sheet').click();
    await page.getByRole('button', {name: 'Nested dialog', exact: true}).click();
    await page.getByRole('dialog', {name: 'Nested', exact: true}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name: 'Nested', exact: true}).waitFor({state: 'detached'});
    await isFocused('nested-trigger');
    assert.equal(await page.getByRole('dialog', {name: 'Agenda sheet'}).count(), 1);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor({state: 'detached'});
    await isFocused('open-sheet');
});
await check('Emulated touch capture survives sheet unmount with touch-action established at start', async () => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true});
    await page.locator('#open-sheet').click();
    const box = await page.locator('#handoff').boundingBox();
    const touch = {x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1};
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [touch]});
    await page.getByRole('dialog', {name: 'Agenda sheet'}).waitFor({state: 'detached'});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{...touch, x: 400, y: 100}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForFunction(() => document.getElementById('capture-events').textContent.includes('capture-ended'));
    const events = await page.locator('#capture-events').innerText();
    assert.match(events, /capture-before-close:true/);
    assert.match(events, /captured-move/);
    await cdp.detach();
    return {events, limitation: 'Immediate handoff, emulated touch. Does not verify long-press recognition or real iOS/Android scrolling.'};
});
await page.screenshot({path: new URL('browser.png', output).pathname, fullPage: true});
await context.tracing.stop({path: new URL('browser-trace.zip', output).pathname});
const report = {date: new Date().toISOString(), browser: await browser.version(), platform: process.platform,
    shadowDOM, flagPackage: '@react-stately/flags@3.2.1', automation: 'playwright@1.64.1', viewport: {width: 1000, height: 800}, realDevice: false,
    sourceHashes: Object.fromEntries(['surface.jsx', 'main.jsx', 'styles.css', 'browser.mjs', 'package-lock.json'].map(name => [name, createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')])),
    cases, errors, outcome: cases.every(c => c.outcome === 'pass') && !errors.length ? 'pass' : 'fail'};
writeFileSync(new URL('browser.json', output), JSON.stringify(report, null, 2) + '\n');
await browser.close();
cases.forEach(c => console.log(`${c.outcome.toUpperCase()}: ${c.name}${c.error ? ` — ${c.error}` : ''}`));
if (report.outcome === 'fail') process.exitCode = 1;
