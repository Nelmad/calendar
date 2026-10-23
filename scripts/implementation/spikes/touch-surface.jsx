import {useEffect, useRef, useState} from 'react';
import {createPortal, flushSync} from 'react-dom';
import {Button, Dialog, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {createTouchSession, LONG_PRESS_MS, MOVE_SLOP_PX} from './touch-session.js';
import './touch.css';

export function TouchSurface({portalContainer}) {
    const owner = useRef(null);
    const firstDay = useRef(null);
    const controller = useRef(null);
    const targetDate = useRef(null);
    const ready = useRef(false);
    const [sheet, setSheet] = useState(false);
    const [draft, setDraft] = useState(false);
    const [target, setTarget] = useState(null);
    const [events, setEvents] = useState([]);
    const [requests, setRequests] = useState(0);
    const [activations, setActivations] = useState(0);
    const [origin, setOrigin] = useState(true);
    const [enabled, setEnabled] = useState(true);
    const append = event => setEvents(old => [...old, event]);
    useEffect(() => {
        if (!enabled) return;
        const instance = createTouchSession({document, owner: owner.current, emit: append,
            onStart() {
                ready.current = false;
                targetDate.current = null;
                flushSync(() => { setDraft(true); setSheet(false); });
            },
            onMove(x, y) {
                if (!ready.current) return;
                const root = firstDay.current.getRootNode();
                let element = root.elementFromPoint(x, y);
                while (element?.shadowRoot) element = element.shadowRoot.elementFromPoint(x, y);
                const date = element?.closest('[data-date]')?.dataset.date ?? null;
                targetDate.current = date;
                setTarget(date);
            },
            onFinish({active, commit, reason}) {
                if (active && commit && ready.current && targetDate.current) {
                    setRequests(old => old + 1);
                    append({name: 'request', target: targetDate.current, at: performance.now()});
                }
                if (active) append({name: 'draft-cleanup', reason, at: performance.now()});
                ready.current = false; targetDate.current = null;
                setDraft(false); setTarget(null);
            },
        });
        controller.current = instance;
        return () => { instance.dispose(); controller.current = null; };
    }, [enabled]);
    useEffect(() => {
        if (!draft || sheet) return;
        let frame;
        const restore = () => {
            const cell = firstDay.current;
            let node = cell;
            let inert = false;
            while (node) { inert ||= !!node.inert; node = node.parentNode ?? node.host; }
            if (inert || document.documentElement.style.overflow === 'hidden') { frame = requestAnimationFrame(restore); return; }
            cell.focus();
            ready.current = true;
            append({name: 'grid-ready', at: performance.now(), focused: cell.getRootNode().activeElement === cell});
        };
        frame = requestAnimationFrame(restore);
        return () => cancelAnimationFrame(frame);
    }, [draft, sheet]);
    const closeSheet = open => {
        if (!open) controller.current?.cancel('sheet-dismissed');
        setSheet(open);
    };
    return <main className="touch-fixture">
        <h1>Touch feasibility</h1>
        <p>Long press {LONG_PRESS_MS} ms, movement tolerance {MOVE_SLOP_PX} CSS px. Drag from the dotted handle; scroll on the item title.</p>
        <div role="grid" aria-label="Fixture dates"><div role="row" className="touch-grid">
            <div ref={firstDay} role="gridcell" tabIndex={0} id="touch-day" data-date="2026-09-03">3 September</div>
            <div role="gridcell" tabIndex={-1} id="touch-target" data-date="2026-09-04">4 September</div>
        </div></div>
        <Button id="touch-open" onPress={() => { setOrigin(true); setSheet(true); }}>Open touch sheet</Button>
        <Button id="touch-remove" onPress={() => { controller.current?.cancel('origin-removed'); setOrigin(false); }}>Remove origin</Button>
        <Button id="touch-disable" onPress={() => setEnabled(false)}>Unmount recognizer</Button>
        <output id="touch-state" data-draft={draft} data-requests={requests} data-activations={activations} data-target={target ?? ''} data-ready={ready.current}>
            Requests: {requests}. Activations: {activations}. {draft ? 'Moving' : 'Idle'}.
        </output>
        {enabled && createPortal(<div ref={owner} id="touch-owner" className="touch-owner" aria-hidden="true" />, portalContainer)}
        <ModalOverlay UNSTABLE_portalContainer={portalContainer} isOpen={sheet} onOpenChange={closeSheet} isDismissable className="touch-backdrop">
            <Modal className="touch-modal"><Dialog aria-label="Touch agenda">
                <Heading slot="title">Touch agenda</Heading>
                <Button id="touch-close" onPress={() => closeSheet(false)}>Close</Button>
                <div id="touch-scroll" className="touch-scroll">
                    {Array.from({length: 24}, (_, index) => <div className="touch-row" key={index}>
                        <button id={index === 0 ? 'touch-primary' : undefined} className="touch-primary" onClick={() => setActivations(old => old + 1)}>Item {index + 1}</button>
                        {index === 0 && origin && enabled && <div id="touch-handle" data-touch-handle className="touch-handle" aria-hidden="true">⠿</div>}
                    </div>)}
                </div>
            </Dialog></Modal>
        </ModalOverlay>
        <pre id="touch-events">{JSON.stringify(events)}</pre>
    </main>;
}
