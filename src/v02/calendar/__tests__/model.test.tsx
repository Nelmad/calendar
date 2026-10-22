import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import * as layout from '../../core/layout.js';
import * as validation from '../../core/validation.js';
import type * as LayoutModule from '../../core/layout.js';
import type * as ValidationModule from '../../core/validation.js';
import {createCalendarModel, createControllerServices} from '../model.js';

// QA-01: the model is memoized by its real inputs; unchanged items are never re-validated or re-indexed.
vi.mock('../../core/validation.js', async original => {
    const actual = await original<typeof ValidationModule>();
    return {...actual, validateRecords: vi.fn(actual.validateRecords)};
});
vi.mock('../../core/layout.js', async original => {
    const actual = await original<typeof LayoutModule>();
    return {...actual, orderItems: vi.fn(actual.orderItems), indexRange: vi.fn(actual.indexRange)};
});
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-09-03', end: '2026-09-05'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-09-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, timeZone: 'UTC', locale: 'en-US', today: '2026-09-03', anchorDate: '2026-09-01', layout: 'desktop', onNavigate() {}});
const calls = () => ({records: vi.mocked(validation.validateRecords).mock.calls.length, order: vi.mocked(layout.orderItems).mock.calls.length,
    range: vi.mocked(layout.indexRange).mock.calls.length});
beforeEach(() => { vi.mocked(validation.validateRecords).mockClear(); vi.mocked(layout.orderItems).mockClear(); vi.mocked(layout.indexRange).mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('memoized calendar model (QA-01)', () => {
    it('returns the identical model for a new props object with the same values and resolved layout', () => {
        const model = createCalendarModel(createControllerServices());
        const props = input(), first = model(props, 'desktop');
        expect(model({...props}, 'desktop')).toBe(first);
        expect(model({...props}, 'mobile')).not.toBe(first);
        expect(calls()).toEqual({records: 1, order: 1, range: 1});
    });
    it('a new callback identity keeps the validated records and the index', () => {
        const model = createCalendarModel(createControllerServices());
        const first = model(input(), 'desktop'), second = model({...input(), onNavigate() {}}, 'desktop');
        expect(second).not.toBe(first);
        if (first.kind !== 'data' || second.kind !== 'data') throw new Error('Expected data models');
        expect(second.records).toBe(first.records); expect(second.index).toBe(first.index); expect(second.props.onNavigate).not.toBe(first.props.onNavigate);
    });
    it('navigation re-indexes only the range; new items, time zone or comparator re-run their stages', () => {
        const model = createCalendarModel(createControllerServices());
        model(input(), 'desktop');
        model({...input(), anchorDate: '2026-10-01'}, 'desktop');
        expect(calls()).toEqual({records: 1, order: 1, range: 2});
        const next = [...items];
        model({...input(), anchorDate: '2026-10-01', items: next}, 'desktop');
        expect(calls()).toEqual({records: 2, order: 2, range: 3});
        model({...input(), anchorDate: '2026-10-01', items: next, timeZone: 'Asia/Tokyo'}, 'desktop');
        expect(calls()).toMatchObject({records: 2, order: 3});
        model({...input(), anchorDate: '2026-10-01', items: next, timeZone: 'Asia/Tokyo', sortItems: () => 0}, 'desktop');
        expect(calls()).toMatchObject({records: 2, order: 4});
    });
    it('renders, key navigation and parent re-renders with inline callbacks do not re-validate or re-index items', () => {
        const view = render(<Calendar {...input()} onNavigate={() => {}}/>);
        expect(calls()).toEqual({records: 1, order: 1, range: 1});
        const cell = (date: string) => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
        act(() => cell('2026-09-03').focus());
        fireEvent.keyDown(cell('2026-09-03'), {key: 'ArrowRight'}); fireEvent.keyDown(cell('2026-09-04'), {key: 'ArrowDown'});
        for (let index = 0; index < 3; index++) view.rerender(<Calendar {...input()} onNavigate={() => {}} style={{width: 900 + index}}/>);
        fireEvent.click(cell('2026-09-04'));
        expect(calls()).toEqual({records: 1, order: 1, range: 1});
    });
});
