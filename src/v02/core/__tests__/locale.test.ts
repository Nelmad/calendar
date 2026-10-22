// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {resolveLocale, localePreferences} from '../locale.js';
import {createDateFormatting, getCalendarVisibleRange} from '../formatting.js';
import {dateToDay} from '../projection.js';

describe('explicit locale negotiation', () => {
    it.each([
        [undefined, 'ru-RU', 'monday', 24, 'ltr'], ['en-US', 'en-US', 'sunday', 12, 'ltr'],
        ['en-GB', 'en-GB', 'monday', 24, 'ltr'], ['ar-SA-u-ca-islamic', 'ar-SA-u-ca-islamic', 'sunday', 12, 'rtl'],
        ['en-US-u-hc-h24', 'en-US-u-hc-h24', 'sunday', 24, 'ltr'],
        ['en-US-u-fw-tue', 'en-US-u-fw-tue', 'tuesday', 12, 'ltr'],
    ])('resolves %s without host defaults', (locale, resolved, firstDayOfWeek, hourCycle, dir) => {
        expect(resolveLocale({locale: locale as string | undefined})).toEqual({locale: resolved, firstDayOfWeek, hourCycle, dir, diagnostics: []});
    });
    it.each(['zz-ZZ', 'x-company', 'i-klingon', 'en-GB-oed'])('falls back once for valid unsupported %s', locale => {
        const result = resolveLocale({locale});
        expect(result).toMatchObject({locale: 'en-US', firstDayOfWeek: 'sunday', hourCycle: 12, dir: 'ltr'});
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].code).toBe('unsupported-locale');
    });
    // Review 2026-10-09-2: ICU throws "Internal error" from Intl.Locale#getHourCycles for an unknown numbering system;
    // the well-formed tag still resolves deterministically, with the formatter's own hour cycle (§11.2).
    it.each([['en-u-nu-xyz', 'sunday', 12, 'ltr'], ['ru-RU-u-nu-foo', 'monday', 24, 'ltr'], ['he-u-nu-abc', 'sunday', 24, 'rtl']] as const)(
        'resolves %s with an unknown numbering system without throwing', (locale, firstDayOfWeek, hourCycle, dir) => {
            expect(resolveLocale({locale})).toEqual({locale, firstDayOfWeek, hourCycle, dir, diagnostics: []});
            const range = getCalendarVisibleRange({anchorDate: '2026-11-01', timeZone: 'UTC', locale});
            expect(range).toEqual(getCalendarVisibleRange({anchorDate: '2026-11-01', timeZone: 'UTC', locale: locale.replace(/-u-nu-\w+$/, ''), firstDayOfWeek}));
        });
    it('lets an unexpected locale-info failure through', () => {
        const NativeLocale = Intl.Locale;
        const replacement = vi.spyOn(Intl, 'Locale').mockImplementation(function (tag: string) {
            return {toString: () => new NativeLocale(tag).toString(), getHourCycles: () => { throw new TypeError('broken runtime'); }} as unknown as Intl.Locale;
        } as typeof Intl.Locale);
        try { expect(() => localePreferences('en-US')).toThrow(TypeError); } finally { replacement.mockRestore(); }
    });
    it.each(['', 'en_US', 'ru--RU', ' en-US', null, 42])('rejects malformed %j', locale => {
        expect(() => resolveLocale({locale} as never)).toThrow(RangeError);
    });
    it('uses explicit preferences and script direction independently of messages', () => {
        expect(resolveLocale({locale: 'ar-SA', firstDayOfWeek: 'friday', hourCycle: 24, dir: 'ltr'})).toMatchObject({firstDayOfWeek: 'friday', hourCycle: 24, dir: 'ltr'});
        expect(resolveLocale({locale: 'az-Arab'}).dir).toBe('rtl');
        expect(resolveLocale({locale: 'ar-Latn'}).dir).toBe('ltr');
        for (const input of [{firstDayOfWeek: 'Monday'}, {hourCycle: 23}, {dir: 'auto'}]) expect(() => resolveLocale(input as never)).toThrow(RangeError);
    });
    it('uses normative week/direction fallbacks when locale-info APIs are absent', () => {
        const NativeLocale = Intl.Locale;
        // Simulate a supported DTF runtime without optional Locale Info methods.
        const replacement = vi.spyOn(Intl, 'Locale').mockImplementation(function (tag: string) {
            return {toString: () => new NativeLocale(tag).toString()} as Intl.Locale;
        } as typeof Intl.Locale);
        try { expect(localePreferences('en-US')).toEqual({firstDayOfWeek: 'monday', hourCycle: 12, dir: 'ltr'}); }
        finally { replacement.mockRestore(); }
    });
});

describe('Gregorian formatting and ISO visible ranges', () => {
    it.each(['ar-SA-u-ca-islamic', 'th-TH-u-ca-buddhist'])('keeps Gregorian fields under %s', locale => {
        const formats = createDateFormatting(resolveLocale({locale}), 'Pacific/Apia');
        const expected = new Intl.DateTimeFormat(locale, {calendar: 'gregory', localeMatcher: 'lookup', timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'}).format(Date.parse('2011-12-30T00:00:00Z'));
        expect(formats.date('2011-12-30').text).toBe(expected);
        expect(formats.date('2011-12-30').lang).toBe(locale);
    });
    it('preserves requested digits and date-only fields in any calendar timezone', () => {
        const formats = createDateFormatting(resolveLocale({locale: 'en-US-u-nu-arab'}), 'America/New_York');
        expect(formats.date('2026-09-03', 'day').text).toBe('٣');
        expect(formats.time('2026-09-03T04:00:00Z').text).toContain('١٢');
        expect(formats.date('0001-01-01', 'short').text).toContain('١');
    });
    it.each([
        ['en-US', 12, '12:00 AM'], ['en-US-u-hc-h24', 24, '00:00'],
        ['en-US-u-hc-h11', 12, '12:00 AM'], ['ru-RU', 24, '00:00'],
    ] as const)('formats midnight with %s / %i', (locale, hourCycle, expected) => {
        const formats = createDateFormatting(resolveLocale({locale, hourCycle}), 'UTC');
        expect(formats.time('2026-09-03T00:00:00Z').text.replace(/\u202f/g, ' ')).toBe(expected);
    });
    it('formats the instant in the display zone and never adds the exclusive end date', () => {
        const formats = createDateFormatting(resolveLocale(), 'Europe/Moscow');
        expect(formats.time('2026-09-02T21:00:00Z').text).toBe('00:00');
        expect(formats.range({start: '2026-09-03', end: '2026-09-04'})).toEqual([formats.date('2026-09-03', 'short')]);
        expect(formats.range({start: '2026-09-03', end: '2026-09-06'}).at(-1)).toEqual(formats.date('2026-09-05', 'short'));
        expect(() => formats.time(Infinity)).toThrow(RangeError);
    });
    it.each([
        ['2021-02-17', '2021-02-01', '2021-03-01'], ['2026-09-03', '2026-08-31', '2026-10-05'],
        ['2026-08-01', '2026-07-27', '2026-09-07'],
    ])('builds the complete grid for %s', (anchorDate, start, end) => {
        expect(getCalendarVisibleRange({anchorDate, timeZone: 'UTC'})).toEqual({start, end, timeZone: 'UTC'});
    });
    it('shares locale defaults, explicit week-start and month identity', () => {
        const options = {anchorDate: '2026-08-19', timeZone: 'Pacific/Apia', locale: 'en-US'};
        expect(getCalendarVisibleRange(options)).toEqual({start: '2026-07-26', end: '2026-09-06', timeZone: 'Pacific/Apia'});
        expect(getCalendarVisibleRange({...options, anchorDate: '2026-08-01'})).toEqual(getCalendarVisibleRange(options));
        expect(getCalendarVisibleRange({...options, firstDayOfWeek: 'monday'}).start).toBe('2026-07-27');
        expect(getCalendarVisibleRange({...options, locale: 'x-company'})).toEqual(getCalendarVisibleRange(options));
    });
    it('supports both anchor boundaries and rejects partial/out-of-domain grids', () => {
        for (const anchorDate of ['0001-02-01', '9999-11-30']) for (const firstDayOfWeek of ['monday', 'sunday', 'saturday'] as const) {
            const result = getCalendarVisibleRange({anchorDate, timeZone: 'UTC', firstDayOfWeek});
            expect([28, 35, 42]).toContain(dateToDay(result.end) - dateToDay(result.start));
        }
        for (const props of [null, {}, {anchorDate: '0001-01-31', timeZone: 'UTC'}, {anchorDate: '9999-12-01', timeZone: 'UTC'},
            {anchorDate: '2026-09-03', timeZone: 'GMT'}, {anchorDate: '2026-09-03', timeZone: 'UTC', locale: 'ru_RU'}]) {
            expect(() => getCalendarVisibleRange(props as never)).toThrow(RangeError);
        }
    });
});

describe('time and range labels (QA-17)', () => {
    const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ');
    it.each([['en-US', '1:05 PM'], ['ja-JP', '午後1:05'], ['en-US-u-nu-arab', '١:٠٥ PM'], ['ru-RU', '1:05 PM']] as const)('never pads a 12-hour hour: %s', (locale, expected) => {
        expect(plain(createDateFormatting(resolveLocale({locale, hourCycle: 12}), 'UTC').time('2026-09-03T13:05:00Z').text)).toBe(expected);
    });
    it.each([['ru-RU', '09:05'], ['de-DE', '09:05'], ['en-US', '09:05'], ['ja-JP', '09:05'], ['he', '09:05'], ['fi-FI', '09.05']] as const)('pads a 24-hour hour in %s', (locale, expected) => {
        expect(createDateFormatting(resolveLocale({locale, hourCycle: 24}), 'UTC').time('2026-09-03T09:05:00Z').text).toBe(expected);
    });
    // QA-D-2-01: midnight in 24-hour mode is "00:…" (§11.2, R59) even where the locale's own short time writes "0:05".
    it.each([['ja-JP', '00:05', '2026年3月4日 00:05'], ['fi-FI', '00.05', '4.3.2026 klo 00.05'], ['he', '00:05', '4 במרץ 2026, 00:05'],
        ['zh-CN', '00:05', '2026年3月4日 00:05']] as const)('pads 24-hour midnight in %s, explicit or from the locale', (locale, time, dateTime) => {
        for (const hourCycle of [24, undefined] as const) {
            const formats = createDateFormatting(resolveLocale({locale, hourCycle}), 'UTC'), instant = Date.parse('2026-03-04T00:05:00Z');
            expect([formats.time(instant).text, formats.dateTime(instant).text]).toEqual([time, dateTime]);
        }
    });
    // QA-D-3 (lead decision 6, §11.2, R59): a 24-hour clock always has a two-digit hour, a 12-hour clock the locale's numeric
    // hour (never "04:00 PM"), for an explicit `hourCycle` and for the cycle of a locale tag.
    it.each([
        ['ja-JP', 12, ['午前12:05', '午後4:00', '午前9:05'], '2026年3月4日 午後4:00'], ['ja-JP', 24, ['00:05', '16:00', '09:05'], '2026年3月4日 16:00'],
        ['fi-FI', 12, ['12.05 ap.', '4.00 ip.', '9.05 ap.'], '4.3.2026 klo 4.00 ip.'], ['fi-FI', 24, ['00.05', '16.00', '09.05'], '4.3.2026 klo 16.00'],
        ['he', 12, ['12:05 AM', '4:00 PM', '9:05 AM'], '4 במרץ 2026, 4:00 PM'], ['he', 24, ['00:05', '16:00', '09:05'], '4 במרץ 2026, 16:00'],
        ['en-US', 12, ['12:05 AM', '4:00 PM', '9:05 AM'], 'Mar 4, 2026, 4:00 PM'], ['en-US', 24, ['00:05', '16:00', '09:05'], 'Mar 4, 2026, 16:00'],
        ['en-US-u-hc-h23', undefined, ['00:05', '16:00', '09:05'], 'Mar 4, 2026, 16:00'], ['en-US-u-hc-h12', undefined, ['12:05 AM', '4:00 PM', '9:05 AM'], 'Mar 4, 2026, 4:00 PM'],
        ['ru-RU', 12, ['12:05 AM', '4:00 PM', '9:05 AM'], '4 мар. 2026 г., 4:00 PM'], ['ru-RU', 24, ['00:05', '16:00', '09:05'], '4 мар. 2026 г., 16:00'],
        ['ru-RU', undefined, ['00:05', '16:00', '09:05'], '4 мар. 2026 г., 16:00'],
    ] as const)('%s with hourCycle %s: midnight, afternoon and morning', (locale, hourCycle, times, dateTime) => {
        const formats = createDateFormatting(resolveLocale({locale, hourCycle}), 'UTC');
        expect(['2026-03-04T00:05:00Z', '2026-03-04T16:00:00Z', '2026-03-04T09:05:00Z'].map(instant => plain(formats.time(instant).text))).toEqual(times);
        expect(plain(formats.dateTime(Date.parse('2026-03-04T16:00:00Z')).text)).toBe(dateTime);
    });
    it('names the date of a same-day timed interval once and keeps both dates across days', () => {
        const formats = createDateFormatting(resolveLocale({locale: 'en-US'}), 'UTC');
        const sameDay = formats.timedRange(Date.parse('2026-09-03T09:00:00Z'), Date.parse('2026-09-03T10:30:00Z')).map(part => plain(part.text)).join('');
        expect(sameDay.split('Sep 3, 2026')).toHaveLength(2); expect(sameDay).toMatch(/9:00.*10:30/);
        const days = formats.timedRange(Date.parse('2026-09-03T22:00:00Z'), Date.parse('2026-09-04T01:00:00Z')).map(part => part.text).join('');
        expect(days).toContain('Sep 3, 2026'); expect(days).toContain('Sep 4, 2026');
        expect(formats.timedRange(Date.parse('2026-09-03T09:00:00Z')).map(part => part.text)).toEqual([formats.dateTime(Date.parse('2026-09-03T09:00:00Z')).text]);
    });
    it('adds the UTC offset only to wall times that a fold repeats', () => {
        const formats = createDateFormatting(resolveLocale({locale: 'en-US', hourCycle: 24}), 'Europe/Berlin');
        const first = formats.time('2026-10-25T00:30:00Z').text, second = formats.time('2026-10-25T01:30:00Z').text;
        expect([first, second]).toEqual(['02:30 GMT+2', '02:30 GMT+1']);
        expect(formats.time('2026-10-25T03:30:00Z').text).toBe('04:30'); expect(formats.time('2026-03-29T01:30:00Z').text).toBe('03:30');
        const fold = formats.timedRange(Date.parse('2026-10-25T00:30:00Z'), Date.parse('2026-10-25T01:30:00Z')).map(part => part.text).join('');
        expect(fold).toContain('GMT+2'); expect(fold).toContain('GMT+1');
    });
    it('gives years below 1000 their era and leaves later years unchanged', () => {
        const en = createDateFormatting(resolveLocale({locale: 'en-US'}), 'UTC'), ru = createDateFormatting(resolveLocale({locale: 'ru-RU'}), 'UTC');
        expect(en.date('0001-02-01', 'month').text).toBe('February 1 AD'); expect(en.date('0099-03-01', 'short').text).toBe('Mar 1, 99 AD');
        expect(ru.date('0001-02-01', 'month').text).toContain('н. э.'); expect(en.date('2026-02-01', 'month').text).toBe('February 2026');
        expect(en.dateTime(Date.parse('0005-01-02T03:00:00Z')).text).toContain('AD'); expect(en.date('0999-01-01', 'day').text).toBe('1');
    });
});
