import {createMessages} from '../../../src/v02/core/messages.js';
import {resolveLocale} from '../../../src/v02/core/locale.js';
import type {MessageTemplates} from '../../../src/v02/core/catalogs.js';

const messages = createMessages(resolveLocale(), 'UTC', {messages: {todayLabel: 'Today'}});
messages.message('todayLabel');
messages.message('moveTargetAnnouncement', 'Title', '2026-09-03', false, '+02:00');
messages.message('selectionCompletedAnnouncement', {start: '2026-09-03', end: '2026-09-05'});
// @ts-expect-error Static messages take no arguments.
messages.message('todayLabel', '2026-09-03');
// @ts-expect-error Unknown catalog keys are rejected.
messages.message('allDayLabel');
// @ts-expect-error Target state is required.
messages.message('moveTargetAnnouncement', 'Title', '2026-09-03');
// @ts-expect-error Message callback parameters must match the public contract.
createMessages(resolveLocale(), 'UTC', {messages: {agendaHeading: (count: number) => String(count)}});

declare const incompleteCatalog: Omit<MessageTemplates, 'pendingStateLabel'>;
// @ts-expect-error Both built-in catalogs must include the pending state label.
const _missingPending: MessageTemplates = incompleteCatalog;
