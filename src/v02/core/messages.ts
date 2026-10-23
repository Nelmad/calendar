import type {CalendarMessages, CalendarItem} from '../reference.js';
import {createBuiltinCatalog, type MessageArguments} from './catalogs.js';
import {createDateFormatting, isolatedText, messageFragments, userText, type LocalizedText, type TextFragment} from './formatting.js';
import {catalogLocale, localeDirection, resolveDateLocale, resolveLocale, type LocaleDiagnostic, type ResolvedLocale} from './locale.js';
import {isLocaleTag} from './localeTag.js';

const hasText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const titleKeys = new Set<keyof CalendarMessages>(['itemActionsLabel', 'moveStartedAnnouncement', 'moveNavigationPendingLabel', 'moveTargetAnnouncement',
    'moveCancelledAnnouncement', 'moveNoopAnnouncement', 'movePendingAnnouncement', 'moveSucceededAnnouncement', 'moveRejectedAnnouncement']);
const otherTextArguments: Partial<Record<keyof CalendarMessages, readonly number[]>> = {
    showSourceLabel: [0], hideSourceLabel: [0], blockedAnnouncement: [0], moveDstGapReason: [1],
    moveTargetAnnouncement: [3], moveCancelledAnnouncement: [1], moveRejectedAnnouncement: [1],
};
export const snapshotItemTitle = (item: Pick<CalendarItem, 'title'>): string => item.title;

export function createMessages(resolved: ResolvedLocale, timeZone: string, options: {messagesLocale?: string | undefined; messages?: Partial<CalendarMessages> | undefined} = {}) {
    const requested = options.messagesLocale ?? resolved.locale;
    if (!isLocaleTag(requested)) throw new RangeError('messagesLocale must be a well-formed BCP 47 tag');
    const lang = catalogLocale(requested);
    const dates = createDateFormatting(resolved, timeZone);
    const catalog = createBuiltinCatalog(lang, dates, () => ({...message('untitledItemLabel').fragments[0], isolate: true}));
    const source = options.messages;
    const validSource = source === undefined || (!!source && typeof source === 'object' && !Array.isArray(source));
    const overrides = validSource ? source : undefined;
    const overrideDir = localeDirection(requested);
    const invalid = (key: string): LocaleDiagnostic => ({code: 'invalid-message', path: `messages.${key}`, reason: 'Expected a nonempty message of the declared shape; using built-in fallback'});
    const diagnostics: readonly LocaleDiagnostic[] = validSource ? [] : [invalid('*')];
    function message<K extends keyof CalendarMessages>(key: K, ...args: MessageArguments<K>): LocalizedText & {diagnostics: readonly LocaleDiagnostic[]} {
        const fallback = catalog[key];
        const override: unknown = overrides?.[key];
        const titleFallback = titleKeys.has(key) && !hasText(args[0]) ? message('untitledItemLabel') : undefined;
        let value: unknown;
        const interpolations: TextFragment[] = [];
        if (typeof fallback === 'function' && typeof override === 'function') {
            // Consumer resolvers get semantic plain values, never HTML or bidi
            // control characters added by the package. Titles use current fallback.
            const values: unknown[] = [...args];
            if (titleFallback) values[0] = titleFallback.fragments.map(part => part.text).join('');
            value = override(...values);
            if (titleKeys.has(key)) interpolations.push(titleFallback ? titleFallback.fragments[0] : userText(values[0] as string));
            for (const index of otherTextArguments[key] ?? []) {
                const argument = values[index];
                if (typeof argument === 'string') interpolations.push(userText(argument));
            }
        } else if (typeof fallback === 'string' && typeof override === 'string') value = override;
        let fragments: readonly TextFragment[];
        let actualLang: string;
        if (hasText(value)) {
            actualLang = requested;
            fragments = messageFragments(value, {lang: requested, dir: overrideDir, kind: 'message'}, interpolations);
        } else {
            actualLang = lang;
            fragments = typeof fallback === 'string' ? [{text: fallback, lang, dir: 'ltr', kind: 'message'}]
                : (fallback as (...values: unknown[]) => readonly TextFragment[])(...args);
        }
        return {lang: actualLang, dir: hasText(value) ? overrideDir : 'ltr', fragments, text: isolatedText(fragments),
            diagnostics: [...(titleFallback?.diagnostics ?? []), ...(override !== undefined && !hasText(value) ? [invalid(key)] : [])]};
    }
    return {lang, messagesLocale: requested, message, diagnostics};
}

/** Safe-shell localization only: no date math with invalid props or other resolvers. */
export function contractMessages(input: {locale?: unknown; messagesLocale?: unknown; dir?: unknown; messages?: Partial<CalendarMessages>}) {
    const validMessages = isLocaleTag(input.messagesLocale);
    const dateLocale = input.locale === undefined ? 'ru-RU' : input.locale;
    const validLocale = isLocaleTag(dateLocale);
    const resolvedDateLocale = validLocale ? resolveDateLocale(dateLocale).locale : undefined;
    const requested = validMessages ? input.messagesLocale as string : resolvedDateLocale ?? 'ru-RU';
    const lang = catalogLocale(requested);
    // The direction of the same resolved locale as the data state (an unsupported RTL tag resolves to en-US, ltr).
    const derivedDir = resolvedDateLocale ? localeDirection(resolvedDateLocale) : 'ltr';
    const dir = input.dir === 'ltr' || input.dir === 'rtl' ? input.dir : derivedDir;
    // Only the specifically permitted error override is evaluated in this path.
    const useOverrides = validMessages || (input.messagesLocale === undefined && validLocale);
    const override = useOverrides ? input.messages?.invalidConfigurationLabel : undefined;
    const messages = createMessages(resolveLocale({locale: lang}), 'UTC', {messagesLocale: requested,
        messages: override === undefined ? undefined : {invalidConfigurationLabel: override}});
    return {lang, dir, calendarLabel: messages.message('calendarLabel'), invalidConfigurationLabel: messages.message('invalidConfigurationLabel')};
}
