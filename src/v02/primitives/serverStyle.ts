import {useEffect, useLayoutEffect, useRef, version, type CSSProperties, type RefObject} from 'react';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// react-dom's unitless-number table: React 19 lists `scale` and a fixed set of prefixed names, React 18 derives a
// Webkit/ms/Moz/O name for every entry.
const unitlessNames = ('animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup '
    + 'columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn '
    + 'gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans tabSize widows zIndex zoom fillOpacity '
    + 'floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth').split(' ');
const legacy = Number.parseInt(version, 10) < 19;
const unitless = new Set(legacy ? [...unitlessNames, ...unitlessNames.flatMap(name => ['Webkit', 'ms', 'Moz', 'O'].map(prefix => prefix + name[0].toUpperCase() + name.slice(1)))]
    : [...unitlessNames, 'scale', ...('MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow '
        + 'msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount '
        + 'WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive '
        + 'WebkitFlexShrink WebkitLineClamp').split(' ')]);

/** One property written as react-dom's client `setValueForStyle` writes it (React 18 and 19), so CSSOM accepts or rejects it as in a client render. */
function setStyle(declarations: CSSStyleDeclaration, name: string, value: unknown) {
    const custom = name.startsWith('--'), target = declarations as unknown as Record<string, unknown>;
    const property = name === 'float' ? 'cssFloat' : name;
    if (value == null || typeof value === 'boolean' || value === '') {
        if (custom) declarations.setProperty(name, ''); else target[property] = '';
    } else if (custom) declarations.setProperty(name, legacy ? String(value).trim() : value as string);
    else if (typeof value === 'number' && value !== 0 && !unitless.has(name)) target[property] = `${value}px`;
    else target[property] = String(value).trim();
}

/**
 * QA-C-1-02: a `style-src` without 'unsafe-inline' or `style-src-attr` blocks the server-rendered `style` attribute, and
 * hydration never writes it again (the grid lost `--nc-week-count`, the root its tokens). A hydrated element whose
 * attribute declared nothing gets the given declarations, property by property, the way a client render writes them.
 * QA-C-2-01: never the attribute text, which would re-read a value with a top-level `;` as further declarations that CSP
 * blocked and a client render rejects. Spec v8 §10.3.4: callers pass only the package's own validated declarations, never
 * the consumer root `style`. An applied or client-rendered style is left as it is.
 */
export function restoreServerStyle(element: HTMLElement | null | undefined, style: CSSProperties | undefined) {
    if (!element || !style || element.style.length || !element.hasAttribute('style')) return;
    for (const name of Object.keys(style)) setStyle(element.style, name, style[name as keyof CSSProperties]);
}
/** Restores once, after the hydration commit, with the package declarations that commit rendered. */
export function useServerStyle(ref: RefObject<HTMLElement | null>, style: CSSProperties | undefined) {
    const rendered = useRef(style);
    useClientLayoutEffect(() => restoreServerStyle(ref.current, rendered.current), [ref]);
}
