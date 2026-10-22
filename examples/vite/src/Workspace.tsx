'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Calendar, neutralTheme, type CalendarAgendaPresentation, type CalendarItem, type CalendarItemAction, type CalendarLayout,
    type CalendarSource, type ISODate} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

type Task = {ticket: number; assignee: string; done: boolean};
type Team = {lead: string};

const workspace = {anchorDate: '2026-09-01', today: '2026-09-03', timeZone: 'Europe/Moscow', locale: 'ru-RU'} as const;
const sources: CalendarSource<Team>[] = [
    {id: 'product', title: 'Продукт', color: '#0b57d0', data: {lead: 'Анна'}},
    {id: 'support', title: 'Поддержка', color: '#188038', data: {lead: 'Олег'}},
    {id: 'ops', title: 'Эксплуатация', color: '#a142f4', data: {lead: 'Ира'}},
];
const task = (id: string, title: string, start: ISODate, days: number, calendarId: string | undefined, ticket: number, assignee: string): CalendarItem<Task> => {
    const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + days);
    return {id, title, ...(calendarId ? {calendarId} : {}), data: {ticket, assignee, done: false}, interval: {kind: 'allDay', start, end: end.toISOString().slice(0, 10)}};
};
const initialItems: CalendarItem<Task>[] = [
    task('roadmap', 'Роадмап квартала', '2026-09-01', 3, 'product', 101, 'Анна'),
    task('triage', 'Разбор обращений', '2026-09-03', 1, 'support', 202, 'Олег'),
    {id: 'deploy', title: 'Выкладка', calendarId: 'ops', data: {ticket: 303, assignee: 'Ира', done: false},
        interval: {kind: 'timed', start: '2026-09-03T21:00:00+03:00', end: '2026-09-03T23:00:00+03:00'}},
    task('interviews', 'Интервью с клиентами', '2026-09-08', 2, 'product', 104, 'Анна'),
    // No calendarId and an unknown one: both always stay visible (fail-open) with the base accent.
    task('holiday', 'Корпоративный выходной', '2026-09-18', 1, undefined, 0, '—'),
    task('legacy', 'Перенос из старого трекера', '2026-09-22', 2, 'archive-2025', 77, 'Олег'),
];
const title = 'Рабочее пространство';
const actions: CalendarItemAction[] = [{id: 'done', label: 'Отметить выполненной'}, {id: 'delete', label: 'Удалить', tone: 'danger'}];

/** Copies this document's stylesheets (with the public styles.css) into a shadow tree, which document CSS does not reach. */
function ShadowPanel({children, onRoot}: {children: ReactNode; onRoot(root: ShadowRoot | undefined): void}) {
    const host = useRef<HTMLDivElement>(null), [mount, setMount] = useState<HTMLElement>();
    useEffect(() => {
        const root = host.current!.shadowRoot ?? host.current!.attachShadow({mode: 'open'});
        root.adoptedStyleSheets = [...document.styleSheets].map(sheet => {
            const copy = new CSSStyleSheet();
            copy.replaceSync([...sheet.cssRules].map(rule => rule.cssText).join('\n'));
            return copy;
        });
        setMount(root.querySelector<HTMLElement>('div') ?? root.appendChild(document.createElement('div')));
        onRoot(root);
        return () => onRoot(undefined);
    }, [onRoot]);
    return <div ref={host} className="workspace-shadow">{mount && createPortal(children, mount)}</div>;
}

/**
 * The alpha.2 integration slice: responsive layouts, a mobile agenda below the grid or in a sheet, item actions, a
 * controlled source filter that your backend accepts later, neutralTheme with tokens, passive content slots and class
 * callbacks, and the same calendar inside a ShadowRoot with its portals.
 */
export function Workspace() {
    const [items, setItems] = useState(initialItems);
    const [anchorDate, setAnchorDate] = useState<ISODate>(workspace.anchorDate);
    const [layout, setLayout] = useState<CalendarLayout>('auto');
    const [presentation, setPresentation] = useState<CalendarAgendaPresentation>('auto');
    const [comfortable, setComfortable] = useState(false);
    const [shadow, setShadow] = useState(false), [shadowRoot, setShadowRoot] = useState<ShadowRoot>();
    // The accepted filter is what the (simulated) settings service saved; a toggle only sends a request.
    const [visibleSourceIds, setVisibleSourceIds] = useState<readonly string[]>(sources.map(source => source.id));
    const [saving, setSaving] = useState<readonly string[]>();
    const [log, setLog] = useState<string[]>([]);
    const note = (text: string) => setLog(entries => [text, ...entries].slice(0, 8));
    useEffect(() => {
        if (!saving) return;
        const timer = setTimeout(() => { setVisibleSourceIds(saving); setSaving(undefined); note(`Фильтр сохранён: ${saving.join(', ') || '—'}`); }, 500);
        return () => clearTimeout(timer);
    }, [saving]);
    // aria-labelledby resolves only in the calendar's own tree scope: the heading stays in the document, so inside the
    // ShadowRoot the calendar gets the same name as aria-label (an IDREF across the boundary would be ignored).
    const name = shadow ? {'aria-label': title} : {'aria-labelledby': 'workspace-title'};
    const calendar = <Calendar<Task, Team> {...name} items={items} {...workspace} anchorDate={anchorDate} onNavigate={setAnchorDate}
        layout={layout} agendaPresentation={presentation} portalContainer={shadow ? shadowRoot ?? null : null}
        theme={neutralTheme} density={comfortable ? 'comfortable' : 'compact'} tokens={{color: {accent: '#3f5f8f'}, radii: {md: '10px'}}}
        className="workspace-calendar" classNames={{item: ({item}) => item.data.done ? 'is-done' : undefined, day: ({isToday}) => isToday ? 'is-today' : undefined}}
        // The done state is text, not only a check mark and a line-through: hidden visually, read by assistive technology.
        renderItem={({item}) => <>{item.data.done && <><span aria-hidden="true">✓ </span><span className="workspace-visually-hidden">Выполнено: </span></>}{item.title}</>}
        renderAgendaItem={({item, source}) => <span className="workspace-row"><span>{item.title}</span>
            <small>#{item.data.ticket} · {item.data.assignee}{source ? ` · ${source.title}` : ''}{item.data.done ? ' · выполнено' : ''}</small></span>}
        renderToolbarContent={() => <button type="button" className="workspace-density" aria-pressed={comfortable}
            onClick={() => setComfortable(value => !value)}>Просторно</button>}
        onItemPress={({item, view}) => note(`Открыта задача #${item.data.ticket} (${view})`)}
        getItemActions={item => item.data.done ? actions.slice(1) : actions}
        onItemActionRequest={({item, actionId}) => {
            note(`${actionId === 'delete' ? 'Удалена' : 'Выполнена'}: ${item.title}`);
            setItems(current => actionId === 'delete' ? current.filter(entry => entry.id !== item.id)
                : current.map(entry => entry.id === item.id ? {...entry, data: {...entry.data, done: true}} : entry));
        }}
        sources={sources} visibleSourceIds={visibleSourceIds} onVisibleSourceIdsChange={ids => { setSaving(ids); note(`Запрос фильтра: ${ids.join(', ') || '—'}`); }}/>;
    return <section className="workspace" lang="ru">
        <header className="release-toolbar">
            <h1 id="workspace-title">{title}</h1>
            <label>Раскладка <select value={layout} onChange={event => setLayout(event.target.value as CalendarLayout)}>
                <option value="auto">auto</option><option value="desktop">desktop</option><option value="mobile">mobile</option>
            </select></label>
            <label>Повестка на телефоне <select value={presentation} onChange={event => setPresentation(event.target.value as CalendarAgendaPresentation)}>
                <option value="auto">под сеткой</option><option value="overlay">лист</option>
            </select></label>
            <label><input type="checkbox" checked={shadow} onChange={event => setShadow(event.target.checked)}/> В ShadowRoot</label>
        </header>
        {shadow ? <ShadowPanel onRoot={setShadowRoot}>{calendar}</ShadowPanel> : calendar}
        <p id="workspace-saving">{saving ? 'Сохранение фильтра…' : 'Фильтр сохранён'}</p>
        <h2 className="release-log-title">Журнал</h2>
        <ol id="workspace-log" className="release-log">{log.map((entry, index) => <li key={`${log.length - index}`}>{entry}</li>)}</ol>
    </section>;
}
