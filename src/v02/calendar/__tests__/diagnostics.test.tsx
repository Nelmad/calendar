import {useState} from 'react';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';
import type {CalendarModel} from '../model.js';

// QA-23: development diagnostics name the actual problem and never fire for a valid configuration.
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-09-03', end: '2026-09-04'}}];
const input = (): CalendarProps => ({items, timeZone: 'UTC', locale: 'en-US', today: '2026-09-03', anchorDate: '2026-09-01', layout: 'desktop', onNavigate() {}});
const Untyped = Calendar as unknown as (props: Record<string, unknown>) => ReturnType<typeof Calendar>;
let warn: ReturnType<typeof vi.spyOn>;
const warnings = () => warn.mock.calls.map(([message]) => String(message));
const cell = (date: string) => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('development diagnostics (QA-23)', () => {
    it('a valid aria-labelledby is not reported when the page unmounts in a later non-urgent commit', async () => {
        let hide!: () => void;
        function Page() {
            const [shown, setShown] = useState(true);
            hide = () => setShown(false);
            return shown ? <section><h2 id="release-title">Releases</h2><Calendar {...input()} aria-labelledby="release-title"/></section> : null;
        }
        render(<Page/>);
        expect(screen.getByRole('region', {name: 'Releases'})).toHaveAttribute('aria-labelledby', 'release-title');
        // A default-priority update outside act(): React removes the DOM in its commit and runs effect cleanup
        // in a later scheduler task. A slow (development) commit exhausts the scheduler's time slice, so it yields
        // in between and the name observer sees the removed root first (client navigation in next dev).
        const environment = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
        let clock = performance.now();
        environment.IS_REACT_ACT_ENVIRONMENT = false;
        const now = vi.spyOn(performance, 'now').mockImplementation(() => clock += 10);
        try {
            hide();
            // The fast clock makes the scheduler yield after every unit of work: wait until the page is gone.
            for (let spent = 0; spent < 3000 && document.querySelector('.nc-calendar'); spent += 20) await new Promise(resolve => setTimeout(resolve, 20));
            await new Promise(resolve => setTimeout(resolve, 100));
        } finally { now.mockRestore(); environment.IS_REACT_ACT_ENVIRONMENT = true; }
        expect(screen.queryByRole('grid')).toBeNull();
        expect(warnings().filter(message => message.includes('aria-labelledby'))).toEqual([]);
    });
    it('a missing labelledby target is still reported once while mounted', async () => {
        const view = render(<Calendar {...input()} aria-labelledby="absent"/>);
        const missing = () => warnings().filter(message => message === '[@nelmad/calendar] aria-labelledby: Ignored missing, empty or cross-tree references: absent');
        expect(missing()).toHaveLength(1);
        // Each rerender and each observed DOM mutation validates the reference again; the warning is not repeated.
        view.rerender(<Calendar {...input()} aria-labelledby="absent" className="again"/>);
        await act(async () => { document.body.append(Object.assign(document.createElement('p'), {textContent: 'mutation'})); });
        await act(async () => { document.body.setAttribute('data-touched', ''); });
        expect(missing()).toHaveLength(1);
    });
    it.each([['returning an empty string', () => ''], ['returning a non-string', () => 42]])('a messages function %s is reported when its text renders', async (_label, agendaHeading) => {
        const user = userEvent.setup();
        render(<Untyped {...input()} messages={{agendaHeading}}/>);
        expect(warnings().filter(message => message.includes('messages.agendaHeading'))).toEqual([]);
        // The agenda heading renders only once the popover opens, in a render of the agenda alone.
        await user.click(cell('2026-09-03'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(warnings().filter(message => message.includes('messages.agendaHeading'))).toEqual([
            '[@nelmad/calendar] messages.agendaHeading: Expected a nonempty message of the declared shape; using built-in fallback',
        ]);
        await user.click(cell('2026-09-03')); await user.click(cell('2026-09-03'));
        expect(warnings().filter(message => message.includes('messages.agendaHeading'))).toHaveLength(1);
    });
    it.each([['timeZone', 'an IANA time zone such as Europe/Moscow'], ['anchorDate', 'an ISO date such as 2026-09-01'], ['items', 'a readonly array'],
        ['onNavigate', 'a function']] as const)('a missing %s is reported as required', (name, expected) => {
        const {[name]: _omitted, ...props} = input();
        render(<Untyped {...props}/>);
        expect(warnings()).toContain(`[@nelmad/calendar] ${name}: Required; expected ${expected}`);
        expect(warnings().join('\n')).not.toContain('accepted-set');
    });
    it('an invalid time zone still names the accepted set', () => {
        render(<Calendar {...input()} timeZone="Mars/Olympus"/>);
        expect(warnings()).toContain('[@nelmad/calendar] timeZone: Timezone is outside the package accepted-set');
    });
    it('removed 0.1 props point to the migration guide, unknown names are not Calendar props, planned props keep their wording', () => {
        render(<Untyped {...input()} events={[]} utcOffset="+03:00" isFetching={false} data-testid="calendar" onEventPress={() => {}} interactionPolicyTypo={{}} selection={null}/>);
        for (const name of ['events', 'utcOffset', 'isFetching', 'data-testid', 'onEventPress']) {
            expect(warnings()).toContain(`[@nelmad/calendar] ${name}: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`);
        }
        expect(warnings()).toContain('[@nelmad/calendar] interactionPolicyTypo: not a Calendar prop; ignored');
        expect(warnings()).toContain('[@nelmad/calendar] selection: not available in 0.2.0-alpha.2; ignored');
        expect(warnings().filter(message => /events|utcOffset|interactionPolicyTypo/.test(message) && message.includes('not available'))).toEqual([]);
        expect(warnings().filter(message => message.includes('selection') && message.includes('migration'))).toEqual([]);
        expect(screen.getByRole('grid')).toBeInTheDocument();
    });
});

describe('message diagnostics in production builds (§11.3)', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
    it.each([['development', 2], ['production', 0]] as const)('%s builds drain render diagnostics in %s commit effects', async (mode, drains) => {
        // The hook is chosen when the module loads, as a bundler fixes NODE_ENV per build.
        vi.stubEnv('NODE_ENV', mode); vi.resetModules();
        const {useMessageDiagnostics} = await import('../useCalendarController.js');
        const drain = vi.fn(() => [{path: 'messages.agendaHeading', reason: 'Expected a string'}]), report = vi.fn();
        // Item color diagnostics share the hook (T18); they are empty here.
        const model = {kind: 'data', drainDiagnostics: drain, appearance: {drain: () => []}} as unknown as CalendarModel<unknown, unknown>;
        function Probe() { useMessageDiagnostics(model, report); return null; }
        const view = render(<Probe/>); view.rerender(<Probe/>);
        expect(drain).toHaveBeenCalledTimes(drains); expect(report).toHaveBeenCalledTimes(drains);
    });
    it('a production calendar neither queues nor prints a message diagnostic', async () => {
        vi.stubEnv('NODE_ENV', 'production'); vi.resetModules();
        const {Calendar: Production} = await import('../../../index.js');
        const user = userEvent.setup();
        render(<Production {...input()} messages={{agendaHeading: () => ''}}/>);
        await user.click(cell('2026-09-03'));
        expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(warnings()).toEqual([]);
    });
});
