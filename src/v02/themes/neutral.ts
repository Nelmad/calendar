import type {CalendarTheme} from '../reference.js';
import {presetName, themePreset, type ThemeName} from './preset.js';

// Second preset (§10.2). Trusted private constructor like classicTheme: validation reads the preset brand, never
// a consumer-provided name or shape. Its defaults live in styles.css under `[data-theme="neutral"]`.
export const neutralTheme: CalendarTheme = themePreset('neutral');

export type {ThemeName};
export const isThemePreset = (value: unknown): value is CalendarTheme => presetName(value) !== undefined;
/** The `data-theme` literal of a preset (§5.7); a missing theme and the safe contract shell are classic (§4.3.2). */
export const themeName = (theme: CalendarTheme | undefined): ThemeName => presetName(theme) ?? 'classic';
