import {useEffect, useRef, useState} from 'react';
import {Button, Checkbox, Dialog, DialogTrigger, Heading, Menu, MenuItem, MenuTrigger, Modal, ModalOverlay, Popover} from 'react-aria-components';
import {parseDate} from '@internationalized/date';
import {enableShadowDOM} from '@react-stately/flags';
import './styles.css';

// Host bootstrap is exported only by this private probe, never the Calendar API.
export function configureFeasibilityRuntime() { enableShadowDOM(); }

// T02 only: intentionally small, no claim to implement Calendar semantics.
export function FeasibilitySurface({portalContainer} = {}) {
    const anchor = useRef(null);
    const sessionOwner = useRef(null);
    const [agenda, setAgenda] = useState(false);
    const [sheet, setSheet] = useState(false);
    const [menu, setMenu] = useState(false);
    const [nested, setNested] = useState(false);
    const [focusTarget, setFocusTarget] = useState(null);
    const [events, setEvents] = useState([]);
    const [date, setDate] = useState('2026-09-03');
    const append = value => setEvents(old => [...old, value]);
    useEffect(() => {
        if (!focusTarget) return;
        const frame = requestAnimationFrame(() => {
            const roots = [sessionOwner.current?.getRootNode(), portalContainer?.getRootNode(), document];
            roots.map(root => root?.getElementById(focusTarget)).find(Boolean)?.focus();
            setFocusTarget(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [focusTarget, portalContainer]);
    const focusNext = direction => {
        setAgenda(false);
        // A bounded experiment for the logical exit, not a general composed-order traversal.
        setFocusTarget(direction === 'forward' ? 'after-grid' : 'before-grid');
    };
    const handoff = event => {
        const owner = sessionOwner.current;
        owner.setPointerCapture(event.pointerId);
        append(`capture-before-close:${owner.hasPointerCapture(event.pointerId)}`);
        setSheet(false);
    };
    return <main ref={sessionOwner}
        onGotPointerCapture={() => append('capture-active')}
        onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) append('captured-move');
        }}
        onLostPointerCapture={() => append('capture-ended')}>
        <h1>T02 feasibility fixtures</h1>
        <p>Private experiments for date runtime, focus and pointer capture.</p>
        <Button id="before-grid">Before grid</Button>
        <div ref={anchor} aria-label="Fixture calendar" className="calendar">
            <div role="grid" aria-label="September 2026">
                <div role="row"><div role="gridcell" tabIndex={0} id="day"
                    onClick={() => setAgenda(true)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setAgenda(true); } }}>
                    {date}
                </div></div>
            </div>
        </div>
        <Button id="after-grid">After grid</Button>
        <Button onPress={() => setDate(parseDate(date).add({days: 1}).toString())}>Advance date</Button>
        <Button id="open-sheet" onPress={() => setSheet(true)}>Open sheet</Button>
        <Popover UNSTABLE_portalContainer={portalContainer} isOpen={agenda} onOpenChange={setAgenda} triggerRef={anchor} isNonModal
            placement="bottom" className="popover">
            <Dialog aria-label="Day agenda"><div onKeyDownCapture={event => {
                if (event.key !== 'Tab') return;
                const target = event.target;
                if (event.shiftKey && target.id === 'agenda-first') { event.preventDefault(); focusNext('backward'); }
                if (!event.shiftKey && target.id === 'agenda-last') { event.preventDefault(); focusNext('forward'); }
            }}>
                <Heading slot="title">Day agenda</Heading>
                <Button id="agenda-first" autoFocus>Open item</Button>
                <MenuTrigger isOpen={menu} onOpenChange={open => { setMenu(open); if (!open) setFocusTarget('item-actions'); }}>
                    <Button id="item-actions">Item actions</Button>
                    <Popover UNSTABLE_portalContainer={portalContainer} className="popover"><Menu aria-label="Item actions"><MenuItem id="open">Open</MenuItem><MenuItem id="remove">Remove</MenuItem></Menu></Popover>
                </MenuTrigger>
                <Button id="agenda-last">Last action</Button>
            </div></Dialog>
        </Popover>
        <ModalOverlay UNSTABLE_portalContainer={portalContainer} isOpen={sheet} onOpenChange={setSheet} isDismissable className="backdrop">
            <Modal className="modal"><Dialog aria-label="Agenda sheet">
                <Heading slot="title">Agenda sheet</Heading>
                <Button onPress={() => setSheet(false)}>Close sheet</Button>
                <div id="handoff" className="handoff" onPointerDown={handoff}>Capture and close sheet</div>
                <Checkbox defaultSelected>Visible source</Checkbox>
                <DialogTrigger isOpen={nested} onOpenChange={open => { setNested(open); if (!open) setFocusTarget("nested-trigger"); }}><Button id="nested-trigger">Nested dialog</Button><ModalOverlay UNSTABLE_portalContainer={portalContainer} className="backdrop"><Modal className="modal"><Dialog aria-label="Nested"><Heading slot="title">Nested</Heading><Button slot="close">Close nested</Button></Dialog></Modal></ModalOverlay></DialogTrigger>
            </Dialog></Modal>
        </ModalOverlay>
        <pre id="capture-events">{events.join('\n')}</pre>
    </main>;
}
