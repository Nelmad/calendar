import type {CalendarDateRange, CalendarVisibleRange, CalendarVisibleRangeOptions} from '../reference.js';
import {addCalendarDays, createDateAdapter, MAX_INSTANT, MIN_INSTANT, parseAnchorDate, parseDateRange, parseISODate, parseRFC3339, UTC_DAY_MS} from './date.js';
import {dateToDay, dayToDate} from './projection.js';
import {localeDirection, resolveLocale, weekdays, type ResolvedLocale} from './locale.js';

export type TextFragment = Readonly<{text: string; lang?: string; dir: 'ltr' | 'rtl' | 'auto'; kind: 'message' | 'date' | 'user'; isolate?: boolean}>;
export type LocalizedText = Readonly<{lang: string; dir: 'ltr' | 'rtl'; fragments: readonly TextFragment[]; text: string}>;
/** Plain text attributes cannot carry nested lang; keep directional isolation. */
export function isolatedText(fragments: readonly TextFragment[]): string {
    return fragments.map(part => part.kind === 'message' && !part.isolate ? part.text : `\u2068${part.text}\u2069`).join('');
}
export const userText = (text: string): TextFragment => ({text, dir: 'auto', kind: 'user'});

const wordCharacter = /[\p{L}\p{M}\p{N}]/u;
/**
 * Occurrences of an interpolated value. A value that begins or ends with a letter is not taken from inside a literal word
 * ("Hid|e| e", "Acti|on|s for on"): when the text has an occurrence whose word-character edges are not glued to further
 * word characters, only such occurrences count; otherwise every occurrence does (a script without spaces) (review 2026-10-09-2).
 */
function valueLocator(text: string, value: string) {
    const isolated = (at: number) => !(wordCharacter.test(value[0]) && wordCharacter.test(text[at - 1] ?? ''))
        && !(wordCharacter.test(value[value.length - 1]) && wordCharacter.test(text[at + value.length] ?? ''));
    let strict = false;
    for (let at = text.indexOf(value); at !== -1 && !strict; at = text.indexOf(value, at + 1)) strict = isolated(at);
    return (cursor: number) => {
        let at = text.indexOf(value, cursor);
        while (strict && at !== -1 && !isolated(at)) at = text.indexOf(value, at + 1);
        return at;
    };
}
/** Recover verbatim interpolations after the one call with unchanged semantic arguments. */
export function messageFragments(text: string, literal: Omit<TextFragment, 'text'>, arguments_: readonly TextFragment[]): readonly TextFragment[] {
    const values = arguments_.filter(part => part.text.length > 0), locators = values.map(value => valueLocator(text, value.text));
    const fragments: TextFragment[] = [];
    let cursor = 0;
    while (cursor < text.length) {
        let next: TextFragment | undefined;
        let position = text.length;
        for (const [index, value] of values.entries()) {
            const found = locators[index](cursor);
            // At the same position the longest value owns the whole interpolation.
            if (found !== -1 && (found < position || (found === position && value.text.length > (next?.text.length ?? 0)))) {
                next = value;
                position = found;
            }
        }
        if (position > cursor) fragments.push({...literal, text: text.slice(cursor, position)});
        if (!next) break;
        fragments.push({...next, isolate: true});
        cursor = position + next.text.length;
    }
    return fragments;
}

export function createDateFormatting(resolved: ResolvedLocale, timeZone: string, dates = createDateAdapter()) {
    dates.validateTimeZone(timeZone);
    const cache = new Map<string, Intl.DateTimeFormat>();
    const formatter = (kind: string, options: Intl.DateTimeFormatOptions, zone = 'UTC') => {
        let result = cache.get(kind);
        if (!result) {
            result = new Intl.DateTimeFormat(resolved.locale, {...options, localeMatcher: 'lookup', calendar: 'gregory', timeZone: zone});
            cache.set(kind, result);
        }
        return result;
    };
    // A date or time is text of the date locale's script: its direction is that script's, whatever layout `dir` the
    // consumer chose (§11.2); an LTR date in an RTL-overridden calendar keeps its order (review 2026-10-09-2).
    const textDir = localeDirection(resolved.locale);
    const fragment = (text: string): TextFragment => ({text, lang: resolved.locale, dir: textDir, kind: 'date'});
    // QA-17: a 12-hour clock never pads the hour ("4:00 PM"). QA-D-2-01: a 24-hour clock always pads it, so midnight is
    // "00:…" in every locale (§11.2, R59), including those whose own short time writes "0:05" (ja-JP, fi-FI).
    const hourCycle = resolved.hourCycle === 12 ? 'h12' : 'h23', hour = hourCycle === 'h12' ? 'numeric' : '2-digit';
    // QA-17: a year below 1000 carries its era, so "February 1 AD" never reads as a day or as 2001.
    const date = (value: string, style: 'full' | 'short' | 'month' | 'weekday' | 'weekdayShort' | 'weekdayNarrow' | 'day' = 'full') => {
        const parsed = parseISODate(value), early = parsed.year < 1000 && ['full', 'short', 'month'].includes(style);
        const options: Record<typeof style, Intl.DateTimeFormatOptions> = {
            full: {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'},
            short: {year: 'numeric', month: 'short', day: 'numeric'}, month: {year: 'numeric', month: 'long'},
            weekday: {weekday: 'long'}, weekdayShort: {weekday: 'short'}, weekdayNarrow: {weekday: 'narrow'}, day: {day: 'numeric'},
        };
        return fragment(formatter(early ? `${style}-era` : style, {...options[style], ...(early ? {era: 'short'} : {})}).format(dateToDay(value) * UTC_DAY_MS));
    };
    // QA-17: a wall time that a fold repeats (Berlin 02:30 twice) names its UTC offset. Offsets change at most once in
    // 72 h (T07), so equal offsets a day before and two days after a UTC day mean no fold in it; that check is cached.
    const offsetAt = (value: number) => dates.projectInstant(Math.min(MAX_INSTANT, Math.max(MIN_INSTANT, value)), timeZone).offsetMilliseconds;
    const calmDays = new Map<number, boolean>();
    const ambiguous = (instant: number) => {
        const day = Math.floor(instant / UTC_DAY_MS);
        let calm = calmDays.get(day);
        if (calm === undefined) {
            if (calmDays.size >= 512) calmDays.clear();
            calm = offsetAt((day - 1) * UTC_DAY_MS) === offsetAt((day + 2) * UTC_DAY_MS);
            calmDays.set(day, calm);
        }
        if (calm) return false;
        const own = offsetAt(instant);
        return [offsetAt(instant - UTC_DAY_MS), offsetAt(instant + UTC_DAY_MS)].some(other => other !== own && offsetAt(instant + own - other) === other);
    };
    const timeOptions = (seconds: boolean, offset: boolean): Intl.DateTimeFormatOptions => ({hour, minute: '2-digit', ...(seconds ? {second: '2-digit'} : {}),
        hourCycle, ...(offset ? {timeZoneName: 'shortOffset'} : {})});
    const time = (value: string | number, seconds = false) => {
        const instant = typeof value === 'string' ? parseRFC3339(value) : value;
        dates.projectInstant(instant, timeZone); // Validate numeric instant bounds too.
        const offset = ambiguous(instant);
        return fragment(formatter(`time-${seconds}-${offset}`, timeOptions(seconds, offset), timeZone).format(instant));
    };
    const range = (value: CalendarDateRange): readonly TextFragment[] => {
        const accepted = parseDateRange(value), last = addCalendarDays(accepted.end, -1);
        return last === accepted.start ? [date(accepted.start, 'short')] : [date(accepted.start, 'short'), fragment(' – '), date(last, 'short')];
    };
    const dateTimeFormatter = (instant: number, offset: boolean) => {
        const year = dates.projectInstant(instant, timeZone).year;
        return formatter(`dateTime-${year < 1000}-${offset}`, {year: 'numeric', month: 'short', day: 'numeric', ...(year < 1000 ? {era: 'short'} : {}),
            ...timeOptions(false, offset)}, timeZone);
    };
    const dateTime = (instant: number) => fragment(dateTimeFormatter(instant, ambiguous(instant)).format(instant));
    /**
     * A timed interval as one label: a date shared by both ends is shown once ("Mar 4, 2026, 10:30 AM – 11:30 AM", QA-17).
     * Built from `format` like every other label: ICU versions differ in the spaces `formatRange` writes, which would make
     * server and client text differ.
     */
    const timedRange = (start: number, end?: number): readonly TextFragment[] => {
        if (end === undefined) return [dateTime(start)];
        const sameDate = end !== start && dates.projectInstant(start, timeZone).date === dates.projectInstant(end, timeZone).date;
        return end === start ? [dateTime(start)] : [dateTime(start), fragment(' – '), sameDate ? time(end) : dateTime(end)];
    };
    return {date, time, range, dateTime, timedRange};
}

/**
 * The exact visible range of the Month that `Calendar` renders for these options: whole weeks from the first day of the
 * week on or before the first of the anchor month, with an exclusive `end`. Pure (no clock, no host time zone), so a
 * server can compute the initial fetch range before rendering. Throws `RangeError` for an invalid anchor date, time zone,
 * locale or first day of the week.
 */
export function getCalendarVisibleRange(options: CalendarVisibleRangeOptions): CalendarVisibleRange {
    if (!options || typeof options !== 'object') throw new RangeError('Expected visible range options');
    const anchor = parseAnchorDate(options.anchorDate);
    const timeZone = createDateAdapter().validateTimeZone(options.timeZone);
    const locale = resolveLocale({locale: options.locale, firstDayOfWeek: options.firstDayOfWeek});
    const first = dateToDay(`${String(anchor.year).padStart(4, '0')}-${String(anchor.month).padStart(2, '0')}-01`);
    // 1970-01-01 was Thursday (Monday index 3), including negative ordinals.
    const weekday = ((first + 3) % 7 + 7) % 7;
    const start = first - (weekday - weekdays.indexOf(locale.firstDayOfWeek) + 7) % 7;
    const nextMonth = dateToDay(anchor.set({day: 1}).add({months: 1}).toString());
    const end = start + Math.ceil((nextMonth - start) / 7) * 7;
    return {start: dayToDate(start), end: dayToDate(end), timeZone};
}
