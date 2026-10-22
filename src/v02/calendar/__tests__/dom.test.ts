import {describe, expect, it} from 'vitest';
import {generatedContentText} from '../dom.js';

describe('accessible CSS generated content', () => {
    it.each([
        ['"Project calendar"', 'Project calendar'],
        ['"Project" " calendar"', 'Project calendar'],
        ['"Project \\63 alendar"', 'Project calendar'],
        ['"Project \\"calendar\\""', 'Project "calendar"'],
        ['url("icon.svg") / "Project calendar"', 'Project calendar'],
        ['"Decoration" / ""', ''],
        ['url("icon.svg")', ''],
        ['none', ''],
        ['normal', ''],
        ['" "', ' '],
    ])('reads rendered text from %s', (content, expected) => {
        expect(generatedContentText(content)).toBe(expected);
    });
});
