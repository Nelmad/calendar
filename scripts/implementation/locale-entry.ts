import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {resolveLocale, type LocaleOptions} from '../../src/v02/core/locale.js';
import {createDateFormatting, getCalendarVisibleRange} from '../../src/v02/core/formatting.js';
import {contractMessages, createMessages} from '../../src/v02/core/messages.js';
import {LocalizedText} from '../../src/v02/LocalizedText.js';
import type {CalendarMessages} from '../../src/v02/reference.js';

type Input = LocaleOptions & {messagesLocale?: string; messages?: Partial<CalendarMessages>};
export function localeModel(input: Input) {
    const resolved = resolveLocale(input);
    const dates = createDateFormatting(resolved, 'Pacific/Apia');
    const messages = createMessages(resolved, 'Pacific/Apia', input);
    return {resolved, range: getCalendarVisibleRange({anchorDate: '2026-08-19', timeZone: 'Pacific/Apia', locale: input.locale, firstDayOfWeek: input.firstDayOfWeek}),
        date: dates.date('2011-12-30'), midnight: createDateFormatting(resolved, 'UTC').time('2026-09-03T00:00:00Z'),
        heading: messages.message('agendaHeading', '2026-09-03'), title: messages.message('moveStartedAnnouncement', '<title>שלום'),
        count: messages.message('itemCountLabel', '2026-09-03', 22), fallback: messages.message('todayLabel'),
        error: contractMessages({locale: input.locale, messagesLocale: 'bad_tag', messages: input.messages})};
}
function textTree(input: Input) {
    const model = localeModel(input);
    return createElement('div', {lang: model.resolved.locale, dir: model.resolved.dir},
        ...[model.heading, model.title, model.count, model.fallback].map((value, key) => createElement(LocalizedText, {value, key})));
}
export const serverText = (input: Input) => renderToString(textTree(input));
/** Review regressions use serializable fixtures; callbacks run locally in each runtime. */
export function messageRegressions() {
    const title = 'Report\u202e';
    const localized = createMessages(resolveLocale({locale: 'en-US'}), 'UTC', {messages: {
        moveCancelledAnnouncement: value => `Move of ${value} cancelled`,
        moveStartedAnnouncement: value => `${value}: ${value} now`,
        showSourceLabel: value => `Show ${value} now`,
        blockedAnnouncement: reason => `Blocked: ${reason} now`,
    }});
    const fallback = createMessages(resolveLocale({locale: 'fr-FR'}), 'UTC', {messages: {
        untitledItemLabel: title, moveStartedAnnouncement: value => `Déplacer ${value} maintenant`,
    }});
    const rows = [
        {name: 'title', value: localized.message('moveCancelledAnnouncement', title), expected: 'Move of Report cancelled'},
        {name: 'repeated title', value: localized.message('moveStartedAnnouncement', title), expected: 'Report: Report now'},
        {name: 'source', value: localized.message('showSourceLabel', title), expected: 'Show Report now'},
        {name: 'reason', value: localized.message('blockedAnnouncement', title), expected: 'Blocked: Report now'},
        {name: 'blank title', value: fallback.message('moveStartedAnnouncement', ' '), expected: 'Déplacer Report maintenant'},
    ];
    return {
        rows: rows.map(row => ({...row, html: renderToString(createElement(LocalizedText, {value: row.value}))})),
        shells: ['rus', 'rus-RU', 'RUS'].flatMap(locale => [undefined, 'bad_tag'].map(messagesLocale => ({locale,
            malformedMessagesLocale: messagesLocale !== undefined, value: contractMessages({locale, messagesLocale})}))),
    };
}
export async function hydrateText(input: Input, container: Element) {
    const errors: string[] = [];
    const root = hydrateRoot(container, textTree(input), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    const html = container.innerHTML;
    root.unmount();
    return {html, errors};
}
