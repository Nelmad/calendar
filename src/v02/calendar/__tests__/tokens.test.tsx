import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';

// QA-14: a token value is written as exactly one custom-property declaration, identically on the server and the client.
const injected = 'white;position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=1)';
// QA-C-1-01: `u\72l(` is url( for CSS; the quote makes it a bad url that ends at the first `)`.
const escapedUrl = String.raw`u\72l(a'b);position:fixed;inset:0;background:url(/exfil?x=2);x:'c)`;
const props = (): CalendarProps => ({items: [], timeZone: 'UTC', locale: 'en-US', today: '2026-09-03', anchorDate: '2026-09-01', onNavigate() {}, layout: 'desktop',
    tokens: {color: {surface: injected, accent: '#0b57d0', muted: escapedUrl}, components: {itemText: 'red !important', itemBackground: '"open'}}, style: {'--nelmad-calendar-color-text': 'purple'}});
const rootStyle = (container: Element) => container.querySelector('.nc-calendar')!.getAttribute('style');
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('token declarations on the server and the client (QA-14, §10.3.2)', () => {
    it('never serializes a value that would add declarations; server, hydration and client render agree', async () => {
        const html = renderToString(<Calendar {...props()}/>);
        const server = document.createElement('div'); server.innerHTML = html;
        expect(rootStyle(server)).toBe('--nelmad-calendar-color-accent:#0b57d0;--nelmad-calendar-color-text:purple');
        expect(html).not.toMatch(/position:fixed|exfil|!important|"open/);
        const errors: unknown[] = [];
        const hydrated = document.createElement('div'); hydrated.innerHTML = html; document.body.append(hydrated);
        // Inside act: outside it the hydration is a Scheduler task that a busy frame defers past the next act (serverStyle.test.tsx).
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => { root = hydrateRoot(hydrated, <Calendar {...props()}/>, {onRecoverableError: error => errors.push(error)}); });
        const client = document.createElement('div'); document.body.append(client);
        const clientRoot = createRoot(client);
        await act(async () => { clientRoot.render(<Calendar {...props()}/>); });
        try {
            expect(errors).toEqual([]);
            expect(rootStyle(hydrated)).toBe(rootStyle(server));
            const style = (client.querySelector('.nc-calendar') as HTMLElement).style;
            expect(Array.from({length: style.length}, (_, i) => style.item(i)).sort()).toEqual(['--nelmad-calendar-color-accent', '--nelmad-calendar-color-text']);
            expect(style.getPropertyValue('--nelmad-calendar-color-accent')).toBe('#0b57d0');
            expect(style.position).toBe('');
            const messages = warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('tokens.'));
            expect([...new Set(messages)].sort()).toEqual(['[@nelmad/calendar] tokens.color.muted: Expected a single CSS declaration value',
                '[@nelmad/calendar] tokens.color.surface: Expected a single CSS declaration value',
                '[@nelmad/calendar] tokens.components.itemBackground: Expected a single CSS declaration value',
                '[@nelmad/calendar] tokens.components.itemText: Expected a single CSS declaration value']);
        } finally {
            await act(async () => { root!.unmount(); clientRoot.unmount(); });
        }
    });
});

// Spec v8 §10.3.3 (decision 2, 2026-10-22): the single-declaration rule of §10.3.2 also applies to `CalendarSource.color` and
// every color of `getItemAppearance`; an offending value is absent, identically on the server and the client, and the lower
// channel (source accent, theme token) stays.
describe('item color declarations on the server and the client (spec v8 §10.3.3)', () => {
    const hostile = [injected, escapedUrl, 'red !important', 'rgb(1, 2, 3', 'red)', '"open', '/* open', 'url(https://tracker.example/p.gif)', String.raw`\75 rl(a)`];
    const at = (id: string, calendarId: string) => ({id, title: id, data: null, calendarId, interval: {kind: 'allDay' as const, start: '2026-09-03', end: '2026-09-04'}});
    const colors = (): CalendarProps => ({...props(), tokens: {color: {accent: '#0b57d0'}}, style: undefined, layout: 'mobile', onItemPress() {},
        items: [...hostile.map((_, index) => at(`s${index}`, `bad${index}`)), ...hostile.map((_, index) => at(`a${index}`, 'good'))],
        sources: [{id: 'good', title: 'Good', color: 'rgb(1, 2, 3)'}, ...hostile.map((color, index) => ({id: `bad${index}`, title: `Bad ${index}`, color}))],
        getItemAppearance: item => item.id.startsWith('a') ? {accentColor: hostile[Number(item.id.slice(1))], backgroundColor: hostile[Number(item.id.slice(1))], textColor: hostile[Number(item.id.slice(1))]} : undefined} as CalendarProps);
    /** Every inline declaration of the agenda rows, by item id: surface, source accent and item accent. */
    const rows = (scope: Element) => Object.fromEntries([...scope.querySelectorAll<HTMLElement>('li[data-item-id]')].map(row => {
        const surface = row.querySelector<HTMLElement>('[data-agenda-control="primary"]')!, marker = row.querySelector<HTMLElement>('.nc-item-accent')!;
        return [row.dataset.itemId, [surface, marker, marker.firstElementChild as HTMLElement].map(node => Array.from({length: node.style.length}, (_, i) => node.style.item(i))
            .map(name => `${name}:${node.style.getPropertyValue(name)}`).join(';'))];
    }));
    it('never serializes an offending color; server, hydration and client render agree, and the lower channel stays', async () => {
        const html = renderToString(<Calendar {...colors()}/>);
        const server = document.createElement('div'); server.innerHTML = html;
        expect(html).not.toMatch(/position:fixed|exfil|tracker|!important|"open|\/\*/);
        const expected = Object.fromEntries([...hostile.map((_, index) => [`s${index}`, ['', '', '']]), ...hostile.map((_, index) => [`a${index}`, ['', 'color:rgb(1, 2, 3)', '']])]);
        expect(rows(server)).toEqual(expected);
        // Only the valid source color is serialized at all: the other markers and surfaces have no style attribute.
        expect([...server.querySelectorAll('li[data-item-id] [style]')].map(node => node.getAttribute('style'))).toEqual(hostile.map(() => 'color:rgb(1, 2, 3)'));
        const errors: unknown[] = [];
        const hydrated = document.createElement('div'); hydrated.innerHTML = html; document.body.append(hydrated);
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => { root = hydrateRoot(hydrated, <Calendar {...colors()}/>, {onRecoverableError: error => errors.push(error)}); });
        const client = document.createElement('div'); document.body.append(client);
        const clientRoot = createRoot(client);
        await act(async () => { clientRoot.render(<Calendar {...colors()}/>); });
        try {
            expect(errors).toEqual([]);
            expect(rows(hydrated)).toEqual(expected); expect(rows(client)).toEqual(expected);
            const messages = [...new Set(warn.mock.calls.map(([message]) => String(message)).filter(message => /sources\(|getItemAppearance\(/.test(message)))];
            expect(messages).toHaveLength(hostile.length * 4);
            expect(messages.every(message => message.endsWith('Expected a single CSS declaration value; ignored'))).toBe(true);
        } finally {
            await act(async () => { root!.unmount(); clientRoot.unmount(); });
        }
    });
});
