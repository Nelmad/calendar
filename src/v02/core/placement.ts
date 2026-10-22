/** A vertical extent in viewport CSS px. */
export type Span = Readonly<{top: number; bottom: number}>;
export type VerticalPlacement = Readonly<{side: 'below' | 'above'; maxHeight: number}>;

/**
 * Block-axis side of a popover inside a host dialog (QA-B-1-05): below the anchor when its natural height fits there
 * or when below has at least as much room as above, otherwise above. `area` is the visible part of the boundary,
 * `padding` keeps the popover off its edges and `offset` off the anchor. The height is limited to the room of the side.
 */
export function verticalPlacement(anchor: Span, area: Span, natural: number, offset: number, padding: number): VerticalPlacement {
    const below = area.bottom - padding - (anchor.bottom + offset), above = anchor.top - offset - (area.top + padding);
    const side = natural <= below || below >= above ? 'below' : 'above';
    return {side, maxHeight: Math.max(0, side === 'below' ? below : above)};
}
