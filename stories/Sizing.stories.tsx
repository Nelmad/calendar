import {useState, type CSSProperties} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar} from '@nelmad/calendar';
import {crowdedItems, frame, september} from './support';

const items = crowdedItems(5);
function Sized({style}: {style?: CSSProperties}) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    return <Calendar items={items} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
        anchorDate={anchorDate} onNavigate={setAnchorDate} {...(style ? {style} : {})}/>;
}

const meta = {
    title: 'Calendar/Sizing',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
The calendar needs no fixed-height parent. The root is \`inline-size: 100%\` with intrinsic \`block-size: auto\`; each week row has
a preferred height from \`density\` and the \`dayMinHeight\` token, so the number of weeks sets the natural height. Rows never grow
with the number of items: hidden items are counted in a \`+N\` indicator and stay reachable in the day agenda.

A definite height on the root itself (\`style\`, \`className\` or external CSS) splits the remaining space equally between the
week rows. The calendar measures each row and shows only whole lanes; a parent height alone is never treated as a constraint.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Intrinsic: Story = {
    name: 'Intrinsic height',
    render: () => <div style={frame}><Sized/></div>,
    parameters: {docs: {description: {story: 'No height anywhere: five meetings per weekday, the rows keep their built-in height and show `+N`.'}}},
};
export const Constrained: Story = {
    name: 'Constrained height',
    render: () => <div style={frame}><Sized style={{blockSize: 460}}/></div>,
    parameters: {docs: {description: {story: '`style={{blockSize: 460}}` on the root: fewer lanes per row and larger `+N`, while toolbar, weekday header and every cell stay unclipped.'}}},
};
export const Taller: Story = {
    name: 'Taller definite height',
    render: () => <div style={frame}><Sized style={{blockSize: 860}}/></div>,
    parameters: {docs: {description: {story: 'A definite height can also be larger than the intrinsic one: rows get taller and show more whole lanes.'}}},
};
export const VeryConstrained: Story = {
    name: 'Below the minimum',
    render: () => <div style={frame}><Sized style={{blockSize: 260}}/></div>,
    parameters: {docs: {description: {story: 'When the height cannot fit a date header and one `+N` row, the grid becomes its own vertical scroll region; controls are not cut and the page gets no second scrollbar axis.'}}},
};
