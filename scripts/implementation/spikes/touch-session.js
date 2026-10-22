// T02 experiment, not the SDK move controller. Thresholds remain candidates.
export const LONG_PRESS_MS = 450;
export const MOVE_SLOP_PX = 8;

export function createTouchSession({document, owner, onStart, onMove, onFinish, emit}) {
    let session = null;
    const touches = new Set();
    const suppressClicks = new Set();
    const log = (name, detail = {}) => emit({name, at: performance.now(), ...detail});
    const finish = (reason, commit = false) => {
        if (!session) return;
        const previous = session;
        session = null;
        clearTimeout(previous.timer);
        if (previous.active || reason !== 'tap') suppressClicks.add(previous.id);
        if (owner.hasPointerCapture(previous.id)) owner.releasePointerCapture(previous.id);
        log(previous.active ? (commit ? 'pointer-released' : 'draft-cancelled') : 'pending-cancelled', {reason, pointerId: previous.id});
        onFinish({active: previous.active, commit, reason});
    };
    const down = event => {
        if (event.pointerType !== 'touch') return;
        touches.add(event.pointerId);
        suppressClicks.delete(event.pointerId);
        if (touches.size > 1) { suppressClicks.add(event.pointerId); finish('multiple-pointers'); return; }
        const handle = event.composedPath().find(node => node?.dataset?.touchHandle !== undefined);
        if (!handle || !event.isPrimary || session) return;
        const next = {id: event.pointerId, x: event.clientX, y: event.clientY, active: false};
        session = next;
        log('pending', {pointerId: next.id, trusted: event.isTrusted});
        next.timer = setTimeout(() => {
            if (session !== next) return;
            if (!handle.isConnected) return finish('source-detached');
            try {
                owner.setPointerCapture(next.id);
                if (!owner.hasPointerCapture(next.id)) throw new Error('Capture not confirmed');
            } catch (error) { log('capture-failed', {error: String(error)}); finish('capture-failed'); return; }
            next.active = true;
            log('capture-confirmed', {connected: owner.isConnected, hidden: owner.getAttribute('aria-hidden'), sameScope: owner.getRootNode() === handle.getRootNode()});
            onStart();
            log('draft-started');
        }, LONG_PRESS_MS);
    };
    const move = event => {
        if (event.pointerId !== session?.id) return;
        if (!session.active) {
            if (Math.hypot(event.clientX - session.x, event.clientY - session.y) > MOVE_SLOP_PX) finish('movement-before-long-press');
        } else {
            log('captured-move', {trusted: event.isTrusted, captured: owner.hasPointerCapture(event.pointerId)});
            onMove(event.clientX, event.clientY);
        }
    };
    const up = event => {
        touches.delete(event.pointerId);
        if (event.pointerId === session?.id) finish(session.active ? 'pointerup' : 'tap', session.active);
    };
    const cancel = event => {
        touches.delete(event.pointerId);
        log('pointercancel', {pointerId: event.pointerId, trusted: event.isTrusted});
        if (event.pointerId === session?.id) finish('pointercancel');
    };
    const lost = event => { if (event.pointerId === session?.id && session.active) finish('lostpointercapture'); };
    const click = event => {
        if (!suppressClicks.has(event.pointerId)) return;
        suppressClicks.delete(event.pointerId);
        event.preventDefault(); event.stopImmediatePropagation(); log('click-suppressed');
    };
    const contextMenu = event => {
        if (session || event.composedPath().some(node => node?.dataset?.touchHandle !== undefined)) event.preventDefault();
    };
    const key = event => { if (event.key === 'Escape') finish('escape'); };
    const blur = () => finish('window-blur');
    const listeners = {pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, click, contextmenu: contextMenu, keydown: key};
    for (const [type, listener] of Object.entries(listeners)) document.addEventListener(type, listener, true);
    owner.addEventListener('lostpointercapture', lost);
    document.defaultView.addEventListener('blur', blur);
    return {
        cancel: reason => finish(reason),
        dispose() {
            finish('unmount');
            for (const [type, listener] of Object.entries(listeners)) document.removeEventListener(type, listener, true);
            owner.removeEventListener('lostpointercapture', lost);
            document.defaultView.removeEventListener('blur', blur);
        },
    };
}
