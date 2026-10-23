import {activeElement, focusElement} from './dom.js';

export function composedParent(node: Element): Element | null {
    return node.assignedSlot ?? node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
}
export function containsComposed(parent: Element, node: Element | null): boolean {
    for (let current = node; current; current = composedParent(current)) if (current === parent) return true;
    return false;
}
/** `node` or a composed ancestor is inert or hidden from the accessibility tree. */
export function inertComposed(node: Element): boolean {
    for (let current: Element | null = node; current; current = composedParent(current)) if (current.matches('[inert],[aria-hidden="true"]')) return true;
    return false;
}
export function available(node: HTMLElement): boolean {
    if (!node.isConnected || node.matches(':disabled,[aria-disabled="true"]')) return false;
    for (let current: Element | null = node; current; current = composedParent(current)) {
        if (current.matches('[hidden],[inert],[aria-hidden="true"]')) return false;
        const style = current.ownerDocument.defaultView?.getComputedStyle(current);
        if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
        if (current.localName === 'details' && !current.hasAttribute('open') && !current.querySelector('summary')?.contains(node)) return false;
    }
    return true;
}
/** Flatten open shadow trees and assigned slots in composed sequential order. */
export function tabbables(root: Element, exclude?: Element): HTMLElement[] {
    const scope = (children: Iterable<Element>): HTMLElement[] => {
        const entries: {index: number; nodes: HTMLElement[]}[] = [];
        const visit = (node: Element) => {
            if (node === exclude) return;
            const element = node as HTMLElement, focusable = typeof element.focus === 'function' && element.tabIndex >= 0 && available(element);
            // Shadow hosts and slots own navigation scopes: positive tabindex inside
            // them is sorted locally, not ahead of the host's position in the document.
            if (node.shadowRoot || node.localName === 'slot') {
                if (node.hasAttribute('tabindex') && element.tabIndex < 0) return;
                const assigned = node.localName === 'slot' ? (node as HTMLSlotElement).assignedElements({flatten: true}) : [];
                const descendants = assigned.length ? assigned : node.shadowRoot?.children ?? node.children;
                entries.push({index: element.tabIndex > 0 ? element.tabIndex : Infinity,
                    nodes: [...(focusable && !node.shadowRoot?.delegatesFocus ? [element] : []), ...scope(descendants)]});
            } else {
                if (focusable) entries.push({index: element.tabIndex || Infinity, nodes: [element]});
                for (const child of node.children) visit(child);
            }
        };
        for (const child of children) visit(child);
        return entries.sort((a, b) => a.index - b.index).flatMap(entry => entry.nodes);
    };
    const result = scope([root]);
    const radios = result.filter(node => node.matches('input[type="radio"][name]')) as HTMLInputElement[];
    return result.filter(node => !radios.includes(node as HTMLInputElement) || radios.find(radio => radio.name === (node as HTMLInputElement).name
        && radio.form === (node as HTMLInputElement).form && radio.getRootNode() === node.getRootNode() && radio.checked) === node
        || !radios.some(radio => radio.name === (node as HTMLInputElement).name && radio.form === (node as HTMLInputElement).form && radio.getRootNode() === node.getRootNode() && radio.checked)
        && radios.find(radio => radio.name === (node as HTMLInputElement).name && radio.form === (node as HTMLInputElement).form && radio.getRootNode() === node.getRootNode()) === node);
}
export function focusAvailable(node: HTMLElement | null | undefined): boolean {
    return !!node && available(node) && focusElement(node);
}
/** An open `<dialog>` in the modal state (`showModal()`); a runtime without `:modal` (jsdom) counts every open one. */
export function modalDialog(element: Element) {
    if (element.localName !== 'dialog' || !(element as HTMLDialogElement).open) return false;
    try { return element.matches(':modal'); } catch { return true; }
}
/**
 * The sequential order a Tab exit continues in: the modal `<dialog>` that holds `node`, else the document. Content outside
 * a modal dialog is inert by its modal state alone, without an attribute (review 2026-10-09-2).
 */
function sequentialScope(node: Element): Element {
    for (let current = composedParent(node); current; current = composedParent(current)) if (modalDialog(current)) return current;
    return node.ownerDocument.documentElement;
}
export function logicalExit(trigger: HTMLElement, overlay: HTMLElement, backwards: boolean): HTMLElement | undefined {
    const nodes = tabbables(sequentialScope(trigger), overlay), index = nodes.indexOf(trigger);
    if (index < 0) return undefined;
    return nodes[index + (backwards ? -1 : 1)];
}
export function displaced(document: Document, previous: Element | null): boolean {
    const active = activeElement(document);
    return active === document.body || !!previous && active === (previous.getRootNode() as ShadowRoot).host;
}
