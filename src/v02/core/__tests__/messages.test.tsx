// @vitest-environment node
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {LocalizedText} from '../../LocalizedText.js';
import {createBuiltinCatalog} from '../catalogs.js';
import {createDateFormatting} from '../formatting.js';
import {resolveLocale} from '../locale.js';
import {contractMessages, createMessages, snapshotItemTitle} from '../messages.js';

const messages = (locale = 'ru-RU', options: Parameters<typeof createMessages>[2] = {}) => createMessages(resolveLocale({locale}), 'UTC', options);
const raw = (value: ReturnType<ReturnType<typeof messages>['message']>) => value.fragments.map(part => part.text).join('');
const sampleArgs: Record<string, unknown[]> = {
    showSourceLabel: ['Work'], hideSourceLabel: ['Work'], openAgendaLabel: ['2026-09-03'], agendaHeading: ['2026-09-03'], itemActionsLabel: ['Task'],
    itemCountLabel: ['2026-09-03', 2], moreItemsLabel: ['2026-09-03', 2], moveDstGapReason: ['2026-03-29', '02:30'], blockedAnnouncement: ['Closed'],
    monthChangedAnnouncement: ['2026-09-01'], agendaUpdatedAnnouncement: ['2026-09-03', 2], selectionStartedAnnouncement: ['2026-09-03'],
    selectionTargetAnnouncement: [{start: '2026-09-03', end: '2026-09-05'}, false], selectionCompletedAnnouncement: [{start: '2026-09-03', end: '2026-09-05'}],
    moveStartedAnnouncement: ['Task'], moveNavigationPendingLabel: ['Task', '2026-10-01'], moveTargetAnnouncement: ['Task', '2026-09-03', true, '+02:00'],
    moveCancelledAnnouncement: ['Task', 'Closed'], moveNoopAnnouncement: ['Task'], movePendingAnnouncement: ['Task'], moveSucceededAnnouncement: ['Task'], moveRejectedAnnouncement: ['Task', 'Closed'],
};

describe('complete language catalogs', () => {
    it.each(['ru-RU', 'en-US'] as const)('implements every normative CalendarMessages key in %s', lang => {
        const reference = readFileSync(new URL('../../reference.d.ts', import.meta.url), 'utf8').split('export type CalendarMessages = {')[1].split('\n};')[0];
        const keys = [...reference.matchAll(/^ {2}(\w+):/gm)].map(match => match[1]).sort();
        const catalog = createBuiltinCatalog(lang, createDateFormatting(resolveLocale({locale: lang}), 'UTC'), () => ({text: 'Untitled', lang, dir: 'ltr', kind: 'message'}));
        expect(Object.keys(catalog).sort()).toEqual(keys);
        const resolve = messages(lang).message as (key: keyof typeof catalog, ...args: unknown[]) => ReturnType<ReturnType<typeof messages>['message']>;
        for (const key of Object.keys(catalog) as (keyof typeof catalog)[]) {
            if (typeof catalog[key] === 'function') expect(sampleArgs[key], key).toBeDefined();
            const result = resolve(key, ...(sampleArgs[key] ?? []));
            expect(result.lang).toBe(lang);
            expect(raw(result).trim(), key).not.toBe('');
            expect(result.diagnostics).toEqual([]);
        }
    });
    it.each([[0, '0 событий'], [1, '1 событие'], [2, '2 события'], [5, '5 событий'], [11, '11 событий'], [21, '21 событие'], [22, '22 события']])('uses Russian plurals for %i', (n, expected) => {
        expect(raw(messages().message('itemCountLabel', '2026-09-03', n as number))).toContain(expected);
    });
    it('uses singular/plural English counts and includes target state/offset/reason', () => {
        const m = messages('en-US');
        expect(raw(m.message('itemCountLabel', '2026-09-03', 1))).toContain('1 event');
        expect(raw(m.message('itemCountLabel', '2026-09-03', 2))).toContain('2 events');
        expect(raw(m.message('moveTargetAnnouncement', 'Task', '2026-10-25', false, '+02:00'))).toContain('Unavailable. UTC+02:00');
        expect(raw(m.message('moveRejectedAnnouncement', 'Task', 'No access'))).toContain('No access');
    });
});

describe('partial overrides, fragments and raw title snapshots', () => {
    it('negotiates catalog independently while preserving actual date and message languages', () => {
        const m = messages('fr-FR');
        const heading = m.message('agendaHeading', '2026-09-03');
        expect(heading.lang).toBe('en-US');
        expect(heading.fragments.filter(part => part.kind === 'date').map(part => part.lang)).toEqual(['fr-FR']);
        expect(heading.fragments.filter(part => part.kind === 'message').every(part => part.lang === 'en-US')).toBe(true);
        expect(messages('ar-SA', {messagesLocale: 'ru-UA'}).message('calendarLabel').lang).toBe('ru-RU');
        expect(resolveLocale({locale: 'ar-SA'}).dir).toBe('rtl');
        expect(messages('x-company').messagesLocale).toBe('en-US');
    });
    it('marks each override in its declared language and leaves missing keys on the built-in language', () => {
        const m = messages('ar-SA', {messagesLocale: 'fr-FR', messages: {todayLabel: "Aujourd’hui"}});
        expect(m.message('todayLabel')).toMatchObject({lang: 'fr-FR', text: "Aujourd’hui"});
        expect(m.message('calendarLabel')).toMatchObject({lang: 'en-US', text: 'Calendar'});
    });
    it.each(['', '  ', null, 7, () => 'Wrong shape'])('falls back on invalid static override %j', todayLabel => {
        const m = messages('ru-RU', {messages: {todayLabel} as never});
        expect(m.message('todayLabel')).toMatchObject({text: 'Сегодня', lang: 'ru-RU', diagnostics: [{code: 'invalid-message', path: 'messages.todayLabel'}]});
    });
    it('falls back per invocation for empty/non-string function results and propagates consumer exceptions', () => {
        const callback = vi.fn((_date: string, n: number) => n ? 'Items' : ' ');
        const m = messages('fr-FR', {messages: {itemCountLabel: callback}});
        expect(m.message('itemCountLabel', '2026-09-03', 1).lang).toBe('fr-FR');
        expect(m.message('itemCountLabel', '2026-09-03', 0).lang).toBe('en-US');
        expect(callback.mock.calls).toEqual([['2026-09-03', 1], ['2026-09-03', 0]]);
        const failure = new Error('consumer failure');
        expect(() => messages('en-US', {messages: {agendaHeading() { throw failure; }}}).message('agendaHeading', '2026-09-03')).toThrow(failure);
        expect(messages('en-US', {messages: {agendaHeading: (() => null) as never}}).message('agendaHeading', '2026-09-03').diagnostics).toHaveLength(1);
    });
    it('does not evaluate unused pure message resolvers or mutate overrides', () => {
        const callback = vi.fn();
        const overrides = Object.freeze({agendaHeading: callback, todayLabel: 'Now'});
        const m = messages('en-US', {messages: overrides});
        m.message('todayLabel');
        expect(callback).not.toHaveBeenCalled();
    });
    it('retains raw title snapshots and resolves blanks through current translations', () => {
        const item = {title: '  '};
        const snapshot = snapshotItemTitle(item);
        item.title = 'Later title';
        expect(raw(messages().message('moveStartedAnnouncement', snapshot))).toContain('Без названия');
        const current = messages('fr-FR', {messages: {untitledItemLabel: 'Sans titre'}});
        const output = current.message('moveStartedAnnouncement', snapshot);
        expect(output.fragments.some(part => part.text === 'Sans titre' && part.lang === 'fr-FR')).toBe(true);
        expect(raw(output)).not.toContain('Later title');
        const callback = vi.fn((title: string) => title);
        messages('en-US', {messages: {untitledItemLabel: 'Untitled now', moveStartedAnnouncement: callback}}).message('moveStartedAnnouncement', snapshot);
        expect(callback).toHaveBeenCalledWith('Untitled now');
        expect(messages('en-US', {messages: {untitledItemLabel: ' '}}).message('moveStartedAnnouncement', snapshot).diagnostics).toEqual([
            {code: 'invalid-message', path: 'messages.untitledItemLabel', reason: expect.any(String)},
        ]);
    });
    it('isolates user text and renders it as escaped text without injecting markup', () => {
        const title = '<img src=x onerror=alert(1)>שלום';
        const message = messages('ar-SA').message('moveStartedAnnouncement', title);
        expect(message.text).toContain(`\u2068${title}\u2069`);
        const html = renderToStaticMarkup(<LocalizedText value={message}/>);
        expect(html).toContain('<bdi lang="" dir="auto">&lt;img');
        expect(html).not.toContain('<img');
        expect(html).toContain('lang="en-US"');
        expect(renderToStaticMarkup(<LocalizedText value={messages('fr-FR').message('agendaHeading', '2026-09-03')}/>)).toContain('lang="fr-FR"');
    });
    it('isolates titles inside overrides without changing resolver arguments or calling twice', () => {
        const title = 'Report\u202e';
        const callback = vi.fn((value: string, reason?: string) => `Move of ${value} cancelled: ${reason}`);
        const result = messages('en-US', {messages: {moveCancelledAnnouncement: callback}}).message('moveCancelledAnnouncement', title, 'Closed');
        expect(callback.mock.calls).toEqual([[title, 'Closed']]);
        expect(raw(result)).toBe(`Move of ${title} cancelled: Closed`);
        expect(result.text).toBe(`Move of \u2068${title}\u2069 cancelled: \u2068Closed\u2069`);
        expect(renderToStaticMarkup(<LocalizedText value={result}/>)).toContain(`<bdi lang="" dir="auto">${title}</bdi>`);
    });
    it.each(['itemActionsLabel', 'moveStartedAnnouncement', 'moveNavigationPendingLabel', 'moveTargetAnnouncement',
        'moveCancelledAnnouncement', 'moveNoopAnnouncement', 'movePendingAnnouncement', 'moveSucceededAnnouncement', 'moveRejectedAnnouncement'] as const)('isolates the title in %s overrides', key => {
        const title = '<שלום>\u202e';
        const callback = vi.fn((value: string) => `Before ${value} after`);
        const m = messages('en-US', {messages: {[key]: callback}});
        const result = (m.message as (messageKey: typeof key, ...args: unknown[]) => ReturnType<typeof m.message>)(key, title, ...sampleArgs[key].slice(1));
        expect(result.text).toBe(`Before \u2068${title}\u2069 after`);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(renderToStaticMarkup(<LocalizedText value={result}/>)).toContain('&lt;שלום&gt;');
    });
    it('isolates repeated and overlapping verbatim values without interpreting regular expressions', () => {
        const title = '[שלום].*';
        const result = messages('en-US', {messages: {moveRejectedAnnouncement: (value, reason) => `${value}: ${reason}; ${value}`}})
            .message('moveRejectedAnnouncement', title, 'שלום');
        expect(result.text).toBe(`\u2068${title}\u2069: \u2068שלום\u2069; \u2068${title}\u2069`);
        expect(raw(result)).toBe(`${title}: שלום; ${title}`);
    });
    it('isolates source labels in overrides and preserves omitted or transformed values', () => {
        for (const key of ['showSourceLabel', 'hideSourceLabel'] as const) {
            expect(messages('en-US', {messages: {[key]: (source: string) => `Calendar ${source}`}}).message(key, 'עבודה').text)
                .toBe('Calendar \u2068עבודה\u2069');
        }
        expect(messages('en-US', {messages: {blockedAnnouncement: reason => `Blocked: ${reason}`}}).message('blockedAnnouncement', 'סגור').text)
            .toBe('Blocked: \u2068סגור\u2069');
        const m = messages('en-US', {messages: {itemActionsLabel: title => title.toUpperCase(), moveStartedAnnouncement: () => 'Moving item'}});
        expect(m.message('itemActionsLabel', 'Report').text).toBe('REPORT');
        expect(m.message('moveStartedAnnouncement', 'Report').text).toBe('Moving item');
    });
    it('keeps the actual fallback-title language and isolation inside built-in and custom messages', () => {
        const fallback = 'بدون عنوان\u202e';
        const callback = vi.fn((title: string) => `Moving ${title} now`);
        for (const override of [undefined, callback]) {
            const result = messages('en-US', {messagesLocale: 'ru-RU', messages: {
                untitledItemLabel: ' ', ...(override ? {moveStartedAnnouncement: override} : {}),
            }}).message('moveStartedAnnouncement', ' ');
            expect(result.text).toContain('\u2068Без названия\u2069');
            expect(result.diagnostics).toEqual([{code: 'invalid-message', path: 'messages.untitledItemLabel', reason: expect.any(String)}]);
        }
        const result = messages('en-US', {messagesLocale: 'ar', messages: {untitledItemLabel: fallback}}).message('moveStartedAnnouncement', ' ');
        expect(result.text).toContain(`\u2068${fallback}\u2069`);
        const withOverride = messages('en-US', {messagesLocale: 'fr-FR', messages: {moveStartedAnnouncement: callback}}).message('moveStartedAnnouncement', ' ');
        expect(withOverride.fragments.find(part => part.text === 'Untitled')).toMatchObject({lang: 'en-US', dir: 'ltr'});
        expect(callback).toHaveBeenLastCalledWith('Untitled');
    });
    it('rejects malformed messagesLocale, but accepts unsupported language for declared overrides', () => {
        expect(() => messages('en-US', {messagesLocale: 'ru_RU'})).toThrow(RangeError);
        expect(messages('en-US', {messagesLocale: 'x-company', messages: {todayLabel: 'Now'}}).message('todayLabel').lang).toBe('x-company');
        expect(messages('en-US', {messages: null as never}).diagnostics).toHaveLength(1);
    });
});

// Review 2026-10-09-2: only the interpolation is a user fragment; a value that also occurs inside a literal word does not
// split that word (wrong lang, FSI/PDI in the accessible text, broken Arabic joining; §11.2, R73).
describe('interpolations inside literal words', () => {
    const fragments = (messages: Parameters<typeof createMessages>[2]['messages'], key: 'itemActionsLabel' | 'hideSourceLabel', value: string, locale = 'en-US') =>
        createMessages(resolveLocale({locale: 'en-US'}), 'UTC', {messagesLocale: locale, messages}).message(key, value).fragments.map(part => [part.text, part.kind]);
    it.each([
        [{itemActionsLabel: (title: string) => `Actions for ${title}`}, 'itemActionsLabel', 'on', 'en-US', [['Actions for ', 'message'], ['on', 'user']]],
        [{hideSourceLabel: (source: string) => `Hide ${source}`}, 'hideSourceLabel', 'e', 'en-US', [['Hide ', 'message'], ['e', 'user']]],
        [{itemActionsLabel: (title: string) => `${title} actions`}, 'itemActionsLabel', 'a', 'en-US', [['a', 'user'], [' actions', 'message']]],
        [{itemActionsLabel: (title: string) => `פעולות עבור ${title}`}, 'itemActionsLabel', 'ע', 'he', [['פעולות עבור ', 'message'], ['ע', 'user']]],
        [{itemActionsLabel: (title: string) => `إجراءات ${title}`}, 'itemActionsLabel', 'ر', 'ar', [['إجراءات ', 'message'], ['ر', 'user']]],
        [{itemActionsLabel: (title: string) => `${title}'s actions`}, 'itemActionsLabel', 'Bob', 'en-US', [['Bob', 'user'], ["'s actions", 'message']]],
        // A script without spaces keeps the first occurrence.
        [{itemActionsLabel: (title: string) => `${title}の操作`}, 'itemActionsLabel', '会議', 'ja', [['会議', 'user'], ['の操作', 'message']]],
    ] as const)('isolates only the interpolation of %j', (messages, key, value, locale, expected) => {
        expect(fragments(messages as never, key, value, locale)).toEqual(expected);
    });
});
// Review 2026-10-09-2: the layout `dir` override is not the direction of date text: a date or time keeps its own
// script's direction, so '1 сент. 2026 г.' is never laid out with RTL paragraph rules (§11.2, R56).
describe('date fragment direction', () => {
    it.each([['ru-RU', 'rtl', 'ltr'], ['en-GB', 'rtl', 'ltr'], ['en-US', 'rtl', 'ltr'], ['ar', 'ltr', 'rtl'], ['he', 'ltr', 'rtl'], ['ar', undefined, 'rtl'], ['ru-RU', undefined, 'ltr']] as const)(
        '%s with dir %s formats dates and times as %s text', (locale, dir, expected) => {
            const resolved = resolveLocale({locale, dir}), formats = createDateFormatting(resolved, 'UTC');
            expect(resolved.dir).toBe(dir ?? expected);
            const parts = [formats.date('2026-09-01'), formats.date('2026-09-01', 'short'), formats.time('2026-09-01T10:30:00Z'), ...formats.range({start: '2026-09-01', end: '2026-09-03'}),
                ...formats.timedRange(Date.parse('2026-09-01T10:30:00Z'), Date.parse('2026-09-02T11:30:00Z'))];
            expect(new Set(parts.map(part => part.dir))).toEqual(new Set([expected]));
        });
    it('renders the agenda heading of an RTL-overridden Russian calendar with ltr date isolates', () => {
        const messages = createMessages(resolveLocale({locale: 'ru-RU', dir: 'rtl'}), 'UTC');
        const html = renderToStaticMarkup(<LocalizedText value={messages.message('agendaHeading', '2026-09-01')}/>);
        expect(html).toContain('dir="ltr"'); expect(html).not.toContain('dir="rtl"');
    });
});
describe('contract-error locale chain', () => {
    it.each(['rus', 'rus-RU', 'RUS'])('uses one catalog for the shell and messages with the %s alias', locale => {
        for (const messagesLocale of [undefined, 'bad_tag']) {
            const result = contractMessages({locale, messagesLocale});
            expect(result.lang).toBe('ru-RU');
            expect(result.calendarLabel).toMatchObject({lang: result.lang, text: 'Календарь'});
            expect(result.invalidConfigurationLabel.lang).toBe(result.lang);
        }
    });
    it('keeps the shell catalog consistent when the valid date locale is unsupported', () => {
        const supported = vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockReturnValue([]);
        try {
            const result = contractMessages({locale: 'ru-RU'});
            expect(result.lang).toBe('en-US');
            expect(result.calendarLabel).toMatchObject({lang: 'en-US', text: 'Calendar'});
            expect(result.invalidConfigurationLabel.lang).toBe('en-US');
        } finally { supported.mockRestore(); }
    });
    it.each([
        [{locale: 'bad_tag', messagesLocale: 'ru-UA'}, 'ru-RU', 'ltr'],
        [{locale: 'ar-SA', messagesLocale: 'bad_tag'}, 'en-US', 'rtl'],
        [{locale: 'bad_tag', messagesLocale: 'bad_tag'}, 'ru-RU', 'ltr'],
        [{locale: 'ar-SA', dir: 'ltr'}, 'en-US', 'ltr'],
        [{locale: 'bad_tag', dir: 'rtl'}, 'ru-RU', 'rtl'],
        [{locale: 'x-company'}, 'en-US', 'ltr'],
        [{}, 'ru-RU', 'ltr'],
        // Review 2026-10-09-2: an unsupported RTL-script tag resolves to en-US for both states, so the shell is ltr too.
        [{locale: 'zz-Arab'}, 'en-US', 'ltr'],
        [{locale: 'dv'}, 'en-US', 'ltr'],
    ])('resolves the shell for %j', (input, lang, dir) => {
        expect(contractMessages(input)).toMatchObject({lang, dir});
    });
    it.each(['zz-Arab', 'dv', 'ar-SA', 'he', 'ru-RU'])('gives the shell of %s the direction of the data state', locale => {
        expect(contractMessages({locale}).dir).toBe(resolveLocale({locale}).dir);
    });
    it('applies only the permitted valid-language error override and never calls unrelated resolvers', () => {
        const callback = vi.fn();
        const overrides = {invalidConfigurationLabel: 'Erreur', agendaHeading: callback};
        expect(contractMessages({locale: 'bad_tag', messagesLocale: 'fr-FR', messages: overrides}).invalidConfigurationLabel).toMatchObject({lang: 'fr-FR', text: 'Erreur'});
        expect(contractMessages({locale: 'ru-RU', messagesLocale: 'bad_tag', messages: overrides}).invalidConfigurationLabel.lang).toBe('ru-RU');
        expect(callback).not.toHaveBeenCalled();
    });
    it('uses default messagesLocale for valid or omitted date locale, but never for malformed tags', () => {
        const overrides = {invalidConfigurationLabel: 'Custom error'};
        expect(contractMessages({locale: 'en-US', messages: overrides}).invalidConfigurationLabel.text).toBe('Custom error');
        expect(contractMessages({messages: overrides}).invalidConfigurationLabel).toMatchObject({text: 'Custom error', lang: 'ru-RU'});
        expect(contractMessages({locale: 'bad_tag', messages: overrides}).invalidConfigurationLabel.text).not.toBe('Custom error');
        expect(contractMessages({messagesLocale: 'bad_tag', messages: overrides}).invalidConfigurationLabel.text).not.toBe('Custom error');
    });
});
