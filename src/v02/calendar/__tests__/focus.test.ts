import {afterEach, describe, expect, it} from 'vitest';
import {available, containsComposed, inertComposed, logicalExit, tabbables} from '../focus.js';

afterEach(() => document.body.replaceChildren());
describe('composed agenda sequential focus', () => {
    it('skips hidden/inert/disabled ancestors and preserves positive tabindex order', () => {
        document.body.innerHTML = '<button id="normal">Normal</button><button tabindex="2" id="two">Two</button><button tabindex="1" id="one">One</button><div style="display:none"><button>Hidden</button></div><div inert><button>Inert</button></div><button disabled>Disabled</button>';
        expect(tabbables(document.body).map(n => n.id)).toEqual(['one', 'two', 'normal']);
    });
    it('flattens nested shadow/slot scopes with local positive tabindex order', () => {
        document.body.innerHTML = '<button id="before">Before</button><div id="host"><button id="slotted">Slot</button></div><button id="after">After</button>';
        const host = document.getElementById('host')!, shadow = host.attachShadow({mode: 'open'});
        shadow.innerHTML = '<button id="inner">Inner</button><slot></slot><button id="positive" tabindex="1">Positive</button>';
        expect(tabbables(document.body).map(n => n.id)).toEqual(['before', 'positive', 'inner', 'slotted', 'after']);
        expect(containsComposed(host, shadow.querySelector('button'))).toBe(true);
        host.setAttribute('tabindex', '-1'); expect(tabbables(document.body).map(n => n.id)).toEqual(['before', 'after']);
        host.hidden = true; expect(available(shadow.querySelector('button')!)).toBe(false);
    });
    it('detects an inert or aria-hidden composed ancestor across a shadow host', () => {
        document.body.innerHTML = '<div id="host"></div>';
        const host = document.getElementById('host')!, shadow = host.attachShadow({mode: 'open'});
        shadow.innerHTML = '<div role="status"></div>'; const status = shadow.firstElementChild!;
        expect(inertComposed(status)).toBe(false);
        host.setAttribute('aria-hidden', 'true'); expect(inertComposed(status)).toBe(true);
        host.removeAttribute('aria-hidden'); host.setAttribute('inert', ''); expect(inertComposed(status)).toBe(true);
    });
    it('skips other radios in the checked group and closed details content', () => {
        document.body.innerHTML = '<input type="radio" name="a" id="one"><input type="radio" name="a" id="two" checked><details><summary tabindex="0" id="summary">More</summary><button id="hidden">Hidden</button></details>';
        expect(tabbables(document.body).map(n => n.id)).toEqual(['two', 'summary']);
    });
    it('excludes the portal and returns no target at either document edge', () => {
        document.body.innerHTML = '<button id="before">Before</button><div role="gridcell" id="trigger" tabindex="0">Date</div><section id="overlay"><button>Close</button></section>';
        const trigger = document.getElementById('trigger')!, overlay = document.getElementById('overlay')!;
        expect(logicalExit(trigger, overlay, false)).toBeUndefined(); expect(logicalExit(trigger, overlay, true)?.id).toBe('before');
        document.getElementById('before')!.remove(); expect(logicalExit(trigger, overlay, true)).toBeUndefined();
    });
});

// Review 2026-10-09-2: content outside an open modal <dialog> is inert by the modal state alone (no attribute), so a Tab
// exit continues in the dialog's own sequential order; past its end there is no package target and the UA continues.
describe('Tab exit inside a modal <dialog>', () => {
    it('never targets the page outside the dialog', () => {
        document.body.innerHTML = '<button id="page-before">Before</button><dialog id="host" open><button id="first">First</button><button id="trigger">Trigger</button></dialog><button id="page-after">After</button><div id="overlay"><button>Inside</button></div>';
        const trigger = document.getElementById('trigger')!, overlay = document.getElementById('overlay')!;
        expect(logicalExit(trigger, overlay, false)).toBeUndefined();
        expect(logicalExit(trigger, overlay, true)?.id).toBe('first');
        document.getElementById('host')!.insertAdjacentHTML('beforeend', '<button id="last">Last</button>');
        expect(logicalExit(trigger, overlay, false)?.id).toBe('last');
        // A closed dialog orders nothing: the document order applies.
        (document.getElementById('host') as HTMLDialogElement).removeAttribute('open');
        document.body.insertAdjacentHTML('afterbegin', '<div id="plain"><button id="p-trigger">Plain</button></div>');
        expect(logicalExit(document.getElementById('p-trigger')!, overlay, false)?.id).toBe('page-before');
    });
});
