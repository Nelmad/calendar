import type {CalendarMessages} from '../reference.js';
import {userText, type TextFragment, type createDateFormatting} from './formatting.js';

export type MessageArguments<K extends keyof CalendarMessages> = CalendarMessages[K] extends (...args: infer A) => string ? A : [];
export type MessageTemplates = {[K in keyof CalendarMessages]: CalendarMessages[K] extends (...args: infer A) => string ? (...args: A) => readonly TextFragment[] : string};

/** Complete typed catalogs; language fragments are preserved before flattening. */
export function createBuiltinCatalog(lang: 'ru-RU' | 'en-US', dates: ReturnType<typeof createDateFormatting>, untitled: () => TextFragment): MessageTemplates {
    const ru = lang === 'ru-RU';
    const literal = (text: string): TextFragment => ({text, lang, dir: 'ltr', kind: 'message'});
    const t = (strings: TemplateStringsArray, ...values: (TextFragment | readonly TextFragment[])[]): readonly TextFragment[] =>
        strings.flatMap((text, i) => [...(text ? [literal(text)] : []), ...(i < values.length ? (Array.isArray(values[i]) ? values[i] as readonly TextFragment[] : [values[i] as TextFragment]) : [])]);
    const title = (value: string) => value.trim() ? userText(value) : untitled();
    const date = (value: string) => dates.date(value, 'short');
    const month = (value: string) => dates.date(value, 'month');
    const number = new Intl.NumberFormat(lang, {localeMatcher: 'lookup'});
    const plural = new Intl.PluralRules(lang, {localeMatcher: 'lookup'});
    const count = (value: number) => {
        if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Item count must be a nonnegative safe integer');
        const category = plural.select(value);
        const noun = ru ? (category === 'one' ? 'событие' : category === 'few' ? 'события' : 'событий') : value === 1 ? 'event' : 'events';
        return literal(`${number.format(value)} ${noun}`);
    };
    const allowed = (value: boolean) => literal(ru ? (value ? 'Доступно' : 'Недоступно') : value ? 'Available' : 'Unavailable');
    return {
        calendarLabel: ru ? 'Календарь' : 'Calendar',
        previousMonthLabel: ru ? 'Предыдущий месяц' : 'Previous month',
        nextMonthLabel: ru ? 'Следующий месяц' : 'Next month',
        todayLabel: ru ? 'Сегодня' : 'Today',
        untitledItemLabel: ru ? 'Без названия' : 'Untitled',
        sourceSelectorLabel: ru ? 'Календари' : 'Calendars',
        showSourceLabel: source => ru ? t`Показать календарь ${userText(source)}` : t`Show calendar ${userText(source)}`,
        hideSourceLabel: source => ru ? t`Скрыть календарь ${userText(source)}` : t`Hide calendar ${userText(source)}`,
        openAgendaLabel: value => ru ? t`Открыть события: ${date(value)}` : t`Open events for ${date(value)}`,
        closeAgendaLabel: ru ? 'Закрыть события дня' : 'Close day agenda',
        agendaHeading: value => ru ? t`События: ${date(value)}` : t`Events for ${date(value)}`,
        agendaEmpty: ru ? 'На этот день событий нет' : 'No events on this day',
        itemActionsLabel: value => ru ? t`Действия: ${title(value)}` : t`Actions for ${title(value)}`,
        itemCountLabel: (value, n) => t`${date(value)}: ${count(n)}`,
        moreItemsLabel: (value, n) => ru ? t`${date(value)}: ещё ${count(n)}` : t`${date(value)}: ${count(n)} hidden`,
        todayStateLabel: ru ? 'Сегодня' : 'Today',
        selectedStateLabel: ru ? 'Выбрано' : 'Selected',
        viewedDateStateLabel: ru ? 'Открытый день' : 'Viewed day',
        unavailableStateLabel: ru ? 'Недоступно' : 'Unavailable',
        pendingStateLabel: ru ? 'Перенос ожидает подтверждения' : 'Move pending',
        selectDateLabel: ru ? 'Выбрать день' : 'Select day',
        selectRangeLabel: ru ? 'Выбрать диапазон' : 'Select range',
        confirmSelectionLabel: ru ? 'Подтвердить выделение' : 'Confirm selection',
        clearSelectionLabel: ru ? 'Снять выделение' : 'Clear selection',
        createLabel: ru ? 'Создать событие' : 'Create event',
        moveItemLabel: ru ? 'Перенести' : 'Move',
        confirmMoveLabel: ru ? 'Подтвердить перенос' : 'Confirm move',
        cancelLabel: ru ? 'Отмена' : 'Cancel',
        retryLabel: ru ? 'Повторить' : 'Retry',
        loadingLabel: ru ? 'Загрузка календаря' : 'Loading calendar',
        refreshingLabel: ru ? 'Обновление календаря' : 'Refreshing calendar',
        emptyLabel: ru ? 'В этом месяце событий нет' : 'No events in this month',
        errorLabel: ru ? 'Не удалось загрузить календарь' : 'Could not load calendar',
        invalidConfigurationLabel: ru ? 'Не удалось показать календарь: неверные настройки' : 'Calendar cannot be displayed: invalid configuration',
        genericBlockedReason: ru ? 'Действие недоступно' : 'Action unavailable',
        navigationBoundaryReason: ru ? 'Месяц вне поддерживаемого диапазона' : 'Month is outside the supported range',
        selectionBoundaryReason: ru ? 'Диапазон выделения выходит за поддерживаемые даты' : 'Selection is outside the supported date range',
        moveDstGapReason: (value, time) => ru ? t`Время ${userText(time)} ${date(value)} не существует в этом часовом поясе` : t`${userText(time)} on ${date(value)} does not exist in this time zone`,
        moveBoundaryReason: ru ? 'Перенос выходит за поддерживаемый диапазон дат' : 'Move is outside the supported date range',
        moveItemChangedReason: ru ? 'Время события изменилось' : 'Event time has changed',
        moveTimeZoneChangedReason: ru ? 'Часовой пояс календаря изменился' : 'Calendar time zone has changed',
        moveItemUnavailableReason: ru ? 'Событие больше недоступно для переноса' : 'Event is no longer available to move',
        gridInstructions: ru ? 'Стрелки — перейти к дате. Enter — открыть события дня. Page Up и Page Down — сменить месяц.' : 'Use arrow keys to navigate dates. Enter opens day events. Page Up and Page Down change the month.',
        rangeSelectionInstructions: ru ? 'Пробел или Enter — задать начало диапазона. Стрелки — выбрать конец. Пробел или Enter — подтвердить. Escape — отменить.' : 'Space or Enter sets the range start. Arrow keys choose the end. Space or Enter confirms. Escape cancels.',
        moveInstructions: ru ? 'Стрелки — выбрать дату переноса. Enter — подтвердить. Escape — отменить.' : 'Arrow keys choose the move date. Enter confirms. Escape cancels.',
        blockedAnnouncement: reason => ru ? t`Действие недоступно: ${userText(reason)}` : t`Action unavailable: ${userText(reason)}`,
        monthChangedAnnouncement: value => ru ? t`Открыт месяц: ${month(value)}` : t`Showing ${month(value)}`,
        agendaUpdatedAnnouncement: (value, n) => ru ? t`Открыты события: ${date(value)}, ${count(n)}` : t`Showing ${date(value)}, ${count(n)}`,
        refreshCompletedAnnouncement: ru ? 'Календарь обновлён' : 'Calendar refreshed',
        selectionStartedAnnouncement: value => ru ? t`Начало выделения: ${date(value)}` : t`Selection starts on ${date(value)}`,
        selectionTargetAnnouncement: (value, ok) => ru ? t`Диапазон: ${dates.range(value)}. ${allowed(ok)}` : t`Range: ${dates.range(value)}. ${allowed(ok)}`,
        selectionCancelledAnnouncement: ru ? 'Выделение отменено' : 'Selection cancelled',
        selectionCompletedAnnouncement: value => ru ? t`Выбран диапазон: ${dates.range(value)}` : t`Selected range: ${dates.range(value)}`,
        selectionClearedAnnouncement: ru ? 'Выделение снято' : 'Selection cleared',
        moveStartedAnnouncement: value => ru ? t`Перенос события ${title(value)}` : t`Moving ${title(value)}`,
        moveNavigationPendingLabel: (value, target) => ru ? t`Перенос события ${title(value)}: ожидается открытие ${month(target)}` : t`Moving ${title(value)}: waiting for ${month(target)}`,
        moveTargetAnnouncement: (value, target, ok, offset) => {
            const suffix = offset === undefined ? [] : t`. ${userText(`UTC${offset}`)}`;
            return ru ? t`${title(value)}: ${date(target)}. ${allowed(ok)}${suffix}` : t`${title(value)}: ${date(target)}. ${allowed(ok)}${suffix}`;
        },
        moveCancelledAnnouncement: (value, reason) => {
            const suffix = reason === undefined ? [] : t`: ${userText(reason)}`;
            return ru ? t`Перенос события ${title(value)} отменён${suffix}` : t`Move of ${title(value)} cancelled${suffix}`;
        },
        moveNoopAnnouncement: value => ru ? t`${title(value)}: дата не изменилась` : t`${title(value)}: date unchanged`,
        movePendingAnnouncement: value => ru ? t`Перенос события ${title(value)} ожидает подтверждения` : t`Move of ${title(value)} is pending`,
        moveSucceededAnnouncement: value => ru ? t`Событие ${title(value)} перенесено` : t`${title(value)} moved`,
        moveRejectedAnnouncement: (value, reason) => ru ? t`Перенос события ${title(value)} отклонён: ${userText(reason)}` : t`Move of ${title(value)} rejected: ${userText(reason)}`,
    };
}
