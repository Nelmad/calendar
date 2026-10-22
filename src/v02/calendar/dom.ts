import type {LocalizedText} from '../core/formatting.js';

export function activeElement(document: Document): Element | null {
    let node = document.activeElement;
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return node;
}
export function focusElement(node: HTMLElement | null | undefined): boolean {
    if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"], [disabled], [aria-disabled="true"]')) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    node.focus({preventScroll: true});
    return activeElement(node.ownerDocument) === node;
}
/**
 * Script focus never scrolls on its own (an overlay is positioned first); a target that keeps its place in the page,
 * such as the inline agenda heading below the grid or a §12.3 recovery target, is then brought into view (WCAG 2.4.11).
 */
export function revealFocused(document: Document) {
    activeElement(document)?.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
}
/** One child-list mutation per semantic payload; React owns only the stable host. */
export function writeLive(host: HTMLElement | null, values: readonly LocalizedText[]) {
    if (!host) return;
    const document = host.ownerDocument, fragment = document.createDocumentFragment();
    values.filter(value => value.text.trim()).forEach((value, index) => {
        if (index) fragment.append(' ');
        const span = document.createElement('span'); span.lang = value.lang; span.dir = value.dir;
        for (const part of value.fragments) {
            const bdi = document.createElement('bdi'); bdi.lang = part.lang ?? ''; bdi.dir = part.dir; bdi.textContent = part.text; span.append(bdi);
        }
        fragment.append(span);
    });
    if (fragment.childNodes.length || host.childNodes.length) host.replaceChildren(fragment);
}

type LabelScope = Document | ShadowRoot;
/** Read CSS strings, excluding URLs/functions; a slash introduces alternative text. */
export function generatedContentText(content: string): string {
    let text = '', depth = 0;
    const tokens = content.match(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[()/]|[^"'()/]+/g) ?? [];
    for (const token of tokens) {
        if (token === '(') { depth++; continue; }
        if (token === ')') { depth = Math.max(0, depth - 1); continue; }
        if (depth) continue;
        if (token === '/') { text = ''; continue; }
        if (token[0] !== '"' && token[0] !== "'") continue;
        text += token.slice(1, -1).replace(/\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|(\r\n|[\n\r\f])|([\s\S]))/gi, (_escape, hex, newline, character) => {
            if (hex) {
                const point = Number.parseInt(hex, 16);
                return String.fromCodePoint(!point || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff ? 0xfffd : point);
            }
            return newline ? '' : character;
        });
    }
    return text;
}
function pseudoContribution(node: Element, pseudo: '::before' | '::after'): string {
    const window = node.ownerDocument.defaultView;
    // Layout-less DOMs may not implement pseudo-element computed styles.
    if (!window?.CSS?.supports?.('content', '"text"')) return '';
    const style = window.getComputedStyle(node, pseudo);
    return style.display === 'none' ? '' : generatedContentText(style.content);
}
function contribution(node: Element, scope: LabelScope, visited = new Set<Element>()): string {
    if (visited.has(node)) return '';
    visited.add(node);
    const referenced = node.getAttribute('aria-labelledby')?.trim().split(/\s+/)
        .map(id => scope.getElementById(id)).filter((target): target is HTMLElement => !!target && target.isConnected)
        .map(target => contribution(target, scope, visited)).join(' ').trim();
    if (referenced) return referenced;
    const label = node.getAttribute('aria-label')?.trim();
    if (label) return label;
    if (node.localName === 'img' || node.localName === 'area') return node.getAttribute('alt') ?? '';
    if (node.localName === 'input') return node.getAttribute('value') ?? node.getAttribute('title') ?? '';
    const children = [...node.childNodes].map(child => {
        if (child.nodeType === 3) return child.textContent ?? '';
        if (child.nodeType !== 1) return '';
        const element = child as Element;
        if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden')) return '';
        return contribution(element, scope, visited);
    }).join(' ');
    const text = [pseudoContribution(node, '::before'), children, pseudoContribution(node, '::after')].join(' ').trim();
    return text || node.getAttribute('title') || '';
}
export function validatedLabelledBy(root: HTMLElement, value: string | undefined) {
    const scope = root.getRootNode() as LabelScope, valid: string[] = [], invalid: string[] = [];
    for (const id of value?.trim().split(/\s+/).filter(Boolean) ?? []) {
        const target = scope.getElementById?.(id);
        if (target?.isConnected && target.getRootNode() === scope && contribution(target, scope).trim()) valid.push(id);
        else invalid.push(id);
    }
    return {value: valid.length ? valid.join(' ') : undefined, invalid};
}
