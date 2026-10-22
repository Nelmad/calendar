// Pure structural check of one CSS declaration value (spec v7 §10.3.2); no CSS parser, no host CSS validation.
const closers: Record<string, string> = {'(': ')', '[': ']', '{': '}'};
const digit = (char?: string) => char !== undefined && char >= '0' && char <= '9';
const hex = (char?: string) => char !== undefined && /^[\da-f]$/i.test(char);
const whitespace = (char?: string) => char === ' ' || char === '\t' || char === '\n';
const nameStart = (char?: string) => char !== undefined && (/^[a-z_]$/i.test(char) || char.charCodeAt(0) >= 0x80);
const nameChar = (char?: string) => nameStart(char) || digit(char) || char === '-';
// CSS Syntax §4.3.8–§4.3.10 (EOF after `\` counts as an escape here, so the caller rejects it).
const validEscape = (first?: string, second?: string) => first === '\\' && second !== '\n';
const identStart = (a?: string, b?: string, c?: string) => a === '-' ? nameStart(b) || b === '-' || validEscape(b, c) : nameStart(a) || validEscape(a, b);
const numberStart = (a?: string, b?: string, c?: string) => digit(a) || a === '.' && digit(b) || (a === '+' || a === '-') && (digit(b) || b === '.' && digit(c));
/**
 * §10.3.2 (spec v7 security rule) without a CSS parser: true when the string is one CSS `<declaration-value>` that a
 * style attribute and `style.setProperty` both read as exactly this custom property (QA-14) and that has no `url(`.
 * The scan follows the CSS Syntax tokenizer for what decides where a declaration ends: comments, strings, escapes,
 * idents (decoded, so `u\72l(` and `\55 RL(` are `url(`), numbers and hashes. Rejected: a top-level `;` or `!`, an
 * unmatched or unclosed bracket, string or comment, any `url(` (a url token or function in any decoded spelling, well
 * formed or not; inside strings and comments it is text), a bad string, an escape at the end or before a newline, and a
 * leading or trailing character that `trim()` removes but CSS does not read as whitespace (U+00A0, U+FEFF…). React
 * writes such a value into the server HTML as further declarations, while the browser rejects it on the client.
 * Nothing else is checked: a value that is structurally one declaration but not a conforming color/length stays a
 * consumer styling error.
 */
export function isDeclarationValue(input: string): boolean {
    // React serializes the `trim()` of the value: it must equal the CSS-whitespace trim, and the scan reads it.
    const trimmed = input.trim();
    if (trimmed !== input.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '')) return false;
    const value = trimmed.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '\ufffd'), open: string[] = [];
    let i = 0;
    const at = (offset = 0): string | undefined => value[i + offset];
    // Consumes `\` and the escaped code point; undefined at the end, where it would take the text after the value.
    const escaped = () => {
        i++;
        if (i >= value.length) return undefined;
        if (!hex(at())) return value[i++];
        let digits = '';
        while (digits.length < 6 && hex(at())) digits += value[i++];
        if (whitespace(at())) i++;
        const code = Number.parseInt(digits, 16);
        return code === 0 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? '\ufffd' : String.fromCodePoint(code);
    };
    const name = () => {
        let result = '';
        for (;;) {
            if (validEscape(at(), at(1))) { const char = escaped(); if (char === undefined) return undefined; result += char; }
            else if (nameChar(at())) result += value[i++];
            else return result;
        }
    };
    while (i < value.length) {
        const char = value[i];
        if (char === '/' && at(1) === '*') { const end = value.indexOf('*/', i + 2); if (end < 0) return false; i = end + 2; }
        else if (char === '"' || char === "'") {
            for (i++; at() !== char;) {
                if (at() === undefined || at() === '\n') return false;
                if (at() !== '\\') i++;
                else if (at(1) === '\n') i += 2;
                else if (escaped() === undefined) return false;
            }
            i++;
        } else if (numberStart(char, at(1), at(2))) {
            if (char === '+' || char === '-') i++;
            while (digit(at())) i++;
            if (at() === '.' && digit(at(1))) for (i++; digit(at());) i++;
            if ((at() === 'e' || at() === 'E') && (digit(at(1)) || (at(1) === '+' || at(1) === '-') && digit(at(2)))) for (i += 2; digit(at());) i++;
            if (identStart(at(), at(1), at(2))) { if (name() === undefined) return false; }
            else if (at() === '%') i++;
        } else if (char === '#' && (nameChar(at(1)) || validEscape(at(1), at(2))) || char === '@' && identStart(at(1), at(2), at(3))) {
            i++;
            if (name() === undefined) return false;
        } else if (identStart(char, at(1), at(2))) {
            const ident = name();
            if (ident === undefined) return false;
            if (at() !== '(') continue;
            // A url token or `url()` function: a resource reference is never a token value (decision 3, 2026-10-09).
            if (/^url$/i.test(ident)) return false;
            i++;
            open.push(')');
        } else if (char === '<' && value.startsWith('!--', i + 1)) i += 4; // CDO, not a `!` delimiter
        else if (char === '\\') return false;
        else {
            if (char in closers) open.push(closers[char]);
            else if (char === ')' || char === ']' || char === '}') { if (open.pop() !== char) return false; }
            else if ((char === ';' || char === '!') && !open.length) return false;
            i++;
        }
    }
    return !open.length;
}
