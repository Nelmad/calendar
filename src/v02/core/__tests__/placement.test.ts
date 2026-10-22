import {describe, expect, it} from 'vitest';
import {verticalPlacement} from '../placement.js';

// QA-B-1-05: block-axis side of a popover inside a host dialog, from viewport geometry (offset 8, padding 16).
describe('popover placement inside a dialog boundary', () => {
    const area = {top: 105, bottom: 795};
    it('stays below when the natural height fits there', () => {
        expect(verticalPlacement({top: 460, bottom: 559}, area, 163, 8, 16)).toEqual({side: 'below', maxHeight: 212});
        expect(verticalPlacement({top: 660, bottom: 759}, area, 12, 8, 16)).toEqual({side: 'below', maxHeight: 12});
    });
    it('flips above near the bottom of the dialog when more room is above, with the room above as the limit', () => {
        // The verifier's case: 112 px below a row-4 cell, 431 px above it.
        expect(verticalPlacement({top: 560, bottom: 659}, area, 195, 8, 16)).toEqual({side: 'above', maxHeight: 431});
        expect(verticalPlacement({top: 660, bottom: 759}, area, 941, 8, 16)).toEqual({side: 'above', maxHeight: 531});
    });
    it('keeps a long list below when below has at least as much room; never a negative limit', () => {
        expect(verticalPlacement({top: 260, bottom: 359}, area, 1189, 8, 16)).toEqual({side: 'below', maxHeight: 412});
        expect(verticalPlacement({top: 400, bottom: 490}, {top: 0, bottom: 914}, 2000, 8, 16)).toEqual({side: 'below', maxHeight: 400});
        expect(verticalPlacement({top: 100, bottom: 790}, area, 500, 8, 16)).toEqual({side: 'below', maxHeight: 0});
    });
});
