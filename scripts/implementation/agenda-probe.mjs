import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-agenda'));
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
const check = async (name, operation) => {
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props) => { await page.evaluate(props => window.month.patch(props), props); await settle(page); };
const cell = (page, date) => page.locator(`[role=gridcell][data-date="${date}"]`);
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
    await page.setContent('<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside{margin:8px}</style><button id="outside">Outside</button><div id="blank">Blank area</div><div id="owner"></div><button id="after">After</button><div id="portal"></div>');
    await page.evaluate(async ({shadow, moduleUrl, css, server, options}) => {
        Date.now = () => Date.parse('2026-03-04T12:00:00Z');
        const host = document.getElementById('owner'), scope = shadow ? host.attachShadow({mode: 'open'}) : host;
        const style = document.createElement('style'); style.textContent = css; scope.append(style);
        const container = document.createElement('div'); container.id = 'fixture'; container.innerHTML = server.html; scope.append(container);
        const module = await import(moduleUrl); window.scope = scope;
        window.month = await module.hydrateMonth(container, options);
    }, {shadow, moduleUrl, css, server, options});
    await settle(page); return {page, context, server};
}

const open = async (page,date='2026-03-04') => { await cell(page,date).focus(); await page.keyboard.press('Enter'); await settle(page); };
const focusItem = async (page,id) => { await page.locator(`[data-view=agenda][data-item-id="${id}"] button`).focus(); await settle(page); };
const current = page => page.evaluate(()=> { let node=document.activeElement;while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;return {id:node?.id,date:node?.dataset.date,item:node?.closest('[data-item-id]')?.dataset.itemId,close:node?.hasAttribute('data-agenda-close'),tag:node?.tagName}; });
try {
 for(const shadow of [false,true])for(const destination of ['local','body','shadow']){
  const label=`${shadow?'shadow':'document'}→${destination}`;
  const fixture=await setup(shadow,{items:samples,agendaDate:'2026-03-04'}),{page,context}=fixture;
  try{
   await page.evaluate(({destination,css})=>{
    let portal=window.scope.querySelector('.nc-calendar');
    if(destination==='body'){portal=document.getElementById('portal');const style=document.createElement('style');style.textContent=css;document.head.append(style);}
    if(destination==='shadow'){portal=document.getElementById('portal').attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=css;portal.append(style);}
    window.month.patch({portalContainer:portal});
    window.liveChanges=[];new MutationObserver(rs=>window.liveChanges.push(...rs.filter(r=>r.type==='childList').map(r=>r.target.textContent))).observe(window.scope.querySelector('[role=status]'),{childList:true});
   },{destination,css});await settle(page);
   await check(`${label}: named non-modal dialog, initial focus, scoped IDREF and Escape`,async()=>{
    await open(page);assert.equal(await page.getByRole('dialog').count(),1);assert.equal((await current(page)).close,true);
    assert.equal(await page.getByRole('dialog').getAttribute('aria-modal'),null);assert.equal(await cell(page,'2026-03-04').getAttribute('aria-expanded'),'true');
    const linked=await cell(page,'2026-03-04').getAttribute('aria-controls');assert.equal(!!linked,destination==='local'||!shadow&&destination==='body');
    assert.equal(await page.locator('#outside').isEnabled(),true);await page.keyboard.press('Escape');await settle(page);
    assert.equal(await page.getByRole('dialog').count(),0);assert.equal((await current(page)).date,'2026-03-04');assert.equal(await cell(page,'2026-03-04').getAttribute('aria-controls'),null);
    assert.deepEqual(await page.evaluate(()=>window.liveChanges),[]);
   });
   await check(`${label}: natural internal Tab order and logical forward/backward exit`,async()=>{
    await open(page);await page.keyboard.press('Tab');assert.equal((await current(page)).item,'bar');
    await page.getByRole('dialog').locator('[data-agenda-control]').last().focus();await page.keyboard.press('Tab');await settle(page);
    assert.equal((await current(page)).id,'after');assert.equal(await page.getByRole('dialog').count(),0);
    await open(page);await page.keyboard.press('Shift+Tab');await settle(page);assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('button',{name:'Next month',exact:true}).evaluate(n=>n===n.getRootNode().activeElement),true);
   });
   await check(`${label}: outside focusable and blank press; another date dismisses old content`,async()=>{
    await open(page);await page.locator('#outside').click();await settle(page);assert.equal((await current(page)).id,'outside');assert.equal(await page.getByRole('dialog').count(),0);
    await open(page);await page.locator('#blank').click();await settle(page);assert.equal((await current(page)).date,'2026-03-04');assert.equal(await page.getByRole('dialog').count(),0);
    await open(page);await cell(page,'2026-03-05').locator('.nc-day-header').click();await settle(page);assert.equal(await page.getByRole('dialog').count(),0);assert.equal((await current(page)).date,'2026-03-05');
    await patch(page,{agendaDate:'2026-03-05'});assert.equal((await current(page)).close,true);assert.equal(await page.getByRole('dialog').getAttribute('data-date'),'2026-03-05');
    await page.keyboard.press('Escape');await patch(page,{agendaDate:'2026-03-04'});
   });
   await check(`${label}: cancelled/stale controlled requests never steal focus`,async()=>{
    await open(page,'2026-03-06');await page.getByRole('button',{name:'Today',exact:true}).focus();await patch(page,{agendaDate:'2026-03-06'});assert.equal(await page.getByRole('dialog').count(),0);
    await open(page,'2026-03-07');await open(page,'2026-03-08');await patch(page,{agendaDate:'2026-03-07'});await patch(page,{agendaDate:'2026-03-08'});
    assert.equal(await page.getByRole('dialog').count(),0);assert.equal((await current(page)).date,'2026-03-08');
    await patch(page,{agendaDate:'2026-03-04'});
   });
   await check(`${label}: removed focused row and blocking view recover; external focus wins`,async()=>{
    await open(page);await focusItem(page,'design');await patch(page,{items:samples.filter(i=>i.id!=='design')});assert.equal((await current(page)).date,'2026-03-04');
    await open(page);await patch(page,{dataState:{status:'loading',phase:'initial'}});assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('region',{name:'Loading calendar',exact:true}).evaluate(n=>n===n.getRootNode().activeElement),true);
    await patch(page,{dataState:{status:'ready'},items:samples});assert.equal((await current(page)).date,'2026-03-04');assert.equal(await page.getByRole('dialog').count(),0);
    await open(page);await page.locator('#outside').focus();await patch(page,{items:[]});assert.equal((await current(page)).id,'outside');await patch(page,{items:samples});
   });
   await check(`${label}: out-of-grid accepted date/root anchor, item focus preserved across month`,async()=>{
    await open(page);await focusItem(page,'bar');await patch(page,{anchorDate:'2026-05-01'});assert.equal((await current(page)).item,'bar');
    assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('[aria-controls]').count(),0);
    const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.width>200&&bounds.height>40);
    await page.locator('[data-agenda-close]').focus();await patch(page,{agendaDate:'2026-05-06'});assert.equal(await page.getByRole('dialog').getAttribute('data-date'),'2026-05-06');
    await page.keyboard.press('Escape');await patch(page,{anchorDate:'2026-03-01',agendaDate:'2026-03-04'});
   });
   await check(`${label}: 1000 items, last keyboard activation, resize retains focus`,async()=>{
    await patch(page,{items:dense(1000)});await open(page);assert.equal(await page.getByRole('listitem').count(),1000);
    await focusItem(page,'dense-999');await page.keyboard.press('Enter');await settle(page);
    assert.equal(await page.evaluate(()=>window.month.events.filter(e=>e.type==='item').at(-1).value.item.id),'dense-999');
    await page.setViewportSize({width:700,height:500});await settle(page);assert.equal((await current(page)).item,'dense-999');
    const box=await page.getByRole('dialog').boundingBox();assert.ok(box.width<=668);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.keyboard.press('Escape');await patch(page,{items:samples});await page.setViewportSize({width:980,height:800});
   });
   await check(`${label}: pending acceptance with layout change, inline announcement and Escape`,async()=>{
    await patch(page,{layout:'mobile',agendaDate:'2026-03-01'});await open(page,'2026-03-04');await patch(page,{layout:'desktop',agendaDate:'2026-03-04'});
    assert.equal((await current(page)).close,true);await page.keyboard.press('Escape');
    await patch(page,{layout:'mobile'});await page.evaluate(()=>window.liveChanges=[]);await cell(page,'2026-03-05').locator('.nc-day-header').tap();await patch(page,{agendaDate:'2026-03-05'});
    assert.equal((await current(page)).date,'2026-03-05');assert.equal(await page.evaluate(()=>window.liveChanges.length),1);
    await open(page,'2026-03-05');assert.equal((await current(page)).tag,'H3');await page.keyboard.press('Escape');assert.equal((await current(page)).date,'2026-03-05');
    assert.equal(await page.locator('.nc-day-list').count(),1);await patch(page,{layout:'desktop',agendaDate:'2026-03-04'});
   });
   await check(`${label}: internal grid scroll repositions the open popover`,async()=>{
    await patch(page,{style:{height:340}});await open(page);const before=await page.locator('.nc-agenda-positioner').boundingBox();
    await page.getByRole('grid').evaluate(n=>{n.scrollTop+=35;});await settle(page);
    const after=await page.locator('.nc-agenda-positioner').boundingBox();assert.equal((await current(page)).close,true);
    assert.ok(Math.abs(before.y-after.y)>10);await page.keyboard.press('Escape');await patch(page,{style:{}});
   });
   await check(`${label}: last document Tab exits without restoring the trigger`,async()=>{
    await open(page);await page.locator('#after').evaluate(n=>n.setAttribute('hidden',''));
    await page.getByRole('dialog').locator('[data-agenda-control]').last().focus();await page.keyboard.press('Tab');await settle(page);
    assert.equal(await page.getByRole('dialog').count(),0);assert.notEqual((await current(page)).date,'2026-03-04');
    await page.locator('#after').evaluate(n=>n.removeAttribute('hidden'));
   });
   await check(`${label}: owned item survives forced inline/popover migration`,async()=>{
    await open(page);await focusItem(page,'bar');await patch(page,{layout:'mobile'});assert.equal((await current(page)).item,'bar');
    await patch(page,{layout:'desktop'});assert.equal((await current(page)).item,'bar');assert.equal(await page.getByRole('dialog').count(),1);await page.keyboard.press('Escape');
   });
   await check(`${label}: visual popover bounds and no page errors on unmount`,async()=>{
    for(const [locale,colorScheme] of [['ru-RU','light'],['ar','dark']]){await patch(page,{locale,colorScheme});await open(page);await page.screenshot({path:resolve(output,`${label.replace('→','-')}-${locale}-popover.png`),fullPage:true});await page.keyboard.press('Escape');}
    await open(page);
    const popup=await page.locator('.nc-agenda-positioner').boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=980&&popup.height>0);
    await page.locator('#outside').focus();await page.evaluate(()=>window.month.unmount());assert.equal((await current(page)).id,'outside');assert.equal(await page.getByRole('dialog').count(),0);
   });
  }finally{await context.close();}
 }
}finally{await browser.close();}
const paths=['src/v02/calendar/CalendarMonth.tsx','src/v02/calendar/DayAgendaBody.tsx','src/v02/calendar/focus.ts','src/v02/calendar/MonthView.tsx','src/v02/calendar/useCalendarController.ts','src/v02/primitives/NonModalPopover.tsx','src/v02/styles.css','scripts/implementation/month-entry.tsx','scripts/implementation/agenda-probe.mjs'];
const report={capturedAt:new Date().toISOString(),outcome:checks.every(c=>c.outcome==='pass')&&!errors.length?'pass':'fail',node:process.version,browser:version,checks,errors,
 scope:'Private T12 desktop popover and inline agenda, Document/open Shadow DOM. Not T15 auto/sheet or T16 nested overlay/AT qualification.',
 sourceHashes:Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
writeFileSync(resolve(output,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(`Agenda: ${checks.filter(c=>c.outcome==='pass').length}/${checks.length}; ${errors.length} errors; ${output}`);if(report.outcome==='fail')process.exitCode=1;
