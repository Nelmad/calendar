import {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {Button, Checkbox, Icon, IconButton, Skeleton, ThemeRoot} from '../index.js';

describe('private UI controls', () => {
    it('presses once for Enter/Space/click without submitting a parent form', async () => {
        const user = userEvent.setup(), press = vi.fn(), submit = vi.fn(event => event.preventDefault());
        render(<form onSubmit={submit}><ThemeRoot lang="en-US" dir="ltr"><Button onPress={press}>Run</Button></ThemeRoot></form>);
        await user.tab();
        expect(screen.getByRole('button', {name: 'Run'})).toHaveFocus();
        await user.keyboard('{Enter} ');
        await user.click(screen.getByRole('button'));
        expect(press).toHaveBeenCalledTimes(3);
        expect(submit).not.toHaveBeenCalled();
    });
    it('skips disabled buttons and never calls their press handler', async () => {
        const user = userEvent.setup(), press = vi.fn();
        render(<ThemeRoot lang="en-US" dir="ltr"><Button isDisabled onPress={press}>Disabled</Button><Button>Enabled</Button></ThemeRoot>);
        await user.tab();
        expect(screen.getByRole('button', {name: 'Enabled'})).toHaveFocus();
        await user.click(screen.getByRole('button', {name: 'Disabled'}));
        expect(press).not.toHaveBeenCalled();
        expect(screen.getByRole('button', {name: 'Disabled'})).toBeDisabled();
    });
    it('forwards the real button ref and gives icon buttons their own accessible name', () => {
        const ref = createRef<HTMLButtonElement>();
        render(<ThemeRoot lang="ru-RU" dir="ltr"><IconButton ref={ref} aria-label="Предыдущий месяц"><Icon name="previous"/></IconButton><Skeleton/></ThemeRoot>);
        expect(ref.current).toBe(screen.getByRole('button', {name: 'Предыдущий месяц'}));
        expect(ref.current?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
    it('keeps a controlled checkbox unchanged until the owner accepts its request', async () => {
        const user = userEvent.setup(), change = vi.fn();
        const view = render(<Checkbox isSelected={false} onChange={change}>Work</Checkbox>);
        await user.tab();
        await user.keyboard(' ');
        expect(change).toHaveBeenCalledWith(true);
        expect(screen.getByRole('checkbox', {name: 'Work'})).not.toBeChecked();
        view.rerender(<Checkbox isSelected onChange={change}>Work</Checkbox>);
        expect(screen.getByRole('checkbox', {name: 'Work'})).toBeChecked();
    });
    it('exposes mixed/disabled checkbox state and ignores disabled input', async () => {
        const user = userEvent.setup(), change = vi.fn();
        render(<Checkbox isIndeterminate isDisabled onChange={change}>Work</Checkbox>);
        const input = screen.getByRole('checkbox', {name: 'Work'});
        expect(input).toBePartiallyChecked();
        expect(input).toBeDisabled();
        await user.click(input);
        expect(change).not.toHaveBeenCalled();
    });
});
