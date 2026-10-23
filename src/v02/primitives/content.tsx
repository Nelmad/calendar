import type {HTMLAttributes, CSSProperties} from 'react';

export function Stack({direction = 'column', className, ...props}: HTMLAttributes<HTMLDivElement> & {direction?: 'row' | 'column'}) {
    return <div {...props} className={['nc-stack', className].filter(Boolean).join(' ')} data-direction={direction}/>;
}
export function Text({as: Element = 'span', tone = 'default', className, ...props}: HTMLAttributes<HTMLSpanElement> & {as?: 'span' | 'p'; tone?: 'default' | 'muted' | 'danger'}) {
    return <Element {...props} className={['nc-text', className].filter(Boolean).join(' ')} data-tone={tone}/>;
}
export function Skeleton({style, className}: {style?: CSSProperties; className?: string}) {
    return <span aria-hidden="true" className={['nc-skeleton', className].filter(Boolean).join(' ')} style={style}/>;
}
const paths = {
    previous: 'M7.8 11L13.4 5.4L12 4L4 12L12 20L13.4 18.6L7.8 13H20V11H7.8Z',
    next: 'M16.2 11L10.6 5.4L12 4L20 12L12 20L10.6 18.6L16.2 13H4V11H16.2Z',
    close: 'M6.4 5L12 10.6L17.6 5L19 6.4L13.4 12L19 17.6L17.6 19L12 13.4L6.4 19L5 17.6L10.6 12L5 6.4Z',
    more: 'M5 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z',
};
export function Icon({name}: {name: keyof typeof paths}) {
    return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="nc-icon"
        data-directional={name === 'previous' || name === 'next' ? 'true' : undefined}><path d={paths[name]} fill="currentColor"/></svg>;
}
