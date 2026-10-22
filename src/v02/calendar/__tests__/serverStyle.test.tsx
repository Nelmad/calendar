import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import type {CSSProperties} from 'react';
import {act} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, getCalendarVisibleRange, type CalendarProps} from '../../../index.js';
import {restoreServerStyle} from '../../primitives/serverStyle.js';
import {resetSurfaceWarnings} from '../../surface.js';

// QA-C-1-02: a strict style-src blocks the server `style` attributes; hydration must still apply the same declarations.
const props = (layout: 'desktop' | 'mobile', style: CalendarProps['style'] = {maxWidth: 600, '--nelmad-calendar-color-text': 'purple'}): CalendarProps => ({items: [],
    timeZone: 'UTC', locale: 'en-US', today: '2026-09-03', anchorDate: '2026-09-01', onNavigate() {}, layout, tokens: {color: {accent: '#0b57d0'}}, style});
const weeks = (layout: 'desktop' | 'mobile') => { const range = getCalendarVisibleRange(props(layout)); return String((Date.parse(range.end) - Date.parse(range.start)) / 7 / 86400000); };
/** jsdom has no CSP: the element keeps its attribute while its declaration block stays empty, as Chrome does when CSP blocks it. */
function block(element: HTMLElement) {
    const declarations = element.ownerDocument.createElement('div').style;
    Object.defineProperty(element, 'style', {configurable: true, get: () => declarations});
    return declarations;
}
const values = (declarations: CSSStyleDeclaration) => Object.fromEntries(Array.from({length: declarations.length}, (_, i) => declarations.item(i))
    .map(name => [name, declarations.getPropertyValue(name)]));
/** Inline declarations of the root and the grid after a client render (createRoot) of the same props. */
async function clientRender(calendar: CalendarProps) {
    const container = document.createElement('div'), root = createRoot(container);
    await act(async () => { root.render(<Calendar {...calendar}/>); });
    const result = {root: values(container.querySelector<HTMLElement>('.nc-calendar')!.style), grid: values(container.querySelector<HTMLElement>('.nc-month')!.style)};
    await act(async () => { root.unmount(); });
    return result;
}
/** SSR, a blocked declaration block on the root and the grid (CSP), hydration; returns the hydrated declarations. */
async function hydrateBlocked(calendar: CalendarProps) {
    const container = document.createElement('div'); container.innerHTML = renderToString(<Calendar {...calendar}/>); document.body.append(container);
    const root = container.querySelector<HTMLElement>('.nc-calendar')!, grid = container.querySelector<HTMLElement>('.nc-month')!;
    const attribute = root.getAttribute('style'), rootStyle = block(root), gridStyle = block(grid), errors: unknown[] = [];
    const cssText = [vi.spyOn(rootStyle, 'cssText', 'set'), vi.spyOn(gridStyle, 'cssText', 'set')];
    const hydrated = hydrateRoot(container, <Calendar {...calendar}/>, {onRecoverableError: error => errors.push(error)});
    await act(async () => {});
    const result = {root: values(rootStyle), grid: values(gridStyle), attribute, attributeAfter: root.getAttribute('style'), errors, cssTextWrites: cssText.flatMap(spy => spy.mock.calls)};
    await act(async () => { hydrated.unmount(); });
    return result;
}
beforeEach(() => { resetSurfaceWarnings(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('server-rendered inline styles under a strict CSP (QA-C-1-02)', () => {
    for (const layout of ['desktop', 'mobile'] as const) it(`hydration restores the blocked root and grid declarations (${layout})`, async () => {
        const html = renderToString(<Calendar {...props(layout)}/>);
        const container = document.createElement('div'); container.innerHTML = html;
        // The root and the grid are the only server-rendered elements with inline styles.
        expect([...container.querySelectorAll<HTMLElement>('[style]')].map(node => node.className.split(' ').find(name => ['nc-calendar', 'nc-month'].includes(name))))
            .toEqual(['nc-calendar', 'nc-month']);
        const result = await hydrateBlocked(props(layout));
        expect(result.errors).toEqual([]);
        // Spec v8 §10.3.4: the package's own validated declarations only; the consumer `style` stays subject to the policy.
        expect(result.root).toEqual({'--nelmad-calendar-color-accent': '#0b57d0'});
        expect(result.grid['--nc-week-count']).toBe(weeks(layout));
        expect(result.grid['--nc-minimum-row']).toMatch(/^\d+px$/);
        expect(result.attributeAfter).toBe(result.attribute);
        // QA-C-2-01: the declarations a client render writes, property by property, never as attribute text.
        const client = await clientRender(props(layout));
        expect(client.root).toEqual({'--nelmad-calendar-color-accent': '#0b57d0', '--nelmad-calendar-color-text': 'purple', 'max-width': '600px'});
        expect({root: result.root, grid: result.grid}).toEqual({root: {'--nelmad-calendar-color-accent': client.root['--nelmad-calendar-color-accent']}, grid: client.grid});
        expect(result.cssTextWrites).toEqual([]);
    });
    // QA-C-2-01: the root `style` prop is not validated; a value with a top-level `;` must not become further declarations.
    it('a hostile consumer style value adds no declarations after hydration', async () => {
        const hostile = props('desktop', {'--nelmad-calendar-color-text': 'red;position:fixed;inset:0;z-index:99999;outline:9px solid lime', lineHeight: 2, marginTop: 4});
        const result = await hydrateBlocked(hostile), client = await clientRender(hostile);
        expect(result.attribute).toContain('position:fixed');
        // A client render writes the consumer properties (and rejects the hostile one); the restore writes none of them.
        expect(Object.keys(client.root).sort()).toEqual(['--nelmad-calendar-color-accent', '--nelmad-calendar-color-text', 'line-height', 'margin-top']);
        expect(result.root).toEqual({'--nelmad-calendar-color-accent': '#0b57d0'});
        expect(result.cssTextWrites).toEqual([]);
    });
    // Spec v8 §10.3.4: a token that the consumer `style` replaces is not the package's declaration of that render.
    it('a token variable replaced by the consumer style is not restored, neither with the token nor with the consumer value', async () => {
        const replaced = {...props('desktop', {'--nelmad-calendar-color-accent': 'red', maxWidth: 600}), tokens: {color: {accent: '#0b57d0', text: '#111'}}};
        const result = await hydrateBlocked(replaced), client = await clientRender(replaced);
        expect(client.root).toEqual({'--nelmad-calendar-color-accent': 'red', '--nelmad-calendar-color-text': '#111', 'max-width': '600px'});
        expect(result.root).toEqual({'--nelmad-calendar-color-text': '#111'});
    });
    it('writes the rendered style object into a blocked block only; an applied one, an element without an attribute and a missing element stay untouched', () => {
        const applied = document.createElement('div'), blocked = document.createElement('div'), bare = document.createElement('div');
        for (const element of [applied, blocked]) element.setAttribute('style', '--a:1;position:fixed');
        const declarations = block(blocked), appliedText = vi.spyOn(applied.style, 'cssText', 'set'), blockedText = vi.spyOn(declarations, 'cssText', 'set');
        const style = {'--a': ' 1 ', maxWidth: 600, zIndex: 3, float: 'left', opacity: 0, color: undefined} as CSSProperties;
        for (const element of [applied, blocked, bare, null]) restoreServerStyle(element, style);
        restoreServerStyle(document.createElement('div'), undefined);
        expect(values(declarations)).toEqual({'--a': '1', 'max-width': '600px', 'z-index': '3', float: 'left', opacity: '0'});
        expect([appliedText.mock.calls, blockedText.mock.calls]).toEqual([[], []]);
        expect([applied.getAttribute('style'), bare.style.length]).toEqual(['--a:1;position:fixed', 0]);
        // Restored once: an already restored block is not written again.
        const setProperty = vi.spyOn(declarations, 'setProperty');
        restoreServerStyle(blocked, style);
        expect(setProperty).not.toHaveBeenCalled();
    });
});

// Spec v8 §10.3.4: the validated item colors of a server-rendered inline agenda are package declarations too.
describe('server-rendered item colors under a strict CSP (spec v8 §10.3.4)', () => {
    const at = (id: string, calendarId?: string) => ({id, title: id, data: null, ...(calendarId ? {calendarId} : {}), interval: {kind: 'allDay' as const, start: '2026-09-03', end: '2026-09-04'}});
    const colored = (press: boolean): CalendarProps => ({...props('mobile', {maxWidth: 600}), items: [at('a', 'work'), at('b', 'home'), at('c')],
        sources: [{id: 'work', title: 'Work', color: 'rgb(1, 2, 3)'}, {id: 'home', title: 'Home', color: 'red;position:fixed'}],
        getItemAppearance: item => ({a: {accentColor: 'rgb(4, 5, 6)', backgroundColor: 'rgb(7, 8, 9)', textColor: 'rgb(10, 11, 12)'}, b: {backgroundColor: 'blue !important'}})[item.id],
        ...(press ? {onItemPress() {}} : {})} as CalendarProps);
    /** Inline declarations of every agenda row surface and accent span, by item id. */
    const rows = (scope: ParentNode) => Object.fromEntries([...scope.querySelectorAll<HTMLElement>('li[data-item-id]')].map(row => {
        const surface = row.querySelector<HTMLElement>('[data-agenda-control="primary"]') ?? row, marker = row.querySelector<HTMLElement>('.nc-item-accent')!;
        return [row.dataset.itemId, {surface: values(surface.style), source: values(marker.style), accent: values((marker.firstElementChild as HTMLElement).style)}];
    }));
    for (const press of [true, false]) it(`hydration restores the blocked colors of each row as a client render writes them (onItemPress: ${press})`, async () => {
        const calendar = colored(press), container = document.createElement('div');
        container.innerHTML = renderToString(<Calendar {...calendar}/>); document.body.append(container);
        const styled = [...container.querySelectorAll<HTMLElement>('[style]')], blocked = new Map(styled.map(element => [element, block(element)]));
        expect(styled.map(element => element.getAttribute('style')).join(' ')).not.toMatch(/position|important/);
        const hydrated = hydrateRoot(container, <Calendar {...calendar}/>), restored = (element: Element) => values(blocked.get(element as HTMLElement)!);
        await act(async () => {});
        const result = Object.fromEntries([...container.querySelectorAll<HTMLElement>('li[data-item-id]')].map(row => {
            const surface = row.querySelector('[data-agenda-control="primary"]') ?? row, marker = row.querySelector('.nc-item-accent')!;
            const read = (element: Element) => blocked.has(element as HTMLElement) ? restored(element) : {};
            return [row.dataset.itemId, {surface: read(surface), source: read(marker), accent: read(marker.firstElementChild!)}];
        }));
        const root = container.querySelector('.nc-calendar')!;
        expect(restored(root)).toEqual({'--nelmad-calendar-color-accent': '#0b57d0'});
        await act(async () => { hydrated.unmount(); });
        const client = document.createElement('div'), clientRoot = createRoot(client);
        await act(async () => { clientRoot.render(<Calendar {...calendar}/>); });
        expect(result).toEqual(rows(client));
        expect(result.a).toEqual({surface: {'background-color': 'rgb(7, 8, 9)', color: 'rgb(10, 11, 12)'}, source: {color: 'rgb(1, 2, 3)'}, accent: {color: 'rgb(4, 5, 6)'}});
        // The rejected values (`;`, `!important`) are absent on the server, after the restore and in the client render alike.
        expect([result.b, result.c]).toEqual([{surface: {}, source: {}, accent: {}}, {surface: {}, source: {}, accent: {}}]);
        await act(async () => { clientRoot.unmount(); });
    });
});
