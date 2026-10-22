import {useEffect, useState, type RefObject} from 'react';
import {validatedLabelledBy} from './dom.js';

export function useRootName(root: RefObject<HTMLElement>, requested: string | undefined, warn: (path: string, reason: string) => void) {
    const [accepted, setAccepted] = useState<{requested: string | undefined; value: string | undefined} | null>(null);
    useEffect(() => {
        const element = root.current, view = element?.ownerDocument.defaultView, Observer = view?.MutationObserver;
        // No reference names nothing and warns about nothing: no observer is needed (§11.3).
        if (!element || !view || !Observer || !requested?.trim()) return;
        let scope: Node | null = null, frame = 0;
        const observer = new Observer(() => update());
        let last: string | undefined | null = null;
        const update = () => {
            // A detached root (rendered before its container is attached) waits for the insertion in its document, so
            // a later connection is validated (§5.7: connectivity changes re-validate; review 2026-10-09-2).
            const currentScope = element.isConnected ? element.getRootNode() : element.ownerDocument;
            if (currentScope !== scope) {
                observer.disconnect(); scope = currentScope;
                // Generated labels may use content: attr(data-...), so name changes
                // are not limited to a fixed set of ARIA/HTML attributes.
                observer.observe(scope, {subtree: true, childList: true, characterData: true, attributes: true});
            }
            // A root being removed (unmount, client navigation) is no longer named by anything: the observer can
            // run between the removal and this effect's cleanup, so validating it would warn falsely (QA-23).
            // A document observer never sees an insertion into a ShadowRoot, so a detached root also re-checks its
            // connection once per frame until it is connected (review 2026-10-09-2, round 2).
            if (!element.isConnected) { if (!frame) frame = view.requestAnimationFrame(() => { frame = 0; update(); }); return; }
            const result = validatedLabelledBy(element, requested);
            // Only a changed name is written: every observed DOM mutation runs this check.
            if (result.value !== last) { last = result.value; setAccepted({requested, value: result.value}); }
            if (result.invalid.length) warn('aria-labelledby', `Ignored missing, empty or cross-tree references: ${result.invalid.join(' ')}`);
        };
        update();
        return () => { observer.disconnect(); if (frame) view.cancelAnimationFrame(frame); };
    }, [root, requested, warn]);
    return accepted && accepted.requested === requested ? accepted.value : undefined;
}
