import {describe, expect, it} from 'vitest';
import {acceptPortal, closeOverlay, liveOwners, modalDepth, outsidePress, parentFallback, pushOverlay, topOverlay, type OverlayStack} from '../overlayStack.js';

const agenda = {id: 'agenda', parent: null, modal: false}, sheet = {id: 'agenda', parent: null, modal: true};
const menu = {id: 'menu', parent: 'agenda', modal: false}, actions = {id: 'actions', parent: 'agenda', modal: true};
const nested = {id: 'nested', parent: 'actions', modal: true};
const ids = (stack: OverlayStack) => stack.map(entry => entry.id);

describe('overlay ownership tree (§12.2, §12.3)', () => {
    it('opens children above their parent and refuses orphans', () => {
        const root = pushOverlay([], agenda).stack;
        expect(ids(pushOverlay(root, menu).stack)).toEqual(['agenda', 'menu']);
        expect(pushOverlay(root, {id: 'x', parent: 'missing', modal: false})).toEqual({stack: root, closed: []});
        expect(pushOverlay([], menu).stack).toEqual([]);
    });
    it('a parent has one open child: opening a sibling closes the previous subtree top-down first', () => {
        const stack = [sheet, actions, nested] as OverlayStack;
        const change = pushOverlay(stack, {id: 'other', parent: 'agenda', modal: true});
        expect(ids(change.stack)).toEqual(['agenda', 'other']); expect(ids(change.closed)).toEqual(['nested', 'actions']);
    });
    it('closes an entry with its descendants deepest first; unknown ids change nothing', () => {
        const stack = [sheet, actions, nested] as OverlayStack;
        expect(ids(closeOverlay(stack, 'actions').closed)).toEqual(['nested', 'actions']);
        expect(ids(closeOverlay(stack, 'agenda').closed)).toEqual(['nested', 'actions', 'agenda']);
        expect(closeOverlay(stack, 'unknown')).toEqual({stack, closed: []});
    });
    it('Escape targets the top entry; modal depth and the live owner follow the top-most modal surface', () => {
        expect(topOverlay([agenda, menu])?.id).toBe('menu'); expect(topOverlay([])).toBeUndefined();
        expect(modalDepth([sheet, actions, nested])).toBe(3); expect(modalDepth([agenda, menu])).toBe(0);
        expect(liveOwners([sheet, actions, nested])).toEqual(['nested', 'actions', 'agenda']); expect(liveOwners([sheet])).toEqual(['agenda']);
        expect(liveOwners([agenda, menu])).toEqual([]); expect(liveOwners([])).toEqual([]);
    });
    it('an outside press closes only the non-modal entries above the pressed one; modal entries own their backdrop', () => {
        expect(ids(outsidePress([agenda, menu], 'agenda'))).toEqual(['menu']);
        expect(ids(outsidePress([agenda, menu], null))).toEqual(['menu', 'agenda']);
        expect(outsidePress([agenda, menu], 'menu')).toEqual([]);
        expect(outsidePress([sheet, actions], 'agenda')).toEqual([]);
    });
    it('§12.3 step 2 picks the next usable control after the former trigger position, then the previous one', () => {
        const order = ['close', 'alpha', 'trigger', 'beta', 'gamma'];
        expect(parentFallback(order, 2, node => node !== 'trigger')).toBe('beta');
        expect(parentFallback(order, 2, node => node === 'close' || node === 'alpha')).toBe('alpha');
        expect(parentFallback(order, 2, () => false)).toBeUndefined();
        // A trigger that was not tabbable at open (-1) searches the whole order forward.
        expect(parentFallback(order, -1, node => node === 'gamma')).toBe('gamma');
    });
});

describe('portalContainer acceptance (§10.3.4, R53)', () => {
    const document = {}, other = {};
    const element = (overrides: object = {}) => ({nodeType: 1, isConnected: true, ownerDocument: document, ...overrides});
    it('missing or null is the default without a diagnostic', () => {
        expect(acceptPortal(undefined, document)).toEqual({accepted: null}); expect(acceptPortal(null, document)).toEqual({accepted: null});
    });
    it('accepts a connected Element or ShadowRoot of the same owner document by identity', () => {
        const node = element(), shadow = element({nodeType: 11, host: element()});
        expect(acceptPortal(node, document).accepted).toBe(node); expect(acceptPortal(shadow, document).accepted).toBe(shadow);
    });
    it.each([
        ['detached element', element({isConnected: false}), 'Detached container; using the default container'],
        ['element of another document', element({ownerDocument: other}), "Container belongs to another document; using the calendar's document body"],
        ['plain DocumentFragment', element({nodeType: 11}), 'Expected an Element or ShadowRoot; using the default container'],
        ['text node', element({nodeType: 3}), 'Expected an Element or ShadowRoot; using the default container'],
        ['runtime string', 'body', 'Expected an Element or ShadowRoot; using the default container'],
    ])('falls back to the default for a %s with a diagnostic', (_name, value, reason) => {
        expect(acceptPortal(value as never, document)).toEqual({accepted: null, reason});
    });
});
