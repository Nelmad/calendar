// Version switcher of the versioned Storybook site. assemble.mjs copies this module to the site root and imports it into
// the manager index.html of every line right after the manager globals, so it adds a toolbar tool through the Storybook
// manager API before the addons and the manager load. It links to the root of every line in versions.json and marks
// the current line (aria-current) and the prerelease ones; the previews (iframe.html) of the lines are not changed.
const {__STORYBOOK_API__: api, __STORYBOOK_COMPONENTS__: components, __STORYBOOK_THEMING__: theming, __REACT__: React} = globalThis;

/** The line whose root the page is under, by the paths of versions.json. */
export const currentLine = (lines, pathname) => lines.find(entry => pathname.startsWith(entry.path) || `${pathname}/` === entry.path);

/** The badge of a prerelease line: the prerelease id of its version (alpha, beta, rc), `pre` when it has none. */
export const prereleaseLabel = version => /^[^-+]+-([0-9A-Za-z]+)/.exec(version)?.[1] ?? 'pre';

const describe = (entry, latest) => [entry.version, entry.status, entry.line === latest ? 'npm latest' : undefined].filter(Boolean).join(' · ');

const visuallyHidden = {position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0};

function register() {
    const {addons, types} = api, {IconButton, Separator} = components, h = React.createElement;
    const versions = fetch(new URL('versions.json', import.meta.url)).then(response => {
        if (!response.ok) throw new Error(`versions.json: HTTP ${response.status}`);
        return response.json();
    });
    versions.catch(error => console.warn(`Version switcher: ${error.message}`));

    function VersionSwitcher() {
        const theme = theming.useTheme(), [site, setSite] = React.useState(undefined);
        React.useEffect(() => {
            let live = true;
            versions.then(value => live && setSite(value), () => {});
            return () => {
                live = false;
            };
        }, []);
        if (!site) return null;
        const current = currentLine(site.lines, location.pathname);
        const badge = {marginLeft: 4, padding: '0 4px', border: '1px solid currentColor', borderRadius: 4, fontSize: 10, lineHeight: '14px', fontWeight: 700, textTransform: 'uppercase'};
        return h(React.Fragment, null,
            h('nav', {'aria-label': `${site.package} versions`, style: {display: 'flex', alignItems: 'center', gap: 2}},
                h('span', {'aria-hidden': true, style: {marginRight: 4, color: theme.color.defaultText, fontSize: theme.typography.size.s1}}, 'Version'),
                site.lines.map(entry => h(IconButton, {key: entry.line, asChild: true, active: entry === current},
                    // Text in the theme text colour (the muted colours of the toolbar icons are below 4.5:1 for text); the
                    // current line keeps the toolbar's active background and is bold.
                    h('a', {href: entry.path, 'aria-current': entry === current ? 'page' : undefined, title: describe(entry, site.latest),
                        style: {color: theme.color.defaultText, fontWeight: entry === current ? theme.typography.weight.bold : theme.typography.weight.regular}},
                        entry.line,
                        entry.status === 'prerelease' && h('span', {'aria-hidden': true, style: badge}, prereleaseLabel(entry.version)),
                        entry.status === 'prerelease' && h('span', {style: visuallyHidden}, ` prerelease ${entry.version}`))))),
            Separator && h(Separator));
    }

    addons.register('nelmad-calendar/versions', () => {
        addons.add('nelmad-calendar/versions/tool', {type: types.TOOL, title: 'Versions', render: VersionSwitcher});
    });
}

if (api?.addons && api.types && components?.IconButton && theming?.useTheme && React?.createElement) register();
else if (globalThis.document) console.warn('Version switcher: the Storybook manager globals are missing; no switcher is shown');
