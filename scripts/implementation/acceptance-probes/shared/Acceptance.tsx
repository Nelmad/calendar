'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Calendar, classicTheme, neutralTheme, type CalendarBaseProps, type CalendarDataState, type CalendarItem, type CalendarItemAction, type CalendarItemActionsProps,
    type CalendarItemPressRequest, type CalendarSource, type CalendarSourceFilterControlProps, type ISODate} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

// Harness-only alpha.1/alpha.2 acceptance page, copied into isolated packed consumers. It imports only the public
// root/CSS; every state of the axe/keyboard matrix is chosen by URL parameters, so the server HTML and the hydrated
// client render the same input. alpha.2 parameters: layout, presentation, theme, density, scheme, rtl, actions,
// sources, slots, multi (two calendars), shadow (the calendar in an open ShadowRoot; portal=shadow portals there too).
type Data = {ticket: number};
type SourceData = {team: string};
type Pending = {source: 'navigate'; date: ISODate} | {source: 'sources'; ids: readonly string[]};
type Harness = {
    log: unknown[]; pending: Pending[]; items: readonly CalendarItem<Data>[]; accept(): void; setDataState(state: CalendarDataState): void; rerender(): void;
    /** The items array the last committed render passed to Calendar: checks compare its identity across rerender(). */
    rendered?: readonly CalendarItem<Data>[];
};
declare global { interface Window { acceptance?: Harness } }

const timed = (id: string, title: string, start: string, end: string | undefined, ticket: number, calendarId?: string): CalendarItem<Data> =>
    ({id, title, data: {ticket}, ...(calendarId ? {calendarId} : {}), interval: {kind: 'timed', start, ...(end ? {end} : {})}});
const allDay = (id: string, title: string, start: ISODate, end: ISODate, ticket: number, calendarId?: string): CalendarItem<Data> =>
    ({id, title, data: {ticket}, ...(calendarId ? {calendarId} : {}), interval: {kind: 'allDay', start, end}});
/** Bar (multi-day all-day), one-cell all-day bar, timed chip, timed bar across two dates and a dense day. */
export const acceptanceItems: readonly CalendarItem<Data>[] = [
    allDay('sprint', 'Подготовка релиза', '2026-09-02', '2026-09-06', 1),
    timed('review', 'Проверка релиза', '2026-09-03T09:00:00+03:00', '2026-09-03T10:00:00+03:00', 2),
    allDay('docs', 'Документация', '2026-09-03', '2026-09-04', 3),
    timed('night', 'Ночной деплой', '2026-09-08T22:00:00+03:00', '2026-09-09T02:00:00+03:00', 4),
    ...Array.from({length: 7}, (_, i) => timed(`dense-${i + 1}`, `Задача ${i + 1}`, `2026-09-16T${String(9 + i).padStart(2, '0')}:00:00+03:00`, undefined, 10 + i)),
    timed('january', 'Январский обзор', '2026-01-31T12:00:00+03:00', undefined, 30),
    timed('october', 'Октябрьский релиз', '2026-10-15T12:00:00+03:00', undefined, 31),
];
/** alpha.2 sources: sprint and the dense day are «Релизы», review is «Команда»; docs has no calendarId, night an unknown one (fail-open). */
const sourced = acceptanceItems.map(item => item.id === 'sprint' || item.id.startsWith('dense') ? {...item, calendarId: 'release'}
    : item.id === 'review' ? {...item, calendarId: 'team'} : item.id === 'night' ? {...item, calendarId: 'archived-calendar'} : item);
const sources: CalendarSource<SourceData>[] = [{id: 'release', title: 'Релизы', color: '#0b57d0', data: {team: 'release'}}, {id: 'team', title: 'Команда', color: '#188038', data: {team: 'core'}}];
/** §6.1/§6.2 fixture on 15 September: each order group, the id tie-break by code units and items of the adjacent months. */
const ordered: readonly CalendarItem<Data>[] = [
    timed('chip', 'Встреча', '2026-09-15T12:00:00+03:00', '2026-09-15T13:00:00+03:00', 51),
    timed('moment', 'Момент', '2026-09-15T08:00:00+03:00', undefined, 52),
    timed('zero', 'Нулевая длительность', '2026-09-15T07:00:00+03:00', '2026-09-15T07:00:00+03:00', 53),
    timed('tm-late', 'Поздняя смена', '2026-09-15T22:00:00+03:00', '2026-09-16T01:00:00+03:00', 54),
    timed('tm-short', 'Короткая ночь', '2026-09-14T20:00:00+03:00', '2026-09-15T02:00:00+03:00', 55),
    timed('tm-long', 'Длинная ночь', '2026-09-14T20:00:00+03:00', '2026-09-16T02:00:00+03:00', 56),
    allDay('alpha', 'Альфа', '2026-09-15', '2026-09-16', 57),
    allDay('Zeta', 'Зета', '2026-09-15', '2026-09-16', 58),
    allDay('ad-b', 'Два дня', '2026-09-15', '2026-09-17', 59),
    allDay('august', 'Август', '2026-08-31', '2026-09-01', 60),
    timed('october-3', 'Октябрь', '2026-10-03T10:00:00+03:00', '2026-10-03T11:00:00+03:00', 61),
];
const actions: CalendarItemAction[] = [{id: 'open', label: 'Открыть задачу'}, {id: 'archive', label: 'Архивировать', tone: 'danger'}];
const fixed = {today: '2026-09-03', anchorDate: '2026-09-01', timeZone: 'Europe/Moscow', locale: 'ru-RU'} as const;
const states: Record<string, CalendarDataState> = {
    'loading-initial': {status: 'loading', phase: 'initial'}, 'loading-refresh': {status: 'loading', phase: 'refresh'},
    'error-initial': {status: 'error', phase: 'initial', error: new Error('Backend unavailable')},
    'error-refresh': {status: 'error', phase: 'refresh', error: new Error('Backend unavailable')},
};
type Props = CalendarBaseProps<Data, SourceData>;
/** Static per-scenario props; the interactive scenario adds controlled navigation and agenda. */
type Overrides = Partial<Pick<Props, 'items' | 'dataState' | 'timeZone' | 'colorScheme' | 'density' | 'locale' | 'style' | 'hourCycle' | 'sortItems'>>;
function scenarioProps(name: string): Overrides {
    if (name in states) return {dataState: states[name], items: name.endsWith('initial') ? [] : acceptanceItems};
    switch (name) {
    case 'empty': return {items: []};
    case 'contract': return {timeZone: 'Mars/Olympus_Mons'};
    case 'dark': return {colorScheme: 'dark'};
    case 'comfortable': return {density: 'comfortable'};
    case 'rtl-ar': return {locale: 'ar-EG', timeZone: 'Africa/Cairo'};
    case 'constrained': return {style: {blockSize: '520px'}};
    case 'tiny': return {style: {blockSize: '160px'}};
    case 'en-US': return {locale: 'en-US', timeZone: 'America/New_York', hourCycle: 12};
    case 'ru-RU': return {locale: 'ru-RU', hourCycle: 24};
    // One item per row position: presentation kinds and a bar split by the Monday week boundary.
    case 'segments': return {items: [allDay('one-day', 'Однодневное', '2026-09-10', '2026-09-11', 40),
        timed('chip', 'Встреча', '2026-09-22T10:00:00+03:00', '2026-09-22T11:00:00+03:00', 41),
        timed('overnight', 'Ночная смена', '2026-09-23T22:00:00+03:00', '2026-09-24T06:00:00+03:00', 42),
        allDay('split', 'Через неделю', '2026-09-05', '2026-09-09', 43)]};
    case 'order': return {items: ordered, style: {blockSize: '1800px'}};
    // A consumer comparator: higher ticket first, ties (0) left to the package id tie-break.
    case 'sorted': return {items: ordered, style: {blockSize: '1800px'}, sortItems: (a, b) => Math.sign(Math.floor(b.data.ticket / 4) - Math.floor(a.data.ticket / 4))};
    default: return {};
    }
}
/** Copies the document stylesheets (the public styles.css import among them) into a shadow tree scope. */
function adoptDocumentStyles(root: ShadowRoot) {
    root.adoptedStyleSheets = [...document.styleSheets].map(sheet => {
        const copy = new CSSStyleSheet();
        copy.replaceSync([...sheet.cssRules].map(rule => rule.cssText).join('\n'));
        return copy;
    });
}
function ShadowMount({children, onRoot}: {children: ReactNode; onRoot(root: ShadowRoot): void}) {
    const host = useRef<HTMLDivElement>(null), [mount, setMount] = useState<HTMLElement>();
    useEffect(() => {
        const root = host.current!.shadowRoot ?? host.current!.attachShadow({mode: 'open'});
        adoptDocumentStyles(root);
        const node = root.querySelector<HTMLElement>('div') ?? root.appendChild(document.createElement('div'));
        onRoot(root); setMount(node);
    }, [onRoot]);
    return <div id="shadow-host" ref={host}>{mount && createPortal(children, mount)}</div>;
}
const noop = () => undefined;

export function Acceptance({params}: {params: Readonly<Record<string, string | undefined>>}) {
    const scenario = params.scenario ?? 'month', manual = params.accept === 'manual';
    const initialAnchor = params.anchor ?? fixed.anchorDate, initialAgenda = params.agenda ?? fixed.today;
    const [anchorDate, setAnchorDate] = useState<ISODate>(initialAnchor);
    const [agendaDate, setAgendaDate] = useState<ISODate>(initialAgenda);
    const [visibleSourceIds, setVisibleSourceIds] = useState<readonly string[]>(['release', 'team']);
    const [secondAnchor, setSecondAnchor] = useState<ISODate>(fixed.anchorDate);
    const [shadowRoot, setShadowRoot] = useState<ShadowRoot>();
    const [revision, setRevision] = useState(0);
    const overrides = scenarioProps(scenario);
    const [dataState, setDataState] = useState<CalendarDataState>(overrides.dataState ?? {status: 'ready'});
    const [pressed, setPressed] = useState<CalendarItemPressRequest<Data>>();
    const baseItems = params.sources ? sourced : overrides.items ?? acceptanceItems;
    const harness = useRef<Harness>({log: [], pending: [], items: baseItems, accept() {}, setDataState() {}, rerender() {}});
    useEffect(() => {
        const current = harness.current;
        // Manual mode holds onNavigate and onVisibleSourceIdsChange until the test accepts them: delayed controlled acceptance.
        current.accept = () => {
            for (const request of current.pending.splice(0)) if (request.source === 'navigate') setAnchorDate(request.date); else setVisibleSourceIds(request.ids);
        };
        current.setDataState = setDataState;
        // A new render with equal input (fresh array and item objects): the layout must not reorder.
        current.rerender = () => { current.items = current.items.map(item => ({...item})); setRevision(value => value + 1); };
        window.acceptance = current;
        document.documentElement.dataset.hydrated = 'true';
        return () => { delete window.acceptance; };
    }, []);
    const log = (entry: unknown) => harness.current.log.push(entry);
    const navigate = (date: ISODate) => {
        log({onNavigate: date});
        if (manual) harness.current.pending.push({date, source: 'navigate'}); else setAnchorDate(date);
    };
    // `items` stays out of the spread: the calendar always gets `items` below, so rerender() really passes fresh objects.
    const {dataState: _initial, items: _items, ...rest} = overrides;
    const rtl = params.rtl === '1' ? {locale: 'ar-EG', timeZone: 'Africa/Cairo'} as const : {};
    const looks: Partial<Pick<Props, 'layout' | 'agendaPresentation' | 'theme' | 'density' | 'colorScheme' | 'portalContainer'>> = {
        layout: params.layout === 'auto' || params.layout === 'mobile' ? params.layout : 'desktop',
        ...(params.presentation === 'overlay' ? {agendaPresentation: 'overlay'} as const : {}),
        theme: params.theme === 'neutral' ? neutralTheme : classicTheme,
        ...(params.density === 'comfortable' || params.density === 'compact' ? {density: params.density} : {}),
        ...(params.scheme === 'dark' || params.scheme === 'light' || params.scheme === 'system' ? {colorScheme: params.scheme} : {}),
        ...(params.portal === 'shadow' && shadowRoot ? {portalContainer: shadowRoot} : {}),
    };
    const slots: Partial<Pick<Props, 'renderItem' | 'renderAgendaItem' | 'renderToolbarContent' | 'renderEmpty' | 'renderError' | 'classNames' | 'getItemAppearance'>> = params.slots !== '1' ? {} : {
        // Passive custom item content, a toolbar extension and a data-error body with controls of their own.
        renderItem: ({item}) => <span className="acceptance-item"><span>{item.title}</span> <small>#{item.data.ticket}</small></span>,
        renderAgendaItem: ({item, date}) => <span className="acceptance-agenda-item">{item.title} · #{item.data.ticket} · {date}</span>,
        renderToolbarContent: ({anchorDate: month}) => <button type="button" className="acceptance-export" aria-describedby="export-hint" onClick={() => log({export: month})}>Экспорт</button>,
        renderEmpty: () => <p>Нет событий: добавьте их в трекере</p>,
        renderError: context => context.kind === 'data' ? <div className="acceptance-error"><p>Сервер недоступен</p>
            <button type="button" onClick={() => log('customRetry')}>Повторить загрузку</button></div> : undefined,
        classNames: {root: 'acceptance-root', item: ({item}) => `acceptance-item-${item.id}`, day: ({isToday}) => isToday ? 'acceptance-today' : undefined},
        getItemAppearance: item => item.id === 'sprint' ? {backgroundColor: '#fde7e9', textColor: '#5c0011', accentColor: '#a50e0e'} : undefined,
    };
    const actionProps: CalendarItemActionsProps<Data> = params.actions !== '1' ? {} : {getItemActions: item => item.id === 'docs' ? [] : actions,
        onItemActionRequest: request => log({onItemActionRequest: request})};
    const sourceProps: CalendarSourceFilterControlProps<SourceData> = params.sources !== '1' ? {} : {sources, visibleSourceIds, onVisibleSourceIdsChange: ids => {
        log({onVisibleSourceIdsChange: ids});
        if (manual) harness.current.pending.push({source: 'sources', ids}); else setVisibleSourceIds(ids);
    }};
    const items = revision ? harness.current.items : baseItems;
    useEffect(() => { harness.current.rendered = items; });
    // aria-labelledby resolves only in the root's own tree scope: inside the ShadowRoot the light-DOM heading is out of reach.
    const name = params.shadow === '1' ? {'aria-label': `Acceptance: ${scenario} (ShadowRoot)`} : {'aria-labelledby': 'acceptance-title'};
    const calendar = <Calendar<Data, SourceData> items={items} {...fixed} {...rtl} {...name}
        anchorDate={anchorDate} onNavigate={navigate} agendaDate={agendaDate} onAgendaDateChange={date => { log({onAgendaDateChange: date}); setAgendaDate(date); }}
        onVisibleRangeChange={range => log({onVisibleRangeChange: range})} onRetryRequest={() => log('onRetryRequest')}
        onItemPress={request => { log({onItemPress: request}); setPressed(request); }}
        {...actionProps} {...sourceProps}
        {...looks} {...slots} {...rest} dataState={dataState}/>;
    return <div className="acceptance" lang="en">
        <h1 id="acceptance-title">Acceptance: {scenario}</h1>
        <p id="export-hint" hidden>Скачивает видимый месяц</p>
        <button type="button" id="before">Before calendar</button>
        <div id="calendar-host">
            {params.shadow === '1' ? <ShadowMount onRoot={setShadowRoot}>{calendar}</ShadowMount> : calendar}
            {params.multi === '1' && <Calendar<Data> id="second-calendar" aria-label="Второй календарь" items={acceptanceItems} {...fixed} layout={looks.layout ?? 'desktop'}
                theme={neutralTheme} colorScheme="dark" anchorDate={secondAnchor} onNavigate={date => { log({second: date}); setSecondAnchor(date); }}
                onItemPress={noop}/>}
        </div>
        <button type="button" id="after">After calendar</button>
        <p>Pressed item: <output id="pressed">{pressed ? pressed.item.id : 'none'}</output></p>
    </div>;
}
