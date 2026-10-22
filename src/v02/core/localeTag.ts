// RFC 5646 §2.1 grammar, §2.2.5/§2.2.6 duplicate restrictions.
// https://www.rfc-editor.org/rfc/rfc5646#section-2.1
// Intl accepts a narrower language identifier grammar. Its support check belongs
// after syntax validation so private-use/grandfathered tags can use the SDK fallback.
const irregular = new Set([
    'en-gb-oed', 'i-ami', 'i-bnn', 'i-default', 'i-enochian', 'i-hak', 'i-klingon',
    'i-lux', 'i-mingo', 'i-navajo', 'i-pwn', 'i-tao', 'i-tay', 'i-tsu',
    'sgn-be-fr', 'sgn-be-nl', 'sgn-ch-de',
]);

export function isLocaleTag(value: unknown): value is string {
    if (typeof value !== 'string' || !value || /[^a-zA-Z0-9-]/.test(value)) return false;
    const lower = value.toLowerCase();
    if (irregular.has(lower)) return true;
    const parts = lower.split('-');
    if (parts.some(part => !/^[a-z0-9]{1,8}$/.test(part))) return false;
    if (parts[0] === 'x') return parts.length > 1;
    if (!/^[a-z]{2,8}$/.test(parts[0])) return false;
    let index = 1;
    if (parts[0].length <= 3) for (let count = 0; count < 3 && /^[a-z]{3}$/.test(parts[index] ?? ''); count++) index++;
    if (/^[a-z]{4}$/.test(parts[index] ?? '')) index++;
    if (/^(?:[a-z]{2}|[0-9]{3})$/.test(parts[index] ?? '')) index++;
    const variants = new Set<string>(), extensions = new Set<string>();
    while (/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/.test(parts[index] ?? '')) {
        const variant = parts[index++];
        if (variants.has(variant)) return false;
        variants.add(variant);
    }
    while (/^[0-9a-wy-z]$/.test(parts[index] ?? '')) {
        const singleton = parts[index++];
        if (extensions.has(singleton)) return false;
        extensions.add(singleton);
        const start = index;
        while (/^[a-z0-9]{2,8}$/.test(parts[index] ?? '')) index++;
        if (index === start) return false;
    }
    if (parts[index] === 'x') return index + 1 < parts.length;
    return index === parts.length;
}
