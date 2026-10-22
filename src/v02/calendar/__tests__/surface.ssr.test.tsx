// @vitest-environment node
import {renderToString} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Calendar} from '../../../index.js';
import {CalendarMonth} from '../CalendarMonth.js';
import {resetSurfaceWarnings} from '../../surface.js';

const base = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', onNavigate() {}};
const Untyped = Calendar as unknown as (props: Record<string, unknown>) => ReturnType<typeof Calendar>;
afterEach(() => { vi.restoreAllMocks(); resetSurfaceWarnings(); });

describe('alpha.2 surface SSR', () => {
    // Review 2026-10-09-2: a well-formed tag with an unknown numbering system renders the grid on the server.
    // Review 2026-10-09-2: one valid timed item of the whole domain took 3.8 s to server-render in Europe/Berlin.
    it('server-renders a timed item spanning the whole domain in a DST zone without scanning its duration', () => {
        const item = {id: 'lease', title: 'Lease', data: null, interval: {kind: 'timed', start: '0001-01-01T00:00:00Z', end: '9999-12-31T23:59:59.999Z'}};
        const started = performance.now();
        const html = renderToString(<Untyped {...base} layout="desktop" timeZone="Europe/Berlin" items={[item]}/>);
        expect(performance.now() - started).toBeLessThan(1000);
        // Lanes are measured on the client; the server marks every date of the grid as occupied.
        expect(html.match(/data-has-items="true"/g)).toHaveLength(35);
    });
    it.each(['en-u-nu-xyz', 'ar-u-nu-zzzz'])('server-renders %s instead of throwing an ICU error', locale => {
        const html = renderToString(<Untyped {...base} layout="desktop" anchorDate="2026-11-01" locale={locale}/>);
        expect(html).toContain('role="grid"'); expect(html).not.toContain('data-status="error"');
    });
    it.each([['missing', {}, 'mobile'], ['auto', {layout: 'auto'}, 'mobile'], ['mobile', {layout: 'mobile'}, 'mobile'], ['desktop', {layout: 'desktop'}, 'desktop']])(
        'renders a deterministic %s layout without callbacks; auto is mobile on the server', (_name, layout, resolved) => {
            const callback = vi.fn(), input = {...base, ...layout, onNavigate: callback, onVisibleRangeChange: callback};
            const html = renderToString(<Untyped {...input}/>);
            expect(renderToString(<Untyped {...input}/>)).toBe(html);
            expect(html).toContain(`data-layout="${resolved}"`); expect(html).toContain('role="grid"'); expect(html).not.toContain('data-status="error"');
            expect(callback).not.toHaveBeenCalled();
            // The public facade and the internal reference surface render the same tree.
            expect(renderToString(<CalendarMonth {...input}/>)).toBe(html);
        });
    // Spec v7 §11.3 (decision 2026-10-09): auto renders the compact mobile month on the server, with the inline agenda only
    // for agendaPresentation="auto"; with "overlay" the compact month has no agenda until activation (the sheet is closed).
    it('auto renders the compact month with the inline agenda; auto + overlay renders it with the sheet closed', () => {
        const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}}];
        const inline = renderToString(<Untyped {...base} items={items}/>), overlay = renderToString(<Untyped {...base} items={items} agendaPresentation="overlay"/>);
        for (const html of [inline, overlay]) { expect(html).toContain('data-layout="mobile"'); expect(html).toContain('nc-day-indicator'); expect(html).not.toContain('nc-overflow'); expect(html).not.toContain('role="dialog"'); }
        expect(inline.match(/data-presentation="inline"/g)).toHaveLength(1); expect(overlay).not.toContain('data-presentation=');
    });
    it('renders a deterministic contract shell for an unknown layout without callbacks', () => {
        const callback = vi.fn(), input = {...base, layout: 'tablet', onNavigate: callback, onVisibleRangeChange: callback};
        const html = renderToString(<Untyped {...input}/>);
        expect(renderToString(<Untyped {...input}/>)).toBe(html);
        for (const attribute of ['data-status="error"', 'data-layout="mobile"', 'aria-label="Calendar cannot be displayed: invalid configuration"']) expect(html).toContain(attribute);
        expect(html).not.toContain('role="grid"'); expect(html).not.toContain('<button');
        expect(callback).not.toHaveBeenCalled();
    });
    it('strips future props on the server identically to the client, warning once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const input = {...base, layout: 'desktop', selection: {start: '2026-03-04', end: '2026-03-05'}, onSelectionChange() {}, interactionPolicy: {}};
        const html = renderToString(<Untyped {...input}/>);
        expect(renderToString(<Untyped {...input}/>)).toBe(html);
        expect(html).toContain('role="grid"'); expect(html).not.toContain('aria-multiselectable'); expect(html).not.toContain('aria-selected');
        expect(html).not.toContain('interactionPolicy');
        expect(html).toBe(renderToString(<Untyped {...base} layout="desktop"/>));
        expect(warn.mock.calls.map(([message]) => message)).toEqual(['selection', 'onSelectionChange', 'interactionPolicy'].map(name => `[@nelmad/calendar] ${name}: not available in 0.2.0-alpha.2; ignored`));
    });
});
