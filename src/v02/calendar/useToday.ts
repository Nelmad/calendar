import {useEffect, useState, type RefObject} from 'react';
import {todaySnapshot} from '../core/today.js';
import type {createControllerServices} from './model.js';

export function useToday(root: RefObject<HTMLElement>, zone: string | undefined, snapshot: string | undefined, services: ReturnType<typeof createControllerServices>) {
    const [computed, setComputed] = useState<{zone: string; date: string} | null>(null);
    useEffect(() => {
        if (!zone || snapshot !== undefined) return;
        const document = root.current?.ownerDocument, window = document?.defaultView;
        if (!document || !window) return;
        let timer: number | undefined, current: string | undefined;
        const sync = () => {
            if (timer !== undefined) window.clearTimeout(timer);
            const now = Date.now(), next = todaySnapshot(now, zone, services.dates);
            // Only a new date is written (QA-01): visibilitychange re-syncs without a render.
            if (next.date !== current) { current = next.date; setComputed({zone, date: next.date}); }
            timer = window.setTimeout(sync, Math.max(1, Math.min(2_147_483_647, next.nextBoundary - now)));
        };
        sync();
        document.addEventListener('visibilitychange', sync);
        return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', sync); };
    }, [root, zone, snapshot, services]);
    return snapshot ?? (computed && computed.zone === zone ? computed.date : null);
}
