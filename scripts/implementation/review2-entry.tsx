import {StrictMode, Suspense, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {Button, Dialog, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {Calendar} from '../../src/index.js';

// Review 2026-10-09-2 probe entry: the public facade in development StrictMode; a React Aria Components host modal (it
// renders no aria-modal) opened from onItemPress; a Suspense boundary that re-suspends already revealed content.
type Props = Record<string, unknown>;
const Untyped = Calendar as unknown as (props: Props) => ReactNode;

export function mount(container: Element, initial: Props) {
    let props = initial;
    const root = createRoot(container), render = () => flushSync(() => root.render(<StrictMode><Untyped {...props}/></StrictMode>));
    render();
    return {patch(next: Props) { props = {...props, ...next}; render(); }, unmount: () => root.unmount()};
}

let setHostOpen: ((open: boolean) => void) | null = null;
function HostPage({props}: {props: Props}) {
    const [open, setOpen] = useState(false);
    setHostOpen = setOpen;
    return <>
        <Untyped {...props} onItemPress={() => setOpen(true)}/>
        <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable style={{position: 'fixed', inset: 0, zIndex: 200000, background: 'rgb(0 0 0 / 30%)'}}>
            <Modal style={{background: '#fff', margin: '100px auto', width: 300, padding: 20}}>
                <Dialog aria-label="Item details" id="host-dialog"><Heading slot="title">Details</Heading>
                    <input id="host-input" aria-label="Note"/><Button id="host-close" onPress={() => setOpen(false)}>Close details</Button></Dialog>
            </Modal>
        </ModalOverlay>
    </>;
}
export function mountHost(container: Element, initial: Props) {
    let props = initial;
    const root = createRoot(container), render = () => flushSync(() => root.render(<StrictMode><HostPage props={props}/></StrictMode>));
    render();
    return {patch(next: Props) { props = {...props, ...next}; render(); }, closeHost: () => flushSync(() => setHostOpen?.(false)), unmount: () => root.unmount()};
}

let pending: Promise<void> | null = null, release: (() => void) | null = null;
function Gate() { if (pending) throw pending; return null; }
export function mountSuspense(container: Element, props: Props) {
    const root = createRoot(container);
    const render = () => flushSync(() => root.render(<StrictMode><Suspense fallback={<p id="fallback">Loading…</p>}><Gate/><Untyped {...props}/></Suspense></StrictMode>));
    render();
    return {
        // A non-transition update that re-suspends revealed content: React hides the boundary and keeps portals.
        suspend() { pending = new Promise(resolve => { release = () => { pending = null; resolve(); }; }); render(); },
        resume() { release?.(); },
        unmount: () => root.unmount(),
    };
}
