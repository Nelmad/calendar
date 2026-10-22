'use client';
import {useRef, useState} from 'react';
import {Calendar, classicTheme, type CalendarDataState, type CalendarItemPressRequest, type CalendarVisibleRange, type ISODate} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';
import {loadRange, rangeKey, release, type ReleaseItem, type Ticket} from './releaseData';

/** Records the server already loaded for the first visible range. */
export type ReleasePrefetch = {range: CalendarVisibleRange; items: ReleaseItem[]};
type Locale = 'ru-RU' | 'en-US';
type LogEntry = {id: number; key: string; outcome: 'prefetch' | 'cached' | 'request' | 'loaded' | 'failed'};

const text = {
    'ru-RU': {title: 'Релиз 0.2', language: 'Язык', fail: 'Сбой следующего запроса', reset: 'Очистить кэш и загрузить заново', range: 'Видимый диапазон',
        agenda: 'Открытый день', pressed: 'onItemPress', log: 'Запросы диапазонов',
        outcomes: {prefetch: 'загружено на сервере', cached: 'уже загружено, запрос не нужен', request: 'запрос', loaded: 'загружено', failed: 'ошибка'}},
    'en-US': {title: 'Release 0.2', language: 'Language', fail: 'Fail the next request', reset: 'Clear cache and reload', range: 'Visible range',
        agenda: 'Viewed day', pressed: 'onItemPress', log: 'Range requests',
        outcomes: {prefetch: 'loaded on the server', cached: 'already loaded, no request', request: 'request', loaded: 'loaded', failed: 'failed'}},
} as const;

/**
 * Full alpha.2 integration with the default responsive layout: controlled navigation, visible-range loading with a
 * cache, data states with retry, a controlled day agenda (a popover on desktop, below the grid on a phone) and item
 * press payloads.
 */
export function ReleaseCalendar({prefetch}: {prefetch?: ReleasePrefetch}) {
    const [locale, setLocale] = useState<Locale>(release.locale);
    const [anchorDate, setAnchorDate] = useState<ISODate>(release.anchorDate);
    const [agendaDate, setAgendaDate] = useState<ISODate>(release.today);
    const [items, setItems] = useState<ReleaseItem[] | undefined>(prefetch?.items);
    const [dataState, setDataState] = useState<CalendarDataState>(prefetch ? {status: 'ready'} : {status: 'loading', phase: 'initial'});
    const [range, setRange] = useState(prefetch?.range);
    const [failNext, setFailNext] = useState(false);
    const [pressed, setPressed] = useState<CalendarItemPressRequest<Ticket>>();
    const [log, setLog] = useState<LogEntry[]>(prefetch ? [{id: 0, key: rangeKey(prefetch.range), outcome: 'prefetch'}] : []);
    const cache = useRef(new Map<string, ReleaseItem[]>(prefetch ? [[rangeKey(prefetch.range), prefetch.items]] : []));
    const pending = useRef<{key: string; controller: AbortController} | undefined>(undefined), counter = useRef(0);
    const t = text[locale], append = (entry: Omit<LogEntry, 'id'>) => {
        const id = ++counter.current;
        setLog(entries => [{...entry, id}, ...entries].slice(0, 20));
    };

    function load(next: CalendarVisibleRange, stale: boolean) {
        const key = rangeKey(next);
        pending.current?.controller.abort();
        const controller = new AbortController(), phase = stale ? 'refresh' : 'initial';
        pending.current = {key, controller};
        setDataState({status: 'loading', phase});
        append({key, outcome: 'request'});
        loadRange(next, {latency: 600, fail: failNext, signal: controller.signal}).then(result => {
            if (controller.signal.aborted) return;
            cache.current.set(key, result); setItems(result); setDataState({status: 'ready'}); append({key, outcome: 'loaded'});
        }, (error: unknown) => {
            if (controller.signal.aborted) return;
            setDataState({status: 'error', phase, error}); append({key, outcome: 'failed'});
        }).finally(() => { if (pending.current?.controller === controller) pending.current = undefined; });
        setFailNext(false);
    }
    // Called after commit for every new (start, end, timeZone); the first call repeats the prefetched range.
    function changeRange(next: CalendarVisibleRange) {
        const key = rangeKey(next), cached = cache.current.get(key);
        setRange(next);
        if (pending.current?.key === key) return;
        if (cached) {
            pending.current?.controller.abort(); pending.current = undefined;
            setItems(cached); setDataState({status: 'ready'}); append({key, outcome: 'cached'});
        } else load(next, items !== undefined);
    }
    function reset() {
        cache.current.clear(); setItems(undefined);
        if (range) load(range, false);
    }

    return <section className="release" lang={locale}>
        <header className="release-toolbar">
            <h1 id="release-title">{t.title}</h1>
            <label>{t.language} <select value={locale} onChange={event => setLocale(event.target.value as Locale)}>
                <option value="ru-RU">Русский (ru-RU)</option><option value="en-US">English (en-US)</option>
            </select></label>
            <label><input type="checkbox" checked={failNext} onChange={event => setFailNext(event.target.checked)}/> {t.fail}</label>
            <button type="button" onClick={reset}>{t.reset}</button>
        </header>
        <Calendar aria-labelledby="release-title" items={items ?? []} timeZone={release.timeZone} today={release.today} locale={locale}
            theme={classicTheme} anchorDate={anchorDate} onNavigate={setAnchorDate} onVisibleRangeChange={changeRange}
            dataState={dataState} onRetryRequest={() => range && load(range, items !== undefined)}
            agendaDate={agendaDate} onAgendaDateChange={setAgendaDate} onItemPress={setPressed}/>
        {/* Plain text, not live regions: the calendar announces its own changes, the demo state is read on demand. */}
        <dl className="release-state">
            <dt>{t.range}</dt><dd><code id="visible-range">{range && rangeKey(range)}</code></dd>
            <dt>{t.agenda}</dt><dd><code id="agenda-date">{agendaDate}</code></dd>
            <dt>{t.pressed}</dt><dd><code id="pressed">{pressed && JSON.stringify({id: pressed.item.id, view: pressed.view,
                date: pressed.date, segmentRange: pressed.segmentRange, data: pressed.item.data})}</code></dd>
        </dl>
        <h2 className="release-log-title">{t.log}</h2>
        <ol id="requests" className="release-log">
            {log.map(entry => <li key={entry.id} data-outcome={entry.outcome}><code>{entry.key}</code> — {t.outcomes[entry.outcome]}</li>)}
        </ol>
    </section>;
}
