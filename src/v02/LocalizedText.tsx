import type {LocalizedText as Text} from './core/formatting.js';

/** Private text-only rendering, reusable by labels and future live payloads. */
export function LocalizedText({value}: {value: Text}) {
    return <span lang={value.lang} dir={value.dir}>{value.fragments.map((part, index) =>
        <bdi key={index} lang={part.lang ?? ''} dir={part.dir}>{part.text}</bdi>)}</span>;
}
