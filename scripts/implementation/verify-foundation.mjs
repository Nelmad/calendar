import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

// Local regression run of the repository checks, intentionally not the CI gate set (ci.yml is). Without an
// output directory the run writes to a fresh temporary directory; its report is never written into the repository.
const output = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-validation-')));
mkdirSync(output, {recursive: true});
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const commands = [
    // The ledger is local and git-ignored since 2026-10-23: without a local copy this checks the spec/plan correspondence only.
    ['requirements', 'npm', ['run', 'check:requirements']],
    // Decisions 2026-10-22 fix round 1: shape of the carried ledger records (DV8-1-01).
    ['requirements-selftest', 'node', ['--test', 'scripts/implementation/requirements.checks.mjs']],
    ['timezones', 'npm', ['run', 'check:timezones']],
    ['transitions', 'npm', ['run', 'check:transitions']],
    ['typecheck', 'npm', ['run', 'typecheck']],
    ['build', 'npm', ['run', 'build']],
    // RELEASE-ALIGN 2026-10-23: the tarball content check that CI and the owner's Release workflow run before staging.
    ['check-pack', 'node', ['scripts/check-pack.mjs']],
    ['api-report', 'npm', ['run', 'check:api']],
    ['docs', 'npm', ['run', 'check:docs', '--', '--output', resolve(output, 'docs-parity.json')]],
    ['docs-gate-selftest', 'node', ['scripts/docs/check-docs-selftest.mjs', '--output', resolve(output, 'docs-gate-selftest.json')]],
    ['storybook-types', 'npm', ['run', 'typecheck:storybook']],
    ['reference-types', 'npm', ['run', 'typecheck:contract', '--', `--output=${resolve(output, 'types')}`]],
    ['minimum-reference-types', 'npm', ['run', 'typecheck:contract', '--', `--output=${resolve(output, 'types')}`], {
        CALENDAR_TYPESCRIPT_COMPILER: 'scripts/implementation/spikes/node_modules/typescript-min/lib/tsc.js',
    }],
    ['lint', 'npm', ['run', 'lint']],
    ['tests', 'npm', ['test', '--', '--reporter=dot']],
    ...['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Africa/Monrovia'].map((TZ, i) => [
        `date-host-timezone-${i + 1}`, 'npm', ['test', '--', 'src/v02/core/__tests__/date.test.ts', 'src/v02/core/__tests__/projection.test.ts', 'src/v02/core/__tests__/layout.test.ts', 'src/v02/core/__tests__/locale.test.ts', 'src/v02/core/__tests__/messages.test.tsx', 'src/v02/core/__tests__/controller.test.ts', 'src/v02/core/__tests__/today.test.ts', 'src/v02/core/__tests__/month.test.ts', 'src/v02/core/__tests__/responsive.test.ts', 'src/v02/core/__tests__/placement.test.ts', '--reporter=dot'], {TZ, LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8'},
    ]),
    ['storybook-build', 'npm', ['run', 'build-storybook', '--', '--disable-telemetry']],
    // Review 2026-10-09-2 and process change 2026-10-22: npm cache path, filtered acceptance outcome, stale port, CI artifact upload,
    // raw run artifacts outside git, example server.
    ['harness-selftest', 'node', ['--test', 'scripts/implementation/harness.checks.mjs']],
    // RELEASE-ALIGN 2026-10-23: archive helpers, repository.url and invariants of the owner's staged-publishing Release workflow and of CI.
    ['release-selftest', 'node', ['--test', 'scripts/release/release-metadata.checks.mjs']],
    // The packed acceptance itself is slow and uses the registry; CI runs it in the packed-consumers job (alpha-acceptance.mjs).
    ...['packed-harness.mjs', 'packed-consumers.mjs', 'alpha-acceptance.mjs', 'acceptance-alpha2.mjs', 'responsive-probe.mjs', 'overlay-probe.mjs', 'host-probe.mjs', 'portal-stories-check.mjs', 'actions-sources-probe.mjs', 'themes-slots-probe.mjs', 'examples-dev-probe.mjs', 'month-probe.mjs', 'controller-probe.mjs', 'review2-probe.mjs', 'review3-probe.mjs', 'projection-probe.mjs', 'browser-probes.mjs', 'verify-foundation.mjs'].map(name => [`harness-syntax-${name.replace('.mjs', '')}`, 'node', ['--check', `scripts/implementation/${name}`]]),
];
const sourcePaths = [
    'README.md', 'README.ru.md', 'CHANGELOG.md', 'docs/api.md', 'docs/api.ru.md', 'docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md',
    'docs/api/calendar.api.md', 'scripts/docs/api-extractor.json', 'scripts/docs/api-report.mjs', 'scripts/docs/check-docs.mjs', 'scripts/docs/check-docs-selftest.mjs',
    'examples/migration/convert.ts', 'examples/migration/tsconfig.json', 'tests/docs/migration.test.tsx', '.storybook/main.ts', '.storybook/preview.ts', '.github/workflows/pages.yml',
    'package.json', 'package-lock.json', 'src/v02/core/date.ts', 'src/v02/core/__tests__/date.test.ts',
    'src/v02/core/validation.ts', 'src/v02/core/__tests__/validation.test.ts',
    'src/v02/core/localeTag.ts', 'src/v02/core/__tests__/localeTag.test.ts',
    'src/v02/core/locale.ts', 'src/v02/core/formatting.ts', 'src/v02/core/catalogs.ts', 'src/v02/core/messages.ts',
    'src/v02/LocalizedText.tsx', 'src/v02/core/__tests__/locale.test.ts', 'src/v02/core/__tests__/messages.test.tsx',
    'tests/contracts/0.2/messages.ts', 'scripts/implementation/locale-entry.ts', 'scripts/implementation/locale-probe.mjs',
    'scripts/implementation/message-regressions.mjs',
    'src/v02/primitives/runtime.ts', 'src/v02/primitives/ThemeRoot.tsx', 'src/v02/primitives/controls.tsx', 'src/v02/primitives/overlays.tsx',
    'src/v02/primitives/content.tsx', 'src/v02/primitives/index.ts', 'src/v02/themes/classic.ts', 'src/v02/styles.css',
    'src/v02/primitives/__tests__/controls.test.tsx', 'src/v02/primitives/__tests__/runtime.test.ts', 'src/v02/themes/__tests__/classic.test.tsx',
    'src/v02/calendar/__tests__/tokens.test.tsx', 'src/v02/primitives/serverStyle.ts', 'src/v02/calendar/__tests__/serverStyle.test.tsx',
    'scripts/implementation/foundation-entry.tsx', 'scripts/implementation/foundation-probe.mjs', 'scripts/implementation/foundation-regressions.mjs', '.storybook/preview-head.html',
    'src/v02/core/controller.ts', 'src/v02/core/today.ts', 'src/v02/core/__tests__/controller.test.ts', 'src/v02/core/__tests__/today.test.ts',
    'src/v02/calendar/model.ts', 'src/v02/calendar/dom.ts', 'src/v02/calendar/useToday.ts', 'src/v02/calendar/useRootName.ts',
    'src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/CalendarShell.tsx', 'src/v02/calendar/__tests__/fixture.tsx',
    'src/v02/calendar/__tests__/controller.test.tsx', 'src/v02/calendar/__tests__/ssr.test.tsx', 'src/v02/calendar/__tests__/dom.test.ts',
    'scripts/implementation/controller-entry.tsx', 'scripts/implementation/controller-probe.mjs',
    'src/v02/core/month.ts', 'src/v02/core/__tests__/month.test.ts', 'src/v02/calendar/MonthView.tsx', 'src/v02/calendar/CalendarMonth.tsx',
    'src/v02/calendar/useMonthMeasurements.ts', 'src/v02/calendar/useStatusGeometry.ts', 'src/v02/calendar/__tests__/month.test.tsx',
    'scripts/implementation/month-entry.tsx', 'scripts/implementation/month-probe.mjs', 'scripts/verify-dist.mjs',
    'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/focus.ts', 'src/v02/primitives/NonModalPopover.tsx',
    'src/v02/calendar/__tests__/agenda.test.tsx', 'src/v02/calendar/__tests__/focus.test.ts', 'scripts/implementation/agenda-probe.mjs',
    'src/v02/core/responsive.ts', 'src/v02/core/__tests__/responsive.test.ts', 'src/v02/calendar/useResponsiveLayout.ts', 'src/v02/primitives/ModalSheet.tsx',
    'src/v02/calendar/__tests__/responsive.test.tsx', 'scripts/implementation/responsive-entry.tsx', 'scripts/implementation/responsive-probe.mjs',
    'src/v02/calendar/__tests__/hydration.test.tsx',
    'src/v02/calendar/__tests__/model.test.tsx', 'src/v02/calendar/__tests__/diagnostics.test.tsx',
    'src/v02/core/overlayStack.ts', 'src/v02/core/__tests__/overlayStack.test.ts', 'src/v02/calendar/overlays.tsx', 'src/v02/calendar/portal.ts',
    'src/v02/core/placement.ts', 'src/v02/core/__tests__/placement.test.ts', 'docs/specification-0.2.md', 'docs/implementation-plan-0.2.md', 'docs/decisions-0.2.md',
    'src/v02/calendar/__tests__/overlays.test.tsx', 'src/v02/calendar/__tests__/overlays.subscriptions.test.tsx', 'src/v02/calendar/__tests__/overlays.renders.test.tsx', 'src/v02/primitives/mirror.ts', 'src/v02/primitives/PortalTheme.tsx',
    'scripts/implementation/overlay-entry.tsx', 'scripts/implementation/overlay-probe.mjs',
    'src/v02/calendar/modality.ts', 'src/v02/calendar/__tests__/hosts.test.tsx', 'src/v02/calendar/__tests__/opening.test.tsx', 'scripts/implementation/host-probe.mjs',
    'src/v02/core/actions.ts', 'src/v02/core/sources.ts', 'src/v02/core/__tests__/actions.test.ts', 'src/v02/calendar/SourceSelector.tsx',
    'src/v02/calendar/__tests__/actions.test.tsx', 'src/v02/calendar/__tests__/sources.test.tsx', 'scripts/implementation/actions-sources-entry.tsx', 'scripts/implementation/actions-sources-probe.mjs',
    'src/v02/themes/neutral.ts', 'src/v02/themes/preset.ts', 'src/v02/core/appearance.ts', 'src/v02/core/cssValue.ts', 'src/v02/calendar/slots.tsx', 'src/v02/core/__tests__/appearance.test.ts',
    'src/v02/themes/__tests__/neutral.test.tsx', 'src/v02/calendar/__tests__/slots.test.tsx', 'src/v02/calendar/__tests__/attributes.test.tsx',
    'scripts/implementation/themes-slots-entry.tsx', 'scripts/implementation/themes-slots-probe.mjs',
    'src/index.ts', 'src/Calendar.tsx', 'scripts/bundle-css.mjs',
    'src/v02/surface.ts', 'src/v02/public.ts', 'src/v02/public.guard.ts', 'vitest.setup.ts', 'vitest.config.ts', 'src/v02/calendar/__tests__/surface.test.tsx', 'src/v02/calendar/__tests__/surface.ssr.test.tsx',
    'tests/contracts/public/positive.ts', 'tests/contracts/public/negative.ts', 'scripts/implementation/packed-probes/shared/require.cts',
    'tests/contracts/public/tsconfig.bundler.json', 'tests/contracts/public/tsconfig.nodenext.json', 'scripts/implementation/packed-consumers.mjs',
    'scripts/implementation/packed-harness.mjs', 'scripts/implementation/harness.checks.mjs', 'scripts/implementation/review2-entry.tsx', 'scripts/implementation/review2-probe.mjs', 'scripts/implementation/review3-entry.tsx', 'scripts/implementation/review3-probe.mjs',
    '.gitignore', 'scripts/implementation/alpha-acceptance.mjs', 'scripts/implementation/acceptance-alpha2.mjs', 'src/v02/calendar/__tests__/alpha1.test.tsx', 'scripts/implementation/spikes/package.json',
    ...['shared/Acceptance.tsx', 'shared/clock.mjs', 'vite/acceptance.html', 'vite/acceptance.vite.config.mjs', 'vite/acceptance-server.mjs', 'vite/src/acceptance/main.tsx',
        'vite/src/acceptance/entry-server.tsx', 'next/app/acceptance/page.tsx', 'next/app/acceptance/clock/route.ts'].map(path => `scripts/implementation/acceptance-probes/${path}`),
    'src/v02/core/timeZones.generated.ts', 'src/v02/core/__tests__/timeZones.test.ts',
    'src/v02/core/projection.ts', 'src/v02/core/layout.ts',
    'src/v02/core/__tests__/projection.test.ts', 'src/v02/core/__tests__/layout.test.ts',
    'scripts/implementation/timezones/audit-transitions.mjs',
    'scripts/implementation/timezones/vendor/tzcode2026c.tar.gz',
    'scripts/implementation/projection-entry.ts', 'scripts/implementation/projection-probe.mjs',
    'scripts/implementation/timezones/generate.mjs', 'scripts/implementation/timezones/primary.mjs',
    'scripts/implementation/timezones/primary.checks.mjs', 'scripts/implementation/timezones/policy.json',
    'scripts/implementation/timezones/probe.ts', 'scripts/implementation/timezones/run-capabilities.mjs',
    'scripts/implementation/timezones/runtime/node.json', 'scripts/implementation/timezones/runtime/chrome.json',
    '.github/workflows/release.yml', 'RELEASING.md', 'scripts/check-pack.mjs', 'scripts/release/release-metadata.mjs', 'scripts/release/release-metadata.checks.mjs', 'scripts/implementation/browser-probes.mjs',
    'docs/implementation/timezones-candidate.json',
    'src/v02/reference.d.ts', 'vite.lib.config.ts', 'stylelint.config.js', '.github/workflows/ci.yml',
    'scripts/implementation/contracts.mjs', 'scripts/implementation/requirements.mjs', 'scripts/implementation/ledger-evidence.mjs', 'scripts/implementation/requirements.checks.mjs',
    'scripts/implementation/spikes/package-lock.json', 'scripts/implementation/verify-foundation.mjs',
    'eslint.config.js', 'tsconfig.storybook.json', 'stories/support.tsx', 'stories/css-inline.d.ts', 'scripts/implementation/portal-stories-check.mjs',
    'scripts/implementation/examples-dev-entry.tsx', 'scripts/implementation/examples-dev-probe.mjs', 'examples/vite/README.md', 'examples/vite/README.ru.md', 'examples/next/README.md', 'examples/next/README.ru.md',
    ...['QuickStart', 'Navigation', 'Agenda', 'Sizing', 'DataStates', 'Localization', 'TimeZones', 'Intervals', 'Validation', 'Theming', 'Keyboard', 'Responsive', 'Portals', 'ActionsSources', 'Slots'].map(name => `stories/${name}.stories.tsx`),
    'scripts/implementation/packed-probes/vite/graph-check.mjs', 'scripts/implementation/packed-probes/vite/helper.ts', 'scripts/implementation/packed-probes/next/app/boundary/page.tsx',
    ...['suspense.html', 'suspense.vite.config.mjs', 'suspense-server.mjs', 'src/suspense/Suspended.tsx', 'src/suspense/entry-server.tsx', 'src/suspense/main.tsx',
        'shadow.html', 'shadow.vite.config.mjs', 'shadow-server.mjs', 'src/shadow/main.tsx']
        .map(path => `scripts/implementation/packed-probes/vite/${path}`),
    ...['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.mjs', 'index.html', 'server.mjs', 'src/App.tsx', 'src/main.tsx', 'src/entry-server.tsx',
        'src/Schedule.tsx', 'src/ReleaseCalendar.tsx', 'src/releaseData.ts', 'src/Workspace.tsx', 'src/app.css'].map(path => `examples/vite/${path}`),
    ...['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'app/layout.tsx', 'app/page.tsx', 'app/quick-start/page.tsx', 'app/app.css',
        'components/Schedule.tsx', 'components/ReleaseCalendar.tsx', 'components/releaseData.ts', 'components/AutoSchedule.tsx', 'app/streaming/page.tsx',
        'app/streaming/loading.tsx', 'components/Workspace.tsx', 'app/workspace/page.tsx'].map(path => `examples/next/${path}`),
];
const report = {
    startedAt: new Date().toISOString(), node: process.version, runtimeVersions: process.versions,
    scope: 'T01/T04–T19 implementation (through the QA fixes of 2026-10-09, the spec draft v7 decisions of 2026-10-09, the residual fixes of 2026-10-19, both fix rounds of review 2026-10-09-1, the fixes of review 2026-10-09-2, the fixes of review 2026-10-09-3 and the spec draft v8 decisions of 2026-10-22 with their fix round 1: selector focus return, the color single-declaration rule, CSSOM restoration of the own package declarations only, the agenda row name, the shape check of carried ledger records, and the spec draft v9 process change of 2026-10-22: re-runnable checks, CI and npm provenance instead of stored raw evidence, its fix round 1: one pack per CI run that the packed consumers and the milestone acceptance test with --tarball, the archive/checkout byte comparison, the Chrome probe gate, exact-case repository.url and a read-only CI token, and its alignment of 2026-10-23 with the staged-publishing Release workflow of the repository owner on main, whose invariants are checked without changing it; since the docs slimming of 2026-10-23 the requirement ledger is a local, git-ignored file) and package build, including the alpha.2 public surface gate (responsive layout, agenda presentations, portalContainer, item actions, controlled sources, neutralTheme, item appearance, content/class slots and stable data-* attributes), the overlay ownership tree with public item menus/action sheets and the standalone source selector, portal mirror, live routing and package-owned modal effects. Packed consumers, the packed prerelease acceptance (keyboard/axe/SSR) and the Chrome probes are checked separately; not release evidence.',
    sourceHashes: Object.fromEntries(sourcePaths.map(path => [path, hash(path)])),
    openChecks: ['B02-TOUCH physical devices unavailable; 24 emulated scenarios passed (T02)', 'T24/beta.1 move parts of R27/R41 (filter during a move draft, built-in move in the action set); complete supported browser/AT matrix and physical devices', 'T27 timezone RC runtime matrix, transition-spacing qualification and 0.2.x freeze', 'T08 native az-Arab Intl data differs between Node/Chrome: text hydration qualification fails; align locale data before releasing this SSR profile'],
    checks: [],
};
for (const [name, command, args, environment = {}] of commands) {
    const start = performance.now();
    const result = spawnSync(command, args, {
        encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
        env: {...process.env, CI: '1', STORYBOOK_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', ...environment},
    });
    const log = `${name}.txt`;
    writeFileSync(resolve(output, log), [result.stdout, result.stderr, result.error ? String(result.error) : ''].filter(Boolean).join('\n'));
    report.checks.push({name, command: [command, ...args], environment, durationMs: Math.round(performance.now() - start),
        exitCode: result.status, signal: result.signal, outcome: result.status === 0 ? 'pass' : 'fail', log});
    writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
}
report.finishedAt = new Date().toISOString();
report.outcome = report.checks.every(check => check.outcome === 'pass') ? 'pass' : 'fail';
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
