import {useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, neutralTheme} from '@nelmad/calendar';
import styles from '@nelmad/calendar/styles.css?inline';
import {Side, Columns, frame, releaseItems, september} from './support';

const box = {minBlockSize: 48, padding: 8, border: '1px dashed GrayText', fontSize: 14};

function ElementDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate), [container, setContainer] = useState<HTMLElement | null>(null);
    return <Columns>
        <Side title="Calendar"><Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} portalContainer={container}/></Side>
        <Side title="portalContainer (Element)"><div ref={setContainer} style={box}/></Side>
    </Columns>;
}

function ShadowRootDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate), host = useRef<HTMLDivElement>(null), [shadow, setShadow] = useState<ShadowRoot | null>(null);
    useLayoutEffect(() => {
        const root = host.current!.shadowRoot ?? host.current!.attachShadow({mode: 'open'});
        // styles.css does not cross the shadow boundary: the portal's tree scope needs its own copy.
        if (!root.querySelector('style')) { const style = document.createElement('style'); style.textContent = styles; root.append(style); }
        setShadow(root);
    }, []);
    return <Columns>
        <Side title="Calendar"><Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} portalContainer={shadow}/></Side>
        <Side title="portalContainer (ShadowRoot with styles.css inside)"><div ref={host} style={box}/></Side>
    </Columns>;
}

function ThemeScopeDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate), host = useRef<HTMLDivElement>(null), [shadow, setShadow] = useState<ShadowRoot | null>(null);
    const [mount, setMount] = useState<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const root = host.current!.shadowRoot ?? host.current!.attachShadow({mode: 'open'});
        if (!root.querySelector('style')) { const style = document.createElement('style'); style.textContent = styles; root.append(style); }
        setMount(root.querySelector('div') ?? root.appendChild(document.createElement('div'))); setShadow(root);
    }, []);
    // The calendar root and its portals live in one ShadowRoot with its own copy of styles.css; the theme travels with the portals.
    return <div ref={host}>{mount && createPortal(<Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="auto"
        theme={neutralTheme} colorScheme="dark" density="comfortable" tokens={{color: {accent: '#8ab4f8'}}} anchorDate={anchorDate} onNavigate={setAnchorDate}
        portalContainer={shadow}/>, mount)}</div>;
}

const meta = {
    title: 'Calendar/Portals',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`portalContainer\` receives the day agenda popover (and the mobile sheet). The default is the \`body\` of the calendar's own
document, or the open modal container around the calendar (a \`<dialog>\` shown with \`showModal()\`, or an element with
\`aria-modal="true"\`; a plain \`role="dialog"\` panel is not one); a detached node, a node of another document or any non-node
value falls back to it with a development warning. Dialog and popover libraries that render \`role="dialog"\` without
\`aria-modal\` and trap focus (Radix Dialog, React Aria Components \`Modal\` and \`Popover\`) need their dialog element as
\`portalContainer\`; development builds warn once when the default goes to \`body\` inside such an element.
Every portal gets its own theme root and a copy of the calendar's resolved public CSS variables and font properties.

\`styles.css\` does not cross a shadow boundary: import it in every tree scope that holds the calendar root or a portal.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ElementContainer: Story = {
    name: 'Element container',
    render: () => <div style={frame}><ElementDemo/></div>,
    parameters: {docs: {description: {story: 'Open a day: the agenda popover is mounted in the dashed box and still anchored to the date cell.'}}},
};
export const ShadowRootContainer: Story = {
    name: 'ShadowRoot container',
    render: () => <div style={frame}><ShadowRootDemo/></div>,
    parameters: {docs: {description: {story: 'The container is an open `ShadowRoot`; the story appends `styles.css` (imported with Vite `?inline`) to it, so the portal is themed. The date cell gets `aria-controls` only when it and the overlay share a tree scope, so here it has none.'}}},
};
export const ThemeScope: Story = {
    name: 'ShadowRoot theme scope',
    render: () => <div style={frame}><ThemeScopeDemo/></div>,
    parameters: {docs: {description: {story: 'Calendar, popover and mobile sheet inside one ShadowRoot: `neutralTheme`, dark, comfortable and an accent token are mirrored to every portal theme root before it is shown. `layout="auto"` follows the content box of the calendar itself, not the window: when the calendar is narrower than 672px (a content box below the 640px `mobileBreakpoint` plus the default 16px padding), for example in a narrow Storybook viewport, it shows the compact month and its inline agenda.'}}},
};
