import {useState, type CSSProperties} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarAgendaPresentation, type CalendarProps, type ISODate} from '@nelmad/calendar';
import {Log, Toolbar, releaseItems, september, useLog, type Ticket} from './support';

// A container the reader can drag: `auto` follows the calendar root's own content width, not the viewport.
const resizable: CSSProperties = {resize: 'horizontal', overflow: 'auto', inlineSize: 560, minInlineSize: 280, maxInlineSize: '100%', padding: 4, border: '1px dashed GrayText'};

function ResponsiveDemo({layout, agendaPresentation, width}: {layout?: CalendarProps<Ticket>['layout']; agendaPresentation?: CalendarAgendaPresentation; width?: number}) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [entries, log] = useLog();
    return <div>
        <div style={width ? {...resizable, inlineSize: width} : resizable}>
            <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" anchorDate={anchorDate} onNavigate={setAnchorDate}
                {...(layout ? {layout} : {})} {...(agendaPresentation ? {agendaPresentation} : {})}
                onItemPress={({item, view, date}) => log(`onItemPress ${JSON.stringify({id: item.id, view, date})}`)}/>
        </div>
        <Log title="Item presses" entries={entries}/>
    </div>;
}

function ControlledSheetDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [agendaDate, setAgendaDate] = useState<ISODate>(september.today);
    const [entries, log] = useLog();
    return <div>
        <Toolbar><span>agendaDate: <code>{agendaDate}</code></span></Toolbar>
        <div style={{...resizable, inlineSize: 380}}>
            <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="mobile" agendaPresentation="overlay"
                anchorDate={anchorDate} onNavigate={setAnchorDate} agendaDate={agendaDate}
                onAgendaDateChange={date => { log(`onAgendaDateChange(${date})`); setTimeout(() => { setAgendaDate(date); log(`agendaDate = ${date}`); }, 600); }}/>
        </div>
        <Log title="Agenda requests (newest first)" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Responsive',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`layout\` defaults to \`'auto'\`: the calendar measures the content box of its own root, so the same page can host a wide and a
narrow calendar. Below \`mobileBreakpoint\` (640px by default) the month becomes a compact grid with item indicators; from
640px on it is the desktop month with bars, chips and \`+N\`. The content box is inside the root's own padding (\`spacing.md\`,
16px on each side by default), so with the defaults the root itself switches at 672px. Server render and the first client render of \`auto\` are always
mobile. \`'desktop'\` and \`'mobile'\` fix the layout and never measure.

There is one day agenda with three presentations: a non-modal popover on desktop, an inline agenda under the mobile grid and,
with \`agendaPresentation="overlay"\`, a modal bottom sheet on mobile. An open agenda follows a resize to the new presentation
on the same control while focus is inside it; focus elsewhere is never taken.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Auto: Story = {
    name: 'Auto (resizable container)',
    render: () => <ResponsiveDemo/>,
    parameters: {docs: {description: {story: 'Drag the bottom corner of the dashed container: the calendar switches when its content box reaches 640px, that is when the root (inside the dashed box) is 672px wide with the default 16px padding. An agenda that holds focus moves between inline and popover.'}}},
};
export const MobileInline: Story = {
    name: 'Mobile, inline agenda',
    render: () => <ResponsiveDemo layout="mobile" width={380}/>,
    parameters: {docs: {description: {story: '`layout="mobile"`: a tap on a day updates the agenda under the grid and keeps focus on the day; `Enter` moves focus to the agenda heading.'}}},
};
export const MobileSheet: Story = {
    name: 'Mobile, overlay sheet',
    render: () => <ResponsiveDemo layout="mobile" agendaPresentation="overlay" width={380}/>,
    parameters: {docs: {description: {story: '`agendaPresentation="overlay"`: a day opens a modal bottom sheet with its heading focused; `Escape`, the close button or the backdrop return focus to the day.'}}},
};
export const ForcedLayouts: Story = {
    name: 'Forced layouts',
    render: () => <div style={{display: 'grid', gap: 24}}>
        <figure style={{margin: 0}}><figcaption style={{fontWeight: 600, marginBlockEnd: 8}}>layout="mobile" in a wide container</figcaption><ResponsiveDemo layout="mobile" width={900}/></figure>
        <figure style={{margin: 0}}><figcaption style={{fontWeight: 600, marginBlockEnd: 8}}>layout="desktop" in a narrow container</figcaption><ResponsiveDemo layout="desktop" width={380}/></figure>
    </div>,
    parameters: {docs: {description: {story: 'A forced layout never measures: the compact month stays compact in 900px, and the desktop month in 380px keeps 64px columns and scrolls inside its own grid region instead of the page. Prefer `auto` where phones are expected.'}}},
};
export const ControlledSheet: Story = {
    name: 'Mobile sheet, delayed acceptance',
    render: () => <ControlledSheetDemo/>,
    parameters: {docs: {description: {story: 'A controlled `agendaDate` accepted after 600 ms: the sheet opens once the prop matches the tapped day. Scrolling the page in the meantime does not cancel the request.'}}},
};
