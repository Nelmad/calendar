import {useState, type CSSProperties} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, classicTheme, neutralTheme, type CalendarColorScheme, type CalendarCSSVariable, type CalendarDensity, type CalendarTheme, type CalendarThemeTokens} from '@nelmad/calendar';
import {Columns, Side, frame, releaseItems, september} from './support';

type Look = {theme?: CalendarTheme; density?: CalendarDensity; colorScheme?: CalendarColorScheme; tokens?: CalendarThemeTokens; style?: CSSProperties & Partial<Record<CalendarCSSVariable, string>>};
function Themed(look: Look) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    return <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop" theme={classicTheme}
        anchorDate={anchorDate} onNavigate={setAnchorDate} {...look}/>;
}
const tokens: CalendarThemeTokens = {
    color: {accent: '#0b6e4f', focus: '#0b6e4f', surface: '#fbfaf5', border: '#c9c4b5'},
    typography: {fontFamily: 'Georgia, "Times New Roman", serif'},
    radii: {sm: '2px', md: '4px', lg: '6px'},
    components: {itemBackground: '#e3efe9', itemText: '#0d3b2c'},
};

const meta = {
    title: 'Calendar/Theming',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
Styles come only from \`@nelmad/calendar/styles.css\`, scoped under \`.nc-theme\`; the calendar's own code injects no CSS at runtime
(its React Aria dependency adds one small \`<style>\` rule for touch handling, see the README for strict CSP).
\`theme\` accepts \`classicTheme\` (default) or \`neutralTheme\`. \`density\` (\`compact\` default, \`comfortable\`) and \`colorScheme\` (\`system\` default,
\`light\`, \`dark\`) are props. \`tokens\` overrides individual design tokens; each token is also a public CSS variable
(\`--nelmad-calendar-*\`) that can be set through \`style\`, \`className\` or external CSS.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Presets: Story = {name: 'Presets', render: () => <div style={frame}><Columns>
    <Side title='classicTheme'><Themed colorScheme="light"/></Side>
    <Side title='neutralTheme'><Themed theme={neutralTheme} colorScheme="light"/></Side>
    <Side title='neutralTheme, dark, comfortable'><Themed theme={neutralTheme} colorScheme="dark" density="comfortable"/></Side>
</Columns></div>,
parameters: {docs: {description: {story: 'Themes change colors, radii, shadow and motion only; layout, roles, focus and keyboard behavior stay the same.'}}}};
export const Matrix: Story = {name: 'Theme × density × color scheme', render: () => <div style={frame}><Columns>
    {[classicTheme, neutralTheme].flatMap(theme => (['compact', 'comfortable'] as const).flatMap(density => (['light', 'dark'] as const).map(colorScheme =>
        <Side key={`${theme.name}-${density}-${colorScheme}`} title={`${theme.name}, ${density}, ${colorScheme}`}><Themed theme={theme} density={density} colorScheme={colorScheme}/></Side>)))}
</Columns></div>,
parameters: {docs: {description: {story: 'Every combination the alpha.2 acceptance scans with axe. Theme and density are independent: density changes sizes only, the theme colors, radii, shadow and motion.'}}}};
export const Density: Story = {name: 'Density', render: () => <div style={frame}><Columns>
    <Side title='density="compact"'><Themed density="compact"/></Side>
    <Side title='density="comfortable"'><Themed density="comfortable"/></Side>
</Columns></div>};
export const ColorScheme: Story = {name: 'Color scheme', render: () => <div style={frame}><Columns>
    <Side title='colorScheme="light"'><Themed colorScheme="light"/></Side>
    <Side title='colorScheme="dark"'><Themed colorScheme="dark"/></Side>
    <Side title='colorScheme="system"'><Themed colorScheme="system"/></Side>
</Columns></div>,
parameters: {docs: {description: {story: '`system` follows `prefers-color-scheme` of the viewer.'}}}};
export const CustomTokens: Story = {name: 'Custom tokens', render: () => <div style={frame}>
    <Themed colorScheme="light" tokens={tokens} style={{'--nelmad-calendar-color-muted': '#4f6357'}}/>
</div>,
parameters: {docs: {description: {story: '`tokens` changes accent, surface, border, radii, font and item colors (chips, bars and agenda rows); `style` sets one more public CSS variable directly (`color.muted`). Toolbar buttons derive their fill from `color.surface` and `color.text`; `components.selectedDayBackground` colors only selected days, which alpha.2 does not offer.'}}}};
export const Playground: StoryObj<typeof Themed> = {
    render: args => <div style={frame}><Themed {...args}/></div>,
    args: {density: 'compact', colorScheme: 'light'},
    argTypes: {density: {control: 'inline-radio', options: ['compact', 'comfortable']}, colorScheme: {control: 'inline-radio', options: ['light', 'dark', 'system']}},
};
