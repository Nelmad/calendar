import {useEffect, useId, useLayoutEffect, type ReactNode} from 'react';
import type {LocalizedText as Text} from '../core/formatting.js';
import type {CalendarProps, CalendarRootState} from '../reference.js';
import type {CalendarSurface} from '../surface.js';
import {LocalizedText} from '../LocalizedText.js';
import {Button, Icon, IconButton, Skeleton, Stack, ThemeRoot} from '../primitives/index.js';
import {inRange, monthStart, shiftMonth} from '../core/controller.js';
import {dateToDay} from '../core/projection.js';
import {useCalendarController, type CalendarController} from './useCalendarController.js';
import {useBlockingReserve, useBlockSizeVariable} from './useStatusGeometry.js';
import {classes, resolveClass as className} from './slots.js';
import {themeName} from '../themes/neutral.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const named = ({text, lang}: {text: string; lang: string}) => ({'aria-label': text, lang});
// Pure ISO arithmetic: the host clock and global Date are never read (a host may replace them).
const weekCount = ({start, end}: {start: string; end: string}) => (dateToDay(end) - dateToDay(start)) / 7;

/** Private shell. T11/T12 supply the real Month/agenda through this internal seam. */
export function CalendarShell<I, S>({input, surface, renderView, renderToolbarControls, renderModeLine, onController}: {
    input: CalendarProps<I, S>; surface?: CalendarSurface; renderView: (controller: CalendarController<I, S>, headingId: string) => ReactNode;
    /** Package controls after the navigation group, such as the source selector (§5.6). */
    renderToolbarControls?: (controller: CalendarController<I, S>) => ReactNode;
    /** The interaction mode line after the toolbar and its data-state banner, before the grid (#11 decision Q3); null for a viewer. */
    renderModeLine?: (controller: CalendarController<I, S>) => ReactNode;
    /**
     * Internal test seam: receives the committed controller after every commit, in every state, so tests reach APIs that
     * have no input yet (the move requests of #10 before the input adapters). The public Calendar never passes it.
     */
    onController?: (controller: CalendarController<I, S>) => void;
}) {
    const controller = useCalendarController(input, surface), {model, rootRef, viewRef, todayRef, statusRef, politeRef, urgentRef} = controller;
    useClientLayoutEffect(() => { onController?.(controller); });
    const headingId = useId(), boundaryId = useId(), statusTextId = useId();
    const state: CalendarRootState = model.state;
    const statusKey = `${state.dataState.status}/${state.dataState.status === 'ready' ? '' : state.dataState.phase}`;
    const weeks = model.kind === 'data' ? weekCount(model.range) : 0;
    // QA-D-1-03: the grid scroller keeps a focused cell clear of its sticky weekday row (`scroll-padding`). Written on the
    // view, which renders no inline style of its own, after its ref is attached (this effect runs after the Month's).
    useBlockSizeVariable(controller.weekdaysRef, viewRef, '--nc-weekdays-block-size', `${model.kind}/${statusKey}/${state.layout}`);
    useBlockingReserve(viewRef, statusRef, model.blocking, `${state.layout}/${state.density}`, weeks, statusKey);
    const calendarLabel = model.kind === 'contract' ? model.messages.calendarLabel : model.message('calendarLabel');
    const consumerRootLabel = typeof input['aria-label'] === 'string' && input['aria-label'].trim() ? input['aria-label'] : undefined;
    const rootLabel = consumerRootLabel ?? calendarLabel.text;
    const rootLang = consumerRootLabel || controller.labelledBy ? model.lang : calendarLabel.lang;
    const statusClass = classes('nc-calendar-status', className(input.classNames?.status, state));
    const errorBody = () => {
        if (model.kind === 'contract') return typeof input.renderError === 'function'
            ? <div lang={model.lang}>{input.renderError({kind: 'contract', error: model.state.dataState.error, hasStaleItems: false})}</div>
            : <LocalizedText value={model.messages.invalidConfigurationLabel}/>;
        if (model.state.dataState.status !== 'error') return null;
        const retryLabel = model.message('retryLabel');
        return input.renderError ? <div lang={model.lang}>{input.renderError({kind: 'data', state: model.state.dataState, visibleRange: model.range,
            hasStaleItems: !model.blocking && model.hasItems})}</div> : <Stack direction={model.blocking ? 'column' : 'row'}>
                <LocalizedText value={model.message('errorLabel')}/>
                {input.onRetryRequest && <Button lang={retryLabel.lang} onPress={() => input.onRetryRequest?.()}><LocalizedText value={retryLabel}/></Button>}</Stack>;
    };
    // A blocking status keeps the height of the grid it replaces (`data-weeks`, QA-07). QA-D-3 (lead decision): a data
    // state never moves the toolbar controls, and no status sits in the toolbar row. A refresh in progress is a thin
    // progress bar over the top border of the grid area, which takes no space; a refresh error (and a custom refresh
    // body, whose size the package cannot know) is an in-flow banner between the toolbar and the grid. Both keep the Tab
    // and reading order toolbar, status, grid. The default bodies name their region once, by their text; an error region
    // keeps its own name. The default refresh progress is no region: only its progress bar carries the name, and the text
    // that names it is hidden from the accessibility tree, so the name is exposed once (QA-D-4-04).
    const placement = model.blocking ? 'block' : state.dataState.status === 'loading' && !input.renderLoading ? 'progress' : 'banner';
    const status = (label: Text, byText: boolean, body: ReactNode) => <div ref={model.blocking ? statusRef : undefined}
        {...placement === 'progress' ? {} : {role: 'region', tabIndex: -1, ...(byText ? {'aria-labelledby': statusTextId, lang: label.lang} : named(label))}}
        className={statusClass} data-placement={placement} data-weeks={model.blocking && model.kind === 'data' ? weeks : undefined}>{body}</div>;
    const loadingStatus = () => state.dataState.status === 'loading' && model.kind === 'data' && status(model.message(model.blocking ? 'loadingLabel' : 'refreshingLabel'), !input.renderLoading,
        input.renderLoading ? <div lang={model.lang}>{input.renderLoading({state: state.dataState, visibleRange: model.range})}</div>
            : model.blocking ? <Stack direction="column">
                <span id={statusTextId}><LocalizedText value={model.message('loadingLabel')}/></span><Skeleton/><Skeleton/><Skeleton/>
            </Stack> : <>
                <span id={statusTextId} className="nc-visually-hidden" aria-hidden="true"><LocalizedText value={model.message('refreshingLabel')}/></span>
                <div role="progressbar" aria-labelledby={statusTextId} lang={model.message('refreshingLabel').lang} className="nc-calendar-progress">
                    <span className="nc-calendar-progress-indicator"/></div>
            </>);
    const errorStatus = () => state.dataState.status === 'error' && status(model.kind === 'contract' ? model.messages.invalidConfigurationLabel : model.message('errorLabel'), false, errorBody());
    const modeLine = model.kind === 'data' && !model.blocking ? renderModeLine?.(controller) : null, statusSlot = model.blocking || placement === 'banner';
    const toolbar = () => {
        if (model.kind !== 'data') return null;
        const context = {...model.state, anchorDate: input.anchorDate, visibleRange: model.range};
        const previous = shiftMonth(model.month, -1), next = shiftMonth(model.month, 1);
        // §11.3: only a Today that would need `onNavigate` to a month beyond the anchor bound is unavailable; a today in the
        // rendered grid (a neighbor date of the first/last supported Month) is focused there.
        const todayMonth = controller.today && monthStart(controller.today);
        const todayBoundary = !!todayMonth && (todayMonth < '0001-02-01' || todayMonth > '9999-11-01') && !inRange(controller.today!, model.range);
        const todayLabel = model.message('todayLabel');
        return <div lang={model.lang} className={classes('nc-calendar-toolbar', className(input.classNames?.toolbar, context))} onKeyDown={event => controller.selection.onControlKey(event)}>
            <h2 id={headingId} className="nc-calendar-heading" lang={model.locale.locale} dir={model.locale.dir}>{model.format.date(model.month, 'month').text}</h2>
            <Stack direction="row">
                <IconButton {...named(model.message('previousMonthLabel'))} isDisabled={!previous || model.blocking}
                    aria-describedby={!previous ? boundaryId : undefined} onPress={() => controller.navigateMonth(-1)}><Icon name="previous"/></IconButton>
                <Button ref={todayRef} lang={todayLabel.lang} isDisabled={!controller.today || todayBoundary || model.blocking}
                    aria-describedby={todayBoundary ? boundaryId : undefined} onPress={controller.navigateToday}><LocalizedText value={todayLabel}/></Button>
                <IconButton {...named(model.message('nextMonthLabel'))} isDisabled={!next || model.blocking}
                    aria-describedby={!next ? boundaryId : undefined} onPress={() => controller.navigateMonth(1)}><Icon name="next"/></IconButton>
            </Stack>
            {renderToolbarControls?.(controller)}
            {(!previous || !next || todayBoundary) && <span id={boundaryId} className="nc-visually-hidden"><LocalizedText value={model.message('navigationBoundaryReason')}/></span>}
            {/* §10.4: an extension area after the package controls, outside the grid; its controls keep their own Tab order. */}
            {input.renderToolbarContent && <div className="nc-toolbar-content">{input.renderToolbarContent(context)}</div>}
        </div>;
    };
    return <ThemeRoot ref={rootRef} mirror={controller.mirror} role="region" tabIndex={-1} id={input.id} aria-label={rootLabel} aria-labelledby={controller.labelledBy}
        lang={rootLang} locale={model.lang} dir={state.dir} theme={model.kind === 'data' ? themeName(model.props.theme) : 'classic'} density={state.density} colorScheme={state.colorScheme}
        tokens={model.kind === 'data' ? input.tokens : undefined} style={input.style}
        className={classes('nc-calendar', input.className, className(input.classNames?.root, state))}
        data-layout={state.layout} data-status={state.dataState.status}
        data-loading-phase={state.dataState.status === 'loading' ? state.dataState.phase : undefined}>
        <div ref={politeRef} className="nc-visually-hidden" role="status" aria-live="polite" aria-atomic="true"/>
        <div ref={urgentRef} className="nc-visually-hidden" role="alert" aria-atomic="true"/>
        {toolbar()}
        {/* The mode line joins this slot last: without it the slot and the ids under the view stay exactly as before. A refresh
            progress belongs to the view; this slot shows a status only as a blocking state or a banner. */}
        {(statusSlot || !!modeLine) && <>{statusSlot && loadingStatus()}{statusSlot && errorStatus()}{modeLine}</>}
        {/* QA-08: `aria-busy` marks the stale content only (the grid and an inline agenda); the live regions of the root and
            the progress region stay outside the busy subtree. */}
        {model.kind === 'data' && !model.blocking && <div ref={viewRef} className="nc-calendar-view" lang={model.lang} data-month-heading={headingId}>
            {placement === 'progress' && loadingStatus()}
            {renderView(controller, headingId)}
            {state.dataState.status === 'ready' && !model.hasItems && <div role="region" {...named(model.message('emptyLabel'))} className={statusClass}>
                {input.renderEmpty ? <div lang={model.lang}>{input.renderEmpty({visibleRange: model.range})}</div> : <LocalizedText value={model.message('emptyLabel')}/>}
            </div>}
        </div>}
    </ThemeRoot>;
}
