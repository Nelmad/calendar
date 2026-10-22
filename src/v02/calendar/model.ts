import type {CalendarDataState, CalendarProps, CalendarResolvedLayout, CalendarRootState, CalendarVisibleRange} from '../reference.js';
import {createDateAdapter} from '../core/date.js';
import {createIntervalProjector} from '../core/projection.js';
import {validateConfiguration, validateRecords, type ConfigurationResult, type ValidatedRecords} from '../core/validation.js';
import {resolveLocale, type ResolvedLocale} from '../core/locale.js';
import {contractMessages, createMessages} from '../core/messages.js';
import {createDateFormatting, getCalendarVisibleRange} from '../core/formatting.js';
import {indexRange, orderItems} from '../core/layout.js';
import {isBlocking, monthStart} from '../core/controller.js';
import {createActionResolver, type ActionResolver} from '../core/actions.js';
import {createAppearanceResolver, type AppearanceResolver} from '../core/appearance.js';
import {themeStyle} from '../themes/classic.js';
import {isThemePreset} from '../themes/neutral.js';
import type {CalendarSurface} from '../surface.js';

export type ControllerDiagnostic = Readonly<{path: string; reason: string; key?: string}>;
export function createControllerServices(surface?: CalendarSurface) {
    const dates = createDateAdapter();
    return {dates, projector: createIntervalProjector(dates), isTheme: isThemePreset, surface};
}
type Services = ReturnType<typeof createControllerServices>;
type ContractConfiguration = Extract<ConfigurationResult<unknown, unknown>, {kind: 'contract'}>;
type DataState = Extract<CalendarRootState, {kind: 'data'}>;
const ready: CalendarDataState = Object.freeze({status: 'ready'});

/** Messages whose render-time diagnostics are kept once each until a commit effect drains them. */
function catalogWithDiagnostics(resolved: ResolvedLocale, timeZone: string, messagesLocale: string | undefined, messages: CalendarProps['messages']) {
    const catalog = createMessages(resolved, timeZone, {messagesLocale, messages});
    // Production prints no diagnostics and drains none (useMessageDiagnostics registers no effect there).
    if (process.env.NODE_ENV === 'production') return {...catalog, drain: (): ControllerDiagnostic[] => []};
    const seen = new Set<string>(), pending: ControllerDiagnostic[] = [];
    const message: typeof catalog.message = (key, ...args) => {
        const value = catalog.message(key, ...args);
        for (const diagnostic of value.diagnostics) {
            const id = `${diagnostic.path}: ${diagnostic.reason}`;
            if (!seen.has(id)) { seen.add(id); pending.push(diagnostic); }
        }
        return value;
    };
    return {...catalog, message, drain: (): ControllerDiagnostic[] => pending.splice(0)};
}
type Catalog = ReturnType<typeof catalogWithDiagnostics>;
type Index<I, S> = ReturnType<typeof indexRange<I, S>>;
function contractModel(configuration: ContractConfiguration, input: Pick<CalendarProps, 'locale' | 'messagesLocale' | 'dir' | 'messages'>) {
    const messages = contractMessages(input);
    const state: Extract<CalendarRootState, {kind: 'contract'}> = {kind: 'contract', layout: 'mobile', density: 'compact', colorScheme: 'system',
        dir: messages.dir, dataState: {status: 'error', phase: 'initial', error: configuration.error}};
    return {kind: 'contract', state, messages, lang: messages.lang, blocking: true, diagnostics: configuration.diagnostics as readonly ControllerDiagnostic[]} as const;
}
type Visible<I, S> = ReadonlyMap<string, ValidatedRecords<I, S>['visibleItems'][number]>;
function dataModel<I, S>(props: CalendarProps<I, S>, state: DataState, locale: ResolvedLocale, catalog: Catalog, range: CalendarVisibleRange, blocking: boolean,
    records: ValidatedRecords<I, S>, index: Index<I, S> | null, format: ReturnType<typeof createDateFormatting>, diagnostics: readonly ControllerDiagnostic[],
    actions: ActionResolver<I>, visible: Visible<I, S>, appearance: AppearanceResolver<I, S>) {
    // `visible`: the records that passed the accepted filter, by ID; `actions`: their committed consumer action sets (§5.5);
    // `appearance`: one resolved item appearance for all segments and the agenda row (§10.3.3).
    return {kind: 'data', props, state, lang: locale.locale, locale, message: catalog.message, drainDiagnostics: catalog.drain, range, month: monthStart(props.anchorDate),
        blocking, records, index, hasItems: index?.days.some(day => day.itemCount > 0) ?? false, format, diagnostics, actions, visible, appearance} as const;
}
export type CalendarDataModel<I, S> = ReturnType<typeof dataModel<I, S>>;
export type CalendarModel<I, S> = ReturnType<typeof contractModel> | CalendarDataModel<I, S>;

const sameValues = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
/** One-entry memo of a pure stage: it recomputes only when one of its own inputs changes identity. */
function memoize<A extends readonly unknown[], R>(compute: (...args: A) => R): (...args: A) => R {
    let last: {args: A; value: R} | undefined;
    return (...args) => {
        if (!last || !sameValues(last.args, args)) last = {args, value: compute(...args)};
        return last.value;
    };
}
/** A new props object with the same own values (a parent re-render) is the same configuration. */
function sameProps(a: object, b: object) {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}
/**
 * Per-instance model memo (QA-01). Each pure stage is keyed by exactly the inputs it reads, so a render with
 * unchanged inputs returns the identical model and effects keyed by it do not re-run; a new callback identity or
 * an unrelated prop never re-validates, re-projects or re-sorts unchanged items. A contract error exits before
 * record/layout processing. `layout` is already resolved (§7): forced props pass through, `auto` is measured.
 */
export function createCalendarModel(services: Services) {
    let lastInput: object | undefined, lastConfiguration: ConfigurationResult<unknown, unknown> | undefined;
    const configure = (input: CalendarProps<unknown, unknown>) => {
        if (!lastInput || !lastConfiguration || !sameProps(lastInput, input)) lastConfiguration = validateConfiguration(input, services);
        lastInput = input;
        return lastConfiguration;
    };
    const contract = memoize((configuration: ContractConfiguration, locale: unknown, messagesLocale: unknown, dir: unknown, messages: unknown) =>
        contractModel(configuration, {locale, messagesLocale, dir, messages} as Pick<CalendarProps, 'locale' | 'messagesLocale' | 'dir' | 'messages'>));
    const locale = memoize((value: CalendarProps['locale'], firstDayOfWeek: CalendarProps['firstDayOfWeek'], hourCycle: CalendarProps['hourCycle'], dir: CalendarProps['dir']) =>
        resolveLocale({locale: value, firstDayOfWeek, hourCycle, dir}));
    const catalog = memoize(catalogWithDiagnostics);
    const records = memoize((items: CalendarProps['items'], sources: CalendarProps['sources'], visibleSourceIds: CalendarProps['visibleSourceIds'], untitled: string) =>
        validateRecords({items, sources, visibleSourceIds} as CalendarProps, services.dates, untitled));
    const range = memoize((anchorDate: string, timeZone: string, value: CalendarProps['locale'], firstDayOfWeek: CalendarProps['firstDayOfWeek']) =>
        getCalendarVisibleRange({anchorDate, timeZone, locale: value, firstDayOfWeek}));
    const ordered = memoize((validated: ValidatedRecords<unknown, unknown>, timeZone: string, sortItems: CalendarProps['sortItems']) =>
        orderItems(validated, services.projector, timeZone, sortItems));
    const index = memoize((entries: ReturnType<typeof ordered>, visible: CalendarVisibleRange) => indexRange(entries, visible));
    const tokens = memoize((value: CalendarProps['tokens']): readonly ControllerDiagnostic[] => themeStyle(value).diagnostics);
    // A new `getItemActions` identity resolves again; the pair is validated together, so a lone resolver never reaches here.
    const actions = memoize((getItemActions: CalendarProps['getItemActions']) => createActionResolver(getItemActions));
    // A new resolver identity or calendar zone resolves again; the context carries the zone (§5.7).
    const appearance = memoize((getItemAppearance: CalendarProps['getItemAppearance'], timeZone: string) => createAppearanceResolver(getItemAppearance, timeZone));
    const visibleById = memoize((validated: ValidatedRecords<unknown, unknown>) => new Map(validated.visibleItems.map(record => [record.item.id, record])));
    const format = memoize((resolved: ResolvedLocale, timeZone: string) => createDateFormatting(resolved, timeZone, services.dates));
    const state = memoize((dataState: CalendarDataState, layout: CalendarResolvedLayout, density: CalendarProps['density'], colorScheme: CalendarProps['colorScheme'],
        dir: ResolvedLocale['dir']): DataState => ({kind: 'data', dataState, layout, density: density ?? 'compact', colorScheme: colorScheme ?? 'system', dir}));
    const data = memoize((props: CalendarProps<unknown, unknown>, root: DataState, resolved: ResolvedLocale, messages: Catalog, visible: CalendarVisibleRange, blocking: boolean,
        validated: ValidatedRecords<unknown, unknown>, layout: Index<unknown, unknown> | null, formatting: ReturnType<typeof createDateFormatting>,
        configuration: readonly ControllerDiagnostic[], themeDiagnostics: readonly ControllerDiagnostic[], resolver: ActionResolver<unknown>, byId: Visible<unknown, unknown>,
        colors: AppearanceResolver<unknown, unknown>) =>
        dataModel(props, root, resolved, messages, visible, blocking, validated, layout, formatting, [...configuration, ...resolved.diagnostics, ...messages.diagnostics,
            ...validated.diagnostics, ...themeDiagnostics, ...(layout?.diagnostics.map(value => ({path: 'sortItems', reason: value.reason})) ?? [])], resolver, byId, colors));
    return function calendarModel<I, S>(input: CalendarProps<I, S>, layout: CalendarResolvedLayout = 'mobile'): CalendarModel<I, S> {
        const configuration = configure(input as CalendarProps<unknown, unknown>);
        if (configuration.kind === 'contract') return contract(configuration, input.locale, input.messagesLocale, input.dir, input.messages);
        const props = configuration.props, resolved = locale(props.locale, props.firstDayOfWeek, props.hourCycle, props.dir);
        const messages = catalog(resolved, props.timeZone, props.messagesLocale, props.messages);
        const validated = records(props.items, props.sources, props.visibleSourceIds, messages.message('untitledItemLabel').text);
        const visible = range(props.anchorDate, props.timeZone, props.locale, props.firstDayOfWeek), dataState = props.dataState ?? ready;
        const blocking = isBlocking(dataState);
        const layoutIndex = blocking ? null : index(ordered(validated, props.timeZone, props.sortItems as CalendarProps['sortItems']), visible);
        return data(props, state(dataState, layout, props.density, props.colorScheme, resolved.dir), resolved, messages, visible, blocking, validated,
            layoutIndex, format(resolved, props.timeZone), configuration.diagnostics, tokens(props.tokens),
            actions(props.onItemActionRequest ? props.getItemActions as CalendarProps['getItemActions'] : undefined), visibleById(validated),
            appearance(props.getItemAppearance as CalendarProps['getItemAppearance'], props.timeZone)) as unknown as CalendarDataModel<I, S>;
    };
}
