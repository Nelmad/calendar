import {initializeUIRuntime} from './runtime.js';
import {createContext, forwardRef, useCallback, useContext, useRef, type HTMLAttributes, type RefObject} from 'react';
import {I18nProvider} from 'react-aria-components';
import type {CalendarColorScheme, CalendarDensity, CalendarDirection, CalendarThemeTokens} from '../reference.js';
import {themeStyle, type CalendarRootStyle} from '../themes/classic.js';
import type {ThemeName} from '../themes/neutral.js';
import type {MirrorHub} from './mirror.js';
import {useServerStyle} from './serverStyle.js';

export type ThemeScope = {/** The theme root's `lang`, not the formatting locale. */ lang: string; dir: CalendarDirection; theme?: ThemeName; density?: CalendarDensity; colorScheme?: CalendarColorScheme;
    tokens?: CalendarThemeTokens; style?: CalendarRootStyle; owner?: RefObject<HTMLElement | null>; mirror?: MirrorHub};
const ThemeContext = createContext<ThemeScope>({lang: 'ru-RU', dir: 'ltr'});
export function themeAttributes(scope: ThemeScope) {
    return {lang: scope.lang, dir: scope.dir, 'data-dir': scope.dir, 'data-theme': scope.theme ?? 'classic',
        'data-density': scope.density ?? 'compact', 'data-color-scheme': scope.colorScheme ?? 'system'};
}
export const useThemeScope = () => useContext(ThemeContext);
export type ThemeRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'dir' | 'lang' | 'style'> & Omit<ThemeScope, 'owner'> & {locale?: string};

/** The package's own root declarations of a render: the validated `tokens`, minus every key that the consumer `style` sets. */
const withoutKeys = (own: CalendarRootStyle, style: CalendarRootStyle | undefined): CalendarRootStyle =>
    style && typeof style === 'object' ? Object.fromEntries(Object.entries(own).filter(([name]) => !(name in style))) : own;
/** Only owner/portal roots carry theme attributes; portal roots mirror this owner (PortalTheme). */
export const ThemeRoot = forwardRef<HTMLDivElement, ThemeRootProps>(function ThemeRoot({lang, locale = lang, dir, theme = 'classic', density = 'compact', colorScheme = 'system',
    tokens, style, mirror, className, children, ...props}, ref) {
    initializeUIRuntime();
    const owner = useRef<HTMLDivElement | null>(null);
    const attach = useCallback((element: HTMLDivElement | null) => {
        owner.current = element;
        if (typeof ref === 'function') ref(element); else if (ref) ref.current = element;
    }, [ref]);
    const own = themeStyle(tokens).style, rootStyle = {...own, ...style};
    // Spec v8 §10.3.4: under a strict CSP only the validated `tokens` declarations come back, without those the consumer
    // `style` replaces; the consumer's own inline style stays subject to its policy.
    useServerStyle(owner, withoutKeys(own, style));
    // The root language follows its accessible name and can differ from date formatting (`locale`);
    // portal theme roots repeat the root's own `lang` (§10.3.4), React Aria formats with `locale`.
    const attributes = themeAttributes({lang, dir, theme, density, colorScheme});
    return <ThemeContext.Provider value={{lang, dir, theme, density, colorScheme, tokens, style, owner, mirror}}><I18nProvider locale={locale}>
        <div {...props} {...attributes} ref={attach} className={['nc-theme', className].filter(Boolean).join(' ')} style={rootStyle}>
            {children}
        </div>
    </I18nProvider></ThemeContext.Provider>;
});
