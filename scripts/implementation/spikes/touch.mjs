import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {release, tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {LONG_PRESS_MS, MOVE_SLOP_PX} from './touch-session.js';

// Raw run output goes to the given directory or a fresh temporary one, never into the repository (process change 2026-10-22).
const output = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-spike-touch-')));
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
await context.tracing.start({screenshots: true, snapshots: true, sources: true});
const page = await context.newPage();
page.setDefaultTimeout(4000);
const cdp = await context.newCDPSession(page);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const cases = [];
let fingers = new Map();
const send = async (type, id, point) => {
    if (type === 'touchStart' || type === 'touchMove') fingers.set(id, {...point, id, radiusX: 4, radiusY: 4, force: 1});
    if (type === 'touchEnd') fingers.delete(id);
    if (type === 'touchCancel') fingers.clear();
    await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: [...fingers.values()]});
};
const center = async selector => {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `Missing ${selector}`);
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};
const events = async () => JSON.parse(await page.locator('#touch-events').innerText());
const state = async () => page.locator('#touch-state').evaluate(node => ({...node.dataset}));
const named = async name => (await events()).filter(event => event.name === name);
const waitEvent = name => page.locator('#touch-events').filter({hasText: `"name":"${name}"`}).waitFor();
const settle = () => page.waitForTimeout(LONG_PRESS_MS + 150);
const open = async () => {
    await page.locator('#touch-open').tap();
    await page.getByRole('dialog', {name: 'Touch agenda'}).waitFor();
    await page.locator('#touch-handle').waitFor();
};
const longPress = async () => {
    const point = await center('#touch-handle');
    await send('touchStart', 1, point);
    await waitEvent('grid-ready');
    return point;
};
const check = async (name, fn, query = '') => {
    const start = performance.now();
    try {
        fingers.clear();
        await page.goto(`http://127.0.0.1:4178/touch.html${query}`);
        await page.locator('#touch-open').waitFor();
        await open();
        const observed = await fn();
        cases.push({name, outcome: 'pass', durationMs: Math.round(performance.now() - start), observed: observed ?? {}, events: await events(), state: await state()});
    } catch (error) {
        cases.push({name, outcome: 'fail', durationMs: Math.round(performance.now() - start), error: String(error), events: await events().catch(() => []), state: await state().catch(() => null)});
        await page.screenshot({path: resolve(output, `failure-${cases.length}.png`)});
    } finally {
        if (fingers.size) await send('touchCancel').catch(() => {});
    }
    console.log(`${cases.at(-1).outcome.toUpperCase()}: ${name}${cases.at(-1).error ? ` — ${cases.at(-1).error}` : ''}`);
};

await check('Short primary tap activates exactly once and never starts a draft', async () => {
    await page.locator('#touch-primary').tap();
    await settle();
    assert.equal((await state()).activations, '1');
    assert.equal((await named('draft-started')).length, 0);
});
await check('Short handle tap does not activate the item or start a delayed draft', async () => {
    await page.locator('#touch-handle').tap();
    await settle();
    assert.equal((await state()).activations, '0');
    assert.equal((await named('draft-started')).length, 0);
});
await check('Movement before threshold cancels recognition and cannot restart it', async () => {
    const p = await center('#touch-handle');
    await send('touchStart', 1, p);
    await send('touchMove', 1, {...p, x: p.x - MOVE_SLOP_PX - 3});
    await send('touchMove', 1, p);
    await settle();
    await send('touchEnd', 1);
    assert.equal((await named('draft-started')).length, 0);
    assert.ok((await events()).some(e => e.reason === 'movement-before-long-press'));
    assert.equal((await state()).requests, '0');
});
await check('Small jitter permits long press, with capture before sheet removal', async () => {
    const p = await center('#touch-handle');
    await send('touchStart', 1, p);
    await page.waitForTimeout(100);
    await send('touchMove', 1, {...p, x: p.x - 2, y: p.y + 2});
    assert.equal((await named('draft-started')).length, 0);
    await waitEvent('grid-ready');
    const log = await events();
    assert.ok(log.find(e => e.name === 'capture-confirmed').at - log.find(e => e.name === 'pending').at >= LONG_PRESS_MS - 5);
    assert.equal(log.find(e => e.name === 'pending').trusted, true);
    await send('touchCancel');
    assert.equal((await state()).requests, '0');
});
for (const width of [390, 412]) {
    await page.setViewportSize({width, height: 844});
    await check(`Native vertical scroll at ${width}px preserves agenda and creates no draft/activation`, async () => {
        const p = await center('#touch-primary');
        const before = await page.locator('#touch-scroll').evaluate(node => node.scrollTop);
        const background = await page.evaluate(() => scrollY);
        await send('touchStart', 1, p);
        for (let i = 1; i <= 10; i++) {
            await send('touchMove', 1, {...p, y: p.y - i * 14});
            await page.waitForTimeout(20);
        }
        await send('touchEnd', 1);
        await settle();
        const after = await page.locator('#touch-scroll').evaluate(node => node.scrollTop);
        assert.ok(after > before + 40, `Expected native scroll, observed ${before} -> ${after}`);
        assert.equal((await named('draft-started')).length, 0);
        assert.equal((await state()).activations, '0');
        assert.equal(await page.getByRole('dialog', {name: 'Touch agenda'}).count(), 1);
        assert.equal(await page.evaluate(() => scrollY), background);
        return {scrollTopBefore: before, scrollTopAfter: after, backgroundScrollY: background};
    });
}
await page.setViewportSize({width: 390, height: 844});

for (const root of ['document', 'shadow']) for (const portal of ['document', 'shadow']) {
    const query = `?root=${root}&portal=${portal}`;
    await check(`${root}/${portal}: long press handoff, grid hit test and one request on pointerup`, async () => {
        await longPress();
        assert.equal(await page.getByRole('dialog', {name: 'Touch agenda'}).count(), 0);
        const capture = (await named('capture-confirmed'))[0];
        assert.deepEqual([capture.connected, capture.hidden, capture.sameScope], [true, 'true', true]);
        assert.equal((await named('grid-ready'))[0].focused, true);
        const owner = await page.locator('#touch-owner').evaluate(node => ({connected: node.isConnected, tabIndex: node.tabIndex, hidden: node.getAttribute('aria-hidden')}));
        assert.deepEqual(owner, {connected: true, tabIndex: -1, hidden: 'true'});
        const target = await center('#touch-target');
        await send('touchMove', 1, target);
        assert.equal((await state()).target, '2026-09-04');
        await send('touchEnd', 1);
        await page.waitForTimeout(50);
        assert.equal((await state()).requests, '1');
        assert.equal((await named('request')).length, 1);
        assert.equal((await state()).activations, '0');
        assert.equal((await state()).draft, 'false');
        assert.equal((await named('draft-cleanup')).length, 1);
        assert.ok((await named('captured-move')).every(e => e.trusted && e.captured));
        assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
        return {owner, root, portal};
    }, query);
    await check(`${root}/${portal}: touchCancel after handoff cancels once without request`, async () => {
        await longPress();
        await send('touchMove', 1, await center('#touch-target'));
        await send('touchCancel');
        await waitEvent('draft-cancelled');
        assert.equal((await named('draft-cleanup')).length, 1);
        assert.equal((await state()).requests, '0');
        assert.equal((await state()).draft, 'false');
        assert.ok((await named('pointercancel')).some(e => e.trusted));
    }, query);
}
await check('touchCancel while waiting prevents delayed recognition', async () => {
    await send('touchStart', 1, await center('#touch-handle'));
    await send('touchCancel');
    await settle();
    assert.equal((await named('draft-started')).length, 0);
    assert.equal(await page.getByRole('dialog', {name: 'Touch agenda'}).count(), 1);
});
await check('Second finger while waiting cancels the pending gesture', async () => {
    const p = await center('#touch-handle');
    await send('touchStart', 1, p);
    await send('touchStart', 2, {...p, x: p.x - 60});
    await settle();
    await send('touchCancel');
    assert.ok((await events()).some(e => e.reason === 'multiple-pointers'));
    assert.equal((await named('draft-started')).length, 0);
});
await check('Second finger after handoff cancels the active draft once', async () => {
    await longPress();
    await send('touchStart', 2, await center('#touch-target'));
    await send('touchCancel');
    assert.equal((await named('draft-cleanup')).length, 1);
    assert.equal((await state()).requests, '0');
});
await check('Capture failure leaves the sheet open and emits no draft', async () => {
    await page.locator('#touch-owner').evaluate(owner => { owner.setPointerCapture = () => { throw new DOMException('Injected capture failure', 'NotFoundError'); }; });
    await send('touchStart', 1, await center('#touch-handle'));
    await waitEvent('capture-failed');
    await send('touchEnd', 1);
    assert.equal((await named('draft-started')).length, 0);
    assert.equal(await page.getByRole('dialog', {name: 'Touch agenda'}).count(), 1);
    return {faultInjection: 'setPointerCapture throws; remaining input events are native CDP touch'};
});
await check('Actual capture loss after handoff cancels without request', async () => {
    await longPress();
    const target = await center('#touch-target');
    await send('touchMove', 1, target);
    const id = (await named('pending'))[0].pointerId;
    await page.locator('#touch-owner').evaluate((owner, id) => owner.releasePointerCapture(id), id);
    await send('touchMove', 1, {...target, x: target.x - 2});
    await waitEvent('draft-cancelled');
    await send('touchEnd', 1);
    assert.equal((await named('draft-cancelled'))[0].reason, 'lostpointercapture');
    assert.equal((await named('draft-cleanup')).length, 1);
    assert.equal((await state()).requests, '0');
});
await check('Escape while waiting closes the sheet and prevents a stale timer', async () => {
    await send('touchStart', 1, await center('#touch-handle'));
    await page.keyboard.press('Escape');
    await settle();
    await send('touchCancel');
    assert.equal((await named('draft-started')).length, 0);
    assert.equal(await page.getByRole('dialog', {name: 'Touch agenda'}).count(), 0);
});
await check('Origin removal during drag cancels once without request', async () => {
    await longPress();
    await page.locator('#touch-remove').click();
    await send('touchEnd', 1);
    assert.equal((await named('draft-cancelled'))[0].reason, 'origin-removed');
    assert.equal((await named('draft-cleanup')).length, 1);
    assert.equal((await state()).requests, '0');
});
await check('Recognizer unmount releases its session with one cleanup', async () => {
    await longPress();
    await page.locator('#touch-disable').click();
    await send('touchEnd', 1);
    assert.equal((await named('draft-cleanup')).length, 1);
    assert.equal((await state()).requests, '0');
    assert.equal(await page.locator('#touch-owner').count(), 0);
});
await check('Release outside grid produces no request and still cleans up exactly once', async () => {
    await longPress();
    await send('touchMove', 1, {x: 4, y: 4});
    await send('touchEnd', 1);
    assert.equal((await state()).requests, '0');
    assert.equal((await named('request')).length, 0);
    assert.equal((await named('draft-cleanup')).length, 1);
});
await check('Drag handle reserves its 44px area; movement cancels without scrolling or activation', async () => {
    const p = await center('#touch-handle');
    await send('touchStart', 1, p);
    for (let i = 1; i <= 8; i++) {
        await send('touchMove', 1, {...p, y: p.y - i * 12});
        await page.waitForTimeout(20);
    }
    await send('touchEnd', 1);
    await settle();
    assert.equal(await page.locator('#touch-scroll').evaluate(node => node.scrollTop), 0);
    assert.equal((await named('draft-started')).length, 0);
    assert.equal((await state()).activations, '0');
    return {tradeoff: 'Scrolling starts on the item body; the permanent 44px drag handle intentionally suppresses native pan'};
});

await page.goto('http://127.0.0.1:4178/touch.html');
await open();
await page.screenshot({path: resolve(output, 'touch-sheet.png')});
await context.tracing.stop({path: resolve(output, 'touch-trace.zip')});
const report = {
    capturedAt: new Date().toISOString(), browser: browser.version(), platform: process.platform, osRelease: release(),
    automation: 'playwright@1.64.1 / CDP Input.dispatchTouchEvent', realDevice: false,
    viewport: {widths: [390, 412], height: 844}, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    longPressMs: LONG_PRESS_MS, movementSlopCssPx: MOVE_SLOP_PX,
    scope: 'Private T02 touch recognizer/composition experiment, not implemented Calendar move semantics or physical iOS/Android conformance',
    unavailable: ['No USB devices reported', 'adb / Android SDK absent', 'Xcode / simctl absent', 'No connected device-testing service'],
    sourceHashes: Object.fromEntries(['touch-session.js', 'touch-surface.jsx', 'touch-main.jsx', 'touch.css', 'touch.html', 'touch.mjs', 'package-lock.json'].map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')])),
    cases, errors, outcome: cases.every(item => item.outcome === 'pass') && !errors.length ? 'pass' : 'fail',
};
writeFileSync(resolve(output, 'touch.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(`${cases.filter(item => item.outcome === 'pass').length}/${cases.length} passed; ${errors.length} page errors. ${output}`);
if (report.outcome !== 'pass') process.exitCode = 1;
