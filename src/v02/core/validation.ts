import {parseAnchorDate, parseDateRange, parseISODate, type CanonicalInterval, type createDateAdapter} from './date.js';
import {isLocaleTag} from './localeTag.js';
import type {
    CalendarItem, CalendarItemAction, CalendarLayout, CalendarMoveState, CalendarProps, CalendarSource, CalendarTheme,
} from '../reference.js';
import type {CalendarSurface} from '../surface.js';

export type Diagnostic = Readonly<{
    code: 'configuration' | 'invalid-record' | 'duplicate-id' | 'empty-title' | 'unknown-source' | 'ignored-filter-id';
    path: string;
    reason: string;
    // Reported once per key and instance; defaults to path and reason.
    key?: string;
}>;
type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const present = (object: RecordValue, name: string) => object[name] !== undefined;
type Dates = ReturnType<typeof createDateAdapter>;
export type ValidationServices = Readonly<{
    dates: Dates;
    // Supplied by the private theme module once presets exist; never structural branding.
    isTheme: (value: unknown) => value is CalendarTheme;
    // Present only behind the public facade: a prerelease restricts and may require layouts.
    surface?: CalendarSurface | undefined;
}>;
export type ConfigurationResult<I, S> =
    | {kind: 'valid'; props: CalendarProps<I, S>; diagnostics: readonly Diagnostic[]}
    | {kind: 'contract'; error: RangeError; diagnostics: readonly Diagnostic[]};

const callbackNames = [
    'onNavigate', 'onVisibleRangeChange', 'onAgendaDateChange', 'onSelectionChange', 'onCreateRequest',
    'onVisibleSourceIdsChange', 'onItemMoveRequest', 'onItemMoveDraftChange', 'getItemActions',
    'onItemActionRequest', 'onRetryRequest', 'onItemPress', 'getItemAppearance', 'sortItems',
    'renderItem', 'renderAgendaItem', 'renderDayHeader', 'renderToolbarContent', 'renderLoading', 'renderEmpty', 'renderError',
] as const;
const pairs = [
    ['agendaDate', 'onAgendaDateChange'], ['selection', 'onSelectionChange'],
    ['visibleSourceIds', 'onVisibleSourceIdsChange'], ['itemMoveStates', 'onItemMoveRequest'],
    ['getItemActions', 'onItemActionRequest'],
] as const;
const enums = {
    firstDayOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    hourCycle: [12, 24], dir: ['ltr', 'rtl'], layout: ['auto', 'desktop', 'mobile'],
    agendaPresentation: ['auto', 'overlay'], density: ['compact', 'comfortable'],
    colorScheme: ['system', 'light', 'dark'],
} as const;

/** Pure validation only. Safe-shell rendering, locale negotiation and callback cleanup belong to T08/T10. */
export function validateConfiguration<I = unknown, S = unknown>(input: unknown, services: ValidationServices): ConfigurationResult<I, S> {
    const diagnostics: Diagnostic[] = [];
    const issue = (path: string, reason: string) => diagnostics.push({code: 'configuration', path, reason});
    const check = (path: string, operation: () => unknown) => {
        try { operation(); }
        catch (error) {
            // Runtime/implementation errors must not be disguised as consumer input errors.
            if (!(error instanceof RangeError)) throw error;
            issue(path, error.message);
        }
    };
    if (!isRecord(input)) issue('props', 'Expected a props object');
    else {
        // A missing required prop says so instead of reporting why `undefined` does not parse (QA-23).
        for (const [path, expected] of [['items', 'a readonly array'], ['anchorDate', 'an ISO date such as 2026-09-01'],
            ['timeZone', 'an IANA time zone such as Europe/Moscow'], ['onNavigate', 'a function']] as const) {
            if (!present(input, path)) issue(path, `Required; expected ${expected}`);
        }
        if (present(input, 'anchorDate')) check('anchorDate', () => parseAnchorDate(input.anchorDate));
        if (present(input, 'timeZone')) check('timeZone', () => services.dates.validateTimeZone(input.timeZone));
        for (const path of ['today', 'agendaDate']) if (present(input, path)) check(path, () => parseISODate(input[path]));
        if (present(input, 'selection') && input.selection !== null) check('selection', () => parseDateRange(input.selection));
        const surface = services.surface;
        for (const [path, values] of Object.entries(enums)) {
            if (path === 'layout' && surface) continue;
            if (present(input, path) && !(values as readonly unknown[]).includes(input[path])) issue(path, 'Unknown enum value');
        }
        // A missing layout means the default 'auto'; it is required only while 'auto' is unavailable.
        if (surface && !surface.layouts.includes((present(input, 'layout') ? input.layout : 'auto') as CalendarLayout)) {
            // A reference layout outside this prerelease is unsupported in it; any other value is unknown (review 2026-10-09-3).
            const reason = !present(input, 'layout') ? `Required in ${surface.version}` : enums.layout.includes(input.layout as CalendarLayout) ? `Unsupported in ${surface.version}` : 'Unknown enum value';
            issue('layout', `${reason}; expected ${surface.layouts.map(value => `'${value}'`).join(' or ')}`);
        }
        if (present(input, 'mobileBreakpoint') && (typeof input.mobileBreakpoint !== 'number' || !Number.isFinite(input.mobileBreakpoint) || input.mobileBreakpoint <= 0)) {
            issue('mobileBreakpoint', 'Expected a positive finite number');
        }
        for (const path of ['locale', 'messagesLocale']) if (present(input, path)) {
            if (!isLocaleTag(input[path])) issue(path, 'Expected a well-formed BCP 47 language tag');
        }
        for (const path of callbackNames) {
            if (present(input, path) && typeof input[path] !== 'function') issue(path, 'Expected a function');
        }
        for (const [value, callback] of pairs) {
            if (present(input, value) !== present(input, callback)) issue(value, `Must be supplied together with ${callback}`);
        }
        for (const path of ['items', 'sources', 'visibleSourceIds', 'itemMoveStates']) {
            if (present(input, path) && !Array.isArray(input[path])) issue(path, 'Expected a readonly array');
        }
        if (present(input, 'visibleSourceIds') && !Array.isArray(input.sources)) issue('sources', 'Controlled source filtering requires sources');
        for (const [path, required] of [['onCreateRequest', 'selection'], ['onItemMoveDraftChange', 'itemMoveStates'], ['showSourceSelector', 'visibleSourceIds']]) {
            if (present(input, path) && !present(input, required)) issue(path, `Requires ${required} and its callback`);
        }
        if (present(input, 'showSourceSelector') && typeof input.showSourceSelector !== 'boolean') issue('showSourceSelector', 'Expected a boolean');
        if (present(input, 'dataState')) {
            const state = input.dataState;
            if (!isRecord(state) || !['ready', 'loading', 'error'].includes(state.status as string)) issue('dataState', 'Unknown data state');
            else if (state.status !== 'ready') {
                if (state.phase !== 'initial' && state.phase !== 'refresh') issue('dataState.phase', 'Expected initial or refresh');
                if (state.status === 'error' && !('error' in state)) issue('dataState.error', 'Error state requires an error payload');
            }
        }
        if (present(input, 'interactionPolicy')) {
            if (!isRecord(input.interactionPolicy)) issue('interactionPolicy', 'Expected a policy object');
            else for (const name of ['canSelectDate', 'canSelectRange', 'canMoveItem', 'canDropItem']) {
                if (present(input.interactionPolicy, name) && typeof input.interactionPolicy[name] !== 'function') issue(`interactionPolicy.${name}`, 'Expected a function');
            }
        }
        if (present(input, 'theme') && !services.isTheme(input.theme)) issue('theme', 'Expected a package theme preset');
        // §10.4: each class field is a string or a pure callback; a callback's result is checked when it is used.
        if (present(input, 'classNames')) {
            if (!isRecord(input.classNames)) issue('classNames', 'Expected an object of class names');
            else for (const [name, value] of Object.entries(input.classNames)) {
                if (value !== undefined && typeof value !== 'string' && typeof value !== 'function') issue(`classNames.${name}`, 'Expected a class name string or function');
            }
        }
        // CSS values, message fallback, ARIA IDREF and portal connectivity have their own
        // recoverable contracts. They are intentionally not promoted to fatal errors here.
    }
    if (diagnostics.length) return {kind: 'contract', error: new RangeError(`${diagnostics[0].path}: ${diagnostics[0].reason}`), diagnostics};
    return {kind: 'valid', props: input as CalendarProps<I, S>, diagnostics};
}

/** Count IDs before validating records so an invalid duplicate cannot let its sibling win. */
function duplicateIDs(records: readonly unknown[], key = 'id'): ReadonlySet<string> {
    const seen = new Set<string>(), duplicates = new Set<string>();
    for (const record of records) if (isRecord(record) && hasText(record[key])) {
        const id = record[key] as string;
        if (seen.has(id)) duplicates.add(id);
        seen.add(id);
    }
    return duplicates;
}
export type ValidatedItem<I, S> = Readonly<{
    item: CalendarItem<I>;
    interval: CanonicalInterval;
    source: CalendarSource<S> | undefined;
    title: string;
    visible: boolean;
}>;
export type ValidatedRecords<I, S> = Readonly<{
    items: readonly ValidatedItem<I, S>[];
    visibleItems: readonly ValidatedItem<I, S>[];
    sources: readonly CalendarSource<S>[];
    // undefined means uncontrolled; [] is a controlled empty set.
    visibleSourceIds: readonly string[] | undefined;
    diagnostics: readonly Diagnostic[];
}>;

export function validateRecords<I, S>(props: CalendarProps<I, S>, dates: Dates, untitledItemLabel: string): ValidatedRecords<I, S> {
    const diagnostics: Diagnostic[] = [];
    const sourceDuplicates = duplicateIDs(props.sources ?? []), itemDuplicates = duplicateIDs(props.items);
    const sources: CalendarSource<S>[] = [];
    for (const [index, value] of (props.sources ?? []).entries()) {
        const path = `sources[${index}]`;
        if (isRecord(value) && sourceDuplicates.has(value.id as string)) diagnostics.push({code: 'duplicate-id', path, reason: 'All sources with this ID are excluded'});
        else if (!isRecord(value) || !hasText(value.id) || !hasText(value.title)) diagnostics.push({code: 'invalid-record', path, reason: 'Source requires nonempty id and title'});
        else sources.push(value);
    }
    const byID = new Map(sources.map(source => [source.id, source]));
    let visibleSourceIds: string[] | undefined;
    if (props.visibleSourceIds !== undefined) {
        const seen = new Set<string>();
        for (const [index, id] of props.visibleSourceIds.entries()) {
            if (typeof id !== 'string' || !byID.has(id) || seen.has(id)) diagnostics.push({code: 'ignored-filter-id', path: `visibleSourceIds[${index}]`, reason: 'Unknown or repeated source ID'});
            else seen.add(id);
        }
        visibleSourceIds = sources.filter(source => seen.has(source.id)).map(source => source.id);
    }
    const visible = visibleSourceIds === undefined ? undefined : new Set(visibleSourceIds);
    const items: ValidatedItem<I, S>[] = [];
    let unknownSource = false;
    const unknownIDs = new Set<string>();
    for (const [index, value] of props.items.entries()) {
        const path = `items[${index}]`;
        if (isRecord(value) && itemDuplicates.has(value.id as string)) {
            diagnostics.push({code: 'duplicate-id', path, reason: 'All items with this ID are excluded'});
            continue;
        }
        if (!isRecord(value) || !hasText(value.id) || typeof value.title !== 'string' || (value.calendarId !== undefined && typeof value.calendarId !== 'string')) {
            diagnostics.push({code: 'invalid-record', path, reason: 'Invalid item id, title or calendarId'});
            continue;
        }
        let interval: CanonicalInterval;
        try { interval = dates.parseInterval(value.interval); }
        catch (error) {
            if (!(error instanceof RangeError)) throw error;
            diagnostics.push({code: 'invalid-record', path: `${path}.interval`, reason: error.message});
            continue;
        }
        const source = value.calendarId === undefined ? undefined : byID.get(value.calendarId);
        if (value.calendarId !== undefined && !source) {
            unknownSource = true;
            // With sources (alpha.2) every unknown ID is named once, at its first item, whatever later items or renders add.
            if (props.sources !== undefined && !unknownIDs.has(value.calendarId)) {
                unknownIDs.add(value.calendarId);
                diagnostics.push({code: 'unknown-source', path: `${path}.calendarId`, key: `unknown-source:${value.calendarId}`,
                    reason: `No source with ID ${JSON.stringify(value.calendarId)}; items with this calendarId remain visible with fallback appearance`});
            }
        }
        const title = hasText(value.title) ? value.title : untitledItemLabel;
        if (!hasText(value.title)) diagnostics.push({code: 'empty-title', path: `${path}.title`, reason: 'Use the localized untitled-item label'});
        items.push({item: value, interval, source, title, visible: !visible || !source || visible.has(source.id)});
    }
    // §5.6 keeps these items visible with a warning. Without a sources prop (as in alpha.1, where it is unavailable)
    // one stable aggregate per input, not one per item, so such a feed produces a single development warning.
    if (unknownSource && props.sources === undefined) diagnostics.push({code: 'unknown-source', path: 'items[].calendarId',
        reason: 'No sources supplied; affected items remain visible with fallback appearance'});
    return {items, visibleItems: items.filter(item => item.visible), sources, visibleSourceIds, diagnostics};
}

export function validateActions(input: unknown): {actions: readonly CalendarItemAction[]; diagnostics: readonly Diagnostic[]} {
    if (!Array.isArray(input)) return {actions: [], diagnostics: [{code: 'invalid-record', path: 'actions', reason: 'Expected an array'}]};
    const duplicates = duplicateIDs(input), actions: CalendarItemAction[] = [], diagnostics: Diagnostic[] = [];
    for (const [index, action] of input.entries()) {
        const path = `actions[${index}]`;
        if (isRecord(action) && duplicates.has(action.id as string)) diagnostics.push({code: 'duplicate-id', path, reason: 'All actions with this ID are excluded'});
        else if (!isRecord(action) || !hasText(action.id) || !hasText(action.label) || (action.tone !== undefined && action.tone !== 'default' && action.tone !== 'danger')) {
            diagnostics.push({code: 'invalid-record', path, reason: 'Invalid action id, label or tone'});
        } else actions.push(action as CalendarItemAction);
    }
    return {actions, diagnostics};
}

/** A string field as it appears in a diagnostic key; any other value by its type, never by reading or printing it. */
const keyPart = (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : typeof value;
/**
 * Validation of one `itemMoveStates` snapshot: the records it excludes are the same in production and development.
 * `issued` maps this mount's request IDs to their item IDs. The issuer state machine (src/v02/core/moveRequests.ts)
 * then decides which kept records of those IDs count. Each excluded record is reported once per instance under a key
 * of its requestId, itemId, status and reason, so another invalid record at the same index still warns; a record
 * without a usable requestId keeps the path-based key.
 */
export function validateMoveStates(input: readonly unknown[], issued: ReadonlyMap<string, string> = new Map()): {states: readonly CalendarMoveState[]; diagnostics: readonly Diagnostic[]} {
    const duplicates = duplicateIDs(input, 'requestId'), states: CalendarMoveState[] = [], diagnostics: Diagnostic[] = [];
    for (const [index, state] of input.entries()) {
        const path = `itemMoveStates[${index}]`;
        const key = (code: Diagnostic['code']) => isRecord(state) && hasText(state.requestId)
            ? {key: `itemMoveStates:${code}:${[state.requestId, state.itemId, state.status, state.reason].map(keyPart).join(':')}`} : {};
        if (isRecord(state) && duplicates.has(state.requestId as string)) diagnostics.push({code: 'duplicate-id', path, reason: 'All states with this requestId are excluded', ...key('duplicate-id')});
        else if (!isRecord(state) || !hasText(state.requestId) || !hasText(state.itemId) || !['pending', 'succeeded', 'rejected'].includes(state.status as string)
            || (state.status === 'rejected' && !hasText(state.reason)) || (issued.has(state.requestId) && issued.get(state.requestId) !== state.itemId)) {
            diagnostics.push({code: 'invalid-record', path, reason: 'Invalid move state or issuer itemId mismatch', ...key('invalid-record')});
        } else states.push(state as CalendarMoveState);
    }
    return {states, diagnostics};
}

export type CalendarInputResult<I, S> =
    | Extract<ConfigurationResult<I, S>, {kind: 'contract'}>
    | {kind: 'data'; props: CalendarProps<I, S>; records: ValidatedRecords<I, S>; moveStates: readonly CalendarMoveState[]; diagnostics: readonly Diagnostic[]};

/** The controller entry: a fatal configuration never reaches record or resolver processing. */
export function validateCalendarInput<I = unknown, S = unknown>(
    input: unknown, services: ValidationServices, untitledItemLabel: string,
    issued: ReadonlyMap<string, string> = new Map(),
): CalendarInputResult<I, S> {
    const configuration = validateConfiguration<I, S>(input, services);
    if (configuration.kind === 'contract') return configuration;
    const records = validateRecords(configuration.props, services.dates, untitledItemLabel);
    const moves = validateMoveStates(configuration.props.itemMoveStates ?? [], issued);
    return {kind: 'data', props: configuration.props, records, moveStates: moves.states, diagnostics: [...records.diagnostics, ...moves.diagnostics]};
}
