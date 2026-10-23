import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarHourCycle, type CalendarMessages, type CalendarWeekday} from '@nelmad/calendar';
import {Columns, Side, Toolbar, frame, releaseItems, september} from './support';

type Localized = {locale?: string; messagesLocale?: string; hourCycle?: CalendarHourCycle; firstDayOfWeek?: CalendarWeekday; messages?: Partial<CalendarMessages>};
function Localized(props: Localized) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    return <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} layout="desktop"
        anchorDate={anchorDate} onNavigate={setAnchorDate} {...props}/>;
}
function LocaleSwitch() {
    const [locale, setLocale] = useState('ru-RU');
    return <div style={frame}>
        <Toolbar>{['ru-RU', 'en-US'].map(value => <label key={value}>
            <input type="radio" name="locale" checked={locale === value} onChange={() => setLocale(value)}/> {value}</label>)}</Toolbar>
        <Localized locale={locale}/>
    </div>;
}
function WeekStart() {
    const [firstDayOfWeek, setFirstDayOfWeek] = useState<CalendarWeekday>('monday');
    const days: CalendarWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return <div style={frame}>
        <Toolbar><label>firstDayOfWeek <select value={firstDayOfWeek} onChange={event => setFirstDayOfWeek(event.target.value as CalendarWeekday)}>
            {days.map(day => <option key={day} value={day}>{day}</option>)}</select></label></Toolbar>
        <Localized locale="ru-RU" firstDayOfWeek={firstDayOfWeek}/>
    </div>;
}
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', timeZone: 'UTC'}).format(new Date(`${value}T00:00:00Z`));

const meta = {
    title: 'Calendar/Localization',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`locale\` (BCP 47) drives date, number and weekday formatting, the default first day of the week and the default direction.
Built-in message catalogs are Russian and English; \`messagesLocale\` chooses the catalog independently from formatting, and
\`messages\` overrides individual strings or functions (other keys keep the catalog value). \`hourCycle\` and
\`firstDayOfWeek\` override the locale defaults. Item titles are user data and are never translated.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const RussianAndEnglish: Story = {name: 'ru-RU / en-US', render: () => <LocaleSwitch/>,
    parameters: {docs: {description: {story: 'Switching the locale changes the formatting, the catalog and the week start (Monday for ru-RU, Sunday for en-US), and therefore the visible range.'}}}};
export const HourCycle: Story = {name: 'hourCycle 12 / 24', render: () => <div style={frame}><Columns>
    <Side title="hourCycle={24}"><Localized locale="en-US" hourCycle={24}/></Side>
    <Side title="hourCycle={12}"><Localized locale="ru-RU" hourCycle={12}/></Side>
</Columns></div>};
export const FirstDayOfWeek: Story = {name: 'firstDayOfWeek', render: () => <WeekStart/>};
export const MessagesLocale: Story = {name: 'messagesLocale', render: () => <div style={frame}><Columns>
    <Side title='locale="de-DE" messagesLocale="ru-RU"'><Localized locale="de-DE" messagesLocale="ru-RU"/></Side>
    <Side title='locale="ru-RU" messagesLocale="en-US"'><Localized locale="ru-RU" messagesLocale="en-US"/></Side>
</Columns></div>,
parameters: {docs: {description: {story: 'German formatting with the Russian catalog (a Russian-speaking team in Germany), and Russian formatting with the English catalog.'}}}};
export const PartialMessages: Story = {name: 'Partial messages override', render: () => <div style={frame}>
    <Localized locale="ru-RU" messages={{todayLabel: 'К сегодняшнему дню', agendaHeading: value => `План на ${date(value)}`}}/>
</div>,
parameters: {docs: {description: {story: '`todayLabel` and the `agendaHeading(date)` function are replaced; everything else comes from the Russian catalog.'}}}};
export const RightToLeft: Story = {name: 'RTL (ar)', render: () => <div style={frame}><Localized locale="ar-EG"/></div>,
    parameters: {docs: {description: {story: `
Arabic derives \`dir="rtl"\`: columns, bars, \`+N\` and directional icons are mirrored, \`ArrowLeft\`/\`ArrowRight\` follow the visual
direction, previous/next month keep their chronological meaning. Without an Arabic catalog the messages fall back to English;
user titles are isolated from the surrounding direction. Pass \`dir\` to override the derived direction.
`}}}};
