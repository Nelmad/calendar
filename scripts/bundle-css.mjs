import {copyFileSync, readFileSync, writeFileSync} from 'node:fs';
import postcss from 'postcss';

// Explicit scoped asset; importing JavaScript never injects CSS. The comments of the source are maintainer notes, so
// the published stylesheet is the source without its comment nodes: PostCSS keeps every other byte as written.
const sheet = postcss.parse(readFileSync(new URL('../src/v02/styles.css', import.meta.url), 'utf8'), {from: 'src/v02/styles.css'});
const lineBreaks = text => text.split('\n').length - 1;
sheet.walkComments(comment => {
    // The next node takes over the space before a comment that opened its block or stood after a blank line, so the
    // layout of the rules stays as written.
    const next = comment.next(), before = comment.raws.before ?? '';
    if (next && (comment === comment.parent.first || lineBreaks(before) > lineBreaks(next.raws.before ?? ''))) next.raws.before = before;
    comment.remove();
});
writeFileSync(new URL('../dist/styles.css', import.meta.url), sheet.toString());
// NodeNext require() consumers need a declaration with CommonJS identity.
copyFileSync(new URL('../dist/index.d.ts', import.meta.url), new URL('../dist/index.d.cts', import.meta.url));
