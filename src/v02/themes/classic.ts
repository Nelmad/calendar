import type {CalendarCSSVariable, CalendarProps, CalendarTheme, CalendarThemeTokens} from '../reference.js';
import {isDeclarationValue} from '../core/cssValue.js';
import {themePreset} from './preset.js';

// §10.3.2 value boundary check, shared with item colors (core/appearance.ts).
export {isDeclarationValue};

export type CalendarRootStyle = NonNullable<CalendarProps['style']>;

// Trusted private constructor for the opaque public-reference type (preset.ts): validation reads its brand, never a
// consumer-provided name or shape.
export const classicTheme: CalendarTheme = themePreset('classic');

export const tokenVariables = {
    color: {surface: '--nelmad-calendar-color-surface', text: '--nelmad-calendar-color-text', muted: '--nelmad-calendar-color-muted',
        border: '--nelmad-calendar-color-border', accent: '--nelmad-calendar-color-accent', danger: '--nelmad-calendar-color-danger', focus: '--nelmad-calendar-color-focus'},
    typography: {fontFamily: '--nelmad-calendar-typography-font-family', fontSize: '--nelmad-calendar-typography-font-size',
        fontWeight: '--nelmad-calendar-typography-font-weight', lineHeight: '--nelmad-calendar-typography-line-height'},
    spacing: {xs: '--nelmad-calendar-spacing-xs', sm: '--nelmad-calendar-spacing-sm', md: '--nelmad-calendar-spacing-md', lg: '--nelmad-calendar-spacing-lg'},
    density: {dayMinHeight: '--nelmad-calendar-density-day-min-height', itemHeight: '--nelmad-calendar-density-item-height', gap: '--nelmad-calendar-density-gap'},
    radii: {sm: '--nelmad-calendar-radii-sm', md: '--nelmad-calendar-radii-md', lg: '--nelmad-calendar-radii-lg'},
    shadows: {overlay: '--nelmad-calendar-shadows-overlay'}, motion: {duration: '--nelmad-calendar-motion-duration', easing: '--nelmad-calendar-motion-easing'},
    components: {itemBackground: '--nelmad-calendar-components-item-background', itemText: '--nelmad-calendar-components-item-text',
        selectedDayBackground: '--nelmad-calendar-components-selected-day-background'},
} as const satisfies {[Group in keyof CalendarThemeTokens]-?: {[Token in keyof NonNullable<CalendarThemeTokens[Group]>]-?: CalendarCSSVariable}};

/** Pure CSS declarations only. Warnings are data for the future controller. */
export function themeStyle(tokens?: CalendarThemeTokens, style?: CalendarRootStyle) {
    const declarations: CalendarRootStyle = {};
    const diagnostics: {path: string; reason: string}[] = [];
    for (const [group, fields] of Object.entries(tokenVariables)) {
        const input = tokens?.[group as keyof CalendarThemeTokens];
        if (input === undefined) continue;
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            diagnostics.push({path: `tokens.${group}`, reason: 'Expected a token group'});
            continue;
        }
        for (const [key, variable] of Object.entries(fields)) {
            const value = (input as Record<string, unknown>)[key];
            if (value === undefined) continue;
            if (typeof value !== 'string' || !value.trim()) diagnostics.push({path: `tokens.${group}.${key}`, reason: 'Expected a nonempty CSS string'});
            else if (!isDeclarationValue(value)) diagnostics.push({path: `tokens.${group}.${key}`, reason: 'Expected a single CSS declaration value'});
            // The CSS-trimmed value (equal to trim() for an accepted value): React 18 trims it on both sides, React 19 only
            // on the server, so the client would otherwise write different text (QA-C-3-01).
            else declarations[variable] = value.trim();
        }
    }
    return {style: {...declarations, ...style}, diagnostics};
}
