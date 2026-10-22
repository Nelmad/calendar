// @vitest-environment node
import {expect, it} from 'vitest';
import {isLocaleTag} from '../localeTag.js';

it.each([
    'ru-RU', 'en', 'ar-EG-u-ca-islamic-nu-arab', 'zh-Hant-TW', 'de-CH-1901',
    'sl-rozaj-biske-1994', 'es-419', 'en-a-myext-b-another-x-private', 'x-company',
    'X-a-12345678', 'i-klingon', 'en-GB-oed', 'sgn-BE-FR', 'no-bok', 'zh-min-nan',
    'zh-cmn-Hans-CN', 'abcd', 'abcdef-Latn-419', 'zz-ZZ', 'en-0-foo',
])('accepts BCP 47 syntax independently of Intl support: %s', value => expect(isLocaleTag(value)).toBe(true));

it.each([
    null, [], 12, '', ' ', 'en_US', ' en-US', 'en-US\n', 'en--US', 'en-', '-en',
    'en-123456789', 'a', 'i-notreal', 'i-klingon-extra', 'x', 'en-x', 'en-a', 'en-a-x-a',
    'de-1901-1901', 'de-1901-1901-x-ok', 'en-a-foo-A-bar', 'abcd-abc', 'en-Latn-US-abc',
    'abcd-abc-def', 'İn-ID', 'en-💡', 'zh-aaa-bbb-ccc-ddd',
])('rejects malformed or duplicate BCP 47 subtags: %j', value => expect(isLocaleTag(value)).toBe(false));
