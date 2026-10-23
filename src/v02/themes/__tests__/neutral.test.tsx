// @vitest-environment node
import {readFileSync} from 'node:fs';
import {renderToString} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {classicTheme, tokenVariables} from '../classic.js';
import {themePreset} from '../preset.js';
import {isThemePreset, neutralTheme, themeName} from '../neutral.js';
import {ThemeRoot} from '../../primitives/index.js';

// §10.2: two presets × two densities × system/light/dark, combined by the zero-specificity preset rules of styles.css.
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
type Rule = {selector: string; media?: string; declarations: Map<string, string>};
/** Top-level and one-level @media rules in source order. */
function rules(text: string, media?: string): Rule[] {
    const result: Rule[] = [];
    for (let index = 0; index < text.length;) {
        const open = text.indexOf('{', index);
        if (open < 0) break;
        const prelude = text.slice(index, open).trim();
        let depth = 1, end = open + 1;
        for (; depth && end < text.length; end++) depth += text[end] === '{' ? 1 : text[end] === '}' ? -1 : 0;
        const body = text.slice(open + 1, end - 1);
        if (prelude.startsWith('@media')) result.push(...rules(body, prelude));
        else if (!prelude.startsWith('@')) result.push({selector: prelude.replace(/\s+/g, ' '), media, declarations: new Map(body.split(';').map(part => part.split(':'))
            .filter(parts => parts.length > 1).map(([name, ...value]) => [name.trim(), value.join(':').trim()]))});
        index = end;
    }
    return result;
}
const all = rules(css);
// Preset rules: exactly `:where(.nc-theme[...])` selectors, the theme root itself.
const presets = all.filter(rule => /^:where\(\.nc-theme(\[[^\]]+\])*\)$/.test(rule.selector));
type Combination = {theme: 'classic' | 'neutral'; scheme: 'light' | 'dark' | 'system'; osDark: boolean; density: 'compact' | 'comfortable'};
/** The cascade of the preset rules for one root: later matching rules win (all have zero specificity). */
function resolve({theme, scheme, osDark, density}: Combination) {
    const values = new Map<string, string>();
    for (const rule of presets) {
        if (rule.media && !(rule.media === '@media (prefers-color-scheme: dark)' && osDark)) continue;
        const attributes = [...rule.selector.matchAll(/\[([\w-]+)="([^"]+)"\]/g)].map(([, name, value]) => [name, value]);
        const state: Record<string, string> = {'data-theme': theme, 'data-color-scheme': scheme, 'data-density': density};
        if (attributes.every(([name, value]) => state[name] === value)) for (const [name, value] of rule.declarations) values.set(name, value);
    }
    return values;
}
const luminance = (hex: string) => {
    const full = hex.length === 4 ? `#${[...hex.slice(1)].map(char => char + char).join('')}` : hex;
    const [r, g, b] = full.slice(1).match(/\w\w/g)!.map(part => Number.parseInt(part, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const variables = Object.values(tokenVariables).flatMap(group => Object.values(group));
const combinations = (['classic', 'neutral'] as const).flatMap(theme => ([['light', false], ['light', true], ['dark', false], ['system', false], ['system', true]] as const)
    .flatMap(([scheme, osDark]) => (['compact', 'comfortable'] as const).map(density => ({theme, scheme, osDark, density}))));

describe('neutral preset and theme combinations (§10.2)', () => {
    it('is a frozen opaque preset recognized by identity only, with its own data-theme literal', () => {
        expect(neutralTheme).toEqual({name: 'neutral'}); expect(Object.isFrozen(neutralTheme)).toBe(true);
        expect(isThemePreset(neutralTheme)).toBe(true); expect(isThemePreset(classicTheme)).toBe(true);
        for (const lookalike of [{name: 'neutral'}, {name: 'classic'}, 'neutral', null, undefined]) expect(isThemePreset(lookalike)).toBe(false);
        expect([themeName(neutralTheme), themeName(classicTheme), themeName(undefined)]).toEqual(['neutral', 'classic', 'classic']);
        const html = renderToString(<ThemeRoot lang="en-US" dir="rtl" theme="neutral" density="comfortable" colorScheme="dark">x</ThemeRoot>);
        expect(html).toContain('data-theme="neutral"'); expect(html).toContain('data-density="comfortable"'); expect(html).toContain('data-color-scheme="dark"');
        expect(html).toBe(renderToString(<ThemeRoot lang="en-US" dir="rtl" theme="neutral" density="comfortable" colorScheme="dark">x</ThemeRoot>));
    });
    it('gives every combination a complete set of the 27 public variables except the inherited typography defaults', () => {
        const typography = variables.filter(name => name.includes('-typography-'));
        for (const combination of combinations) {
            const values = resolve(combination);
            for (const name of variables) {
                if (typography.includes(name)) expect(values.has(name), `${JSON.stringify(combination)} ${name}`).toBe(false);
                else expect(values.get(name), `${JSON.stringify(combination)} ${name}`).toBeTruthy();
            }
            // The app font is inherited unless a consumer sets the typography variables (§10.3.4).
            expect(all.find(rule => rule.selector === ':where(.nc-theme)')!.declarations.get('font-family')).toBe('var(--nelmad-calendar-typography-font-family, inherit)');
        }
    });
    it('keeps theme and density independent: presets never set density variables, densities set nothing else', () => {
        const density = variables.filter(name => name.includes('-density-'));
        for (const rule of presets.filter(candidate => candidate.selector.includes('data-theme') || candidate.selector.includes('data-color-scheme'))) {
            expect([...rule.declarations.keys()].filter(name => density.includes(name)), rule.selector).toEqual([]);
        }
        const comfortable = presets.filter(rule => rule.selector.includes('data-density'));
        expect(comfortable.map(rule => rule.selector)).toEqual([':where(.nc-theme[data-density="comfortable"])']);
        expect([...comfortable[0].declarations.keys()].sort()).toEqual([...density].sort());
        for (const theme of ['classic', 'neutral'] as const) {
            const compact = resolve({theme, scheme: 'light', osDark: false, density: 'compact'}), roomy = resolve({theme, scheme: 'light', osDark: false, density: 'comfortable'});
            for (const name of variables) expect(roomy.get(name) === compact.get(name), name).toBe(!density.includes(name));
        }
    });
    it('changes appearance, not structure: neutral differs from classic in colors, radii, shadow and motion only', () => {
        const classic = resolve({theme: 'classic', scheme: 'light', osDark: false, density: 'compact'}), neutral = resolve({theme: 'neutral', scheme: 'light', osDark: false, density: 'compact'});
        const changed = variables.filter(name => classic.get(name) !== neutral.get(name)).map(name => name.replace('--nelmad-calendar-', '').split('-')[0]);
        expect([...new Set(changed)].sort()).toEqual(['color', 'components', 'motion', 'radii', 'shadows']);
        // Only the theme root rules depend on data-theme: no component rule restyles one preset structurally.
        expect(all.filter(rule => rule.selector.includes('data-theme') && !presets.includes(rule))).toEqual([]);
    });
    it('dark and system-dark resolve to the same palette; system-light to the light one', () => {
        for (const theme of ['classic', 'neutral'] as const) {
            const dark = resolve({theme, scheme: 'dark', osDark: false, density: 'compact'}), system = resolve({theme, scheme: 'system', osDark: true, density: 'compact'});
            const light = resolve({theme, scheme: 'light', osDark: true, density: 'compact'}), systemLight = resolve({theme, scheme: 'system', osDark: false, density: 'compact'});
            expect(Object.fromEntries(system)).toEqual(Object.fromEntries(dark)); expect(Object.fromEntries(systemLight)).toEqual(Object.fromEntries(light));
            expect(dark.get('color-scheme')).toBe('dark'); expect(light.get('color-scheme')).toBe('light');
            expect(dark.get('--nelmad-calendar-color-surface')).not.toBe(light.get('--nelmad-calendar-color-surface'));
        }
    });
    it('meets WCAG contrast for text, state colors, borders and focus in every theme and scheme', () => {
        for (const combination of combinations) {
            const value = (name: string) => resolve(combination).get(`--nelmad-calendar-${name}`)!.replace(/^#fff$/, '#ffffff');
            const label = (name: string) => `${combination.theme}/${combination.scheme}/${combination.osDark ? 'os-dark' : 'os-light'} ${name}`;
            const surface = value('color-surface'), item = value('components-item-background');
            for (const name of ['color-text', 'color-muted', 'color-accent', 'color-danger']) expect(contrast(value(name), surface), label(name)).toBeGreaterThanOrEqual(4.5);
            for (const name of ['color-border', 'color-focus']) expect(contrast(value(name), surface), label(name)).toBeGreaterThanOrEqual(3);
            expect(contrast(value('components-item-text'), item), label('item text')).toBeGreaterThanOrEqual(4.5);
            expect(contrast(value('color-accent'), item), label('accent marker on an item')).toBeGreaterThanOrEqual(3);
            expect(contrast(value('color-text'), value('components-selected-day-background')), label('text on a selected day')).toBeGreaterThanOrEqual(4.5);
        }
    });
});

// Review 2026-10-09-2: the ESM and CJS builds are separate module instances with their own preset objects. A preset
// created by another instance (the same trusted constructor) is the same canonical preset; a copy of its shape is not.
describe('presets across module instances', () => {
    it('recognizes a preset of another module instance by its brand', () => {
        const otherClassic = themePreset('classic'), otherNeutral = themePreset('neutral');
        expect(otherClassic).not.toBe(classicTheme); expect(otherNeutral).not.toBe(neutralTheme);
        expect([isThemePreset(otherClassic), themeName(otherClassic), isThemePreset(otherNeutral), themeName(otherNeutral)]).toEqual([true, 'classic', true, 'neutral']);
        expect(otherNeutral).toEqual(neutralTheme); expect(Object.keys(otherNeutral)).toEqual(['name']);
    });
    it.each([{name: 'classic'}, Object.freeze({name: 'neutral'}), {...neutralTheme}, Object.create(neutralTheme), Object.freeze(Object.create(neutralTheme)), null, 'neutral'])('rejects the copy %j', value => {
        expect(isThemePreset(value)).toBe(false); expect(themeName(value as never)).toBe('classic');
    });
});
