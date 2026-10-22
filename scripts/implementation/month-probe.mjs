import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-month'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-month-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'month-entry.tsx'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs'))), cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], version = browser.version();
// Development aid only: a filtered run is marked in the report and never counts as complete evidence.
const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
const check = async (name, operation) => {
    if (only && !only.test(name)) return;
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props) => { await page.evaluate(props => window.month.patch(props), props); await settle(page); };
const cell = (page, date) => page.locator(`[role=gridcell][data-date="${date}"]`);
const focused = page => page.evaluate(() => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return {date: node?.getAttribute('data-date'), tag: node?.tagName, id: node?.id}; });
const dense = (count = 12) => Array.from({length: count}, (_, i) => ({id: `dense-${i}`, title: `Event ${String(i).padStart(4, '0')}`, data: i,
    interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-06'}}));
const samples = [
    {id: 'bar', title: 'Release preparation · Подготовка релиза', data: {}, interval: {kind: 'allDay', start: '2026-03-03', end: '2026-03-11'}},
    {id: 'design', title: 'Design review', data: {}, interval: {kind: 'timed', start: '2026-03-04T10:30:00Z', end: '2026-03-04T11:30:00Z'}},
    {id: 'sync', title: 'Team sync', data: {}, interval: {kind: 'timed', start: '2026-03-11T12:00:00Z'}},
    ...dense(6),
];
async function setup(shadow, options = {}, viewport = {width: 980, height: 800}) {
    const context = await browser.newContext({viewport, locale: 'de-DE', hasTouch: true}), page = await context.newPage();
    page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(String(error)));
    const server = esm.serverMonth(options); assert.deepEqual(cjs.serverMonth(options), server); assert.deepEqual(server.events, []);
    await page.setContent('<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside{margin:8px}</style><button id="outside">Outside</button><div id="owner"></div>');
    await page.evaluate(async ({shadow, moduleUrl, css, server, options}) => {
        Date.now = () => Date.parse('2026-03-04T12:00:00Z');
        const host = document.getElementById('owner'), scope = shadow ? host.attachShadow({mode: 'open'}) : host;
        const style = document.createElement('style'); style.textContent = css; scope.append(style);
        const container = document.createElement('div'); container.id = 'fixture'; container.innerHTML = server.html; scope.append(container);
        const module = await import(moduleUrl); window.scope = scope; window.monthModule = module;
        window.month = await module.hydrateMonth(container, options);
    }, {shadow, moduleUrl, css, server, options});
    await settle(page); return {page, context, server};
}
const geometry = page => page.evaluate(() => {
    const scope = window.scope, grid = scope.querySelector('.nc-month'), calendar = scope.querySelector('.nc-calendar');
    const rect = node => { const r = node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}; };
    return {root: rect(calendar), grid: rect(grid), scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        rows: [...scope.querySelectorAll('.nc-month-week')].map(row => ({box:rect(row),
            items:[...row.querySelectorAll('.nc-month-item')].map(node => ({id:node.dataset.itemId, ...rect(node)})),
            cells:[...row.querySelectorAll('.nc-day')].map(node => ({date:node.dataset.date, box:rect(node), header:rect(node.querySelector('.nc-day-header')),
                overflow:node.querySelector('.nc-overflow') ? {text:node.querySelector('.nc-overflow').textContent,...rect(node.querySelector('.nc-overflow'))} : null}))}))};
});
function completeRows(g) {
    assert.equal(g.pageOverflow, false);
    assert.ok(Math.max(...g.rows.map(r => r.box.height)) - Math.min(...g.rows.map(r => r.box.height)) < 1);
    for (const row of g.rows) for (const c of row.cells) {
        if (c.overflow) { assert.ok(c.overflow.width >= 24 && c.overflow.height >= 24); assert.ok(c.overflow.top >= c.header.bottom); assert.ok(c.overflow.bottom <= c.box.bottom); }
        const visible = row.items.filter(i => Math.min(i.right,c.box.right) - Math.max(i.left,c.box.left) > 3);
        for (const item of visible) { assert.ok(item.top >= c.header.bottom); assert.ok(item.bottom <= (c.overflow?.top ?? c.box.bottom), JSON.stringify({item,c})); }
        for (let i = 1; i < visible.length; i++) assert.ok(visible[i].top >= visible[i-1].bottom);
    }
}
try {
    for (const shadow of [false, true]) {
        const label = shadow ? 'shadow' : 'document';
        for (const locale of ['en-US','ru-RU','ar']) for (const unknownToday of [false,true]) await check(`${label}: SSR/hydration ${locale}, unknownToday=${unknownToday}`, async () => {
            const {page, context, server} = await setup(shadow, {locale, unknownToday, items: dense()});
            try {
                assert.deepEqual(await page.evaluate(() => window.month.errors), []);
                assert.deepEqual(await page.evaluate(() => window.month.events), [{type:'range',value:server.range}]);
                assert.equal(server.html.includes('nc-month-segments'), false);
                assert.equal(server.html.replaceAll('<!-- -->','').includes('+' + new Intl.NumberFormat(locale).format(12)), true);
                assert.equal(await page.locator('[role=gridcell][tabindex="0"]').count(), 1);
                assert.equal(await cell(page,'2026-03-04').getAttribute('aria-current'),'date');
                assert.equal(await page.locator('.nc-overflow[tabindex],.nc-overflow[role]').count(),0);
                completeRows(await geometry(page));
            } finally { await context.close(); }
        });
        for (const [anchorDate, weeks] of [['2026-02-01',4],['2026-03-01',5],['2026-08-01',6]]) await check(`${label}: ${weeks} intrinsic weeks independent of item count and parent height`, async () => {
            const {page, context} = await setup(shadow,{anchorDate});
            try {
                const before = await geometry(page); assert.equal(before.rows.length,weeks); assert.ok(before.rows.every(row => Math.abs(row.box.height - 100) < 1));
                await page.evaluate(() => window.scope.querySelector('#fixture').style.height='120px');
                await patch(page,{items:dense(1000)}); const after=await geometry(page);
                assert.equal(before.grid.height,after.grid.height); completeRows(after);
            } finally { await context.close(); }
        });
        await check(`${label}: constrained resize zero/one/many whole lanes, atomic +N, hidden/show`, async () => {
            const {page,context} = await setup(shadow,{items:dense()});
            try {
                const counts=[];
                for (const height of [1000,600,430,260,700]) {
                    await patch(page,{style:{height}}); const g=await geometry(page); completeRows(g); assert.equal(g.root.height,height);
                    const row=g.rows.find(r=>r.cells.some(c=>c.date==='2026-03-04')), c=row.cells.find(c=>c.date==='2026-03-04');
                    const visible=row.items.length; assert.equal(visible+Number(c.overflow?.text.slice(1) ?? 0),12); counts.push(visible);
                    if(height===260) assert.ok(g.scrollHeight>g.clientHeight);
                }
                assert.ok(counts.includes(0)&&counts.includes(1)&&counts.some(n=>n>1),JSON.stringify(counts));
                await page.evaluate(()=>window.scope.querySelector('#fixture').style.display='none'); await settle(page);
                assert.equal(await page.locator('.nc-month-item').count(),0); assert.equal(await cell(page,'2026-03-04').locator('.nc-overflow').textContent(),'+12');
                await page.evaluate(()=>window.scope.querySelector('#fixture').style.display=''); await settle(page); completeRows(await geometry(page));
                return {visibleLanes:counts};
            } finally {await context.close();}
        });
        await check(`${label}: external CSS height, font and density resize keep dates/overflow intact`, async () => {
            const {page,context} = await setup(shadow,{items:dense(), className:'sized'});
            try {
                await page.evaluate(()=> {const s=document.createElement('style');s.textContent='.sized{height:420px;font-size:28px}';window.scope.append(s);});await settle(page);
                for (const density of ['compact','comfortable']) {await patch(page,{density});const g=await geometry(page);completeRows(g);assert.equal(g.root.height,420);}
                await cell(page,'2026-03-28').focus();await page.keyboard.press('ArrowDown');await settle(page);
                const box=await cell(page,'2026-04-04').boundingBox(), grid=await page.getByRole('grid').boundingBox();assert.ok(box.y+box.height<=grid.y+grid.height+1);
                await page.screenshot({path:resolve(output,`${label}-large-font-constrained.png`),fullPage:true});
            }finally{await context.close();}
        });
        for(const dir of ['ltr','rtl'])await check(`${label}: ${dir} segment hit date, keyboard and controlled month acceptance`,async()=>{
            const {page,context}=await setup(shadow,{items:samples,dir,style:{height:900}});
            try{
                for(const date of ['2026-03-03','2026-03-06','2026-03-09']){
                    const target=await cell(page,date).boundingBox(), segments=await page.locator('[data-item-id=bar][data-view=month]').all();
                    let hit;for(const segment of segments){const b=await segment.boundingBox();if(b.y>target.y&&b.y<target.y+target.height)hit=b;}
                    assert.ok(hit);await page.mouse.click(target.x+target.width/2,hit.y+hit.height/2);await settle(page);
                    const last=await page.evaluate(()=>window.month.events.filter(e=>e.type==='item').at(-1).value);assert.equal(last.date,date);assert.equal(last.view,'month');
                    assert.equal(last.segmentRange.start,date==='2026-03-09'?'2026-03-08':'2026-03-03');
                    assert.equal(await page.locator('.nc-day-list').count(),0);
                }
                await cell(page,'2026-03-04').focus();await page.keyboard.press(dir==='ltr'?'ArrowRight':'ArrowLeft');assert.equal((await focused(page)).date,'2026-03-05');
                await page.keyboard.press('Home');assert.equal((await focused(page)).date,'2026-03-01');await page.keyboard.press('End');assert.equal((await focused(page)).date,'2026-03-07');
                await page.keyboard.press('Home');await page.keyboard.press('PageDown');await settle(page);assert.equal((await focused(page)).date,'2026-03-01');
                await patch(page,{anchorDate:'2026-04-01'});assert.equal((await focused(page)).date,'2026-04-01');
                await page.keyboard.press('PageDown');await page.locator('#outside').focus();await patch(page,{anchorDate:'2026-05-01'});assert.equal((await focused(page)).id,'outside');
            }finally{await context.close();}
        });
        await check(`${label}: overflow tap and Enter reach all 1000 items, repeated activation and close`,async()=>{
            const {page,context}=await setup(shadow,{items:dense(1000)});
            try{
                await cell(page,'2026-03-04').locator('.nc-overflow').tap();await settle(page);assert.equal(await page.getByRole('listitem').count(),1000);
                assert.equal((await focused(page)).tag,'BUTTON');
                await page.getByRole('button',{name:/Event 0999/}).click();assert.equal(await page.evaluate(()=>window.month.events.filter(e=>e.type==='item').at(-1).value.item.id),'dense-999');
                await cell(page,'2026-03-04').focus();await page.keyboard.press('Enter');await settle(page);assert.equal((await focused(page)).tag,'BUTTON');
                await page.locator('.nc-day-list-heading button').click();await settle(page);assert.equal(await page.locator('.nc-day-list').count(),0);assert.equal((await focused(page)).date,'2026-03-04');
            }finally{await context.close();}
        });
        await check(`${label}: delayed agenda acceptance cannot steal external focus`,async()=>{
            const {page,context}=await setup(shadow,{items:dense(),agendaDate:'2026-03-01'});
            try{
                await cell(page,'2026-03-04').focus();await page.keyboard.press('Enter');await settle(page);assert.equal(await page.locator('.nc-day-list').count(),0);
                await page.locator('#outside').focus();await patch(page,{agendaDate:'2026-03-04'});assert.equal((await focused(page)).id,'outside');assert.equal(await page.locator('.nc-day-list').count(),0);
                await cell(page,'2026-03-04').focus();await page.keyboard.press('Enter');await settle(page);assert.equal((await focused(page)).tag,'BUTTON');
            }finally{await context.close();}
        });
        await check(`${label}: mobile narrow touch, indicators and readable list`,async()=>{
            const {page,context}=await setup(shadow,{layout:'mobile',locale:'ru-RU',items:samples},{width:320,height:740});
            try{
                assert.equal(await page.locator('.nc-month-item,.nc-overflow').count(),0);assert.ok(await page.locator('.nc-day-indicator').count()>0);
                await cell(page,'2026-03-05').tap();await settle(page);assert.equal(await page.locator('.nc-day-list').getAttribute('data-date'),'2026-03-05');
                assert.equal(await page.getByRole('listitem').count(),7);assert.equal((await geometry(page)).pageOverflow,false);
                await page.screenshot({path:resolve(output,`${label}-mobile.png`),fullPage:true});
            }finally{await context.close();}
        });
        for(const [name,options]of [['desktop',{locale:'ru-RU'}],['rtl-dark',{locale:'ar',colorScheme:'dark'}]])await check(`${label}: visual ${name} and native AX grid`,async()=>{
            const {page,context,server}=await setup(shadow,{...options,items:samples,selection:{start:'2026-03-10',end:'2026-03-13'}});
            try{
                completeRows(await geometry(page));const session=await context.newCDPSession(page),ax=await session.send('Accessibility.getFullAXTree');await session.detach();
                assert.equal(ax.nodes.filter(n=>n.role?.value==='grid').length,1);assert.equal(ax.nodes.filter(n=>n.role?.value==='gridcell').length,(Date.parse(server.range.end)-Date.parse(server.range.start))/86400000);
                assert.equal(ax.nodes.some(n=>n.role?.value==='button'&&n.name?.value?.startsWith('Event')),false);
                await cell(page,'2026-03-04').focus();await page.screenshot({path:resolve(output,`${label}-${name}.png`),fullPage:true});
            }finally{await context.close();}
        });
    }
    // QA-14: a token value that is not one CSS declaration value is dropped identically on the server and the client.
    await check('document: hostile token value: one declaration on server, hydration and client render (QA-14)', async () => {
        const injected = 'white;position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=1)';
        // QA-C-1-01: escaped spellings of url( with a quote are bad urls that end at the first `)`.
        const escaped = String.raw`u\72l(a'b);position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=2);x:'c)`, upper = String.raw`U\52L(a"b);position:fixed;x:"c)`;
        const options = {items: samples, tokens: {color: {surface: injected, accent: 'rgb(1, 2, 3)', muted: escaped, border: upper}, components: {itemText: 'red !important'}}};
        const {page, context, server} = await setup(false, options);
        try {
            assert.doesNotMatch(server.html, /position:fixed|exfil|!important/);
            const result = await page.evaluate(async ({html, options}) => {
                const parsed = document.createElement('div'); parsed.innerHTML = html;
                const client = document.createElement('div'); document.body.append(client); await window.monthModule.renderMonth(client, options);
                const root = window.scope.querySelector('.nc-calendar'), style = getComputedStyle(root);
                // React writes the server attribute as text and the client through CSSOM; compare the declarations.
                const declarations = node => node.getAttribute('style').split(';').map(part => part.trim()).filter(Boolean).map(part => part.split(':').map(side => side.trim()).join(':')).sort();
                return {server: declarations(parsed.querySelector('.nc-calendar')), hydrated: declarations(root), client: declarations(client.querySelector('.nc-calendar')),
                    position: style.position, zIndex: style.zIndex, surface: style.getPropertyValue('--nelmad-calendar-color-surface').trim(), accent: style.getPropertyValue('--nelmad-calendar-color-accent').trim(),
                    itemText: getComputedStyle(window.scope.querySelector('.nc-month-item')).color, requests: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.includes('exfil'))};
            }, {html: server.html, options});
            assert.deepEqual(result.server, ['--nelmad-calendar-color-accent:rgb(1, 2, 3)']);
            assert.deepEqual(result.hydrated, result.server); assert.deepEqual(result.client, result.server);
            assert.deepEqual([result.position, result.zIndex, result.surface, result.accent, result.itemText, result.requests], ['relative', 'auto', '#fff', 'rgb(1, 2, 3)', 'rgb(33, 32, 31)', []]);
            assert.deepEqual(await page.evaluate(() => window.month.errors), []);
            return result;
        } finally { await context.close(); }
    });
    // Decision 3 (spec v7 §10.3.2, DEC-1-01): any url(, well formed and in any decoded spelling, makes the token absent. A consumer
    // rule that uses the public variable in a URL-accepting property then loads nothing; the control rule shows that it would.
    await check('document: a well-formed url() token value in any spelling is absent on server, hydration and client; consumer CSS loads nothing (decision 3, spec v7 §10.3.2)', async () => {
        const tracker = 'https://tracker.invalid/p.gif';
        const tokens = {color: {surface: `url(${tracker}?x=1)`, danger: String.raw`u\72l(${tracker}?x=2)`, focus: `URL("${tracker}?x=3")`, accent: 'rgb(1, 2, 3)'},
            shadows: {overlay: String.raw`\75 rl('${tracker}?x=4')`}, components: {itemBackground: `image-set(url(${tracker}?x=5) 1x)`}};
        const {page, context, server} = await setup(false, {items: samples, tokens});
        try {
            assert.doesNotMatch(server.html, /tracker|72l|75 rl/i);
            const requests = []; page.on('request', request => { if (request.url().includes('tracker.invalid')) requests.push(request.url()); });
            const result = await page.evaluate(async ({html, tokens, tracker}) => {
                const style = document.createElement('style');
                style.textContent = `.nc-calendar{background-image:var(--nelmad-calendar-color-surface);border-image-source:var(--nelmad-calendar-color-danger)}
                    .nc-month{list-style-image:var(--nelmad-calendar-color-focus);background-image:var(--nelmad-calendar-shadows-overlay)}.nc-month-item{background-image:var(--nelmad-calendar-components-item-background)}
                    #control{background-image:url(${tracker}?control);width:4px;height:4px}`;
                const control = document.createElement('div'); control.id = 'control'; window.scope.append(style, control);
                const parsed = document.createElement('div'); parsed.innerHTML = html;
                const client = document.createElement('div'); document.body.append(client); await window.monthModule.renderMonth(client, {items: [], tokens});
                const declarations = node => node.getAttribute('style').split(';').map(part => part.trim()).filter(Boolean).map(part => part.split(':').map(side => side.trim()).join(':')).sort();
                const root = window.scope.querySelector('.nc-calendar'), computed = getComputedStyle(root);
                for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
                await new Promise(resolve => setTimeout(resolve, 300));
                return {server: declarations(parsed.querySelector('.nc-calendar')), hydrated: declarations(root), client: declarations(client.querySelector('.nc-calendar')),
                    backgroundImage: computed.backgroundImage, borderImage: computed.borderImageSource, controlImage: getComputedStyle(control).backgroundImage.slice(0, 40)};
            }, {html: server.html, tokens, tracker});
            assert.deepEqual(result.server, ['--nelmad-calendar-color-accent:rgb(1, 2, 3)']);
            assert.deepEqual(result.hydrated, result.server); assert.deepEqual(result.client, result.server);
            assert.deepEqual([result.backgroundImage, result.borderImage], ['none', 'none']);
            assert.deepEqual(requests, [`${tracker}?control`], JSON.stringify(requests));
            assert.deepEqual(await page.evaluate(() => window.month.errors), []);
            return {...result, requests};
        } finally { await context.close(); }
    });
    // QA-C-1-01: generated values around url(, escapes, quotes, comments and trim(); an accepted value must be exactly one
    // declaration in the server attribute, accepted by setProperty, and equal on both sides. QA-C-2-02: the server side is
    // the HTML React writes (`trim()`, React's attribute escaping) read by the HTML parser, which turns CR/CRLF into LF and
    // NUL into U+FFFD; both sides are compared after that input preprocessing, which CSS applies before tokenizing anyway.
    await check('document: token validator against Chrome HTML and CSS parsing and the Chrome url reading, 60000 generated values (QA-C-1-01, QA-C-2-02, decision 3)', async () => {
        const context = await browser.newContext(), page = await context.newPage();
        try {
            await page.setContent('<div></div>');
            return await page.evaluate(async ({moduleUrl}) => {
                const {isDeclarationValue} = await import(moduleUrl);
                const fragments = ['url(', 'URL(', 'u\\72l(', '\\75 rl(', 'U\\52L(', 'ur\\l(', 'url', '(', ')', '[', ']', '{', '}', '"', "'", ';', '!', '\\', '/*', '*/',
                    ' ', '\t', '\n', '\r', '\f', '\u00a0', '\u2028', '\ufeff', '\x01', '\x7f', '\0', '#', '@', '1', '-', '--', '.', '+', 'e', 'a', ':', '%', ',',
                    'red', 'position:fixed', '\\\n', '\\;', '\\)', '\\"', '\u00e9', '-->', '<!--', '&', '<', '>', '&quot;'];
                let seed = 42;
                const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
                const values = new Set();
                while (values.size < 60000) { let value = ''; for (let k = 1 + Math.floor(random() * 10); k > 0; k--) value += fragments[Math.floor(random() * fragments.length)]; if (value.trim()) values.add(value); }
                // react-dom's escapeTextForBrowser, applied to the whole serialized style attribute.
                const escape = text => text.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;'})[char]);
                const preprocess = text => text.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
                const holder = document.createElement('div'), image = document.createElement('div'); document.body.append(image);
                // Decision 3 (spec v7 §10.3.2): Chrome's own reading decides whether an accepted value is a resource reference.
                const resource = value => { image.style.setProperty('--x', value); image.style.backgroundImage = 'var(--x)'; const computed = getComputedStyle(image).backgroundImage; image.removeAttribute('style'); return /url\(/i.test(computed); };
                const urls = ['url(a)', 'url(https://tracker.invalid/p.gif)', 'url( "a;b" )', "url('a')", 'URL(a)', 'u\\72l(a)', '\\75 rl(a)', '\\55 \\52 \\4c (a)', 'ur\\l(a)',
                    'url(data:image/png;base64,AA==)', 'image-set(url(a) 1x)', 'var(--y, url(a))', 'red, url(a)', '[url(a)]', ' url(a) '];
                const accepted = urls.filter(value => isDeclarationValue(value)), control = urls.filter(resource);
                if (accepted.length) throw new Error('url( accepted: ' + JSON.stringify(accepted));
                if (control.length < 10) throw new Error('the resource oracle reads too few url values: ' + JSON.stringify(control));
                const stats = {values: values.size, untrimmedDiffers: 0, accepted: 0, acceptedInvalidOnBothSides: 0, acceptedDifferingOnlyByPreprocessing: 0, rejected: 0, rejectedButHarmless: 0, urlSamplesRejected: urls.length, urlSamplesReadAsResourceByChrome: control.length}, unsafe = [];
                for (const value of values) {
                    holder.innerHTML = `<div style="${escape(`--x:${value.trim()};--y:1`)}"></div>`;
                    const attribute = holder.firstChild;
                    // The client writes what themeStyle passes, value.trim(): React 18 trims it again, React 19 writes it as is.
                    // QA-C-3-01: the untrimmed text is compared as well, so a value whose serialization depends on its trailing
                    // whitespace is a mismatch unless the package passes the trimmed one.
                    const raw = document.createElement('div'); raw.style.setProperty('--x', value);
                    const trimmed = document.createElement('div'); trimmed.style.setProperty('--x', value.trim());
                    const server = attribute.style.getPropertyValue('--x'), client = trimmed.style.getPropertyValue('--x'), untrimmed = raw.style.getPropertyValue('--x');
                    const leak = [...attribute.style].some(name => name !== '--x' && name !== '--y') || attribute.style.getPropertyValue('--y') !== '1';
                    const mismatch = preprocess(server) !== preprocess(client);
                    if (preprocess(untrimmed) !== preprocess(client)) stats.untrimmedDiffers++;
                    if (isDeclarationValue(value)) {
                        stats.accepted++; if (!server) stats.acceptedInvalidOnBothSides++; if (!mismatch && server !== client) stats.acceptedDifferingOnlyByPreprocessing++;
                        if (leak || mismatch || resource(value)) unsafe.push(value);
                    } else { stats.rejected++; if (!leak && !mismatch && server) stats.rejectedButHarmless++; }
                }
                if (unsafe.length) throw new Error('accepted but unsafe: ' + JSON.stringify(unsafe.slice(0, 10)));
                return stats;
            }, {moduleUrl});
        } finally { await context.close(); }
    });
    // QA-C-1-02: style-src without 'unsafe-inline' blocks the server `style` attributes; hydration restores them through CSSOM.
    // QA-C-2-01: only what a client render writes; a consumer style value with a top-level `;` must not become declarations.
    // Spec v8 §10.3.4 (decision 3, 2026-10-22): only the package's own validated declarations, never the consumer root style.
    await check("document: strict CSP (style-src 'self'): hydration restores the package's own root tokens and grid rows as a client render writes them, not the consumer root style (QA-C-1-02, QA-C-2-01, spec v8 §10.3.4)", async () => {
        const hostile = 'red;position:fixed;inset:0;z-index:99999;outline:9px solid lime';
        const options = {items: samples, tokens: {color: {accent: 'rgb(1, 2, 3)'}}, style: {'--nelmad-calendar-color-text': hostile, maxWidth: 960, lineHeight: 1.5}};
        const server = esm.serverMonth(options);
        const context = await browser.newContext({viewport: {width: 980, height: 800}, locale: 'de-DE'}), page = await context.newPage(), violations = [];
        page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => { if (/Content Security Policy/.test(message.text())) violations.push(message.text().slice(0, 120)); });
        const origin = 'http://calendar.test', policy = "default-src 'self'; style-src 'self'; script-src 'self'";
        const files = {'/': ['text/html', `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body style="margin:0"><div id="fixture">${server.html}</div></body></html>`],
            '/styles.css': ['text/css', css], '/entry.mjs': ['text/javascript', readFileSync(resolve(directory, 'index.mjs'), 'utf8')]};
        await page.route(`${origin}/**`, route => { const [type, body] = files[new URL(route.request().url()).pathname];
            return route.fulfill({status: 200, contentType: type, body, headers: {'content-security-policy': policy}}); });
        try {
            await page.goto(`${origin}/`);
            const read = (selector = '#fixture') => page.evaluate(selector => { const root = document.querySelector(`${selector} .nc-calendar`), grid = document.querySelector(`${selector} .nc-month`);
                const inline = node => [...node.style].map(name => `${name}:${node.style.getPropertyValue(name)}`), style = getComputedStyle(root);
                return {weeks: getComputedStyle(grid).getPropertyValue('--nc-week-count').trim(), accent: style.getPropertyValue('--nelmad-calendar-color-accent').trim(),
                    position: style.position, zIndex: style.zIndex, outline: style.outlineStyle, maxWidth: style.maxWidth,
                    rootInline: inline(root), gridInline: inline(grid).map(text => text.split(':')[0]), rootAttribute: root.getAttribute('style'), gridAttribute: grid.getAttribute('style')}; }, selector);
            const before = await read();
            await page.evaluate(async options => {
                Date.now = () => Date.parse('2026-03-04T12:00:00Z');
                const module = await import('/entry.mjs'); window.scope = document; window.month = await module.hydrateMonth(document.getElementById('fixture'), options);
            }, options);
            await settle(page);
            const after = await read(), weeks = String((Date.parse(server.range.end) - Date.parse(server.range.start)) / 7 / 86400000);
            // The policy is active: before hydration neither attribute applies.
            assert.equal(before.weeks, ''); assert.notEqual(before.accent, 'rgb(1, 2, 3)'); assert.ok(before.rootAttribute && before.gridAttribute);
            assert.ok(before.rootAttribute.includes('position:fixed')); assert.deepEqual([before.position, before.rootInline], ['relative', []]);
            assert.ok(violations.length >= 2, JSON.stringify(violations));
            assert.deepEqual([after.weeks, after.accent, after.maxWidth], [weeks, 'rgb(1, 2, 3)', 'none'], 'tokens and rows back; the consumer max-width stays blocked');
            // The hostile value stays rejected, exactly as in a client render of the same props on the same page.
            await page.evaluate(async options => { const client = document.createElement('div'); client.id = 'client'; document.body.append(client);
                const module = await import('/entry.mjs'); await module.renderMonth(client, options); }, options);
            await settle(page);
            const client = await read('#client');
            assert.deepEqual([after.position, after.zIndex, after.outline], ['relative', 'auto', 'none']);
            assert.deepEqual(client.rootInline, ['--nelmad-calendar-color-accent:rgb(1, 2, 3)', 'max-width:960px', 'line-height:1.5'], 'a client render writes the consumer style too');
            assert.deepEqual(after.rootInline, client.rootInline.filter(text => text.startsWith('--nelmad-calendar-')), 'the package declarations of that client render, nothing else');
            assert.deepEqual(after.gridInline, client.gridInline);
            assert.deepEqual(after.gridInline, ['--nc-week-count', '--nc-minimum-row']);
            await page.evaluate(() => document.getElementById('client').remove());
            completeRows(await geometry(page));
            const chip = page.locator('.nc-month-chip').first(), id = await chip.getAttribute('data-item-id');
            await chip.click();
            assert.deepEqual((await page.evaluate(() => window.month.events)).filter(event => event.type === 'item').map(event => event.value.item.id), [id]);
            assert.deepEqual(await page.evaluate(() => window.month.errors), []);
            await page.screenshot({path: resolve(output, 'document-strict-csp.png'), fullPage: true});
            return {before, after, client, pressed: id, violations: violations.length, firstViolation: violations[0]};
        } finally { await context.close(); }
    });
    // Spec v8 §10.3.4 (decision 3): the validated item colors of a server-rendered inline agenda are the package's declarations too.
    await check("document: strict CSP (style-src 'self'), mobile inline agenda: hydration restores the validated item colors of the server-rendered rows as a client render writes them; offending colors and the consumer root style stay absent (spec v8 §10.3.4)", async () => {
        const day = (id, calendarId) => ({id, title: id[0].toUpperCase() + id.slice(1), data: {}, ...(calendarId ? {calendarId} : {}), interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}});
        const options = {layout: 'mobile', items: [day('plain', 'work'), day('full', 'work'), day('bad', 'bad'), day('none')],
            sources: [{id: 'work', title: 'Work', color: 'rgb(10, 120, 40)'}, {id: 'bad', title: 'Bad', color: 'red;position:fixed'}],
            appearance: {full: {accentColor: 'rgb(200, 0, 120)', backgroundColor: 'rgb(250, 240, 200)', textColor: 'rgb(40, 20, 0)'}, bad: {backgroundColor: 'blue !important'}},
            tokens: {color: {accent: 'rgb(1, 2, 3)'}}, style: {maxWidth: 400, '--nelmad-calendar-color-text': 'rgb(9, 9, 9)'}};
        const server = esm.serverMonth(options);
        assert.doesNotMatch(server.html, /position:fixed|!important/);
        const context = await browser.newContext({viewport: {width: 420, height: 900}, locale: 'de-DE'}), page = await context.newPage(), violations = [];
        page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => { if (/Content Security Policy/.test(message.text())) violations.push(message.text().slice(0, 120)); });
        const origin = 'http://calendar.test', policy = "default-src 'self'; style-src 'self'; script-src 'self'";
        // The agenda rows carry non-ASCII text (en dash, isolates): the document declares its encoding.
        const files = {'/': ['text/html', `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body style="margin:0"><div id="fixture">${server.html}</div></body></html>`],
            '/styles.css': ['text/css', css], '/entry.mjs': ['text/javascript', readFileSync(resolve(directory, 'index.mjs'), 'utf8')]};
        await page.route(`${origin}/**`, route => { const [type, body] = files[new URL(route.request().url()).pathname];
            return route.fulfill({status: 200, contentType: type, body, headers: {'content-security-policy': policy}}); });
        try {
            await page.goto(`${origin}/`);
            const read = (selector = '#fixture') => page.evaluate(selector => {
                const inline = node => node ? [...node.style].map(name => `${name}:${node.style.getPropertyValue(name)}`) : [];
                const root = document.querySelector(`${selector} .nc-calendar`);
                return {root: inline(root), maxWidth: getComputedStyle(root).maxWidth, rows: Object.fromEntries([...document.querySelectorAll(`${selector} li[data-item-id]`)].map(row => {
                    const surface = row.querySelector('[data-agenda-control=primary]') ?? row, marker = row.querySelector('.nc-item-accent'), inner = marker.firstElementChild;
                    return [row.dataset.itemId, {surface: inline(surface), source: inline(marker), accent: inline(inner), border: getComputedStyle(inner).borderInlineStartColor,
                        background: getComputedStyle(surface).backgroundColor, color: getComputedStyle(surface).color}];
                }))};
            }, selector);
            const before = await read();
            assert.deepEqual(Object.values(before.rows).map(row => [...row.surface, ...row.source, ...row.accent]), [[], [], [], []], 'CSP blocks every row declaration before hydration');
            assert.ok(violations.length >= 3, JSON.stringify(violations));
            await page.evaluate(async options => {
                Date.now = () => Date.parse('2026-03-04T12:00:00Z');
                const module = await import('/entry.mjs'); window.scope = document; window.month = await module.hydrateMonth(document.getElementById('fixture'), options);
            }, options);
            await settle(page);
            // The restored surface color starts the background-color transition of styles.css; computed colors are read
            // once it ends (a mid-transition sample such as rgb(250, 240, 202) is not the declared value).
            await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
            const after = await read();
            assert.deepEqual(await page.evaluate(() => window.month.errors), [], 'hydration without recovery');
            await page.evaluate(async options => { const client = document.createElement('div'); client.id = 'client'; document.body.append(client);
                const module = await import('/entry.mjs'); await module.renderMonth(client, options); }, options);
            await settle(page);
            const client = await read('#client');
            const declared = rows => Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, {surface: row.surface, source: row.source, accent: row.accent}]));
            assert.deepEqual(declared(after.rows), declared(client.rows), 'the hydrated rows carry exactly the client-rendered item declarations');
            assert.deepEqual(declared(after.rows), {plain: {surface: [], source: ['color:rgb(10, 120, 40)'], accent: []},
                full: {surface: ['background-color:rgb(250, 240, 200)', 'color:rgb(40, 20, 0)'], source: ['color:rgb(10, 120, 40)'], accent: ['color:rgb(200, 0, 120)']},
                bad: {surface: [], source: [], accent: []}, none: {surface: [], source: [], accent: []}});
            assert.deepEqual([after.rows.plain.border, after.rows.full.border, after.rows.full.background, after.rows.full.color], ['rgb(10, 120, 40)', 'rgb(200, 0, 120)', 'rgb(250, 240, 200)', 'rgb(40, 20, 0)']);
            assert.deepEqual([after.rows.bad.border, after.rows.none.border], ['rgb(1, 2, 3)', 'rgb(1, 2, 3)'], 'the theme accent below the offending source color');
            assert.deepEqual(after.root, ['--nelmad-calendar-color-accent:rgb(1, 2, 3)']); assert.equal(after.maxWidth, 'none', 'the consumer root style stays blocked');
            assert.deepEqual(client.root, ['--nelmad-calendar-color-accent:rgb(1, 2, 3)', 'max-width:400px', '--nelmad-calendar-color-text:rgb(9, 9, 9)']);
            assert.deepEqual(await page.evaluate(() => window.month.errors), []);
            await page.screenshot({path: resolve(output, 'document-strict-csp-mobile-agenda.png'), fullPage: true});
            return {before, after, client, violations: violations.length};
        } finally { await context.close(); }
    });
    // QA-15: items (chips, bars, agenda rows) use the item tokens; selected-day colors only selected cells; controls use neither.
    await check('document: component tokens wired per §10.3.1/§10.3.3 (QA-15)', async () => {
        const item = 'rgb(227, 239, 233)', text = 'rgb(13, 59, 44)', selected = 'rgb(243, 233, 198)';
        const {page, context} = await setup(false, {items: samples, style: {height: 900}, selection: {start: '2026-03-10', end: '2026-03-13'},
            tokens: {components: {itemBackground: item, itemText: text, selectedDayBackground: selected}}});
        try {
            // Read resolved colors, not the 100 ms background transition of buttons in the newly mirrored popover.
            await page.emulateMedia({reducedMotion: 'reduce'});
            const colors = selector => page.evaluate(selector => [...document.querySelectorAll(selector)].map(node => { const style = getComputedStyle(node); return [style.backgroundColor, style.color]; }), selector);
            const bars = await colors('.nc-month-bar'), chips = await colors('.nc-month-chip');
            assert.ok(bars.length && chips.length);
            for (const [background, color] of [...bars, ...chips]) assert.deepEqual([background, color], [item, text]);
            const cells = await page.evaluate(() => [...document.querySelectorAll('.nc-day')].map(node => [node.hasAttribute('data-selected'), getComputedStyle(node).backgroundColor]));
            assert.ok(cells.some(([isSelected]) => isSelected));
            for (const [isSelected, background] of cells) assert.equal(background === selected, isSelected);
            const toolbar = await colors('.nc-calendar-toolbar .nc-button');
            assert.ok(toolbar.length >= 3);
            for (const [background] of toolbar) assert.ok(![item, selected].includes(background), background);
            const today = page.locator('.nc-calendar-toolbar .nc-button').first();
            await today.hover(); await settle(page);
            const hovered = await today.evaluate(node => [node.hasAttribute('data-hovered'), getComputedStyle(node).backgroundColor]);
            assert.equal(hovered[0], true); assert.ok(![item, selected, toolbar[0][0]].includes(hovered[1]), hovered[1]);
            await cell(page, '2026-03-04').focus(); await page.keyboard.press('Enter'); await settle(page);
            const rows = await colors('.nc-agenda-item > [data-agenda-control=primary]');
            assert.ok(rows.length >= 6);
            for (const [background, color] of rows) assert.deepEqual([background, color], [item, text]);
            const row = page.locator('.nc-agenda-item > [data-agenda-control=primary]').first();
            assert.equal(await row.evaluate(node => getComputedStyle(node).backgroundImage), 'none');
            await row.hover(); await settle(page);
            // T18: hover tints the item's own colors with a currentcolor overlay, so a getItemAppearance background (inline)
            // keeps the feedback; the item background itself stays the resolved channel.
            const hoveredRow = await row.evaluate(node => { const style = getComputedStyle(node); return [node.hasAttribute('data-hovered'), style.backgroundColor, style.backgroundImage]; });
            assert.equal(hoveredRow[0], true); assert.equal(hoveredRow[1], item);
            assert.match(hoveredRow[2], /^linear-gradient\((?:color-mix|rgba?|color)\(/, `hover overlay: ${hoveredRow[2]}`);
            const painted = await page.evaluate(selected => [...document.querySelectorAll('.nc-theme, .nc-theme *')]
                .filter(node => getComputedStyle(node).backgroundColor === selected && !node.matches('.nc-day[data-selected]')).map(node => node.className), selected);
            assert.deepEqual(painted, []);
            await page.screenshot({path: resolve(output, 'document-component-tokens.png'), fullPage: true});
            return {bars: bars.length, chips: chips.length, selectedCells: cells.filter(([isSelected]) => isSelected).length, toolbar, hovered: hovered[1], agendaRows: rows.length};
        } finally { await context.close(); }
    });
    // QA-D: fixes of QA-06, QA-07, QA-08, QA-09, QA-12, QA-17, QA-18 and QA-19 in Chrome (geometry, paint order, focus, live DOM).
    const three = samples.slice(0, 3);
    const center = box => ({x: box.x + box.width / 2, y: box.y + box.height / 2});
    const itemEvents = page => page.evaluate(() => window.month.events.filter(event => event.type === 'item').map(event => ({id: event.value.item.id, date: event.value.date})));
    await check('document: a keyboard-focused cell keeps its chips and bars pressable; the ring is drawn above them (QA-06)', async () => {
        const {page, context} = await setup(false, {items: three, style: {height: 900}});
        try {
            await cell(page, '2026-03-04').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await settle(page);
            assert.equal(await cell(page, '2026-03-04').evaluate(node => node.matches(':focus-visible')), true);
            const ring = await cell(page, '2026-03-04').evaluate(node => { const style = getComputedStyle(node, '::after'); return {width: style.borderTopWidth, z: style.zIndex, events: style.pointerEvents, cellZ: getComputedStyle(node).zIndex}; });
            assert.deepEqual(ring, {width: '2px', z: '2', events: 'none', cellZ: 'auto'});
            const chip = center(await page.locator('[data-item-id=design][data-view=month]').boundingBox());
            assert.equal(await page.evaluate(({x, y}) => document.elementFromPoint(x, y).closest('.nc-month-item')?.dataset.itemId, chip), 'design');
            await page.mouse.click(chip.x, chip.y); await settle(page);
            const target = await cell(page, '2026-03-04').boundingBox(), bars = await page.locator('[data-item-id=bar][data-view=month]').all();
            let bar; for (const segment of bars) { const box = await segment.boundingBox(); if (box.y > target.y && box.y < target.y + target.height) bar = box; }
            await cell(page, '2026-03-04').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
            await page.mouse.click(target.x + target.width / 2, bar.y + bar.height / 2); await settle(page);
            assert.deepEqual(await itemEvents(page), [{id: 'design', date: '2026-03-04'}, {id: 'bar', date: '2026-03-04'}]);
            assert.equal(await page.locator('.nc-day-list').count(), 0);
            await cell(page, '2026-03-04').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await settle(page);
            await page.screenshot({path: resolve(output, 'document-qa06-focused-cell.png'), clip: {x: target.x - 20, y: target.y - 20, width: target.width * 2 + 40, height: target.height + 40}});
            return ring;
        } finally { await context.close(); }
    });
    await check('document: a refresh draws a bar over the grid border and moves nothing; a refresh error banner moves the grid and the open popover with it; blocking states keep the height (QA-07, QA-D-3-01, QA-D-3-02)', async () => {
        const {page, context} = await setup(false, {items: three});
        try {
            const measure = () => page.evaluate(() => {
                const box = node => { const r = node?.getBoundingClientRect(); return r && {top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height}; };
                const root = box(window.scope.querySelector('.nc-calendar')), grid = box(window.scope.querySelector('.nc-month'));
                return {root: root.height, gridTop: grid?.top, grid, status: box(window.scope.querySelector('.nc-calendar-status')),
                    statusMargin: Number.parseFloat(getComputedStyle(window.scope.querySelector('.nc-calendar-status') ?? document.body).marginBlockEnd) || 0,
                    controls: [...window.scope.querySelectorAll('.nc-calendar-toolbar button')].map(node => box(node)),
                    popover: box(document.querySelector('.nc-agenda-popover')), anchor: box(window.scope.querySelector('[data-date="2026-03-11"][role=gridcell]'))};
            });
            const ready = await measure();
            await cell(page, '2026-03-11').focus(); await page.keyboard.press('Enter'); await settle(page);
            const open = await measure(); assert.ok(open.popover);
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
            const refresh = await measure();
            assert.deepEqual([refresh.gridTop, refresh.root, refresh.anchor, refresh.popover, refresh.controls], [ready.gridTop, ready.root, open.anchor, open.popover, ready.controls]);
            // The 3 px bar ends on the grid's 1 px top border, inside the grid's inline extent.
            assert.ok(Math.abs(refresh.status.height - 3) < 0.1 && Math.abs(refresh.status.bottom - (ready.gridTop + 1)) < 0.1
                && refresh.status.left > ready.grid.left && refresh.status.right < ready.grid.right, JSON.stringify(refresh));
            await page.evaluate(() => window.month.patch({dataState: {status: 'error', phase: 'refresh', error: 1}, onRetryRequest: () => { window.retries = (window.retries ?? 0) + 1; }}));
            await settle(page);
            const error = await measure(), shift = error.status.height + error.statusMargin;
            // The banner is in the flow between the toolbar and the grid: the grid, its cells and the popover move by its outer size.
            assert.deepEqual(error.controls, ready.controls);
            assert.ok(error.status.bottom <= error.gridTop - error.statusMargin + 0.5 && Math.abs(error.gridTop - ready.gridTop - shift) < 0.5, JSON.stringify({ready, error}));
            assert.ok(Math.abs(error.anchor.top - open.anchor.top - shift) < 0.5 && Math.abs(error.popover.top - open.popover.top - shift) < 0.5, JSON.stringify({open, error}));
            const retry = center(await page.getByRole('button', {name: 'Retry'}).boundingBox());
            await page.mouse.click(retry.x, retry.y); assert.equal(await page.evaluate(() => window.retries), 1);
            await page.screenshot({path: resolve(output, 'document-qa07-refresh-error.png'), fullPage: true});
            await cell(page, '2026-03-11').focus(); await page.keyboard.press('Enter'); await settle(page);
            await patch(page, {dataState: {status: 'ready'}}); const back = await measure();
            assert.deepEqual([back.gridTop, back.anchor, back.popover], [ready.gridTop, open.anchor, open.popover], 'the popover follows its anchor back');
            const blocking = {};
            for (const dataState of [{status: 'loading', phase: 'initial'}, {status: 'error', phase: 'initial', error: 1}]) {
                await patch(page, {dataState}); blocking[dataState.status] = (await measure()).root;
                assert.ok(Math.abs(blocking[dataState.status] - ready.root) <= 1, JSON.stringify({ready: ready.root, blocking}));
            }
            await page.screenshot({path: resolve(output, 'document-qa07-blocking.png'), fullPage: true});
            return {ready: ready.root, gridTop: ready.gridTop, progress: refresh.status, banner: error.status, shift, popover: {open: open.popover.top, error: error.popover.top}, blocking};
        } finally { await context.close(); }
    });
    await check('document: the toolbar month is announced once and not replaced by the refresh that follows; its completion once; live regions are outside aria-busy (QA-08, QA-D-1-04, QA-D-3-03)', async () => {
        const {page, context} = await setup(false, {items: three});
        try {
            await page.evaluate(() => {
                window.writes = []; const host = window.scope.querySelector('.nc-calendar > [role=status]');
                new MutationObserver(records => { for (const record of records) window.writes.push([...record.addedNodes].map(node => node.textContent).join('')); }).observe(host, {childList: true});
            });
            await page.getByRole('button', {name: 'Next month'}).click(); await settle(page);
            await patch(page, {anchorDate: '2026-04-01'}); await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
            const busy = await page.evaluate(() => ['[role=status]', '[role=alert]', '[role=progressbar]', '.nc-calendar-view', '.nc-month'].map(selector =>
                window.scope.querySelector(`.nc-calendar ${selector}`).closest('[aria-busy="true"]')?.className ?? null));
            assert.deepEqual(busy, [null, null, null, null, 'nc-month']);
            // QA-D-3-03: the refresh start writes nothing; the month stays in the polite host until the completion replaces it.
            const during = await page.evaluate(() => window.scope.querySelector('.nc-calendar > [role=status]').textContent);
            assert.equal(during, 'Showing April 2026');
            await patch(page, {dataState: {status: 'ready'}});
            const writes = await page.evaluate(() => window.writes);
            assert.deepEqual(writes, ['Showing April 2026', 'Calendar refreshed']);
            return {writes, during, busy};
        } finally { await context.close(); }
    });
    await check('document: forced colors keep item boxes, dashed continuation sides and GrayText outside-month days (QA-09)', async () => {
        const {page, context} = await setup(false, {items: three, style: {height: 900}});
        try {
            await page.emulateMedia({forcedColors: 'active'}); await settle(page);
            const state = await page.evaluate(() => {
                const border = node => { const style = getComputedStyle(node); return [style.borderTopStyle, style.borderTopWidth, style.borderLeftStyle, style.borderRightStyle]; };
                const header = date => getComputedStyle(window.scope.querySelector(`[data-date="${date}"] .nc-day-header`)).color;
                const segments = [...window.scope.querySelectorAll('.nc-month-item')];
                return {chip: border(segments.find(node => node.dataset.itemId === 'design')), bars: segments.filter(node => node.dataset.itemId === 'bar').map(node =>
                    [node.hasAttribute('data-continues-before'), node.hasAttribute('data-continues-after'), ...border(node)]), outside: header('2026-04-01'), inside: header('2026-03-31')};
            });
            assert.deepEqual(state.chip, ['solid', '1px', 'solid', 'solid']);
            assert.deepEqual(state.bars, [[false, true, 'solid', '1px', 'solid', 'dashed'], [true, false, 'solid', '1px', 'dashed', 'solid']]);
            assert.notEqual(state.outside, state.inside);
            await page.screenshot({path: resolve(output, 'document-qa09-forced-colors.png'), fullPage: true});
            return state;
        } finally { await context.close(); }
    });
    await check('document: pressing the visible part of a cell at the viewport edge activates it without scrolling the page (QA-12)', async () => {
        const {page, context} = await setup(false, {items: three}, {width: 980, height: 900});
        try {
            const row = await page.locator('.nc-month-week').last().boundingBox();
            await page.setViewportSize({width: 980, height: Math.floor(row.y + 20)}); await settle(page);
            const target = await cell(page, '2026-04-01').boundingBox(), point = {x: target.x + target.width / 2, y: Math.floor(row.y + 10)};
            await page.mouse.move(point.x, point.y); await page.mouse.down(); await settle(page);
            const scrolled = await page.evaluate(() => scrollY); await page.mouse.up(); await settle(page);
            assert.equal(scrolled, 0); assert.equal(await page.locator('.nc-day-list').getAttribute('data-date'), '2026-04-01');
            // Keyboard focus still brings a hidden cell into view.
            await page.keyboard.press('Escape'); await settle(page); await page.evaluate(() => scrollTo(0, 0));
            await cell(page, '2026-03-25').focus(); await page.keyboard.press('ArrowDown'); await settle(page);
            assert.ok(await page.evaluate(() => scrollY) > 0);
            return {scrolledOnPress: scrolled};
        } finally { await context.close(); }
    });
    await check('document: 12-hour times are unpadded and a same-day range names its date once (QA-17)', async () => {
        const {page, context} = await setup(false, {items: three, style: {height: 900}, hourCycle: 12});
        try {
            const chip = (await page.locator('[data-item-id=design][data-view=month] .nc-item-time').textContent()).replace(/\s/g, ' ');
            await cell(page, '2026-03-04').focus(); await page.keyboard.press('Enter'); await settle(page);
            const details = (await page.locator('.nc-agenda-item[data-item-id=design] .nc-agenda-details').textContent()).replace(/\s/g, ' ');
            assert.equal(chip, '10:30 AM'); assert.equal(details.split('Mar 4, 2026').length, 2, details); assert.match(details, /10:30 AM – 11:30 AM/);
            return {chip, details};
        } finally { await context.close(); }
    });
    await check('document: the +N indicator keeps its sign before the number in RTL (QA-17)', async () => {
        const {page, context} = await setup(false, {items: dense(), locale: 'ar'});
        try {
            const order = await page.evaluate(() => {
                // The sign and the number are separate text nodes of the indicator.
                const indicator = window.scope.querySelector('[data-date="2026-03-04"] .nc-overflow'), walker = document.createTreeWalker(indicator, NodeFilter.SHOW_TEXT), texts = [];
                while (walker.nextNode()) texts.push(walker.currentNode);
                const range = document.createRange(), left = node => { range.selectNodeContents(node); return range.getBoundingClientRect().left; };
                return {text: indicator.textContent, plus: left(texts.find(node => node.textContent === '+')), digit: left(texts.find(node => node.textContent !== '+'))};
            });
            assert.ok(order.plus < order.digit, JSON.stringify(order));
            return order;
        } finally { await context.close(); }
    });
    // Samples the state each frame paints: a ResizeObserver created in the frame's rAF runs after the calendar's own observers.
    const paintedFrames = (page, change, count = 6) => page.evaluate(async ({change, count}) => {
        const check = () => { let bad = 0, empty = 0;
            for (const row of window.scope.querySelectorAll('.nc-month-week')) {
                const box = row.getBoundingClientRect(), overflow = [...row.querySelectorAll('.nc-overflow')].map(node => node.getBoundingClientRect());
                const segments = [...row.querySelectorAll('.nc-month-item')].map(node => node.getBoundingClientRect());
                if (row.querySelector('[data-has-items]') && !segments.length) empty++;
                for (const s of segments) if (s.bottom > box.bottom + 0.5 || overflow.some(o => o.left < s.right && s.left < o.right && s.bottom > o.top + 0.5 && s.top < o.bottom)) bad++;
            }
            return `bad=${bad},empty=${empty}`; };
        (0, eval)(change);
        const frames = [];
        for (let i = 0; i < count; i++) await new Promise(done => requestAnimationFrame(() => {
            const observer = new ResizeObserver(() => { observer.disconnect(); frames.push(check()); done(); }); observer.observe(document.documentElement); }));
        return frames;
    }, {change, count});
    const daily = [];
    for (const [month, days] of [['03', 30], ['04', 30]]) for (let day = 1; day <= days; day++) for (let k = 0; k < 4; k++) {
        const start = `2026-${month}-${String(day).padStart(2, '0')}`, end = day === days ? (month === '03' ? '2026-03-31' : '2026-05-01') : `2026-${month}-${String(day + 1).padStart(2, '0')}`;
        daily.push({id: `${month}-${day}-${k}`, title: `Item ${month}-${day}-${k}`, data: {}, interval: {kind: 'allDay', start, end}});
    }
    await check('document: +N is reserved per date and a continuation shows no start time (QA-18)', async () => {
        const perDate = [{id: 'tue-1', title: 'Tue one', data: {}, interval: {kind: 'timed', start: '2026-03-10T09:00:00Z'}}, {id: 'tue-2', title: 'Tue two', data: {}, interval: {kind: 'timed', start: '2026-03-10T10:00:00Z'}},
            ...[1, 2, 3].map(k => ({id: `wed-${k}`, title: `Wed ${k}`, data: {}, interval: {kind: 'timed', start: `2026-03-11T0${k}:00:00Z`}})),
            {id: 'night', title: 'Overnight', data: {}, interval: {kind: 'timed', start: '2026-03-14T22:00:00Z', end: '2026-03-16T02:00:00Z'}}];
        const {page, context} = await setup(false, {items: perDate});
        try {
            const state = await page.evaluate(() => ({overflow: ['2026-03-10', '2026-03-11'].map(date => window.scope.querySelector(`[role=gridcell][data-date="${date}"] .nc-overflow`)?.textContent ?? null),
                visible: [...window.scope.querySelectorAll('.nc-month-item')].map(node => node.dataset.itemId),
                night: [...window.scope.querySelectorAll('[data-item-id=night]')].map(node => [node.hasAttribute('data-continues-before'), node.querySelector('.nc-item-time').textContent.replace(/\s/g, ' ')])}));
            assert.deepEqual(state.overflow, [null, '+2']); assert.ok(state.visible.includes('tue-1') && state.visible.includes('tue-2'), JSON.stringify(state));
            assert.deepEqual(state.night, [[false, '10:00 PM'], [true, '']]);
            completeRows(await geometry(page));
            return state;
        } finally { await context.close(); }
    });
    await check('document: every painted frame of a resize or a navigation has its lanes and +N (QA-18)', async () => {
        const {page, context} = await setup(false, {items: daily, style: {height: 1100}});
        try {
            const result = {shrink: await paintedFrames(page, 'window.month.patch({style: {height: 700}})'), grow: await paintedFrames(page, 'window.month.patch({style: {height: 1000}})'),
                navigate: await paintedFrames(page, "window.month.patch({anchorDate: '2026-04-01'})"), back: await paintedFrames(page, "window.month.patch({anchorDate: '2026-03-01'})")};
            for (const frames of Object.values(result)) assert.deepEqual([...new Set(frames)], ['bad=0,empty=0'], JSON.stringify(result));
            return result;
        } finally { await context.close(); }
    });
    await check('document: lanes are measured in CSS px under a host zoom or transform (QA-18)', async () => {
        const {page, context} = await setup(false, {items: daily, style: {height: 1000}});
        try {
            const lanes = () => page.evaluate(() => window.scope.querySelector('.nc-month-week').querySelectorAll('.nc-month-item').length), plain = await lanes(), result = {plain};
            for (const css of ['zoom: 1.5', 'transform: scale(0.5); transform-origin: 0 0', 'transform: scale(0.8); transform-origin: 0 0']) {
                await page.evaluate(css => { document.getElementById('owner').style.cssText = css; }, css); await settle(page);
                result[css] = await lanes(); completeRows(await geometry(page));
            }
            assert.deepEqual(Object.values(result), [plain, plain, plain, plain], JSON.stringify(result)); assert.ok(plain > 0);
            return result;
        } finally { await context.close(); }
    });
    await check('document: comfortable density shows at least the lanes of compact (QA-18)', async () => {
        const pair = [1, 2].map(k => ({id: `pair-${k}`, title: `Pair ${k}`, data: {}, interval: {kind: 'allDay', start: '2026-03-17', end: '2026-03-18'}})), result = {};
        for (const density of ['compact', 'comfortable']) {
            const {page, context} = await setup(false, {items: pair, density});
            try {
                result[density] = await page.evaluate(() => ({items: window.scope.querySelectorAll('.nc-month-item').length, overflow: window.scope.querySelector('.nc-overflow')?.textContent ?? null,
                    row: window.scope.querySelector('.nc-month-week').getBoundingClientRect().height}));
                completeRows(await geometry(page));
            } finally { await context.close(); }
        }
        for (const density of ['compact', 'comfortable']) assert.deepEqual([result[density].items, result[density].overflow], [2, null], JSON.stringify(result));
        return result;
    });
    await check('document: a narrow chip keeps its title and drops the time first (QA-19)', async () => {
        const noon = [{id: 'noon', title: 'Planning meeting', data: {}, interval: {kind: 'timed', start: '2026-03-04T12:00:00Z'}}], result = {};
        for (const width of [560, 980]) {
            const {page, context} = await setup(false, {items: noon, hourCycle: 12}, {width, height: 800});
            try {
                result[width] = await page.evaluate(() => { const chip = window.scope.querySelector('[data-item-id=noon]'), time = chip.querySelector('.nc-item-time'), title = chip.querySelector('bdi');
                    return {chip: chip.getBoundingClientRect().width, title: title.getBoundingClientRect().width, time: getComputedStyle(time).display === 'none' ? 0 : time.getBoundingClientRect().width, timeClipped: time.scrollWidth > time.clientWidth + 1}; });
            } finally { await context.close(); }
        }
        assert.ok(result[560].chip < 91 && result[560].time === 0 && result[560].title >= 30, JSON.stringify(result));
        assert.ok(result[980].time > 0 && !result[980].timeClipped && result[980].title >= 30, JSON.stringify(result));
        return result;
    });
    await check('document: forced desktop at 320 px scrolls inside the grid, not the page (QA-19)', async () => {
        const {page, context} = await setup(false, {items: samples, hourCycle: 12}, {width: 320, height: 740});
        try {
            const state = await page.evaluate(() => { const grid = window.scope.querySelector('.nc-month'), buttons = [...window.scope.querySelectorAll('.nc-calendar-toolbar button')];
                return {page: document.documentElement.scrollWidth, grid: [grid.scrollWidth, grid.clientWidth], buttons: Math.max(...buttons.map(node => node.getBoundingClientRect().right)),
                    column: window.scope.querySelector('[role=gridcell]').getBoundingClientRect().width,
                    clippedTimes: [...window.scope.querySelectorAll('.nc-item-time')].filter(node => getComputedStyle(node).display !== 'none' && node.scrollWidth > node.clientWidth + 1).length}; });
            assert.ok(state.page <= 320 && state.grid[0] > state.grid[1] && state.buttons <= 320 && state.column >= 64 && !state.clippedTimes, JSON.stringify(state));
            await page.screenshot({path: resolve(output, 'document-qa19-forced-desktop-320.png'), fullPage: true});
            return state;
        } finally { await context.close(); }
    });
    await check('document: the weekday row stays visible over a scrolled constrained grid (QA-19)', async () => {
        const {page, context} = await setup(false, {items: samples, style: {height: 300}});
        try {
            const sticky = await page.evaluate(async () => { const grid = window.scope.querySelector('.nc-month'); grid.scrollTop = 120; await new Promise(requestAnimationFrame);
                const header = window.scope.querySelector('.nc-month-weekdays').getBoundingClientRect(), box = grid.getBoundingClientRect();
                return {scrolled: grid.scrollTop, offset: header.top - box.top, hit: document.elementFromPoint(header.left + 40, header.top + header.height / 2).closest('[role]')?.getAttribute('role')}; });
            assert.ok(sticky.scrolled > 0 && Math.abs(sticky.offset - 1) <= 1 && sticky.hit === 'columnheader', JSON.stringify(sticky));
            return sticky;
        } finally { await context.close(); }
    });
    // Review 2026-10-09-1: a mobile root of definite block-size (the README Sizing example) keeps its inline agenda inside it.
    const timedOnFourth = Array.from({length: 8}, (_, i) => ({id: `slot-${i}`, title: `Planning slot ${i + 1}`, data: {},
        interval: {kind: 'timed', start: `2026-03-04T${String(8 + i).padStart(2, '0')}:00:00Z`, end: `2026-03-04T${String(8 + i).padStart(2, '0')}:30:00Z`}}));
    for (const [variant, style] of [['blockSize 480', {blockSize: 480}], ['height 500', {height: 500}], ['intrinsic', undefined]]) {
        await check(`document: mobile ${variant} root: the inline agenda stays inside the root (it scrolls only under a definite height); page content below keeps its pointer hits (§6.3)`, async () => {
            const {page, context} = await setup(false, {layout: 'mobile', items: timedOnFourth, ...(style ? {style} : {})}, {width: 390, height: 1200});
            try {
                const state = await page.evaluate(async () => {
                    const after = document.createElement('button'); after.id = 'after'; after.textContent = 'After'; after.style.cssText = 'display:block;width:100%;height:40px';
                    document.getElementById('owner').after(after); await new Promise(requestAnimationFrame);
                    const root = window.scope.querySelector('.nc-calendar').getBoundingClientRect(), agenda = window.scope.querySelector('[data-presentation=inline]');
                    const box = agenda.getBoundingClientRect(), rows = [...agenda.querySelectorAll('[data-item-id]')], last = rows.at(-1);
                    const below = after.getBoundingClientRect(), hits = [0.25, 0.5, 0.9].map(x => document.elementFromPoint(below.left + below.width * x, below.top + 10)?.id);
                    const inside = {agendaBottom: box.bottom, rootBottom: root.bottom, scroll: [agenda.scrollHeight, agenda.clientHeight], overflow: getComputedStyle(agenda).overflowY, hits, rows: rows.length};
                    // The last row is reachable: scrolled into view inside the agenda, its center hits it.
                    last.scrollIntoView({block: 'nearest'}); await new Promise(requestAnimationFrame);
                    const target = last.querySelector('button').getBoundingClientRect(), hit = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2);
                    return {...inside, lastReachable: last.contains(hit), lastInside: target.bottom <= box.bottom + 0.5 && target.top >= box.top - 0.5};
                });
                assert.equal(state.rows, 8); assert.ok(state.agendaBottom <= state.rootBottom + 0.5, JSON.stringify(state));
                assert.deepEqual(state.hits, ['after', 'after', 'after'], JSON.stringify(state)); assert.ok(state.lastReachable && state.lastInside, JSON.stringify(state));
                // Only a definite root height shrinks the agenda; an intrinsic root shows every row without inner scrolling.
                if (style) assert.ok(state.scroll[0] > state.scroll[1], JSON.stringify(state)); else assert.ok(state.scroll[0] <= state.scroll[1] + 1, JSON.stringify(state));
                if (style) await page.screenshot({path: resolve(output, `document-mobile-${variant.replace(' ', '-')}-inline-agenda.png`)});
                return state;
            } finally { await context.close(); }
        });
    }
    await check('document: the grid owns only rows in the accessibility tree; instructions describe it from outside (QA-19)', async () => {
        const {page, context} = await setup(false, {items: samples});
        try {
            const session = await context.newCDPSession(page), ax = await session.send('Accessibility.getFullAXTree'); await session.detach();
            const byId = new Map(ax.nodes.map(node => [node.nodeId, node])), grid = ax.nodes.find(node => node.role?.value === 'grid');
            const children = grid.childIds.map(id => byId.get(id)).filter(node => !node.ignored).map(node => node.role?.value);
            assert.ok(children.length && children.every(role => role === 'row' || role === 'rowgroup'), JSON.stringify(children));
            assert.match(grid.description?.value ?? '', /arrow keys/);
            return {children, description: grid.description?.value};
        } finally { await context.close(); }
    });
    // QA-D-1: the verifier's round 1 findings (stale month announcement, banner over cells, sticky row over a focused
    // cell, mobile blocking height, pointer mark after a press without focus change).
    const firstWeek = page => page.evaluate(() => [...window.scope.querySelectorAll('.nc-month-week:first-child [role=gridcell]')].map(node => node.dataset.date));
    await check('document: a refresh after focus left the calendar repeats no month and writes nothing at its start (QA-D-1-01, QA-D-3-03)', async () => {
        const {page, context} = await setup(false, {items: three});
        try {
            await page.evaluate(() => {
                window.writes = []; const host = window.scope.querySelector('.nc-calendar > [role=status]');
                new MutationObserver(records => { for (const record of records) window.writes.push([...record.addedNodes].map(node => node.textContent).join('')); }).observe(host, {childList: true});
            });
            await page.getByRole('button', {name: 'Next month'}).click(); await settle(page); await patch(page, {anchorDate: '2026-04-01'});
            await page.evaluate(() => document.getElementById('outside').focus()); await page.waitForTimeout(1000);
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
            const state = await page.evaluate(() => ({writes: window.writes, active: document.activeElement.id}));
            assert.deepEqual(state, {writes: ['Showing April 2026'], active: 'outside'});
            return state;
        } finally { await context.close(); }
    });
    await check('document: no refresh status covers a weekday name, date cell, focus ring or toolbar control at any width; the toolbar controls never move; only a refresh error moves the grid, by its banner (QA-D-1-02, QA-D-3-01)', async () => {
        const result = {};
        for (const [name, options, width] of [['mobile-320-ru', {layout: 'mobile', locale: 'ru-RU'}, 320], ['desktop-320-ru', {locale: 'ru-RU'}, 320],
            ['desktop-640-ru', {locale: 'ru-RU'}, 640], ['desktop-700-ru', {locale: 'ru-RU'}, 700], ['mobile-320-en', {layout: 'mobile'}, 320],
            ['mobile-400-ru', {layout: 'mobile', locale: 'ru-RU'}, 400], ['desktop-980-en', {}, 980], ['desktop-1280-ru', {locale: 'ru-RU'}, 1280]]) {
            const {page, context} = await setup(false, {items: three, ...options}, {width, height: 900});
            try {
                // Geometry, not hit testing alone: a box that ignores pointer events still hides what is under it.
                const place = () => page.evaluate(() => {
                    const statusNode = window.scope.querySelector('.nc-calendar-status'), toolbar = window.scope.querySelector('.nc-calendar-toolbar');
                    const status = statusNode.getBoundingClientRect(), margin = Number.parseFloat(getComputedStyle(statusNode).marginBlockEnd) || 0;
                    const overlaps = box => { const now = statusNode.getBoundingClientRect(); return box.left < now.right - 0.5 && now.left < box.right - 0.5 && box.top < now.bottom - 0.5 && now.top < box.bottom - 0.5; };
                    const controls = [...toolbar.querySelectorAll('button')].map(node => node.getBoundingClientRect());
                    const gridTop = window.scope.querySelector('.nc-month').getBoundingClientRect().top, scroller = window.scope.querySelector('.nc-month'), scrollLeft = scroller.scrollLeft;
                    // A forced desktop grid scrolls inside its region at 320 px: each name is brought into that region first.
                    const headers = [...window.scope.querySelectorAll('[role=columnheader]')].map(node => { node.scrollIntoView({block: 'nearest', inline: 'nearest'}); const box = node.getBoundingClientRect();
                        return {text: node.textContent, covered: overlaps(box), visible: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('[role=columnheader]') === node}; });
                    scroller.scrollLeft = scrollLeft;
                    return {placement: statusNode.dataset.placement, inToolbar: toolbar.contains(statusNode), status: {top: status.top, bottom: status.bottom, height: status.height}, margin,
                        controls: controls.map(box => [box.left, box.top]), controlsCovered: controls.filter(overlaps).length,
                        headersCovered: headers.filter(header => header.covered || !header.visible).map(header => header.text),
                        cellsCovered: [...window.scope.querySelectorAll('[role=gridcell]')].filter(node => overlaps(node.getBoundingClientRect())).map(node => node.dataset.date), gridTop};
                });
                const ready = await page.evaluate(() => ({gridTop: window.scope.querySelector('.nc-month').getBoundingClientRect().top,
                    controls: [...window.scope.querySelectorAll('.nc-calendar-toolbar button')].map(node => { const box = node.getBoundingClientRect(); return [box.left, box.top]; })}));
                await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}); const refresh = await place();
                await page.evaluate(() => window.month.patch({dataState: {status: 'error', phase: 'refresh', error: 1}, onRetryRequest: () => { window.retries = (window.retries ?? 0) + 1; }}));
                await settle(page); const error = await place();
                // Every first-week cell, focused from the keyboard, shows the top of its ring: the hit there is the cell itself.
                const dates = await firstWeek(page), hits = [];
                await cell(page, dates[0]).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
                for (const date of dates) {
                    if (date !== dates[0]) await page.keyboard.press(options.locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
                    hits.push(await page.evaluate(date => { const node = window.scope.querySelector(`[role=gridcell][data-date="${date}"]`), box = node.getBoundingClientRect();
                        return node.matches(':focus-visible') && document.elementFromPoint(box.left + box.width / 2, box.top + 3)?.closest('[role=gridcell]') === node; }, date));
                }
                const retry = center(await page.locator('.nc-calendar-status button').boundingBox()); await page.mouse.click(retry.x, retry.y);
                await page.screenshot({path: resolve(output, `document-qa-d-3-01-${name}-error.png`), fullPage: true});
                for (const state of [refresh, error]) {
                    assert.deepEqual([state.inToolbar, state.headersCovered, state.cellsCovered, state.controlsCovered], [false, [], [], 0], JSON.stringify({name, state}));
                    assert.deepEqual(state.controls, ready.controls, `${name}: the toolbar controls stay in place`);
                }
                // The progress takes no space; the error banner moves the grid by exactly its outer size.
                assert.ok(refresh.placement === 'progress' && Math.abs(refresh.gridTop - ready.gridTop) < 0.5, JSON.stringify({name, ready, refresh}));
                assert.ok(error.placement === 'banner' && Math.abs(error.gridTop - ready.gridTop - error.status.height - error.margin) < 0.5, JSON.stringify({name, ready, error}));
                assert.deepEqual([hits.every(Boolean), await page.evaluate(() => window.retries)], [true, 1], JSON.stringify({hits}));
                result[name] = {refresh, error, shift: {refresh: refresh.gridTop - ready.gridTop, error: error.gridTop - ready.gridTop}};
            } finally { await context.close(); }
        }
        return result;
    });
    await check('document: no painted frame of a resize shows a refresh status over the grid (QA-D-2-04, QA-D-3-01)', async () => {
        const result = {};
        for (const dataState of [{status: 'error', phase: 'refresh', error: 1}, {status: 'loading', phase: 'refresh'}]) {
            const {page, context} = await setup(false, {items: three, locale: 'ru-RU'}, {width: 640, height: 800});
            try {
                await page.evaluate(dataState => window.month.patch({dataState, onRetryRequest: () => {}}), dataState); await settle(page);
                // Recorded in observers created after the calendar's, so after its layout and before paint in each frame.
                const initial = await page.evaluate(() => {
                    window.frames_ = []; let frame = 0; const tick = () => { frame++; if (frame < 30) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
                    const status = () => window.scope.querySelector('.nc-calendar-status');
                    const record = source => { const box = status().getBoundingClientRect();
                        const covered = [...window.scope.querySelectorAll('[role=gridcell], [role=columnheader], .nc-calendar-toolbar button')].map(node => node.getBoundingClientRect())
                            .filter(other => other.left < box.right && box.left < other.right && other.top < box.bottom - 0.5 && box.top < other.bottom - 0.5).length;
                        window.frames_.push({frame, source, height: Math.round(box.height), covered}); };
                    new ResizeObserver(() => record('status')).observe(status());
                    new ResizeObserver(() => record('weekdays')).observe(window.scope.querySelector('.nc-month-weekdays'));
                    new ResizeObserver(() => record('toolbar')).observe(window.scope.querySelector('.nc-calendar-toolbar'));
                    return Math.round(status().getBoundingClientRect().height);
                });
                await page.setViewportSize({width: 320, height: 800}); await settle(page); await settle(page);
                const frames = await page.evaluate(() => window.frames_);
                assert.ok(frames.length > 0 && frames.every(frame => frame.covered === 0), JSON.stringify(frames));
                // The error banner wraps at 320 px (the case that grows it is exercised); the progress keeps its 3 px.
                if (dataState.status === 'error') assert.ok(frames.some(frame => frame.height > initial), JSON.stringify({initial, frames}));
                else assert.ok(frames.every(frame => frame.height === 3), JSON.stringify(frames));
                result[dataState.status] = {initial, frames};
            } finally { await context.close(); }
        }
        return result;
    });
    // QA-D-3: the verifier's round 3 findings (toolbar controls moved by a status, a press lost or retried, the popover left
    // behind by a moving grid, layout shifts of every refresh, the blocking reserve before a measurement).
    const nextButton = page => page.evaluate(() => { const box = [...window.scope.querySelectorAll('.nc-calendar-toolbar button')][2].getBoundingClientRect(); return {x: box.left + box.width / 2, y: box.top + box.height / 2}; });
    const navigations = page => page.evaluate(() => window.month.events.filter(event => event.type === 'navigate').map(event => event.value));
    await check('document: a second press on Next lands on Next while the host loads or fails the new range; it never hits a skeleton or Retry (QA-D-3-01)', async () => {
        const result = {};
        for (const [name, options, width] of [['desktop-1280-en', {}, 1280], ['desktop-1280-ru', {locale: 'ru-RU'}, 1280], ['desktop-980-en', {}, 980],
            ['desktop-700-ru', {locale: 'ru-RU'}, 700], ['mobile-400-ru', {layout: 'mobile', locale: 'ru-RU'}, 400], ['mobile-320-ru', {layout: 'mobile', locale: 'ru-RU'}, 320]]) {
            const {page, context} = await setup(false, {items: three, ...options}, {width, height: 900});
            try {
                await page.evaluate(() => { window.retries = 0; window.hits = []; window.month.patch({onRetryRequest: () => { window.retries++; }});
                    document.addEventListener('click', event => window.hits.push(event.target.closest('button')?.getAttribute('aria-label') ?? event.target.className), true); });
                await settle(page);
                const next = await nextButton(page);
                // The documented loading pattern: the first press starts a refresh of the requested range, then the user presses again.
                await page.mouse.click(next.x, next.y); await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
                const underRefresh = await page.evaluate(({x, y}) => document.elementFromPoint(x, y).closest('button')?.getAttribute('aria-label') ?? null, next);
                await page.mouse.click(next.x, next.y); await settle(page);
                // The request for that range fails: a refresh error, and another press at the same point.
                await patch(page, {dataState: {status: 'error', phase: 'refresh', error: 1}});
                const underError = await page.evaluate(({x, y}) => document.elementFromPoint(x, y).closest('button')?.getAttribute('aria-label') ?? null, next);
                await page.mouse.click(next.x, next.y); await settle(page);
                const state = {next, underRefresh, underError, hits: await page.evaluate(() => window.hits), navigations: await navigations(page), retries: await page.evaluate(() => window.retries),
                    after: await nextButton(page)};
                const label = options.locale === 'ru-RU' ? 'Следующий месяц' : 'Next month';
                assert.deepEqual([state.underRefresh, state.underError, state.hits, state.retries], [label, label, [label, label, label], 0], JSON.stringify({name, state}));
                assert.deepEqual([state.navigations.length, state.after], [3, next], JSON.stringify({name, state}));
                result[name] = state;
            } finally { await context.close(); }
        }
        return result;
    });
    await check('document: an open popover stays anchored to its date cell when a refresh error banner moves the grid at narrow desktop widths (QA-D-3-02)', async () => {
        const result = {};
        for (const [name, options, width] of [['desktop-700-ru', {locale: 'ru-RU'}, 700], ['desktop-640-en', {}, 640], ['desktop-980-en', {}, 980]]) {
            const {page, context} = await setup(false, {items: three, ...options}, {width, height: 900});
            try {
                const measure = () => page.evaluate(() => { const anchor = window.scope.querySelector('[role=gridcell][data-date="2026-03-25"]').getBoundingClientRect(), popover = document.querySelector('.nc-agenda-popover')?.getBoundingClientRect();
                    return {cell: {top: anchor.top, bottom: anchor.bottom}, popover: popover && {top: popover.top, left: popover.left}, gap: popover && popover.top - anchor.bottom,
                        overlap: popover ? Math.max(0, Math.min(anchor.bottom, popover.bottom) - Math.max(anchor.top, popover.top)) : null}; });
                const box = await cell(page, '2026-03-25').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + 8); await settle(page);
                const before = await measure();
                await page.evaluate(() => window.month.patch({dataState: {status: 'error', phase: 'refresh', error: 1}, onRetryRequest: () => {}})); await settle(page);
                const after = await measure();
                assert.ok(before.popover && after.popover && Math.abs(after.gap - before.gap) < 0.5 && after.overlap === 0 && after.cell.top > before.cell.top, JSON.stringify({name, before, after}));
                result[name] = {before, after};
            } finally { await context.close(); }
        }
        return result;
    });
    await check('document: refresh cycles shift no layout in mobile, auto and desktop (QA-D-3-02)', async () => {
        const result = {};
        for (const [name, options, viewport] of [['mobile-400-ru', {layout: 'mobile', locale: 'ru-RU'}, {width: 400, height: 900}], ['auto-390-en', {layout: 'auto'}, {width: 390, height: 900}],
            ['desktop-700-ru', {locale: 'ru-RU'}, {width: 700, height: 900}], ['desktop-1280-en', {}, {width: 1280, height: 900}]]) {
            const {page, context} = await setup(false, {items: three, ...options}, viewport);
            try {
                await page.evaluate(() => { window.shifts = []; new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.shifts.push(entry.value); }).observe({type: 'layout-shift'}); });
                const top = () => page.evaluate(() => window.scope.querySelector('[role=grid]').getBoundingClientRect().top), ready = await top(), tops = [];
                for (let cycle = 0; cycle < 5; cycle++) {
                    await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}); await page.waitForTimeout(150); tops.push(await top());
                    await patch(page, {dataState: {status: 'ready'}}); await page.waitForTimeout(150);
                }
                const cls = await page.evaluate(() => window.shifts.reduce((sum, value) => sum + value, 0));
                assert.ok(cls === 0 && tops.every(value => value === ready), JSON.stringify({name, cls, ready, tops}));
                result[name] = {cls, ready, tops};
            } finally { await context.close(); }
        }
        return result;
    });
    await check('document: the refresh progress moves by transform only, is a static full bar under reduced motion and keeps system colors in forced colors (QA-D-3)', async () => {
        const {page, context} = await setup(false, {items: three, locale: 'ar'}, {width: 980, height: 800});
        try {
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
            const sample = () => page.evaluate(() => { const track = window.scope.querySelector('.nc-calendar-progress'), bar = track.firstElementChild, style = getComputedStyle(bar);
                return {transform: style.transform, animation: style.animationName, direction: style.animationDirection, width: bar.getBoundingClientRect().width, track: track.getBoundingClientRect().width,
                    color: style.backgroundColor, trackColor: getComputedStyle(track).backgroundColor, adjust: getComputedStyle(track).forcedColorAdjust}; });
            const first = await sample(); await page.waitForTimeout(200); const second = await sample();
            assert.ok(first.animation === 'nc-progress-slide' && first.direction === 'reverse' && first.transform !== second.transform && first.width < first.track, JSON.stringify({first, second}));
            await page.emulateMedia({reducedMotion: 'reduce'}); await settle(page);
            const reduced = await sample(); assert.ok(reduced.animation === 'none' && Math.abs(reduced.width - reduced.track) < 0.5, JSON.stringify(reduced));
            await page.emulateMedia({reducedMotion: 'no-preference', forcedColors: 'active'}); await settle(page);
            const forced = await sample(), canvas = await page.evaluate(() => getComputedStyle(window.scope.querySelector('.nc-calendar')).backgroundColor);
            assert.ok(forced.adjust === 'none' && forced.color !== forced.trackColor && forced.trackColor !== canvas && forced.color !== canvas, JSON.stringify({forced, canvas}));
            await page.screenshot({path: resolve(output, 'document-qa-d-3-progress-forced.png'), clip: {x: 0, y: 0, width: 980, height: 200}});
            return {first, second, reduced, forced, canvas};
        } finally { await context.close(); }
    });
    await check('document: a keyboard-focused cell of a scrolled constrained grid is never under the sticky weekday row (QA-D-1-03)', async () => {
        const {page, context} = await setup(false, {items: samples, style: {height: 300}});
        try {
            await cell(page, '2026-03-31').focus(); await settle(page);
            const rows = [];
            for (let step = 0; step < 5; step++) {
                await page.keyboard.press('ArrowUp'); await settle(page);
                rows.push(await page.evaluate(() => { const node = document.activeElement, box = node.getBoundingClientRect(), header = window.scope.querySelector('.nc-month-weekdays').getBoundingClientRect();
                    return {date: node.dataset.date, covered: Math.max(0, Math.min(header.bottom, box.bottom) - box.top), hit: document.elementFromPoint(box.left + 10, box.top + 3)?.closest('[role]') === node,
                        scrollTop: window.scope.querySelector('.nc-month').scrollTop}; }));
            }
            await page.screenshot({path: resolve(output, 'document-qa-d-1-03-sticky-focus.png')});
            assert.ok(rows.every(row => row.covered === 0 && row.hit) && rows.some(row => row.scrollTop > 0), JSON.stringify(rows));
            return rows;
        } finally { await context.close(); }
    });
    await check('document: blocking states keep the measured height in mobile and desktop; a first mount uses the estimate within 2 % (QA-D-1-05, QA-D-3)', async () => {
        const result = {}, august = [...three, {id: 'august', title: 'August', data: {}, interval: {kind: 'allDay', start: '2026-08-12', end: '2026-08-13'}}];
        for (const [name, options, viewport] of [['mobile', {layout: 'mobile'}, {width: 400, height: 900}], ['desktop', {}, {width: 980, height: 900}],
            ['comfortable', {density: 'comfortable'}, {width: 980, height: 1200}]]) {
            const {page, context} = await setup(false, {items: august, ...options}, viewport);
            try {
                const height = () => page.evaluate(() => window.scope.querySelector('.nc-calendar').getBoundingClientRect().height);
                const sizes = {ready: await height(), row: await page.evaluate(() => window.scope.querySelector('.nc-month-weeks').getBoundingClientRect().height / 5)};
                await patch(page, {dataState: {status: 'loading', phase: 'initial'}}); sizes.loading = await height();
                await patch(page, {dataState: {status: 'error', phase: 'initial', error: 1}}); sizes.error = await height();
                await patch(page, {dataState: {status: 'loading', phase: 'initial'}, anchorDate: '2026-08-01'}); sizes.sixWeeks = await height();
                await patch(page, {dataState: {status: 'ready'}}); sizes.sixWeeksReady = await height();
                assert.ok(Math.abs(sizes.loading - sizes.ready) <= 1 && Math.abs(sizes.error - sizes.ready) <= 1, JSON.stringify(sizes));
                // Another month keeps the measured view plus one measured week row; in mobile its inline agenda then shows
                // another date, whose content the reserve cannot know.
                assert.ok(Math.abs(sizes.sixWeeks - sizes.ready - sizes.row) <= 1, JSON.stringify(sizes));
                if (name !== 'mobile') assert.ok(Math.abs(sizes.sixWeeks - sizes.sixWeeksReady) <= sizes.sixWeeksReady * 0.05, JSON.stringify(sizes));
                result[name] = sizes;
            } finally { await context.close(); }
            // First mount: nothing was measured, the stylesheet estimate holds the place of the view. In mobile it assumes
            // an inline agenda of a date without items (here the items end before the viewed date, 4 March).
            const quiet = [{id: 'quiet', title: 'Quiet', data: {}, interval: {kind: 'allDay', start: '2026-03-02', end: '2026-03-04'}}];
            const first = await setup(false, {items: name === 'mobile' ? quiet : august, dataState: {status: 'loading', phase: 'initial'}, ...options}, viewport);
            try {
                const height = () => first.page.evaluate(() => window.scope.querySelector('.nc-calendar').getBoundingClientRect().height);
                const estimate = await height(); await patch(first.page, {dataState: {status: 'ready'}}); const ready = await height();
                // QA-D-3: the estimate is built from the sizes the Month uses (lead decision: within about 2 %).
                assert.ok(Math.abs(estimate - ready) <= ready * 0.02, JSON.stringify({name, estimate, ready}));
                result[name].firstMount = {estimate, ready};
            } finally { await first.context.close(); }
        }
        return result;
    });
    // QA-D-4-01: in a mobile root of fixed height the inline agenda shrinks before the grid; the grid keeps its weekday row
    // and at least one whole 44 px week visible, also with the refresh error banner.
    await check('document: a constrained mobile root keeps a usable grid viewport in ready and refresh-error states (QA-D-4-01)', async () => {
        const result = {};
        for (const [name, locale, viewport, height] of [['320x360-ru', 'ru-RU', {width: 320, height: 640}, 360], ['390x420-en', 'en-US', {width: 390, height: 640}, 420],
            ['375x480-ru', 'ru-RU', {width: 375, height: 640}, 480]]) {
            const {page, context} = await setup(false, {items: three, layout: 'mobile', locale, style: {height}}, viewport);
            try {
                const measure = () => page.evaluate(() => {
                    const scope = window.scope, grid = scope.querySelector('.nc-month'), weekdays = scope.querySelector('.nc-month-weekdays').getBoundingClientRect().height;
                    const agenda = scope.querySelector('.nc-day-list[data-presentation="inline"]'), root = scope.querySelector('.nc-calendar').getBoundingClientRect();
                    const content = [...scope.querySelectorAll('.nc-calendar > *')].map(node => node.getBoundingClientRect().bottom);
                    return {grid: grid.clientHeight, weekdays, agenda: agenda?.getBoundingClientRect().height ?? null, root: root.height, overflow: Math.max(...content) - root.bottom};
                });
                const sizes = {ready: await measure()};
                await patch(page, {dataState: {status: 'error', phase: 'refresh', error: 1}}); sizes.refreshError = await measure();
                for (const [state, size] of Object.entries(sizes)) {
                    assert.ok(Math.abs(size.root - height) <= 1, JSON.stringify({name, state, size}));
                    assert.ok(size.grid >= size.weekdays + 44 - 1, `grid viewport below the weekday row and one week: ${JSON.stringify({name, state, size})}`);
                    assert.ok(size.agenda >= 80 - 1, JSON.stringify({name, state, size}));
                    assert.ok(size.overflow <= 1, `content leaves the root: ${JSON.stringify({name, state, size})}`);
                }
                result[name] = sizes;
            } finally { await context.close(); }
        }
        return result;
    });
    await check('document: a first blocking mount keeps the height of the month it becomes under host fonts, line heights and paragraph resets (QA-D-3)', async () => {
        const result = {}, quiet = [{id: 'quiet', title: 'Quiet', data: {}, interval: {kind: 'allDay', start: '2026-03-02', end: '2026-03-04'}}];
        for (const [name, options, viewport, css, sheet] of [['desktop-font20', {}, {width: 980, height: 900}, 'font-size:20px'], ['desktop-lh16', {locale: 'ru-RU'}, {width: 980, height: 900}, 'line-height:1.6'],
            ['mobile-font20', {layout: 'mobile'}, {width: 400, height: 900}, 'font-size:20px'], ['mobile-lh16-ru', {layout: 'mobile', locale: 'ru-RU'}, {width: 400, height: 900}, 'line-height:1.6'],
            ['mobile-six-weeks', {layout: 'mobile', anchorDate: '2026-08-01', items: [{id: 'august', title: 'August', data: {}, interval: {kind: 'allDay', start: '2026-08-12', end: '2026-08-13'}}]}, {width: 400, height: 900}, ''],
            ['mobile-p-reset', {layout: 'mobile'}, {width: 360, height: 900}, '', '#owner p{margin:0}']]) {
            for (const dataState of [{status: 'loading', phase: 'initial'}, {status: 'error', phase: 'initial', error: 1}]) {
                const {page, context} = await setup(false, {items: quiet, ...options, dataState}, viewport);
                try {
                    await page.evaluate(([css, sheet]) => { document.getElementById('owner').style.cssText = css; const style = document.createElement('style'); style.textContent = sheet ?? ''; document.head.append(style); },
                        [css, sheet]);
                    await settle(page);
                    const height = () => page.evaluate(() => window.scope.querySelector('.nc-calendar').getBoundingClientRect().height);
                    const estimate = await height(); await patch(page, {dataState: {status: 'ready'}}); const ready = await height();
                    assert.ok(Math.abs(estimate - ready) <= ready * 0.02, JSON.stringify({name, dataState, estimate, ready}));
                    result[`${name}/${dataState.status}`] = {estimate, ready};
                } finally { await context.close(); }
            }
        }
        return result;
    });
    await check('document: focus restored to a cell pressed while focused scrolls it into view (QA-D-1-06)', async () => {
        const {page, context} = await setup(false, {items: three}, {width: 980, height: 500});
        try {
            const target = await cell(page, '2026-03-03').boundingBox(), point = {x: target.x + 5, y: target.y + 5};
            await page.mouse.click(point.x, point.y); await settle(page); await page.keyboard.press('Escape'); await settle(page);
            assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-03-03');
            await page.mouse.click(point.x, point.y); await settle(page); assert.equal(await page.locator('.nc-day-list').count(), 1);
            await page.evaluate(() => scrollTo(0, 2000)); await settle(page);
            await page.keyboard.press('Escape'); await settle(page);
            const state = await page.evaluate(() => { const node = document.activeElement, box = node.getBoundingClientRect(); return {date: node.dataset.date, top: box.top, bottom: box.bottom, height: innerHeight}; });
            assert.ok(state.date === '2026-03-03' && state.top >= 0 && state.bottom <= state.height, JSON.stringify(state));
            return state;
        } finally { await context.close(); }
    });
}finally{await browser.close();}
const paths=['src/v02/core/month.ts','src/v02/core/formatting.ts','src/v02/core/layout.ts','src/v02/calendar/MonthView.tsx','src/v02/calendar/CalendarMonth.tsx','src/v02/calendar/useMonthMeasurements.ts',
    'src/v02/calendar/useCalendarController.ts','src/v02/calendar/DayAgendaBody.tsx','src/v02/calendar/useStatusGeometry.ts',
    'src/v02/calendar/CalendarShell.tsx','src/v02/calendar/slots.tsx','src/v02/core/appearance.ts','src/v02/styles.css','src/v02/themes/classic.ts','src/v02/primitives/ThemeRoot.tsx','src/v02/primitives/serverStyle.ts','src/v02/primitives/NonModalPopover.tsx',
    'scripts/implementation/month-entry.tsx','scripts/implementation/month-probe.mjs'];
const report={capturedAt:new Date().toISOString(),outcome:!only&&checks.every(c=>c.outcome==='pass')&&!errors.length?'pass':'fail',filter:only?String(only):null,node:process.version,browser:version,checks,errors,
    scope:'T11 Month regression with T12 desktop popover, plus token declarations on server/hydration/client (QA-14, escaped url and a Chrome HTML/CSS differential check for QA-C-1-01/QA-C-2-02), server styles under a strict CSP restored as a client render writes them, limited to the own validated declarations of the package for the root, the grid and the inline agenda rows (QA-C-1-02, QA-C-2-01, spec v8 §10.3.4), component token wiring (QA-15) and the QA-D fixes: pressable items in a focused cell (QA-06), status placement and blocking height (QA-07), the month announced once and refresh separately, outside aria-busy (QA-08, QA-D-1-01/04), forced colors (QA-09), pointer focus without scroll (QA-12), time/range/RTL labels (QA-17), per-date +N, painted-frame atomicity, CSS px under zoom/transform, comfortable lanes and continuations (QA-18), narrow chips, forced desktop at 320 px, sticky weekdays and grid children (QA-19); QA-D-1 round 1: no month after focus left, banners at 320 px cover no cell or ring, focused cells clear of the sticky row, measured blocking heights in mobile and desktop, scroll on restored focus after a press without focus change; QA-D-3 round 3: toolbar controls fixed in every data state, a refresh as a 3 px bar over the grid border with no layout shift, a refresh error banner that moves the grid and an open popover together, double Next under the loading pattern, progress motion/reduced motion/forced colors, blocking estimates within 2 % under host fonts; review 2026-10-09-1: a mobile root of definite block-size keeps its inline agenda inside the root (it scrolls), host content below keeps its pointer hits, an intrinsic root shows every row without inner scrolling. Separate agenda harness covers focus lifecycle; not physical touch or AT qualification.',
    sourceHashes:Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
writeFileSync(resolve(output,'browser.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Month: ${checks.filter(c=>c.outcome==='pass').length}/${checks.length}; ${errors.length} page errors; ${output}`);
if(report.outcome==='fail')process.exitCode=1;
