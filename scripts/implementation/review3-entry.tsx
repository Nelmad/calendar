import {StrictMode, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {Button, Dialog, DialogTrigger, Modal, ModalOverlay, Popover} from 'react-aria-components';
import {Calendar} from '../../src/index.js';

// Review 2026-10-09-3 probe entry: the public facade in development StrictMode, alone or inside a React Aria Components
// Modal or Popover (both render role="dialog" without aria-modal); `own` passes the host dialog as portalContainer.
type Props = Record<string, unknown>;
const Untyped = Calendar as unknown as (props: Props) => ReactNode;

export function mount(container: Element, initial: Props) {
    let props = initial;
    const root = createRoot(container), render = () => flushSync(() => root.render(<StrictMode><Untyped {...props}/></StrictMode>));
    render();
    return {patch(next: Props) { props = {...props, ...next}; render(); }, unmount: () => root.unmount()};
}

function Hosted({props, kind, own}: {props: Props; kind: 'modal' | 'popover'; own: boolean}) {
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const calendar = (!own || panel) && <Untyped {...props} {...(own ? {portalContainer: panel} : {})}/>;
    if (kind === 'modal') {
        return <ModalOverlay isOpen style={{position: 'fixed', inset: 0, zIndex: 1000, background: 'rgb(0 0 0 / 30%)'}}>
            <Modal style={{background: '#fff', margin: '24px auto', width: 900, padding: 16}}>
                <Dialog ref={setPanel} aria-label="Planner" id="host-dialog">{calendar}</Dialog>
            </Modal>
        </ModalOverlay>;
    }
    return <DialogTrigger defaultOpen>
        <Button id="host-trigger">Planner</Button>
        <Popover placement="bottom start" style={{background: '#fff', width: 900, padding: 16, border: '1px solid #999'}}>
            <Dialog ref={setPanel} aria-label="Planner" id="host-dialog">{calendar}</Dialog>
        </Popover>
    </DialogTrigger>;
}
export function mountHosted(container: Element, props: Props, kind: 'modal' | 'popover', own: boolean) {
    const root = createRoot(container);
    flushSync(() => root.render(<StrictMode><Hosted props={props} kind={kind} own={own}/></StrictMode>));
    return {unmount: () => root.unmount()};
}
