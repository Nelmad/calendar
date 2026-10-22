import type {CalendarDirection, CalendarHourCycle, CalendarWeekday} from '../reference.js';
import {isLocaleTag} from './localeTag.js';

export const weekdays: readonly CalendarWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export type LocaleDiagnostic = Readonly<{code: 'unsupported-locale' | 'invalid-message'; path: string; reason: string}>;
export type LocaleOptions = Readonly<{locale?: string | undefined; firstDayOfWeek?: CalendarWeekday | undefined; hourCycle?: CalendarHourCycle | undefined; dir?: CalendarDirection | undefined}>;
type LocaleInfo = Intl.Locale & {
    getWeekInfo?: () => {firstDay: number}; weekInfo?: {firstDay: number};
    getTextInfo?: () => {direction: string}; textInfo?: {direction: string};
    getHourCycles?: () => string[]; hourCycles?: string[];
};

export function resolveDateLocale(value: unknown = 'ru-RU') {
    if (!isLocaleTag(value)) throw new RangeError('locale must be a well-formed BCP 47 tag');
    let supported: string | undefined;
    try { supported = Intl.DateTimeFormat.supportedLocalesOf([value], {localeMatcher: 'lookup'})[0]; }
    catch (error) { if (!(error instanceof RangeError)) throw error; }
    // Keep supported scripts/region/extensions, including fw/nu/hc, even when a
    // formatter ignores some of them. Never negotiate through the host default.
    const locale = supported ?? 'en-US';
    const diagnostics: LocaleDiagnostic[] = supported ? [] : [{code: 'unsupported-locale', path: 'locale', reason: `${value} is unsupported; using en-US`}];
    return {locale, diagnostics};
}

/** ICU rejects some well-formed tags in a locale-info getter (an unknown `-u-nu-` value throws in getHourCycles). */
function localeInfo<T>(read: () => T): T | undefined {
    try { return read(); } catch (error) { if (!(error instanceof RangeError)) throw error; return undefined; }
}
export function localePreferences(locale: string) {
    const info = new Intl.Locale(locale, {calendar: 'gregory'}) as LocaleInfo;
    const week = localeInfo(() => info.getWeekInfo?.() ?? info.weekInfo);
    const text = localeInfo(() => info.getTextInfo?.() ?? info.textInfo);
    // Without locale info the formatter's own resolved hour cycle decides, the same in Node and the browser (R65).
    const cycle = localeInfo(() => info.getHourCycles?.() ?? info.hourCycles)?.[0]
        ?? (new Intl.DateTimeFormat(locale, {localeMatcher: 'lookup', calendar: 'gregory', timeZone: 'UTC', hour: 'numeric'}).resolvedOptions() as
            Intl.ResolvedDateTimeFormatOptions & {hourCycle?: string}).hourCycle;
    return {
        firstDayOfWeek: weekdays[(week?.firstDay ?? 1) - 1] ?? 'monday',
        hourCycle: (cycle === 'h11' || cycle === 'h12' ? 12 : 24) as CalendarHourCycle,
        dir: (text?.direction === 'rtl' ? 'rtl' : 'ltr') as CalendarDirection,
    };
}
export function localeDirection(locale: string): CalendarDirection {
    try {
        const info = new Intl.Locale(locale) as LocaleInfo;
        return (info.getTextInfo?.() ?? info.textInfo)?.direction === 'rtl' ? 'rtl' : 'ltr';
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return 'ltr';
    }
}

export function resolveLocale(options: LocaleOptions = {}) {
    const {locale, diagnostics} = resolveDateLocale(options.locale);
    if (options.firstDayOfWeek !== undefined && !weekdays.includes(options.firstDayOfWeek)) throw new RangeError('Invalid firstDayOfWeek');
    if (options.hourCycle !== undefined && options.hourCycle !== 12 && options.hourCycle !== 24) throw new RangeError('Invalid hourCycle');
    if (options.dir !== undefined && options.dir !== 'ltr' && options.dir !== 'rtl') throw new RangeError('Invalid dir');
    const defaults = localePreferences(locale);
    return {locale, diagnostics, firstDayOfWeek: options.firstDayOfWeek ?? defaults.firstDayOfWeek,
        hourCycle: options.hourCycle ?? defaults.hourCycle, dir: options.dir ?? defaults.dir};
}
export type ResolvedLocale = ReturnType<typeof resolveLocale>;

export function catalogLocale(value: string): 'ru-RU' | 'en-US' {
    return /^ru(?:-|$)/i.test(value) ? 'ru-RU' : 'en-US';
}
