import {forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type HTMLAttributes} from 'react';
import {mirrorTheme} from './mirror.js';
import {themeAttributes, useThemeScope} from './ThemeRoot.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const media = ['(prefers-color-scheme: dark)', '(forced-colors: active)', '(prefers-reduced-motion: reduce)'];
const seen = new WeakSet<HTMLElement>(), pending = new WeakSet<HTMLElement>();

/**
 * Package-owned theme root of a portal overlay (§10.3.4): the owner's theme attributes plus a mirror of
 * its resolved public variables and font properties. The node is hidden and takes no input until the
 * layout-effect mirror ran, so the owner's initial focus and announcements always see mirrored values.
 */
export const PortalTheme = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function PortalTheme({className, ...props}, ref) {
    const scope = useThemeScope(), node = useRef<HTMLDivElement | null>(null), {owner, mirror} = scope;
    const attach = useCallback((element: HTMLDivElement | null) => {
        if (element && !seen.has(element)) {
            seen.add(element); pending.add(element); element.style.visibility = 'hidden';
            // Descendants whose style was computed before the mirror (focus, measurement) would otherwise transition from
            // the preset defaults to the mirrored values after the reveal.
            element.setAttribute('data-nc-mirror-pending', '');
        }
        node.current = element;
        if (typeof ref === 'function') ref(element); else if (ref) ref.current = element;
    }, [ref]);
    const refresh = useCallback(() => {
        const target = node.current, root = owner?.current;
        if (!target || !root) return;
        mirrorTheme(root, target);
        if (!pending.delete(target)) return;
        // The mirrored values are computed while transitions are off, so turning them on again changes no value.
        void target.offsetHeight;
        target.removeAttribute('data-nc-mirror-pending');
        target.style.removeProperty('visibility');
    }, [owner]);
    // Every committed render of this portal, which re-renders with its owning Calendar.
    useClientLayoutEffect(refresh);
    useEffect(() => {
        const window = node.current?.ownerDocument.defaultView;
        const queries = window?.matchMedia ? media.map(query => window.matchMedia(query)) : [];
        for (const query of queries) query.addEventListener?.('change', refresh);
        window?.addEventListener('resize', refresh);
        const unsubscribe = mirror?.subscribe(refresh);
        // Owner resize checkpoint while this portal is open, also for a forced layout, whose Calendar observes no width.
        const root = owner?.current, view = root?.ownerDocument.defaultView;
        const resize = root && view?.ResizeObserver ? new view.ResizeObserver(refresh) : null;
        if (root) resize?.observe(root);
        return () => {
            for (const query of queries) query.removeEventListener?.('change', refresh);
            window?.removeEventListener('resize', refresh);
            unsubscribe?.(); resize?.disconnect();
        };
    }, [mirror, owner, refresh]);
    return <div {...props} {...themeAttributes(scope)} ref={attach} className={['nc-theme', className].filter(Boolean).join(' ')}/>;
});
