import type {CalendarItem, CalendarItemAppearance, CalendarItemAppearanceContext, CalendarSource, IanaTimeZone} from '../reference.js';
import {isDeclarationValue} from './cssValue.js';

export type AppearanceDiagnostic = Readonly<{path: string; reason: string}>;
/**
 * The resolved item colors of §10.3.3, one per item for all its segments and its agenda row. Each field is a CSS color
 * declaration value of its own channel layer; an absent field leaves the lower layer (source, then theme/tokens).
 */
export type ResolvedAppearance = Readonly<{sourceAccent?: string; accent?: string; background?: string; text?: string}>;
type AppearanceRecord<I, S> = Readonly<{item: CalendarItem<I>; source: CalendarSource<S> | undefined}>;
type Resolver<I, S> = (item: CalendarItem<I>, context: CalendarItemAppearanceContext<S>) => CalendarItemAppearance | undefined;

const none: ResolvedAppearance = Object.freeze({});
const fields = [['accentColor', 'accent'], ['backgroundColor', 'background'], ['textColor', 'text']] as const;
/**
 * One consumer color as a declaration value, or the reason it is absent. Runtime non-string and blank values are absent
 * (§10.3.3). A string that is not exactly one declaration value is absent too: a style attribute would read its `;`,
 * `!important` or comment as further declarations on the server, while the client assignment rejects the whole value
 * (R63 requires the same server and client declarations). Nothing else is checked: a well-formed non-color reaches the
 * CSS engine, which rejects it at assignment so the lower channel stays.
 */
export function colorValue(value: unknown): {value?: string; reason?: string} {
    if (value === undefined) return {};
    if (typeof value !== 'string' || !value.trim()) return {reason: 'Expected a nonempty CSS color string; ignored'};
    if (!isDeclarationValue(value)) return {reason: 'Expected a single CSS declaration value; ignored'};
    return {value};
}
const isObject = (value: unknown): value is {[key: string]: unknown} => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Item appearance resolution (§4.2, §10.3.3): the accent of a known source, then the independent partial fields of
 * `getItemAppearance`. The resolver gets the item and `{timeZone, source}` only, never a segment or date, and runs at most
 * once per validated record (an item with its source) and resolver identity, so every segment and the agenda row share
 * one result. Diagnostics are data for a commit effect, once per record.
 */
export function createAppearanceResolver<I, S>(getItemAppearance: Resolver<I, S> | undefined, timeZone: IanaTimeZone) {
    const resolved = new WeakMap<object, ResolvedAppearance>(), accents = new WeakMap<object, string | undefined>(), pending: AppearanceDiagnostic[] = [];
    /** The accent marker of a known source, also used by the source selector; checked once per source object. */
    const sourceAccent = (source: CalendarSource<S> | undefined) => {
        if (!source) return undefined;
        if (accents.has(source)) return accents.get(source);
        const color = colorValue(source.color);
        if (color.reason) pending.push({path: `sources("${source.id}").color`, reason: color.reason});
        accents.set(source, color.value);
        return color.value;
    };
    const resolve = (record: AppearanceRecord<I, S>): ResolvedAppearance => {
        const cached = resolved.get(record);
        if (cached) return cached;
        const result: {-readonly [K in keyof ResolvedAppearance]: ResolvedAppearance[K]} = {};
        // Unknown and invalid sources were dropped by validation: the item keeps the base accent (§5.6).
        const accent = sourceAccent(record.source);
        if (accent !== undefined) result.sourceAccent = accent;
        if (getItemAppearance) {
            const output: unknown = getItemAppearance(record.item, record.source ? {timeZone, source: record.source} : {timeZone});
            const path = `getItemAppearance("${record.item.id}")`;
            if (output !== undefined && !isObject(output)) pending.push({path, reason: 'Expected an appearance object or undefined; ignored'});
            else if (output) for (const [field, channel] of fields) {
                const color = colorValue(output[field]);
                if (color.reason) pending.push({path: `${path}.${field}`, reason: color.reason});
                else if (color.value !== undefined) result[channel] = color.value;
            }
        }
        const value = Object.keys(result).length ? Object.freeze(result) : none;
        resolved.set(record, value);
        return value;
    };
    return {resolve, sourceAccent, drain: (): AppearanceDiagnostic[] => pending.splice(0)};
}
export type AppearanceResolver<I, S> = ReturnType<typeof createAppearanceResolver<I, S>>;
