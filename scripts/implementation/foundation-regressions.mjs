import assert from 'node:assert/strict';

// Layout and focus scrolling need a real browser. Run inside each owner/portal tree pair.
export async function foundationRegressions({page, check, label, waitFocus}) {
    const settle = () => page.evaluate(async () => {
        // RAC scrolls the focused menu item in a passive effect followed by rAF.
        for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    });
    const mount = async options => {
        await page.setViewportSize({width: 800, height: 600});
        await page.evaluate(options => {
            const fixture = window.foundation;
            fixture.hydration.unmount();
            document.getElementById('outside').hidden = true;
            document.body.style.margin = '0';
            window.scrollTo(0, 0);
            fixture.hydration = {unmount: fixture.module.mountFoundationRegression(fixture.container, {...options, portalContainer: fixture.portalScope})};
        }, options);
        await page.locator('#regression-trigger').waitFor();
    };
    const openMenu = async () => {
        await page.locator('#regression-trigger').focus();
        await page.keyboard.press('ArrowDown');
        await page.getByRole('menu', {name: 'Regression actions'}).waitFor();
        await settle();
    };
    const menuGeometry = () => page.getByRole('menu', {name: 'Regression actions'}).evaluate(menu => {
        const surface = menu.closest('.nc-popover'), positioner = surface.parentElement;
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        const rect = node => node.getBoundingClientRect().toJSON();
        return {surface: rect(surface), positioner: rect(positioner), active: rect(active), text: active.textContent,
            scrollTop: surface.scrollTop, pageScroll: document.scrollingElement.scrollTop, viewport: {width: innerWidth, height: innerHeight}};
    });
    const assertVisible = geometry => {
        const {surface, positioner, active, viewport} = geometry;
        assert.ok(surface.top >= 0 && surface.bottom <= viewport.height + 1, `surface outside viewport: ${JSON.stringify(geometry)}`);
        assert.ok(surface.left >= 0 && surface.right <= viewport.width + 1, 'surface must fit viewport width');
        assert.ok(surface.height <= positioner.height + 1, 'scroll surface must fit the positioned overlay');
        assert.ok(active.top >= surface.top && active.bottom <= surface.bottom, 'focused action must be fully visible');
        assert.equal(geometry.pageScroll, 0, 'menu navigation must scroll its surface, not the page');
    };
    for (const menuCount of [10, 30]) for (const triggerTop of [0, 260]) {
        await check(`${label}: long menu ${menuCount}, trigger y=${triggerTop}`, async () => {
            await mount({menuCount, triggerTop});
            await page.setViewportSize({width: 800, height: 500});
            await openMenu();
            const opened = await menuGeometry(); assertVisible(opened);
            await page.keyboard.press('End'); await settle();
            const last = await menuGeometry(); assert.equal(last.text, `Action ${menuCount}`); assertVisible(last);
            let resized;
            if (menuCount === 30 && triggerTop === 0) {
                await page.setViewportSize({width: 320, height: 360}); await settle();
                // Re-enter the last item after resizing to exercise keyboard scroll with the new bound.
                await page.keyboard.press('Home'); await settle(); await page.keyboard.press('End'); await settle();
                resized = await menuGeometry(); assert.equal(resized.text, `Action ${menuCount}`); assertVisible(resized);
            }
            await page.keyboard.press('Home'); await settle();
            const first = await menuGeometry(); assert.equal(first.text, 'Action 1'); assertVisible(first);
            await page.keyboard.press('Escape');
            await page.getByRole('menu').waitFor({state: 'detached'}); await waitFocus(page, 'regression-trigger');
            return {opened, last, first, ...(resized ? {resized} : {})};
        });
    }
    const placements = [
        {placement: 'bottom start', ltr: 'bottom left', rtl: 'bottom right'},
        {placement: 'bottom end', ltr: 'bottom right', rtl: 'bottom left'},
        {placement: 'start top', ltr: 'left top', rtl: 'right top'},
        {placement: 'end bottom', ltr: 'right bottom', rtl: 'left bottom'},
        {placement: 'bottom left', ltr: 'bottom left', rtl: 'bottom left'},
        {placement: 'bottom right', ltr: 'bottom right', rtl: 'bottom right'},
    ];
    for (const direction of ['ltr', 'rtl']) for (const expected of placements) {
        const locale = direction === 'rtl' ? 'en-US' : 'ar';
        await check(`${label}: ${locale}/${direction}, ${expected.placement}`, async () => {
            await mount({direction, locale, placement: expected.placement, triggerTop: 180});
            await openMenu();
            const {surface} = await menuGeometry();
            const trigger = await page.locator('#regression-trigger').evaluate(node => node.getBoundingClientRect().toJSON());
            const [side, align] = expected[direction].split(' ');
            if (side === 'bottom') {
                assert.ok(surface.top >= trigger.bottom, 'popover must open below trigger');
                assert.ok(Math.abs(surface[align] - trigger[align]) < 1, `${align} edges must align: ${JSON.stringify({surface, trigger})}`);
            } else {
                assert.ok(side === 'left' ? surface.right < trigger.left : surface.left > trigger.right, `popover must open to the ${side}`);
                assert.ok(Math.abs(surface[align] - trigger[align]) < 1, `${align} edges must align`);
            }
            await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({state: 'detached'});
            return {surface, trigger};
        });
    }
    await check(`${label}: nested RTL/LTR/RTL directional icons`, async () => {
        await mount({});
        const styles = {};
        for (const id of ['icons-rtl', 'icons-ltr', 'icons-inner-rtl']) {
            styles[id] = await page.locator(`#${id} > svg`).evaluateAll(nodes => nodes.map(node => ({
                direction: getComputedStyle(node).direction, transform: getComputedStyle(node).transform,
            })));
            const direction = id === 'icons-ltr' ? 'ltr' : 'rtl';
            assert.deepEqual(styles[id], [
                ...Array.from({length: 2}, () => ({direction, transform: direction === 'rtl' ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none'})),
                {direction, transform: 'none'},
            ]);
        }
        return styles;
    });
    await page.evaluate(() => window.foundation.hydration.unmount());
}
