import type {CalendarTheme} from '../reference.js';

export type ThemeName = 'classic' | 'neutral';
/**
 * Trusted private constructor for the opaque public-reference type. Validation never reads a consumer-provided name or
 * shape: a preset carries a registered, non-enumerable own brand. The ESM and CJS builds (or two bundled copies) are
 * separate module instances with their own preset objects; the brand is shared by all of them, so a preset is recognized
 * by its canonical meaning, not by which copy created it (§4.3, review 2026-10-09-2). A structural copy has no brand.
 */
const presetBrand = Symbol.for('@nelmad/calendar/theme-preset');
export function themePreset(name: ThemeName): CalendarTheme {
    return Object.freeze(Object.defineProperty({name}, presetBrand, {value: name})) as CalendarTheme;
}
/** The preset a frozen branded object stands for, whichever module instance (ESM, CJS) created it. */
export function presetName(value: unknown): ThemeName | undefined {
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return undefined;
    const name: unknown = Object.getOwnPropertyDescriptor(value, presetBrand)?.value;
    return name === 'classic' || name === 'neutral' ? name : undefined;
}
