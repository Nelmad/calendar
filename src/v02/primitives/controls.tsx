import {initializeUIRuntime} from './runtime.js';
import {forwardRef, type ReactNode} from 'react';
import {Button as AriaButton, Checkbox as AriaCheckbox, type ButtonProps as AriaButtonProps, type CheckboxProps as AriaCheckboxProps} from 'react-aria-components';

const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ');
/** Element props without React Aria's `data-selected`: that stable attribute belongs to date cells and item wrappers (§5.7, R60). */
export function withoutSelected<P extends object>(props: P): P {
    const {'data-selected': _selected, ...rest} = props as P & {'data-selected'?: unknown};
    return rest as P;
}
export type ButtonProps = Omit<AriaButtonProps, 'className'> & {className?: string; tone?: 'default' | 'danger'};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({className, tone = 'default', type = 'button', ...props}, ref) {
    initializeUIRuntime();
    return <AriaButton {...props} type={type} ref={ref} data-tone={tone} className={classes('nc-button', className)}/>;
});
export type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label' | 'aria-labelledby'> & {'aria-label': string; children: ReactNode};
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({className, children, ...props}, ref) {
    return <Button {...props} ref={ref} className={classes('nc-icon-button', className)}><span aria-hidden="true" className="nc-icon-content">{children}</span></Button>;
});
export type CheckboxProps = Omit<AriaCheckboxProps, 'className' | 'children'> & {className?: string; children: ReactNode};
export const Checkbox = forwardRef<HTMLLabelElement, CheckboxProps>(function Checkbox({className, children, ...props}, ref) {
    initializeUIRuntime();
    // §5.7 (R60): React Aria's `data-selected` on the label is dropped; the native checkbox keeps the checked state.
    return <AriaCheckbox {...props} ref={ref} className={classes('nc-checkbox', className)}
        render={element => <label {...withoutSelected(element)}/>}>
        {({isSelected, isIndeterminate}) => <><span className="nc-checkbox-mark" aria-hidden="true">{isIndeterminate ? '−' : isSelected ? '✓' : ''}</span><span>{children}</span></>}
    </AriaCheckbox>;
});
