import {useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react';
import {flushSync} from 'react-dom';
import {FocusScope} from 'react-aria/FocusScope';
import {actionsPresentation, type ActionsPresentation} from '../core/actions.js';
import {sourceSelectorShown, toggleSource} from '../core/sources.js';
import {LocalizedText} from '../LocalizedText.js';
import {Button, Checkbox, Icon, IconButton, Menu, MenuItem} from '../primitives/index.js';
import {ModalSheet} from '../primitives/ModalSheet.js';
import {NonModalPopover} from '../primitives/NonModalPopover.js';
import {activeElement} from './dom.js';
import {containsComposed, displaced, focusAvailable, logicalExit} from './focus.js';
import type {CalendarDataModel} from './model.js';
import {ModalLiveEndpoints, refocusDisplaced, trackSurfaceFocus} from './overlays.js';
import {usePortalTarget} from './portal.js';
import type {CalendarController} from './useCalendarController.js';
import {resolveClass} from './slots.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const owner = 'sources';

/**
 * §5.6 built-in source selector in the toolbar: a desktop `menu` of `menuitemcheckbox` items or a mobile modal sheet of
 * named checkboxes. It exists only with the controlled pair and at least two valid sources, unless hidden by
 * `showSourceSelector={false}`. When it disappears, the controller recovers focus that it held by §12.3 (roving cell,
 * status, toolbar, root): the trigger and its surface are gone.
 */
export function SourceSelector<I, S>({controller}: {controller: CalendarController<I, S>}) {
    const {model} = controller;
    const shown = model.kind === 'data' && sourceSelectorShown(model.records.sources.length, model.records.visibleSourceIds !== undefined, model.props.showSourceSelector);
    return shown ? <SourceSelectorControl controller={controller} model={model}/> : null;
}

function SourceSelectorControl<I, S>({controller, model}: {controller: CalendarController<I, S>; model: CalendarDataModel<I, S>}) {
    const {rootRef, overlays: stack, warn} = controller, trigger = useRef<HTMLButtonElement>(null), surface = useRef<HTMLDivElement | null>(null), domId = stack.domId(owner);
    const presentation = actionsPresentation(model.state.layout);
    const [open, setOpen] = useState<ActionsPresentation | null>(null);
    // R39: a presentation switch closes the standalone selector; it never opens the other presentation by itself. §9: a
    // committed blocking state closes it in the same commit (with its modal effects) and disables its trigger like the
    // navigation; nothing reopens when content returns, and focus inside goes to the state region (§12.3 step 5).
    const shown = open === presentation && !model.blocking ? open : null;
    // The node that last held focus inside the open surface (null once focus left it), and a requested return to the trigger.
    const owned = useRef<Element | null>(null), restore = useRef(false), frame = useRef(0);
    // Toggles use the latest committed model: the accepted filter, never an optimistic local state (§5.6, R27).
    const committed = useRef(model);
    useClientLayoutEffect(() => { committed.current = model; });
    const close = useCallback((returnFocus: boolean) => { if (returnFocus) restore.current = true; setOpen(null); }, []);
    // §10.3.4: a new accepted container closes the open selector with recovery; nothing reopens there.
    const {portal, refresh} = usePortalTarget(model.props.portalContainer, rootRef, warn, () => { if (shown) close(true); }, () => shown !== null);
    const toggle = (id: string) => {
        const latest = committed.current, accepted = latest.records.visibleSourceIds;
        const next = accepted && !latest.blocking && toggleSource(latest.records.sources, accepted, id);
        if (next) latest.props.onVisibleSourceIdsChange?.([...next]);
    };
    useClientLayoutEffect(() => shown ? stack.setAside({id: owner, modal: shown === 'sheet', element: () => surface.current}) : undefined, [stack, shown]);
    // Focus that left to another node closes the non-modal menu without recovery; an outside press closes it once the
    // target had its focus and click turn, then §12.3 returns displaced focus to the trigger.
    useEffect(() => {
        const root = rootRef.current, document = root?.ownerDocument, window = document?.defaultView;
        if (shown !== 'menu' || !root || !document || !window) return;
        const inside = (node: Element | null) => !!node && (node === trigger.current || !!surface.current && containsComposed(surface.current, node));
        const onFocus = () => {
            const active = activeElement(document);
            if (!active || active === document.body || inside(active)) return;
            owned.current = null; close(false);
        };
        // Only a primary press that starts and ends outside closes the menu (review 2026-10-09-2, as the agenda popover).
        const ours = (event: Event) => event.composedPath().some(target => target === trigger.current || target === surface.current);
        let started: 'inside' | 'outside' | null = null;
        const down = (event: PointerEvent) => { started = event.button === 0 && !ours(event) ? 'outside' : 'inside'; };
        const pointer = (event: PointerEvent) => {
            const outsidePress = started !== 'inside' && event.button === 0;
            started = null;
            if (ours(event) || !outsidePress) return;
            window.cancelAnimationFrame(frame.current);
            frame.current = window.requestAnimationFrame(() => { frame.current = 0; close(true); });
        };
        const scopes = new Set<EventTarget>([document, root.getRootNode(), ...(portal ? [portal.getRootNode()] : [])]);
        for (const scope of scopes) scope.addEventListener('focusin', onFocus, true);
        document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', pointer, true);
        return () => {
            for (const scope of scopes) scope.removeEventListener('focusin', onFocus, true);
            document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', pointer, true);
            window.cancelAnimationFrame(frame.current);
        };
    }, [shown, rootRef, portal, close]);
    // After the commit that removed the surface (and a sheet's inert background): focus displaced to body by the removal,
    // or by a switch while focus was inside, returns to the trigger. An external focus target is kept.
    useEffect(() => {
        const document = rootRef.current?.ownerDocument;
        if (shown !== null || !document) return;
        const switched = open !== null, last = owned.current, requested = restore.current || switched && !!last;
        if (switched) setOpen(null);
        restore.current = false; owned.current = null;
        const active = activeElement(document);
        if (requested && (!active || active === document.body || !!last && displaced(document, last))) focusAvailable(trigger.current);
    }, [rootRef, shown, open]);
    // IDREF only while both nodes are connected in the same tree scope (§12.2, R42).
    useEffect(() => {
        const button = trigger.current, target = surface.current?.querySelector(`[id="${domId}"]`);
        if (!shown || !button || !target?.isConnected || button.getRootNode() !== target.getRootNode()) return;
        button.setAttribute('aria-controls', target.id);
        return () => button.removeAttribute('aria-controls');
    }, [shown, portal, domId]);
    // §12.3: a source removed while focused (the set still has two or more) keeps focus in the open surface.
    const sourceList = model.records.sources;
    useClientLayoutEffect(() => { if (shown) refocusDisplaced(surface.current); }, [shown, sourceList]);
    useEffect(() => shown ? trackSurfaceFocus(surface.current) : undefined, [shown]);
    // §12.2 mobile sheet: the first enabled toggle, otherwise close.
    useEffect(() => {
        const node = surface.current;
        if (shown === 'sheet' && node && !focusAvailable(node.querySelector<HTMLElement>('input[type="checkbox"]'))) focusAvailable(node.querySelector<HTMLElement>('[data-sources-close]'));
    }, [shown]);
    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (shown !== 'menu' || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !trigger.current || !surface.current) return;
        // §12.2: the menu sits logically right after its trigger; the trigger itself is skipped.
        const target = logicalExit(trigger.current, surface.current, event.shiftKey), button = trigger.current;
        flushSync(() => close(false));
        if (target) { event.preventDefault(); event.stopPropagation(); if (!focusAvailable(target)) focusAvailable(button); }
        else focusAvailable(button);
    };
    const label = model.message('sourceSelectorLabel'), accepted = new Set(model.records.visibleSourceIds), sources = model.records.sources;
    // §10.3.3: a known source's color is also the accent marker of the source itself in the selector.
    const accent = (source: typeof sources[number]) => {
        const color = model.appearance.sourceAccent(source);
        return <span className="nc-source-accent" style={color !== undefined ? {color} : undefined}/>;
    };
    const sourceLabel = (id: string, title: string) => model.message(accepted.has(id) ? 'hideSourceLabel' : 'showSourceLabel', title);
    const track = (node: HTMLDivElement | null) => { surface.current = node; };
    const focusCapture = (event: {target: EventTarget}) => { owned.current = event.target as Element; };
    let overlay = null;
    if (shown === 'menu' && portal) overlay = <NonModalPopover anchor={trigger} portal={portal} kind="menu">
        <FocusScope><div ref={track} tabIndex={-1} className="nc-child-overlay" onKeyDown={keyDown} onFocusCapture={focusCapture}>
            <Menu id={domId} aria-label={label.text} autoFocus="first" selectionMode="multiple" selectedKeys={accepted}
                onSelectionChange={keys => {
                    if (keys === 'all') return;
                    // Controlled: RAC proposes the accepted set with one key toggled; the next props decide.
                    const changed = sources.filter(source => keys.has(source.id) !== accepted.has(source.id));
                    if (changed.length === 1) toggle(changed[0].id);
                }}>
                {sources.map(source => <MenuItem key={source.id} id={source.id} textValue={source.title} aria-label={sourceLabel(source.id, source.title).text}>
                    {({isSelected}) => <><span className="nc-menu-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>{accent(source)}<bdi dir="auto">{source.title}</bdi></>}
                </MenuItem>)}
            </Menu>
        </div></FocusScope>
    </NonModalPopover>;
    else if (shown === 'sheet' && portal) overlay = <ModalSheet portal={portal} onDismiss={() => close(true)} modalRef={track}>
        {/* §12.4: the endpoints belong to the modal subtree, inside the aria-modal element. */}
        <div id={domId} role="dialog" aria-modal="true" aria-labelledby={`${domId}-heading`} tabIndex={-1} className="nc-day-list nc-action-sheet"
            onKeyDown={keyDown} onFocusCapture={focusCapture}>
            <ModalLiveEndpoints owner={owner} stack={stack}/>
            <div className="nc-day-list-heading"><h3 id={`${domId}-heading`}><LocalizedText value={label}/></h3>
                <IconButton data-sources-close aria-label={model.message('cancelLabel').text} lang={model.message('cancelLabel').lang} onPress={() => close(true)}>
                    <Icon name="close"/></IconButton></div>
            <div className="nc-action-list">{sources.map(source => {
                const name = sourceLabel(source.id, source.title);
                return <Checkbox key={source.id} isSelected={accepted.has(source.id)} aria-label={name.text} onChange={() => toggle(source.id)}>
                    {accent(source)}<bdi dir="auto">{source.title}</bdi></Checkbox>;
            })}</div>
        </div>
    </ModalSheet>;
    return <>
        <Button ref={trigger} data-source-selector className={resolveClass(model.props.classNames?.sourceSelector, model.state)} lang={label.lang} aria-haspopup={presentation === 'menu' ? 'menu' : 'dialog'} aria-expanded={shown !== null}
            isDisabled={model.blocking} onPress={() => {
                if (shown) { close(true); return; }
                // A host dialog may have opened around the Calendar since mount (QA-03).
                refresh(); restore.current = false; setOpen(presentation);
            }}><LocalizedText value={label}/></Button>
        {overlay}
    </>;
}
