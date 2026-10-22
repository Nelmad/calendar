import {describe, expect, it, vi} from 'vitest';
import {colorValue, createAppearanceResolver} from '../appearance.js';
import type {CalendarItem, CalendarSource} from '../../reference.js';

// §4.2/§10.3.3 (R62/R63): three independent channels over the theme/token base; the source layer is accent only.
const item = (id: string, calendarId?: string): CalendarItem => ({id, title: id, data: {}, ...(calendarId ? {calendarId} : {}),
    interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}});
const work: CalendarSource = {id: 'work', title: 'Work', color: 'rgb(1, 2, 3)'};
const record = (value: CalendarItem, source?: CalendarSource) => ({item: value, source});

describe('item appearance resolution', () => {
    it('keeps any single declaration value and drops blank, non-string and multi-declaration values with a reason', () => {
        for (const value of ['red', ' var(--brand) ', 'not-a-color', 'color-mix(in srgb, red 50%, blue)', 'var(--missing)']) expect(colorValue(value)).toEqual({value});
        expect(colorValue(undefined)).toEqual({});
        for (const value of ['', '   ', 5, null, {}, ['red']]) expect(colorValue(value)).toEqual({reason: 'Expected a nonempty CSS color string; ignored'});
        for (const value of ['red;', 'red !important', 'red; background: blue', 'url(a)', '"open', '/* open']) {
            expect(colorValue(value), value).toEqual({reason: 'Expected a single CSS declaration value; ignored'});
        }
    });
    // Spec v8 §10.3.3 (decision 2): the §10.3.2 rule for every source and resolver color, escaped `url(` spellings included.
    it('applies the single-declaration rule of tokens to colors: top-level ; or !, unbalanced quotes, brackets or comments and any url( are absent', () => {
        for (const value of ['red;position:fixed', 'red!important', 'rgb(1, 2, 3', 'red)', '[red', "'open", '/* a */ red /* b', 'url(a.png)', 'URL("a")',
            String.raw`u\72l(a)`, String.raw`\75 rl(a)`, 'image-set(url(a.png) 1x)', 'var(--x, url(a))', 'red\\', '\u00a0red']) {
            expect(colorValue(value), JSON.stringify(value)).toEqual({reason: 'Expected a single CSS declaration value; ignored'});
        }
        for (const value of ['"url(a)"', '/* url(a) */ red', 'rgb(1 2 3 / 50%)', 'var(--brand, #0b57d0)']) expect(colorValue(value), value).toEqual({value});
        const colors = createAppearanceResolver(() => ({accentColor: String.raw`u\72l(a)`, backgroundColor: 'red;color:blue', textColor: 'rgb(9, 9, 9)'}), 'UTC');
        // The lower channel stays: the source accent for accentColor, the theme token for the background.
        expect(colors.resolve(record(item('x', 'work'), work))).toEqual({sourceAccent: 'rgb(1, 2, 3)', text: 'rgb(9, 9, 9)'});
        expect(colors.resolve(record(item('y'), undefined))).toEqual({text: 'rgb(9, 9, 9)'});
        expect(createAppearanceResolver(undefined, 'UTC').sourceAccent({id: 'u', title: 'U', color: 'u\\72l(a)'})).toBeUndefined();
    });
    it('gives a known source only the accent layer; the resolver replaces each present field independently', () => {
        const resolver = vi.fn((value: CalendarItem) => ({a: {}, b: {accentColor: 'rgb(7, 8, 9)'}, c: {backgroundColor: 'rgb(4, 5, 6)'}, d: {textColor: 'rgb(9, 9, 9)'},
            e: {accentColor: undefined, backgroundColor: ' ', textColor: 'blue'}})[value.id]);
        const colors = createAppearanceResolver(resolver, 'UTC');
        expect(colors.resolve(record(item('a', 'work'), work))).toEqual({sourceAccent: 'rgb(1, 2, 3)'});
        expect(colors.resolve(record(item('b', 'work'), work))).toEqual({sourceAccent: 'rgb(1, 2, 3)', accent: 'rgb(7, 8, 9)'});
        expect(colors.resolve(record(item('c', 'work'), work))).toEqual({sourceAccent: 'rgb(1, 2, 3)', background: 'rgb(4, 5, 6)'});
        expect(colors.resolve(record(item('d'), undefined))).toEqual({text: 'rgb(9, 9, 9)'});
        // A blank field is no override; the other fields still apply.
        expect(colors.resolve(record(item('e', 'missing'), undefined))).toEqual({text: 'blue'});
        expect(colors.drain()).toEqual([{path: 'getItemAppearance("e").backgroundColor', reason: 'Expected a nonempty CSS color string; ignored'}]);
    });
    it('passes only the calendar zone and a known source; never a segment, date or view', () => {
        const resolver = vi.fn(() => undefined), colors = createAppearanceResolver(resolver, 'Europe/Berlin');
        const known = item('a', 'work'), unknown = item('b', 'gone'), plain = item('c');
        colors.resolve(record(known, work)); colors.resolve(record(unknown, undefined)); colors.resolve(record(plain, undefined));
        expect(resolver.mock.calls).toEqual([[known, {timeZone: 'Europe/Berlin', source: work}], [unknown, {timeZone: 'Europe/Berlin'}], [plain, {timeZone: 'Europe/Berlin'}]]);
        expect(Object.keys(resolver.mock.calls[1][1] as object)).toEqual(['timeZone']);
    });
    it('resolves each validated record once, so every segment and the agenda row share one result', () => {
        const resolver = vi.fn(() => ({backgroundColor: 'red'})), colors = createAppearanceResolver(resolver, 'UTC'), value = record(item('a'));
        const first = colors.resolve(value);
        expect(colors.resolve(value)).toBe(first); expect(colors.resolve(value)).toBe(first);
        expect(resolver).toHaveBeenCalledTimes(1);
        // A new record (new items or sources input) resolves again.
        colors.resolve(record(value.item)); expect(resolver).toHaveBeenCalledTimes(2);
        // Without a resolver nothing is called and items keep the theme layers.
        expect(createAppearanceResolver(undefined, 'UTC').resolve(record(item('x')))).toEqual({});
    });
    it('reports invalid source colors once per source object and non-object resolver results once per record', () => {
        const blank: CalendarSource = {id: 'blank', title: 'Blank', color: '  '}, bad: CalendarSource = {id: 'bad', title: 'Bad', color: 'red;position:fixed' as string};
        const colors = createAppearanceResolver((value: CalendarItem) => (value.id === 'n' ? 'red' : 7) as never, 'UTC');
        expect(colors.resolve(record(item('n', 'blank'), blank))).toEqual({});
        expect(colors.resolve(record(item('m', 'blank'), blank))).toEqual({});
        expect(colors.resolve(record(item('k', 'bad'), bad))).toEqual({});
        expect(colors.sourceAccent(blank)).toBeUndefined(); expect(colors.sourceAccent(work)).toBe('rgb(1, 2, 3)'); expect(colors.sourceAccent(undefined)).toBeUndefined();
        expect(colors.drain()).toEqual([
            {path: 'sources("blank").color', reason: 'Expected a nonempty CSS color string; ignored'},
            {path: 'getItemAppearance("n")', reason: 'Expected an appearance object or undefined; ignored'},
            {path: 'getItemAppearance("m")', reason: 'Expected an appearance object or undefined; ignored'},
            {path: 'sources("bad").color', reason: 'Expected a single CSS declaration value; ignored'},
            {path: 'getItemAppearance("k")', reason: 'Expected an appearance object or undefined; ignored'},
        ]);
        expect(colors.drain()).toEqual([]);
    });
});
