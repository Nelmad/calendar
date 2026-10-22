// @vitest-environment node
import {readFileSync} from 'node:fs';
import {renderToString} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {classicTheme, isDeclarationValue, themeStyle, tokenVariables} from '../classic.js';
import {Button, ThemeRoot} from '../../primitives/index.js';
import type {CalendarThemeTokens} from '../../reference.js';

describe('private classic foundation', () => {
    it('covers the exact 27 normative token variables with explicit mapping', () => {
        const reference = readFileSync(new URL('../../reference.d.ts', import.meta.url), 'utf8').split('export type CalendarCSSVariable =')[1].split(';')[0];
        const names = [...reference.matchAll(/'(--nelmad-calendar-[^']+)'/g)].map(match => match[1]).sort();
        expect(Object.values(tokenVariables).flatMap(Object.values).sort()).toEqual(names);
        expect(names).toHaveLength(27);
        const tokens = Object.fromEntries(Object.entries(tokenVariables).map(([group, fields]) => [group,
            Object.fromEntries(Object.keys(fields).map(key => [key, `sentinel-${group}-${key}`]))]));
        const result = themeStyle(tokens);
        for (const [group, fields] of Object.entries(tokenVariables)) for (const [key, variable] of Object.entries(fields)) {
            expect(result.style[variable]).toBe(`sentinel-${group}-${key}`);
        }
        expect(result.diagnostics).toEqual([]);
    });
    it('preserves nonempty CSS strings and root style precedence without a CSS parser', () => {
        const result = themeStyle({color: {text: ' var(--consumer-text) ', surface: 'not-a-color'}}, {'--nelmad-calendar-color-text': 'purple', padding: 12});
        expect(result.style).toEqual({'--nelmad-calendar-color-text': 'purple', '--nelmad-calendar-color-surface': 'not-a-color', padding: 12});
        expect(result.diagnostics).toEqual([]);
        // Passed CSS-trimmed, so React 19's untrimmed client setProperty writes the server text (QA-C-3-01).
        expect(themeStyle({spacing: {sm: ' calc(1rem + 2px) '}}).style['--nelmad-calendar-spacing-sm']).toBe('calc(1rem + 2px)');
        expect(themeStyle({color: {muted: "u\\72l-free'^'\\`\\,\r"}}).style['--nelmad-calendar-color-muted']).toBe("u\\72l-free'^'\\`\\,");
    });
    it('ignores blank/non-string values with pure diagnostics', () => {
        const result = themeStyle({color: {text: ' ', surface: null}, motion: 12} as unknown as CalendarThemeTokens);
        expect(result.style).toEqual({});
        expect(result.diagnostics.map(value => value.path)).toEqual(['tokens.color.surface', 'tokens.color.text', 'tokens.motion']);
    });
    it('accepts any single CSS declaration value without parsing it as a color or length (QA-14)', () => {
        for (const value of ['red', ' var(--consumer, #fff) ', 'calc(1rem + 2px)', 'rgb(0 0 0 / 18%)', '0 8px 24px rgb(0 0 0 / 18%), none', 'not-a-color',
            '"Georgia; serif", serif', "'a\\'b'", '"url(a)"', '/* url(a) */ red', '/* a; b */ red', 'cubic-bezier(.2, 0, 0, 1)',
            '[a; b] {c; d}', 'a\\;b', 'fn(a!b)', '"line\\\ncontinued"']) expect(isDeclarationValue(value), value).toBe(true);
    });
    it('rejects values that would write further declarations or swallow the next one (QA-14)', () => {
        for (const value of ['white;position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=1)', 'red;', 'red !important', 'red!important',
            'calc(1px', 'rgb(0 0 0', 'a)', '(]', '}', '[', '"open', "'open", '"a\nb"', '/* open', 'url(open', 'url(a"b)', 'url(a(b))', 'red\\', 'a\\\nb',
            'url(a\\']) expect(isDeclarationValue(value), JSON.stringify(value)).toBe(false);
    });
    // QA-C-1-01: CSS decodes escapes in idents, so `u\72l(` spells url( too; `#url(`, `--url(`, `1url(` and `url (` do not (CSS Syntax §4.3).
    it('reads url( and the other tokens as the CSS tokenizer does (QA-14)', () => {
        for (const value of ['#url("a;b")', '--url(x)', 'myurl(a"b")', '1url(a)', 'url (a)', 'curl(a)', '"u\\72l(a)"',
            '<!-- red -->', '"\\41\n"', String.raw`a\9 b`, ' red\t']) expect(isDeclarationValue(value), JSON.stringify(value)).toBe(true);
    });
    // Decision 3 (spec v7 §10.3.2, DEC-1-01): a resource reference is never a token value, even as one well-formed declaration value.
    it('rejects every url( in any decoded spelling, well formed or not, also nested in functions and blocks', () => {
        for (const value of ['url(data:image/png;base64,AA==)', 'url(https://tracker.example/p.gif)', 'url( "a;b" )', "url('a')", 'url()', 'URL("a;b")', 'Url(a)',
            String.raw`u\72l("a;b")`, String.raw`u\72l(data:a;b)`, String.raw`\75 rl(a)`, String.raw`\55 \52 \4c (a)`, String.raw`ur\l(a)`, String.raw`\000075rl(a)`,
            'image-set(url(a.png) 1x)', 'var(--consumer, url(a))', 'red, url(a)', '[url(a)]', '{url(a)}', ' url(a) ']) expect(isDeclarationValue(value), JSON.stringify(value)).toBe(false);
        expect(themeStyle({color: {surface: 'url(https://tracker.example/p.gif)', accent: '#0b57d0'}}).style).toEqual({'--nelmad-calendar-color-accent': '#0b57d0'});
    });
    it('rejects escaped spellings of a bad url( and values whose trim() differs for CSS (QA-14)', () => {
        for (const value of [String.raw`u\72l(a'b);position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=1);x:'c)`,
            String.raw`\75 rl(a'b);position:fixed;x:'c)`, String.raw`U\52L(a"b);position:fixed;x:"c)`, String.raw`ur\l(a"b);x:"c)`, String.raw`u\72 l(a"b);x:"c)`,
            'url(\u00a0"a);position:fixed;x:")', 'url(a b)', 'url(a\x01)', String.raw`u\72l(open`, 'u\\72l(a\\',
            // React writes the `trim()` of the value: a trailing escaped tab turns into an escape at the end, a leading U+00A0 disappears.
            '1 %--\\\t', '\u00a0url(a"b);position:fixed;x:")', 'red\u00a0', '\ufeffred']) expect(isDeclarationValue(value), JSON.stringify(value)).toBe(false);
    });
    it('treats a value that is not one declaration value as absent with a development diagnostic (QA-14)', () => {
        const injected = 'white;position:fixed;inset:0;z-index:2147483647;background:url(/exfil?x=1)';
        const result = themeStyle({color: {surface: injected, accent: '#0b57d0'}, components: {itemText: 'red !important'}}, {'--nelmad-calendar-color-text': 'purple'});
        expect(result.style).toEqual({'--nelmad-calendar-color-accent': '#0b57d0', '--nelmad-calendar-color-text': 'purple'});
        expect(result.diagnostics).toEqual([{path: 'tokens.color.surface', reason: 'Expected a single CSS declaration value'},
            {path: 'tokens.components.itemText', reason: 'Expected a single CSS declaration value'}]);
        const html = renderToString(<ThemeRoot lang="en-US" dir="ltr" tokens={{color: {surface: injected, accent: '#0b57d0'}}}>x</ThemeRoot>);
        expect(html).toContain('style="--nelmad-calendar-color-accent:#0b57d0"');
        expect(html).not.toMatch(/position|exfil|surface/);
    });
    it('wires component tokens per §10.3.1/§10.3.3: items use item tokens, selected-day only selected cells (QA-15)', () => {
        const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const users = new Map<string, string[]>();
        for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) for (const declaration of body.split(';')) {
            const [property, ...value] = declaration.split(':');
            if (!value.length || property.trim().startsWith('--')) continue;
            for (const [, variable] of value.join(':').matchAll(/var\((--nelmad-calendar-components-[\w-]+)\)/g)) {
                users.set(variable, [...users.get(variable) ?? [], ...selector.split(',').map(part => part.trim().replace(/\s+/g, ' '))]);
            }
        }
        expect(users.get('--nelmad-calendar-components-selected-day-background')).toEqual([':where(.nc-theme) .nc-day[data-selected]']);
        for (const variable of ['--nelmad-calendar-components-item-background', '--nelmad-calendar-components-item-text']) {
            expect(users.get(variable)?.length, variable).toBeGreaterThan(0);
            for (const selector of users.get(variable)!) expect(selector, variable).toMatch(/\.nc-month-item\b|\.nc-agenda-item\b/);
        }
        expect(users.get('--nelmad-calendar-components-item-background')).toContain(':where(.nc-theme) .nc-month-item');
        expect([...users.values()].flat().filter(selector => /\.nc-month-bar|\.nc-menu-item|\.nc-icon-button/.test(selector) || /\.nc-button/.test(selector) && !/nc-agenda-item/.test(selector))).toEqual([]);
    });
    it('draws the focus ring of a date cell above its items without lifting the cell over them (QA-06)', () => {
        const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({selector: selector.trim().replace(/\s+/g, ' '), body}));
        const cellRules = rules.filter(rule => /\.nc-day(:focus-visible)?$|\.nc-day:focus-visible\b(?!::)/.test(rule.selector) && !rule.selector.includes('::'));
        expect(cellRules.length).toBeGreaterThan(0);
        for (const rule of cellRules) expect(rule.body, rule.selector).not.toMatch(/z-index/);
        const ring = rules.find(rule => rule.selector === ':where(.nc-theme) .nc-day:focus-visible::after')!;
        expect(ring.body).toMatch(/pointer-events:\s*none/); expect(ring.body).toMatch(/border:\s*2px solid var\(--nelmad-calendar-color-focus\)/);
        expect(rules.find(rule => rule.selector === '.nc-theme.nc-calendar')!.body).toMatch(/isolation:\s*isolate/);
    });
    it('reserves the sticky weekday row and blocking view sizes; a refresh is a bar over the grid border, a refresh error an in-flow banner (QA-D-1-03, -05, QA-D-3-01)', () => {
        const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({selector: selector.trim().replace(/\s+/g, ' '), body}));
        const body = (selector: string) => rules.filter(rule => rule.selector === selector).map(rule => rule.body).join('');
        // The weekday row keeps its own size: no status ever sits over it or grows it.
        expect(body(':where(.nc-theme) .nc-month-weekdays')).not.toMatch(/min-block-size/); expect(css).not.toContain('--nc-status-banner-block-size');
        // No status in the toolbar row (QA-D-3-01): nothing there can move the toolbar controls.
        expect(css).not.toContain('data-placement="toolbar"');
        const banner = body(':where(.nc-theme) .nc-calendar-status[data-placement="banner"]');
        expect(banner).not.toMatch(/position:/); expect(banner).toMatch(/margin-block-end:\s*var\(--nelmad-calendar-spacing-sm\)/);
        // The progress region takes no space: absolute in the view, 3 px whose bottom edge is the grid's 1 px top border.
        const progress = body(':where(.nc-theme) .nc-calendar-status[data-placement="progress"]');
        expect(progress).toMatch(/position:\s*absolute/); expect(progress).toMatch(/inset-block-start:\s*-2px/); expect(progress).toMatch(/block-size:\s*3px/);
        expect(progress).toMatch(/pointer-events:\s*none/); expect(body(':where(.nc-theme) .nc-calendar-view')).toMatch(/position:\s*relative/);
        // Only the progress region (which holds no consumer content) turns off pointer events: a link or field from a custom
        // `renderLoading`/`renderError` body stays pressable (QA-D-2-05).
        expect(rules.filter(rule => rule.selector.includes('nc-calendar-status') && /pointer-events/.test(rule.body)).map(rule => rule.selector))
            .toEqual([':where(.nc-theme) .nc-calendar-status[data-placement="progress"]']);
        // Motion by transform only (no layout shift); static under reduced motion; system colors in forced colors.
        expect(body(':where(.nc-theme) .nc-calendar-progress-indicator')).toMatch(/animation:\s*nc-progress-slide/);
        expect(css).toMatch(/@keyframes nc-progress-slide \{\s*from \{ transform: translateX\(-100%\); \}\s*to \{ transform: translateX\(250%\); \}/);
        const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf('@media (forced-colors: active)'));
        expect(reduced).toMatch(/\.nc-calendar-progress-indicator \{\s*inline-size: 100%;\s*animation: none;/);
        const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
        expect(forced).toMatch(/\.nc-calendar-progress \{\s*forced-color-adjust: none;\s*background-color: GrayText;/);
        expect(forced).toMatch(/\.nc-calendar-progress-indicator \{\s*background-color: Highlight;/);
        expect(body(':where(.nc-theme) .nc-month')).toMatch(/scroll-padding-block-start:\s*calc\(var\(--nc-weekdays-block-size, 0px\) \+ 1px\);/);
        expect(body(':where(.nc-theme) .nc-calendar-status[data-weeks]')).toMatch(/flex:\s*1 1 var\(--nc-reserved-block-size, calc\(/);
        expect(body(':where(.nc-theme[data-layout="mobile"]) .nc-calendar-status[data-weeks]')).toMatch(/flex-basis:\s*var\(--nc-reserved-block-size, calc\(/);
        // QA-D-3: without a measurement the reserve is built from the sizes the Month itself uses.
        expect(body(':where(.nc-theme) .nc-calendar-status[data-weeks]')).toContain('var(--nelmad-calendar-density-day-min-height) + var(--nc-weekday-row-size) + 2px');
        expect(body(':where(.nc-theme[data-layout="mobile"]) .nc-calendar-status[data-weeks]').replace(/\s+/g, ' '))
            .toContain('var(--nc-week-count) * var(--nc-mobile-week-size) + var(--nc-weekday-row-size) + 2px + var(--nelmad-calendar-spacing-sm) + var(--nc-inline-agenda-size)');
        expect(body(':where(.nc-theme[data-layout="mobile"]) .nc-month-weeks')).toMatch(/flex-basis:\s*calc\(var\(--nc-week-count\) \* var\(--nc-mobile-week-size\)\)/);
        // QA-D-4-01: the empty-date agenda size is a content strut (it raises the flex basis) and no minimum, so a constrained
        // mobile root shrinks the agenda before the grid, which keeps its weekday row and one 44 px week.
        expect(body(':where(.nc-theme) .nc-day-list[data-presentation="inline"]')).toMatch(/display:\s*flow-root;/);
        expect(body(':where(.nc-theme) .nc-day-list[data-presentation="inline"]')).not.toContain('min-block-size');
        expect(body(':where(.nc-theme) .nc-day-list[data-presentation="inline"]::before').replace(/\s+/g, ' '))
            .toContain('float: inline-start; inline-size: 0; block-size: calc(var(--nc-inline-agenda-size) - 2px - 2 * var(--nelmad-calendar-spacing-sm));');
        expect(body(':where(.nc-theme[data-layout="mobile"]) .nc-month')).toMatch(/min-block-size:\s*calc\(var\(--nc-weekdays-block-size, var\(--nc-weekday-row-size\)\) \+ 44px \+ 2px\);/);
        expect(body('.nc-theme.nc-calendar')).toMatch(/--nc-weekday-row-size:\s*calc\(2 \* var\(--nelmad-calendar-spacing-sm\) \+ 0\.8125lh\)/);
    });
    it('keeps items and outside-month days distinguishable in forced colors (QA-09)', () => {
        const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
        expect(forced).toMatch(/\.nc-month-item \{\s*border: 1px solid ButtonText;/);
        expect(forced).toMatch(/\.nc-month-item\[data-continues-before\] \{ border-inline-start-style: dashed; \}/);
        expect(forced).toMatch(/\.nc-month-item\[data-continues-after\] \{ border-inline-end-style: dashed; \}/);
        expect(forced).toMatch(/\.nc-day\[data-outside-month\] \.nc-day-header \{ color: GrayText; \}/);
    });
    it('renders deterministic scoped attributes without DOM, clock or font assets', () => {
        const render = () => renderToString(<ThemeRoot lang="ar-SA" dir="rtl" density="comfortable" colorScheme="dark"><Button>Run</Button></ThemeRoot>);
        expect(render()).toBe(render());
        expect(render()).toContain('data-theme="classic"');
        expect(render()).toContain('data-density="comfortable"');
        expect(render()).toContain('data-color-scheme="dark"');
        expect(render()).toContain('data-dir="rtl"');
        expect(Object.isFrozen(classicTheme)).toBe(true);
        const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
        expect(css).not.toMatch(/:root|@font-face|https?:\/\//);
    });
});
