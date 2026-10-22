// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import type {CalendarItem} from '../../reference.js';
import {actionsPresentation, createActionResolver, findAction} from '../actions.js';
import {sourceSelectorShown, toggleSource} from '../sources.js';

const item = (id: string): CalendarItem => ({id, title: id, data: {}, interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}});

describe('generic item actions (§5.5)', () => {
    it('chooses the desktop menu or the mobile action sheet from the resolved layout', () => {
        expect(actionsPresentation('desktop')).toBe('menu');
        expect(actionsPresentation('mobile')).toBe('sheet');
    });
    it('resolves each item object once per resolver and excludes invalid or duplicate actions with item-scoped diagnostics', () => {
        const getItemActions = vi.fn((record: CalendarItem) => record.id === 'a' ? [
            {id: 'open', label: 'Open'}, {id: 'delete', label: 'Delete', tone: 'danger' as const}, {id: 'x', label: '  '}, {id: 'dup', label: 'One'}, {id: 'dup', label: 'Two'},
            {id: 'tone', label: 'Tone', tone: 'loud' as never}] : []);
        const resolver = createActionResolver(getItemActions), a = item('a');
        const first = resolver.resolve(a);
        expect(first.actions.map(action => action.id)).toEqual(['open', 'delete']);
        expect(resolver.resolve(a)).toBe(first); expect(getItemActions).toHaveBeenCalledTimes(1);
        expect(resolver.drain().map(diagnostic => diagnostic.path)).toEqual(['getItemActions("a").actions[2]', 'getItemActions("a").actions[3]',
            'getItemActions("a").actions[4]', 'getItemActions("a").actions[5]']);
        // Diagnostics are reported once each; a new item object with the same content resolves again without repeating them.
        expect(resolver.drain()).toEqual([]);
        resolver.resolve({...a}); expect(getItemActions).toHaveBeenCalledTimes(2); expect(resolver.drain()).toEqual([]);
        expect(resolver.resolve(item('b')).actions).toEqual([]);
    });
    it('treats a non-array result as an empty set with one diagnostic, and an absent pair as no actions at all', () => {
        const resolver = createActionResolver(() => 'open' as never);
        expect(resolver.resolve(item('a')).actions).toEqual([]);
        expect(resolver.drain()).toEqual([{code: 'invalid-record', path: 'getItemActions("a").actions', reason: 'Expected an array'}]);
        const none = createActionResolver(undefined);
        expect(none.resolve(item('a')).actions).toEqual([]); expect(none.drain()).toEqual([]);
    });
    it('finds only actions of the given committed set', () => {
        const resolved = createActionResolver(() => [{id: 'open', label: 'Open'}]).resolve(item('a'));
        expect(findAction(resolved, 'open')).toEqual({id: 'open', label: 'Open'});
        expect(findAction(resolved, 'share')).toBeUndefined();
    });
});

describe('controlled sources (§5.6)', () => {
    const sources = [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}, {id: 'team', title: 'Team'}];
    it('returns unique known IDs in sources order, never in press order', () => {
        expect(toggleSource(sources, ['team'], 'work')).toEqual(['work', 'team']);
        expect(toggleSource(sources, ['work', 'home', 'team'], 'home')).toEqual(['work', 'team']);
        expect(toggleSource(sources, [], 'team')).toEqual(['team']);
    });
    it('sends nothing for an unknown source', () => {
        expect(toggleSource(sources, ['work'], 'missing')).toBeUndefined();
    });
    it('shows the built-in selector only with the controlled pair and at least two valid sources, unless hidden', () => {
        expect(sourceSelectorShown(2, true, undefined)).toBe(true);
        expect(sourceSelectorShown(2, true, true)).toBe(true);
        expect(sourceSelectorShown(2, true, false)).toBe(false);
        expect(sourceSelectorShown(1, true, true)).toBe(false);
        expect(sourceSelectorShown(5, false, undefined)).toBe(false);
    });
});
