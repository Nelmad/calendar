import {initializeUIRuntime} from './runtime.js';
import {forwardRef, type DetailedHTMLProps, type HTMLAttributes, type ReactNode} from 'react';
import {Dialog as AriaDialog, Menu as AriaMenu, MenuItem as AriaMenuItem, Modal as AriaModal, ModalOverlay, Popover as AriaPopover,
    type DialogProps, type MenuProps, type MenuItemProps, type ModalOverlayProps, type PopoverProps} from 'react-aria-components';
import {themeStyle} from '../themes/classic.js';
import {themeAttributes, useThemeScope} from './ThemeRoot.js';
import {withoutSelected} from './controls.js';

export {DialogTrigger, MenuTrigger, Heading} from 'react-aria-components';
const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ');
type Named = {'aria-label': string};

export function Menu<T extends object>(props: Omit<MenuProps<T>, 'className'> & Named & {className?: string}) {
    initializeUIRuntime();
    // Clear MenuTrigger's implicit IDREF; menus own their name in every tree scope.
    return <AriaMenu {...props} aria-labelledby="" className={classes('nc-menu', props.className)}/>;
}
export function MenuItem<T extends object>(props: Omit<MenuItemProps<T>, 'className'> & {className?: string; tone?: 'default' | 'danger'}) {
    const {tone = 'default', className, ...rest} = props;
    // §5.7: `data-selected` is a stable attribute of date cells and item wrappers only (R60); React Aria's own selection
    // attribute of a checkable item is dropped, its state stays `aria-checked`.
    return <AriaMenuItem {...rest} data-tone={tone} className={classes('nc-menu-item', className)}
        render={element => <div {...withoutSelected(element as DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>)}/>}/>;
}
export const Dialog = forwardRef<HTMLElement, DialogProps & Named>(function Dialog({className, ...props}, ref) {
    initializeUIRuntime();
    return <AriaDialog {...props} ref={ref} className={classes('nc-dialog', className)}/>;
});
export const Popover = forwardRef<HTMLElement, Omit<PopoverProps, 'className' | 'style'> & {className?: string}>(function Popover({className, placement, children, ...props}, ref) {
    initializeUIRuntime();
    const scope = useThemeScope();
    // RAC derives its positioner's dir from locale, ignoring an explicit dir.
    // Resolve logical edges ourselves and keep the theme root inside that boundary.
    const resolvedPlacement = (placement ?? 'bottom start')
        .replace('start', scope.dir === 'rtl' ? 'right' : 'left')
        .replace('end', scope.dir === 'rtl' ? 'left' : 'right') as NonNullable<PopoverProps['placement']>;
    return <AriaPopover {...props} placement={resolvedPlacement} ref={ref} className="nc-positioned-popover">
        {state => <div {...themeAttributes(scope)} className={classes('nc-theme', 'nc-popover', className)} style={themeStyle(scope.tokens).style}>
            {typeof children === 'function' ? children(state) : children}
        </div>}
    </AriaPopover>;
});
export const Modal = forwardRef<HTMLDivElement, Omit<ModalOverlayProps, 'className' | 'style' | 'children'> & {children: ReactNode}>(function Modal({children, isDismissable = true, ...props}, ref) {
    initializeUIRuntime();
    const scope = useThemeScope();
    return <ModalOverlay {...props} {...themeAttributes(scope)} ref={ref} isDismissable={isDismissable} className="nc-theme nc-backdrop" style={themeStyle(scope.tokens).style}>
        <AriaModal className="nc-modal">{children}</AriaModal>
    </ModalOverlay>;
});
