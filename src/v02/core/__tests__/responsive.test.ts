import {describe, expect, it} from 'vitest';
import {acceptanceRule, layoutForWidth, migratesFocus, openOverlay, resolveAgendaPresentation, resolveLayout, switchFeedback, validWidth, withinFeedbackBand} from '../responsive.js';

describe('responsive layout resolution (§7)', () => {
    it.each([[639, 'mobile'], [639.99, 'mobile'], [640, 'desktop'], [640.01, 'desktop'], [1, 'mobile']] as const)('default breakpoint: %s px is %s', (width, layout) => {
        expect(layoutForWidth(width)).toBe(layout);
    });
    it('uses a consumer breakpoint with the same exclusive lower bound', () => {
        expect(layoutForWidth(499, 500)).toBe('mobile'); expect(layoutForWidth(500, 500)).toBe('desktop');
        expect(layoutForWidth(900, 1024)).toBe('mobile');
    });
    it('accepts only positive finite widths as measurements', () => {
        for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) expect(validWidth(width)).toBe(false);
        expect(validWidth(0.5)).toBe(true);
    });
    it('forced layouts ignore measurements; auto is mobile until measured, or keeps a forced carry-over', () => {
        expect(resolveLayout('desktop', 'mobile')).toBe('desktop'); expect(resolveLayout('mobile', 'desktop')).toBe('mobile');
        expect(resolveLayout('auto', null)).toBe('mobile'); expect(resolveLayout(undefined, null)).toBe('mobile');
        expect(resolveLayout('auto', 'desktop')).toBe('desktop'); expect(resolveLayout('auto', null, 'desktop')).toBe('desktop');
        expect(resolveLayout('auto', 'mobile', 'desktop')).toBe('mobile');
    });
    it('resolves the agenda presentation from the resolved layout and the requested presentation', () => {
        expect(resolveAgendaPresentation('desktop')).toBe('popover'); expect(resolveAgendaPresentation('desktop', 'overlay')).toBe('popover');
        expect(resolveAgendaPresentation('mobile')).toBe('inline'); expect(resolveAgendaPresentation('mobile', 'overlay')).toBe('sheet');
    });
});

describe('transactional presentation switch (§11.3, R38)', () => {
    it('keeps an unchanged resolved overlay mounted, including desktop auto ↔ overlay', () => {
        expect(openOverlay({mounted: 'popover', owner: null}, resolveAgendaPresentation('desktop', 'overlay'))).toBe('popover');
        expect(migratesFocus({mounted: 'popover', owner: 'popover'}, 'popover')).toBe(false);
    });
    it('opens exactly the new overlay when focus is inside the owning stack', () => {
        expect(openOverlay({mounted: null, owner: 'inline'}, 'popover')).toBe('popover');
        expect(openOverlay({mounted: null, owner: 'inline'}, 'sheet')).toBe('sheet');
        expect(openOverlay({mounted: 'popover', owner: 'popover'}, 'sheet')).toBe('sheet');
        expect(openOverlay({mounted: 'sheet', owner: 'sheet'}, 'popover')).toBe('popover');
        for (const [owner, next] of [['inline', 'popover'], ['popover', 'sheet'], ['sheet', 'inline'], ['popover', 'inline']] as const) expect(migratesFocus({mounted: null, owner}, next)).toBe(true);
    });
    it('with external focus closes the old overlay and mounts no new one; inline is never an overlay', () => {
        expect(openOverlay({mounted: 'popover', owner: null}, 'sheet')).toBeNull();
        expect(openOverlay({mounted: 'sheet', owner: null}, 'popover')).toBeNull();
        expect(openOverlay({mounted: null, owner: null}, 'popover')).toBeNull();
        expect(openOverlay({mounted: 'sheet', owner: 'sheet'}, 'inline')).toBeNull();
        expect(migratesFocus({mounted: 'popover', owner: null}, 'inline')).toBe(false);
    });
});

describe('acceptance of a still-current request (§5.2.1, R46)', () => {
    it('applies the input-specific rule of the presentation resolved at acceptance', () => {
        expect(acceptanceRule('popover', 'pointer', true)).toEqual({open: 'popover', focus: 'first-control', announce: false});
        expect(acceptanceRule('popover', 'keyboard', false)).toEqual({open: 'popover', focus: 'first-control', announce: false});
        expect(acceptanceRule('sheet', 'pointer', true)).toEqual({open: 'sheet', focus: 'heading', announce: false});
        expect(acceptanceRule('sheet', 'keyboard', true)).toEqual({open: 'sheet', focus: 'heading', announce: false});
        expect(acceptanceRule('inline', 'keyboard', true)).toEqual({open: null, focus: 'heading', announce: false});
        expect(acceptanceRule('inline', 'pointer', true)).toEqual({open: null, focus: 'none', announce: true});
        expect(acceptanceRule('inline', 'pointer', false)).toEqual({open: null, focus: 'none', announce: false});
    });
});

describe('auto layout loop guard (QA-04)', () => {
    it('a switch whose own layout moves the width back across the breakpoint is self-feedback', () => {
        // Desktop is taller than the viewport: its scrollbar narrows the content box from 645 to 630 px.
        expect(switchFeedback('mobile', 'desktop', 630)).toBe(true); expect(switchFeedback('desktop', 'mobile', 645)).toBe(true);
        expect(switchFeedback('mobile', 'desktop', 639.99)).toBe(true); expect(switchFeedback('desktop', 'mobile', 640, 640)).toBe(true);
    });
    it('a measurement that agrees with the switch, an invalid width or no switch is not feedback', () => {
        expect(switchFeedback('mobile', 'desktop', 640)).toBe(false); expect(switchFeedback('desktop', 'mobile', 639)).toBe(false);
        for (const width of [0, Number.NaN]) expect(switchFeedback('mobile', 'desktop', width)).toBe(false);
        expect(switchFeedback('desktop', 'desktop', 600)).toBe(false);
        expect(switchFeedback('mobile', 'desktop', 520, 500)).toBe(false); expect(switchFeedback('mobile', 'desktop', 499, 500)).toBe(true);
    });
    it('the feedback band keeps the current layout within [breakpoint - band, breakpoint + band) only', () => {
        for (const width of [625, 630, 639.99, 640, 654.99]) expect(withinFeedbackBand(width, 15)).toBe(true);
        for (const width of [624.99, 655, 900, 0]) expect(withinFeedbackBand(width, 15)).toBe(false);
        expect(withinFeedbackBand(640, null)).toBe(false); expect(withinFeedbackBand(640, 0)).toBe(false);
        expect(withinFeedbackBand(495, 10, 500)).toBe(true); expect(withinFeedbackBand(510, 10, 500)).toBe(false);
    });
});
