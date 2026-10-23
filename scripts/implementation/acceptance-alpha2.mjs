import assert from 'node:assert/strict';

/** Text of an HTML fragment for assertions: tags are removed until a fixpoint, so no tag survives a single pass. */
function textContent(html) {
    if (html === undefined) return undefined;
    let text = html, previous;
    do { previous = text; text = text.replace(/<[^>]*>/g, ''); } while (text !== previous);
    return text;
}

// alpha.2 part of the packed-candidate acceptance (plan T19), used by alpha-acceptance.mjs: SSR scenarios of the
// responsive/integration slice, desktop (1280) and touch phone (390) Chrome flows and the axe state matrix. Each flow
// works through the public Calendar on the acceptance page (scripts/implementation/acceptance-probes/shared/Acceptance.tsx).

/** Server HTML of the alpha.2 scenarios: [name, URL params, assertion on the Calendar host fragment]. */
export const ssrScenarios = [
    ['auto', {scenario: 'month', layout: 'auto'}, html => {
        // §11.3 v7 (decision 4): auto renders the compact month with the inline agenda; no +N on mobile.
        assert.match(html, /data-layout="mobile"/);
        assert.match(html, /<section[^>]*data-date="2026-09-03"[^>]*data-presentation="inline"/); assert.doesNotMatch(html, /class="nc-overflow"/);
        assert.equal((html.match(/role="grid"/g) ?? []).length, 1);
    }],
    ['auto-overlay', {scenario: 'month', layout: 'auto', presentation: 'overlay'}, html => {
        assert.match(html, /data-layout="mobile"/); assert.doesNotMatch(html, /data-presentation=/, 'overlay: no agenda before activation');
    }],
    ['mobile', {scenario: 'month', layout: 'mobile'}, html => { assert.match(html, /data-layout="mobile"/); assert.match(html, /data-presentation="inline"/); }],
    ['neutral-dark-comfortable', {scenario: 'month', theme: 'neutral', scheme: 'dark', density: 'comfortable'}, html => {
        assert.match(html, /data-theme="neutral"/); assert.match(html, /data-color-scheme="dark"/); assert.match(html, /data-density="comfortable"/);
    }],
    ['actions-auto', {scenario: 'month', layout: 'auto', actions: '1'}, html => {
        // Two triggers in the inline agenda of 3 September (docs has an empty set); a sheet on mobile.
        assert.equal((html.match(/data-agenda-control="actions"/g) ?? []).length, 2); assert.match(html, /data-agenda-control="actions"[^>]*aria-haspopup="dialog"/);
    }],
    ['sources-desktop', {scenario: 'month', sources: '1'}, html => assert.match(html, /data-source-selector="true"[^>]*aria-haspopup="menu"/)],
    ['sources-auto', {scenario: 'month', layout: 'auto', sources: '1'}, html => assert.match(html, /data-source-selector="true"[^>]*aria-haspopup="dialog"/)],
    ['slots', {scenario: 'month', slots: '1'}, html => {
        assert.match(html, /class="[^"]*acceptance-root/); assert.match(html, /acceptance-export/); assert.match(html, /class="[^"]*acceptance-today/);
    }],
    ['multi', {scenario: 'month', multi: '1'}, html => {
        assert.equal((html.match(/role="grid"/g) ?? []).length, 2);
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]), duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        assert.deepEqual(duplicates, [], 'two calendars share no DOM id');
    }],
    ['shadow', {scenario: 'month', shadow: '1'}, html => { assert.match(html, /id="shadow-host"/); assert.doesNotMatch(html, /role="grid"/, 'the ShadowRoot mount is client-only'); }],
    ['order', {scenario: 'order'}, html => assert.match(html, /role="grid"/)],
    ['month-pre-measurement', {scenario: 'month'}, html => {
        // §6.3/§11.3: before the first client measurement every non-empty day has zero lanes and a visible +N.
        assert.equal((html.match(/class="nc-month-item[ "]/g) ?? []).length, 0, 'no item lanes on the server');
        const overflow = html.split('<div role="gridcell"').slice(1).map(chunk => [/data-date="([^"]+)"/.exec(chunk)[1], textContent(/class="nc-overflow"[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1])])
            .filter(([, count]) => count).map(([date, count]) => `${date}:${count}`);
        assert.deepEqual(overflow, ['2026-09-02:+1', '2026-09-03:+3', '2026-09-04:+1', '2026-09-05:+1', '2026-09-08:+1', '2026-09-09:+1', '2026-09-16:+7']);
    }],
];

/** Helpers shared by the alpha.2 flows; `h` is the page context of alpha-acceptance.mjs. */
function tools(h) {
    const {tab, settle} = h;
    const deep = () => tab.evaluate(() => {
        let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
        return {id: node?.id || undefined, date: node?.dataset?.date, tag: node?.tagName, label: node?.getAttribute('aria-label') ?? undefined, item: node?.closest('[data-item-id]')?.dataset.itemId,
            control: node?.dataset?.agendaControl, inDialog: !!node?.closest('[role=dialog]'), inInline: !!node?.closest('[data-presentation=inline]'), text: node?.textContent?.trim().slice(0, 80),
            selector: node?.hasAttribute('data-source-selector') ?? false, role: node?.getAttribute('role') ?? undefined, inShadow: node?.getRootNode() instanceof ShadowRoot};
    });
    const focusIs = async (expected, message) => { const value = await deep(); for (const [key, wanted] of Object.entries(expected)) assert.equal(value[key], wanted, `${message}: ${key} ${JSON.stringify(value)}`); };
    const root = (index = 0) => tab.locator('.nc-calendar').nth(index);
    const layout = (index = 0) => root(index).getAttribute('data-layout');
    const cell = (date, index = 0) => root(index).locator(`[role=gridcell][data-date="${date}"]`);
    // Content-box width of the root, through the width of its host: padding and border are added back.
    const setContent = async px => { await tab.evaluate(px => {
        const host = document.getElementById('calendar-host'), node = host.querySelector('.nc-calendar'), style = getComputedStyle(node);
        const extra = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + parseFloat(style[key]), 0);
        host.style.inlineSize = `${px + extra}px`;
    }, px); await settle(); };
    const contentWidth = () => root().evaluate(node => { const style = getComputedStyle(node); return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); });
    const surfaces = () => tab.evaluate(() => {
        const all = [document, ...[...document.querySelectorAll('#shadow-host')].map(host => host.shadowRoot).filter(Boolean)];
        const q = selector => all.flatMap(scope => [...scope.querySelectorAll(selector)]);
        return {dialogs: q('[role=dialog]').length, modal: q('[role=dialog][aria-modal=true]').length, menus: q('[role=menu]').length, inline: q('[data-presentation=inline]').map(node => node.dataset.date),
            popover: q('[data-presentation=popover]').map(node => node.dataset.date), sheet: q('[data-presentation=sheet]').map(node => node.dataset.date),
            inert: [...document.querySelectorAll('[inert]')].map(node => node.id || node.className || node.tagName), htmlOverflow: getComputedStyle(document.documentElement).overflow};
    });
    const entries = name => h.log().then(list => list.filter(entry => entry && typeof entry === 'object' && name in entry).map(entry => entry[name]));
    const tap = async locator => { await locator.tap(); await settle(); };
    const listIds = scope => scope.locator('li[data-item-id]').evaluateAll(nodes => nodes.map(node => node.dataset.itemId));
    return {deep, focusIs, root, layout, cell, setContent, contentWidth, surfaces, entries, tap, listIds};
}

/** Desktop (1280) flows of the alpha.2 slice. */
export async function desktopChecks(h) {
    const {tab, check, label, open, press, settle, accept, fixture} = h;
    const t = tools(h), {focusIs, root, layout, cell, setContent, surfaces, entries, listIds} = t;
    await check(`${label}-auto-hydration-desktop`, async () => {
        await open({scenario: 'month', layout: 'auto'});
        // The server rendered the compact month (ssr-auto); the measured layout is applied after hydration, once.
        assert.equal(await layout(), 'desktop');
        assert.deepEqual(await tab.evaluate(() => window.__layouts), ['desktop'], 'one switch, mobile → desktop');
        const state = await surfaces();
        assert.deepEqual([state.dialogs, state.inline, await tab.getByRole('grid').count()], [0, [], 1], 'no agenda opened by the switch');
        assert.equal(await tab.evaluate(() => document.activeElement === document.body), true, 'focus not taken');
        assert.deepEqual([await entries('onAgendaDateChange'), await entries('onNavigate'), (await entries('onVisibleRangeChange')).length], [[], [], 1]);
        return {layouts: await tab.evaluate(() => window.__layouts)};
    });
    await check(`${label}-auto-breakpoint-639-640-passive`, async () => {
        await open({scenario: 'month', layout: 'auto'});
        await tab.locator('#before').focus();
        const steps = [];
        for (const [px, expected] of [[640, 'desktop'], [639, 'mobile'], [640, 'desktop'], [639, 'mobile'], [1000, 'desktop'], [320, 'mobile']]) {
            await setContent(px);
            const width = await t.contentWidth(), state = await surfaces();
            assert.ok(Math.abs(width - px) < 0.01, `content box ${width} for ${px}`);
            assert.equal(await layout(), expected, `${px}px`);
            assert.deepEqual([state.dialogs, state.inline], [0, expected === 'mobile' ? ['2026-09-03'] : []], `${px}px: the viewed date only, no overlay`);
            await focusIs({id: 'before'}, `${px}px: external focus kept`);
            steps.push({px, layout: expected});
        }
        assert.deepEqual([await entries('onAgendaDateChange'), await entries('onNavigate')], [[], []], 'a resize sends no request');
        return {steps};
    });
    await check(`${label}-auto-switch-moves-agenda-focus`, async () => {
        await open({scenario: 'month', layout: 'auto'});
        await setContent(639);
        await root().locator('[data-presentation=inline] [data-item-id=review] [data-agenda-control=primary]').focus();
        await setContent(640);
        let state = await surfaces();
        assert.deepEqual(state.popover, ['2026-09-03'], 'focus inside the agenda moves to the popover');
        await focusIs({item: 'review', control: 'primary', inDialog: true}, 'same item in the popover');
        await setContent(639); state = await surfaces();
        assert.deepEqual([state.popover, state.inline], [[], ['2026-09-03']]);
        await focusIs({item: 'review', control: 'primary', inInline: true}, 'same item inline');
        assert.deepEqual(await entries('onAgendaDateChange'), []);
    });
    await check(`${label}-forced-mobile-wide`, async () => {
        await open({scenario: 'month', layout: 'mobile'});
        await setContent(1000);
        assert.equal(await layout(), 'mobile'); assert.deepEqual(await tab.evaluate(() => window.__layouts), [], 'a forced layout never switches');
        assert.equal(await root().locator('.nc-overflow').count(), 0);
    });
    await check(`${label}-popover-outside-press`, async () => {
        await open({scenario: 'month'});
        await cell('2026-09-03').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        await tab.locator('#after').click(); await settle();
        assert.equal((await surfaces()).dialogs, 0); await focusIs({id: 'after'}, 'a press on a focusable target keeps its focus');
        await cell('2026-09-03').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        await tab.locator('#acceptance-title').click(); await settle();
        assert.equal((await surfaces()).dialogs, 0); await focusIs({date: '2026-09-03'}, 'displaced focus returns to the date cell');
    });
    await check(`${label}-actions-menu-nested-escape`, async () => {
        await open({scenario: 'month', actions: '1'});
        await cell('2026-09-03').focus(); await press('Enter');
        const dialog = tab.getByRole('dialog'); await dialog.waitFor();
        const rows = await dialog.locator('li[data-item-id]').evaluateAll(nodes => nodes.map(node => [node.dataset.itemId, node.querySelectorAll('[data-agenda-control=actions]').length]));
        assert.deepEqual(Object.fromEntries(rows), {sprint: 1, review: 1, docs: 0}, 'an empty set has no trigger');
        const trigger = dialog.locator('[data-item-id=sprint] [data-agenda-control=actions]');
        assert.deepEqual([await trigger.getAttribute('aria-haspopup'), await trigger.getAttribute('aria-expanded')], ['menu', 'false']);
        assert.match(await trigger.getAttribute('aria-label'), /^Действия: ⁨?Подготовка релиза⁩?$/);
        await trigger.focus(); await press('Enter');
        const menu = tab.getByRole('menu'); await menu.waitFor();
        assert.deepEqual(await menu.getByRole('menuitem').allInnerTexts(), ['Открыть задачу', 'Архивировать']);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        await focusIs({role: 'menuitem', text: 'Открыть задачу'}, 'first action focused');
        await press('Escape');
        assert.deepEqual([(await surfaces()).menus, (await surfaces()).dialogs], [0, 1], 'Escape closes only the menu');
        await focusIs({item: 'sprint', control: 'actions'}, 'back to the trigger');
        await press('Enter'); await menu.waitFor(); await press('ArrowDown'); await press('Enter');
        const requests = await entries('onItemActionRequest');
        assert.equal(requests.length, 1);
        assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {item: await fixture('sprint'), actionId: 'archive'});
        assert.equal(await tab.evaluate(() => window.acceptance.log.findLast(entry => entry.onItemActionRequest).onItemActionRequest.item === window.acceptance.items.find(item => item.id === 'sprint')), true, 'the committed item object');
        assert.deepEqual([(await surfaces()).menus, (await surfaces()).dialogs], [0, 1]);
        await focusIs({item: 'sprint', control: 'actions'}, 'an action returns to its trigger');
        await press('Escape'); assert.equal((await surfaces()).dialogs, 0); await focusIs({date: '2026-09-03'}, 'second Escape: the date cell');
        return {rows, request: {item: 'sprint', actionId: 'archive'}};
    });
    await check(`${label}-sources-menu-delayed-acceptance`, async () => {
        await open({scenario: 'month', sources: '1', accept: 'manual'});
        const selector = root().locator('[data-source-selector]');
        assert.equal(await selector.getAttribute('aria-haspopup'), 'menu');
        // Labels isolate the consumer source title with U+2068/U+2069 (§11.2 bidi); compared without the isolates.
        const checkboxes = () => tab.getByRole('menuitemcheckbox').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label').replace(/[\u2068\u2069]/g, ''), node.getAttribute('aria-checked')]));
        await selector.focus(); await press('Enter'); await tab.getByRole('menu').waitFor();
        const before = await checkboxes();
        assert.deepEqual(before, [['Скрыть календарь Релизы', 'true'], ['Скрыть календарь Команда', 'true']]);
        await press('Enter');
        assert.deepEqual(JSON.parse(JSON.stringify(await entries('onVisibleSourceIdsChange'))), [['team']]);
        assert.deepEqual(await checkboxes(), before, 'nothing changes before acceptance');
        assert.equal(await root().locator('.nc-month-item[data-item-id=sprint]').count() > 0, true);
        await accept();
        assert.deepEqual(await checkboxes(), [['Показать календарь Релизы', 'false'], ['Скрыть календарь Команда', 'true']]);
        assert.equal((await surfaces()).menus, 1, 'the menu stays open');
        await press('Escape'); assert.equal((await surfaces()).menus, 0); await focusIs({selector: true}, 'Escape returns to the selector');
        const visible = await root().locator('.nc-month-item').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.itemId))].sort());
        assert.deepEqual(visible, ['docs', 'night', 'review'], 'hidden source gone; no calendarId and unknown calendarId stay (fail-open)');
        const description = date => cell(date).evaluate(node => node.getRootNode().getElementById(node.getAttribute('aria-describedby')).textContent);
        assert.match(await description('2026-09-03'), /2 события/); assert.match(await description('2026-09-16'), /0 событий/);
        assert.equal(await cell('2026-09-16').locator('.nc-overflow').count(), 0, '+N counts only visible records');
        await cell('2026-09-03').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        assert.deepEqual((await listIds(tab.getByRole('dialog'))).sort(), ['docs', 'review']);
        await press('Escape');
        return {before, visible};
    });
    await check(`${label}-multiple-instances`, async () => {
        await open({scenario: 'month', multi: '1'});
        const ids = await tab.evaluate(() => { const values = [...document.querySelectorAll('[id]')].map(node => node.id); return values.filter((id, index) => values.indexOf(id) !== index); });
        assert.deepEqual(ids, [], 'no duplicate ids');
        assert.deepEqual(await tab.locator('[role=grid]').evaluateAll(grids => grids.map(grid => grid.querySelectorAll('[role=gridcell][tabindex="0"]').length)), [1, 1]);
        await tab.locator('#before').focus(); const order = [];
        for (let i = 0; i < 9; i++) { await press('Tab'); const value = await t.deep(); order.push(value.date ? `${value.date}@${await tab.evaluate(() => document.activeElement.closest('.nc-calendar').id || 'first')}` : value.label ?? (value.id === 'after' ? 'after' : value.text)); }
        assert.deepEqual(order, ['Предыдущий месяц', 'Сегодня', 'Следующий месяц', '2026-09-03@first', 'Предыдущий месяц', 'Сегодня', 'Следующий месяц', '2026-09-03@second-calendar', 'after']);
        await h.live();
        await root(1).getByRole('button', {name: 'Следующий месяц'}).click(); await settle();
        const live = await tab.evaluate(() => window.liveLog.filter(entry => entry.text).map(entry => `${entry.root}:${entry.text}`));
        assert.deepEqual(live, ['second-calendar:Открыт месяц: октябрь 2026 г.'], 'announcements only in the owning root');
        await cell('2026-09-03').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        const themeOf = () => tab.getByRole('dialog').evaluate(node => node.closest('.nc-theme').dataset.theme);
        assert.equal(await themeOf(), 'classic');
        await cell('2026-10-08', 1).click(); await settle();
        const state = await surfaces();
        assert.deepEqual([state.dialogs, state.popover], [1, ['2026-10-08']], 'a press in the second calendar closes the first agenda');
        assert.equal(await themeOf(), 'neutral', 'each portal keeps the theme of its calendar');
        await press('Escape'); await focusIs({date: '2026-10-08'}, 'Escape restores the second calendar cell');
        assert.equal((await surfaces()).dialogs, 0);
        return {order, live};
    });
    for (const portal of ['document', 'shadow']) await check(`${label}-shadow-root-${portal}-portal`, async () => {
        await open({scenario: 'month', shadow: '1', ...(portal === 'shadow' ? {portal: 'shadow'} : {})});
        const c = cell('2026-09-03');
        assert.equal(await c.evaluate(node => node.getRootNode() instanceof ShadowRoot), true);
        // T19-V1-02: a light-DOM IDREF is out of reach in the ShadowRoot; the harness names the root within its own scope.
        const name = await root().evaluate(node => [node.getAttribute('role'), node.getAttribute('aria-label'), node.getAttribute('aria-labelledby')]);
        assert.deepEqual(name, ['region', 'Acceptance: month (ShadowRoot)', null], 'the root keeps the consumer name in the ShadowRoot');
        await c.focus(); await press('ArrowRight'); await focusIs({date: '2026-09-04', inShadow: true}, 'roving focus in the ShadowRoot');
        await press('ArrowLeft'); await press('Enter');
        const dialog = tab.getByRole('dialog'); await dialog.waitFor();
        const placement = await dialog.evaluate(node => ({inShadow: node.getRootNode() instanceof ShadowRoot}));
        assert.equal(placement.inShadow, portal === 'shadow');
        await focusIs({inDialog: true}, 'initial focus inside the agenda');
        const controls = await c.getAttribute('aria-controls');
        assert.equal(controls === await dialog.getAttribute('id'), portal === 'shadow', 'aria-controls only within one tree scope');
        const mirror = await tab.evaluate(() => {
            const host = document.getElementById('shadow-host').shadowRoot, rootNode = host.querySelector('.nc-calendar');
            const dialogNode = host.querySelector('[role=dialog]') ?? document.querySelector('[role=dialog]'), theme = dialogNode.closest('.nc-theme');
            const read = node => ['--nelmad-calendar-color-surface', '--nelmad-calendar-color-accent', 'font-family'].map(name => getComputedStyle(node).getPropertyValue(name).trim());
            return {root: read(rootNode), portal: read(theme)};
        });
        assert.deepEqual(mirror.portal, mirror.root, 'the portal mirrors the public variables and font of the root');
        assert.ok(mirror.root[0], 'styles.css applies in the ShadowRoot');
        await press('Escape'); await dialog.waitFor({state: 'hidden'});
        await focusIs({date: '2026-09-03', inShadow: true}, 'Escape restores the cell inside the ShadowRoot');
        return {portal, placement, mirror, rootName: name};
    });
    await check(`${label}-slots-custom-content`, async () => {
        await open({scenario: 'month', slots: '1'});
        assert.ok(await root().evaluate(node => node.classList.contains('acceptance-root')));
        assert.equal(await cell('2026-09-03').evaluate(node => node.classList.contains('acceptance-today')), true);
        const custom = await root().locator('.nc-month-item[data-item-id=sprint]').first().evaluate(node => ({text: node.textContent, custom: !!node.querySelector('.acceptance-item'),
            className: node.classList.contains('acceptance-item-sprint'), background: getComputedStyle(node).backgroundColor, focusable: node.querySelectorAll('a, button, input, [tabindex]').length}));
        assert.deepEqual([custom.custom, custom.className, custom.focusable], [true, true, 0], JSON.stringify(custom)); assert.equal(custom.background, 'rgb(253, 231, 233)');
        await tab.locator('#before').focus(); const order = [];
        for (let i = 0; i < 6; i++) { await press('Tab'); const value = await t.deep(); order.push(value.date ?? value.label ?? (value.id === 'after' ? 'after' : value.text)); }
        assert.ok(order.includes('Экспорт') && order.indexOf('2026-09-03') === order.lastIndexOf('2026-09-03'), `one grid Tab stop, toolbar extension reachable: ${order}`);
        const exported = root().getByRole('button', {name: 'Экспорт'});
        assert.equal(await exported.getAttribute('aria-describedby'), 'export-hint');
        await exported.focus(); await press('Enter'); assert.deepEqual(await entries('export'), ['2026-09-01']);
        await tab.evaluate(() => window.acceptance.setDataState({status: 'error', phase: 'refresh', error: new Error('x')})); await settle();
        assert.equal(await root().getByRole('button', {name: 'Повторить', exact: true}).count(), 0, 'the custom error body replaces the built-in retry');
        await root().getByRole('button', {name: 'Повторить загрузку'}).focus(); await press('Enter');
        assert.equal((await h.log()).filter(entry => entry === 'customRetry').length, 1);
        assert.equal(await tab.getByRole('grid').count(), 1, 'stale grid kept');
        return {order, custom};
    });
    await check(`${label}-month-presentation-and-default-order`, async () => {
        await open({scenario: 'order'});
        const kinds = await root().locator('.nc-month-item').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.itemId,
            node.classList.contains('nc-month-bar') ? 'bar' : node.classList.contains('nc-month-chip') ? 'chip' : 'other'])));
        assert.deepEqual(kinds, {chip: 'chip', moment: 'chip', zero: 'chip', 'tm-late': 'bar', 'tm-short': 'bar', 'tm-long': 'bar', alpha: 'bar', Zeta: 'bar', 'ad-b': 'bar', august: 'bar', 'october-3': 'chip'});
        // Adjacent months inside the visible range are drawn in their outside-month cells.
        for (const [id, date] of [['august', '2026-08-31'], ['october-3', '2026-10-03']]) assert.equal(await cell(date).getAttribute('data-outside-month'), 'true', id);
        const expected = ['ad-b', 'Zeta', 'alpha', 'tm-long', 'tm-short', 'tm-late', 'zero', 'moment', 'chip'];
        const gridOrder = () => root().locator('[role=row][data-week="2026-09-14"] .nc-month-item').evaluateAll((nodes, date) => {
            const column = document.querySelector(`[role=gridcell][data-date="${date}"]`).getBoundingClientRect();
            return nodes.filter(node => { const box = node.getBoundingClientRect(); return box.left < column.right - 1 && box.right > column.left + 1; })
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(node => node.dataset.itemId);
        }, '2026-09-15');
        assert.deepEqual(await gridOrder(), expected, 'grid order on 15 September');
        assert.equal(await cell('2026-09-15').locator('.nc-overflow').count(), 0);
        const geometry = () => root().locator('.nc-month-item').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return `${node.dataset.itemId}@${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)}`; }));
        const first = await geometry();
        await tab.evaluate(() => { window.acceptancePrevious = window.acceptance.rendered; window.acceptance.rerender(); }); await settle();
        // T19-V1-01: the calendar must really get a fresh array of fresh, structurally equal item objects.
        const fresh = await tab.evaluate(() => {
            const before = window.acceptancePrevious, after = window.acceptance.rendered;
            return {length: after.length, array: before !== after, objects: after.every((item, index) => item !== before[index]),
                equal: JSON.stringify(after) === JSON.stringify(before)};
        });
        assert.deepEqual(fresh, {length: 11, array: true, objects: true, equal: true}, 'rerender() passes fresh equal item objects to Calendar');
        assert.deepEqual(await geometry(), first, 'equal input renders the same layout');
        await cell('2026-09-15').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        assert.deepEqual(await listIds(tab.getByRole('dialog')), expected, 'agenda order equals grid order');
        await press('Escape');
        return {expected, kinds, fresh, geometry: first};
    });
    await check(`${label}-sort-items-comparator-and-id-tie-break`, async () => {
        await open({scenario: 'sorted'});
        const expected = ['Zeta', 'ad-b', 'alpha', 'tm-long', 'moment', 'tm-late', 'tm-short', 'zero', 'chip'];
        await cell('2026-09-15').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor();
        assert.deepEqual(await listIds(tab.getByRole('dialog')), expected, 'comparator groups, then id by code units');
        await press('Escape');
        const grid = await root().locator('[role=row][data-week="2026-09-14"] .nc-month-item').evaluateAll(nodes => {
            const column = document.querySelector('[role=gridcell][data-date="2026-09-15"]').getBoundingClientRect();
            return nodes.filter(node => { const box = node.getBoundingClientRect(); return box.left < column.right - 1 && box.right > column.left + 1; })
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(node => node.dataset.itemId);
        });
        assert.deepEqual(grid, expected); return {expected};
    });
    await check(`${label}-month-row-count`, async () => {
        const rows = {};
        for (const [anchor, weeks] of [['2027-02-01', 4], ['2026-09-01', 5], ['2026-08-01', 6]]) {
            await open({scenario: 'month', anchor, agenda: anchor});
            const shape = await root().locator('[role=grid]').evaluate(grid => ({rowcount: grid.getAttribute('aria-rowcount'),
                weeks: grid.querySelectorAll('[role=row][data-week]').length, columns: [...grid.querySelectorAll('[role=row]')].map(row => row.querySelectorAll('[role=gridcell], [role=columnheader]').length)}));
            assert.deepEqual(shape, {rowcount: String(weeks + 1), weeks, columns: Array(weeks + 1).fill(7)}, anchor);
            rows[anchor] = weeks;
        }
        return {rows};
    });
    await check(`${label}-intrinsic-and-constrained-rows`, async () => {
        const measure = () => root().evaluate(node => {
            const rows = [...node.querySelectorAll('[role=row][data-week]')].map(row => row.getBoundingClientRect().height);
            const clipped = [...node.querySelectorAll('.nc-month-item')].filter(item => {
                const box = item.getBoundingClientRect(), cellBox = item.closest('[role=row]').getBoundingClientRect();
                return box.top < cellBox.top - 0.5 || box.bottom > cellBox.bottom + 0.5;
            }).map(item => item.dataset.itemId);
            return {height: node.getBoundingClientRect().height, rows, clipped};
        });
        const equal = rows => Math.max(...rows) - Math.min(...rows) < 0.5;
        const result = {};
        await open({scenario: 'month'}); result.month = await measure();
        await open({scenario: 'empty'}); result.empty = await measure();
        assert.ok(equal(result.month.rows) && Math.abs(result.month.rows[0] - result.empty.rows[0]) < 0.5, `rows do not grow with items: ${JSON.stringify(result)}`);
        await tab.evaluate(() => { document.getElementById('calendar-host').style.blockSize = '1400px'; }); await settle();
        result.parent = await measure();
        assert.ok(Math.abs(result.parent.height - result.empty.height) < 0.5, 'a parent height alone is not a constraint');
        for (const scenario of ['constrained', 'comfortable', 'month']) {
            await open({scenario}); const value = result[`${scenario}-lanes`] = await measure();
            assert.ok(equal(value.rows), `${scenario}: equal rows ${value.rows}`); assert.deepEqual(value.clipped, [], `${scenario}: no partially visible item`);
        }
        assert.ok(Math.abs(result['constrained-lanes'].height - 520) < 0.5, 'definite root height');
        await open({scenario: 'tiny'});
        result.tiny = await root().evaluate(node => {
            const view = [...node.querySelectorAll('*')].find(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
            const box = node.getBoundingClientRect(), buttons = [...node.querySelectorAll('.nc-calendar-toolbar button')].map(button => button.getBoundingClientRect());
            const overflow = node.querySelector('[data-date="2026-09-03"] .nc-overflow')?.getBoundingClientRect();
            return {height: box.height, scroller: view?.className ?? null, controls: buttons.every(b => b.top >= box.top && b.bottom <= box.bottom && b.height >= 24),
                overflow: overflow && overflow.height >= 24, pageScroll: document.documentElement.scrollWidth > innerWidth};
        });
        assert.deepEqual([result.tiny.scroller !== null, result.tiny.controls, result.tiny.overflow, result.tiny.pageScroll], [true, true, true, false], JSON.stringify(result.tiny));
        return result;
    });
    await check(`${label}-overflow-activation-and-atomic-resize`, async () => {
        await open({scenario: 'constrained'});
        const indicator = cell('2026-09-16').locator('.nc-overflow'), before = await indicator.innerText();
        await indicator.click(); const dialog = tab.getByRole('dialog'); await dialog.waitFor();
        const viaPointer = {id: await dialog.getAttribute('id'), items: await listIds(dialog)};
        assert.equal(viaPointer.items.length, 7); assert.equal(await cell('2026-09-16').getAttribute('aria-controls'), viaPointer.id);
        await press('Escape'); await focusIs({date: '2026-09-16'}, 'the owning cell');
        await press('Enter'); await dialog.waitFor();
        assert.deepEqual(await listIds(dialog), viaPointer.items, 'Enter opens the same full agenda');
        const focused = await t.deep();
        await root().evaluate(node => { node.style.blockSize = '900px'; }); await settle();
        const after = await indicator.count() ? await indicator.innerText() : null;
        assert.notEqual(after, before, `lanes and N update on resize (${before} → ${after})`);
        assert.equal((await surfaces()).dialogs, 1, 'the agenda stays open'); assert.deepEqual(await t.deep(), focused, 'no focus recovery');
        assert.deepEqual(await tab.locator('[role=gridcell][tabindex="0"]').evaluateAll(nodes => nodes.map(node => node.dataset.date)), ['2026-09-16']);
        await press('Escape');
        return {before, after, viaPointer};
    });
}

/** Phone (390 CSS px, touch) flows of the alpha.2 slice. */
export async function mobileChecks(h) {
    const {tab, check, label, open, press, settle, accept, fixture} = h;
    const t = tools(h), {focusIs, root, layout, cell, surfaces, entries, tap, listIds} = t;
    await check(`${label}-mobile-auto-first-render`, async () => {
        await open({scenario: 'month', layout: 'auto'});
        assert.equal(await layout(), 'mobile'); assert.deepEqual(await tab.evaluate(() => window.__layouts), [], 'server, first client render and measurement agree');
        const state = await surfaces();
        assert.deepEqual([state.inline, state.dialogs], [['2026-09-03'], 0]);
        assert.equal(await root().locator('.nc-overflow, .nc-month-item').count(), 0, 'compact grid: no chips and no +N');
        assert.deepEqual(await root().locator('[role=gridcell][data-has-items=true]').evaluateAll(nodes => nodes.map(node => node.dataset.date)),
            ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-08', '2026-09-09', '2026-09-16']);
        assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page horizontal scroll');
        assert.equal(await tab.evaluate(() => document.activeElement === document.body), true);
    });
    await check(`${label}-mobile-tap-date-inline-agenda`, async () => {
        await open({scenario: 'month', layout: 'auto'}); await h.live();
        await tap(cell('2026-09-10'));
        assert.deepEqual(await entries('onAgendaDateChange'), ['2026-09-10']);
        assert.deepEqual((await surfaces()).inline, ['2026-09-10']); await focusIs({date: '2026-09-10'}, 'a tap keeps focus on the date');
        assert.match(await root().locator('[data-presentation=inline] h3').innerText(), /10 сент/);
        const live = await tab.evaluate(() => window.liveLog.filter(entry => entry.text).map(entry => entry.text));
        assert.ok(live.some(text => /^Открыты события: .*10 сент.*0 событий/.test(text)), `inline update announced: ${live}`);
        await press('Enter'); await focusIs({tag: 'H3', inInline: true}, 'Enter moves focus to the agenda heading');
        await press('Escape'); await focusIs({date: '2026-09-10'}, 'Escape returns to the date');
        await tap(cell('2026-09-03'));
        await tap(root().locator('[data-presentation=inline] [data-item-id=review] [data-agenda-control=primary]'));
        const request = (await entries('onItemPress')).at(-1);
        assert.deepEqual(JSON.parse(JSON.stringify(request)), {item: await fixture('review'), date: '2026-09-03', view: 'agenda'});
        return {live};
    });
    await check(`${label}-mobile-sheet-modal`, async () => {
        await open({scenario: 'month', layout: 'auto', presentation: 'overlay'});
        assert.deepEqual((await surfaces()).inline, []);
        await tap(cell('2026-09-03'));
        let state = await surfaces();
        assert.deepEqual([state.sheet, state.modal, state.htmlOverflow], [['2026-09-03'], 1, 'hidden']);
        assert.ok(await tab.locator('#before').evaluate(node => { for (let current = node; current; current = current.parentElement) if (current.inert) return true; return false; }), 'background inert');
        await focusIs({tag: 'H3', inDialog: true}, 'focus starts on the sheet heading');
        await tap(tab.getByRole('dialog').locator('[data-item-id=review] [data-agenda-control=primary]'));
        assert.deepEqual(JSON.parse(JSON.stringify((await entries('onItemPress')).at(-1))), {item: await fixture('review'), date: '2026-09-03', view: 'agenda'});
        await press('Escape'); state = await surfaces();
        assert.deepEqual([state.dialogs, state.inert, state.htmlOverflow], [0, [], 'visible']); await focusIs({date: '2026-09-03'}, 'Escape returns to the date');
        await tap(cell('2026-09-03')); await tab.getByRole('dialog').waitFor();
        const backdrop = await tab.locator('.nc-sheet-backdrop').boundingBox(), sheet = await tab.locator('.nc-sheet').boundingBox();
        assert.ok(sheet.y - backdrop.y > 40, 'backdrop visible above the sheet');
        await tab.touchscreen.tap(backdrop.x + backdrop.width / 2, backdrop.y + 20); await settle();
        assert.equal((await surfaces()).dialogs, 0, 'a backdrop press closes'); await focusIs({date: '2026-09-03'}, 'backdrop returns to the date');
        await tap(cell('2026-09-03')); await tap(tab.getByRole('button', {name: 'Закрыть события дня'}));
        assert.equal((await surfaces()).dialogs, 0); await focusIs({date: '2026-09-03'}, 'close button returns to the date');
    });
    await check(`${label}-mobile-action-sheet`, async () => {
        await open({scenario: 'month', layout: 'auto', actions: '1'});
        const trigger = root().locator('[data-presentation=inline] [data-item-id=sprint] [data-agenda-control=actions]');
        assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog');
        await tap(trigger);
        const sheet = tab.getByRole('dialog', {name: /Действия: .*Подготовка релиза/}); await sheet.waitFor();
        assert.equal(await sheet.getAttribute('aria-modal'), 'true');
        assert.deepEqual(await sheet.getByRole('button').allInnerTexts().then(texts => texts.map(text => text.trim()).filter(Boolean)), ['Открыть задачу', 'Архивировать']);
        await focusIs({text: 'Открыть задачу'}, 'first action focused');
        await tap(sheet.getByRole('button', {name: 'Открыть задачу'}));
        assert.deepEqual(JSON.parse(JSON.stringify(await entries('onItemActionRequest'))), [{item: await fixture('sprint'), actionId: 'open'}]);
        assert.equal((await surfaces()).dialogs, 0); await focusIs({item: 'sprint', control: 'actions'}, 'returns to the trigger');
        await tap(trigger); await sheet.waitFor(); await press('Escape');
        assert.equal((await surfaces()).dialogs, 0); await focusIs({item: 'sprint', control: 'actions'}, 'Escape returns to the trigger');
    });
    await check(`${label}-mobile-nested-sheets-escape`, async () => {
        await open({scenario: 'month', layout: 'auto', presentation: 'overlay', actions: '1'});
        await tap(cell('2026-09-03'));
        await tap(tab.locator('[data-presentation=sheet] [data-item-id=review] [data-agenda-control=actions]'));
        assert.equal((await surfaces()).modal, 2, 'action sheet over the agenda sheet');
        await press('Escape');
        let state = await surfaces(); assert.deepEqual([state.modal, state.sheet], [1, ['2026-09-03']], 'Escape closes only the top sheet');
        await focusIs({item: 'review', control: 'actions', inDialog: true}, 'back to the trigger inside the agenda sheet');
        await press('Escape'); state = await surfaces();
        assert.deepEqual([state.dialogs, state.inert, state.htmlOverflow], [0, [], 'visible']); await focusIs({date: '2026-09-03'}, 'then the date');
        assert.deepEqual(await entries('onItemActionRequest'), []);
    });
    await check(`${label}-mobile-source-sheet-delayed`, async () => {
        await open({scenario: 'month', layout: 'auto', sources: '1', accept: 'manual'});
        const selector = root().locator('[data-source-selector]');
        assert.equal(await selector.getAttribute('aria-haspopup'), 'dialog');
        await tap(selector);
        const boxes = () => tab.locator('.nc-sheet input[type=checkbox]').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label').replace(/[\u2068\u2069]/g, ''), node.checked]));
        const before = await boxes();
        assert.deepEqual(before, [['Скрыть календарь Релизы', true], ['Скрыть календарь Команда', true]]);
        await tap(tab.locator('.nc-sheet label').first());
        assert.deepEqual(JSON.parse(JSON.stringify(await entries('onVisibleSourceIdsChange'))), [['team']]); assert.deepEqual(await boxes(), before, 'checked until acceptance');
        await accept();
        assert.deepEqual(await boxes(), [['Показать календарь Релизы', false], ['Скрыть календарь Команда', true]]);
        await press('Escape'); assert.equal((await surfaces()).dialogs, 0); await focusIs({selector: true}, 'Escape returns to the selector');
        assert.equal(await cell('2026-09-16').getAttribute('data-has-items'), null, 'the dense release day has no visible items');
        assert.deepEqual((await listIds(root().locator('[data-presentation=inline]'))).sort(), ['docs', 'review']);
    });
    await check(`${label}-mobile-forced-desktop-scrolls-in-region`, async () => {
        await open({scenario: 'month', layout: 'desktop'});
        const result = await root().evaluate(node => {
            const scroller = [...node.querySelectorAll('*')].find(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1);
            return {scroller: scroller?.className ?? null, pageScroll: document.documentElement.scrollWidth > innerWidth};
        });
        assert.deepEqual([result.scroller !== null, result.pageScroll], [true, false], JSON.stringify(result));
        return result;
    });
}

/** alpha.2 axe states: [name, URL params, optional preparation] per context. */
export function axeStates(h, {touch, wide}) {
    const t = tools(h), {cell, tap} = t, {tab, press, settle} = h;
    const agenda = async () => { await cell('2026-09-03').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor(); await settle(); };
    if (touch) return [
        ['mobile-inline', {scenario: 'month', layout: 'auto'}],
        ['mobile-sheet-open', {scenario: 'month', layout: 'auto', presentation: 'overlay'}, async () => { await tap(cell('2026-09-03')); await tab.getByRole('dialog').waitFor(); }],
        ['mobile-action-sheet-open', {scenario: 'month', layout: 'auto', actions: '1'}, async () => { await tap(t.root().locator('[data-presentation=inline] [data-item-id=sprint] [data-agenda-control=actions]')); await tab.getByRole('dialog').waitFor(); }],
        ['mobile-source-sheet-open', {scenario: 'month', layout: 'auto', sources: '1'}, async () => { await tap(t.root().locator('[data-source-selector]')); await tab.getByRole('dialog').waitFor(); }],
        ...['loading-initial', 'loading-refresh', 'error-initial', 'error-refresh', 'empty', 'contract'].map(scenario => [`mobile-${scenario}`, {scenario, layout: 'auto'}]),
        ['mobile-neutral-dark-comfortable', {scenario: 'month', layout: 'auto', theme: 'neutral', scheme: 'dark', density: 'comfortable'}],
        ['mobile-rtl-ar', {scenario: 'month', layout: 'auto', rtl: '1'}],
        ['mobile-slots', {scenario: 'month', layout: 'auto', slots: '1'}],
        ['mobile-forced-desktop', {scenario: 'month', layout: 'desktop'}],
    ];
    if (!wide) return [];
    const themes = ['classic', 'neutral'].flatMap(theme => ['compact', 'comfortable'].flatMap(density => ['light', 'dark'].map(scheme =>
        [`${theme}-${density}-${scheme}`, {scenario: 'month', theme, density, scheme}])));
    return [
        ['auto-desktop', {scenario: 'month', layout: 'auto'}],
        ...themes,
        ['neutral-system-dark', {scenario: 'month', theme: 'neutral', scheme: 'system'}, null, 'dark'],
        ['neutral-dark-agenda-open', {scenario: 'month', theme: 'neutral', scheme: 'dark'}, agenda],
        ['rtl-neutral-dark-comfortable', {scenario: 'month', rtl: '1', theme: 'neutral', scheme: 'dark', density: 'comfortable'}],
        ['actions-menu-open', {scenario: 'month', actions: '1'}, async () => { await agenda(); await tab.locator('[role=dialog] [data-item-id=sprint] [data-agenda-control=actions]').focus(); await press('Enter'); await tab.getByRole('menu').waitFor(); }],
        ['source-menu-open', {scenario: 'month', sources: '1'}, async () => { await t.root().locator('[data-source-selector]').focus(); await press('Enter'); await tab.getByRole('menu').waitFor(); }],
        ['slots', {scenario: 'month', slots: '1'}],
        ['slots-error-refresh', {scenario: 'error-refresh', slots: '1'}],
        ['multi', {scenario: 'month', multi: '1'}],
        ['shadow-agenda-open', {scenario: 'month', shadow: '1', portal: 'shadow'}, agenda],
        ['order', {scenario: 'order'}],
    ];
}
