# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-12

### Changed

- Published from GitHub Actions through npm trusted publishing, with a provenance attestation that links the
  package to its source commit and build. No code changes since 0.1.0.
- `repository`, `homepage` and `bugs` point to `github.com/Nelmad/calendar` with the exact owner name.

## [0.1.0] - 2026-06-10

### Added

- Initial release of `@nelmad/calendar`
- `Calendar` — month view with multi-day event bars and single-day chips
- `CalendarSkeleton` loading placeholder
- UTC-offset-aware layout (`buildWeekLayout`, `getMonthGridRange`, `getMonthGridWeeks`)
- `formatEventTime` helper
- Customizable `labels`, `theme`, and `palette` with default exports
- Hover edit/delete actions with `single` / `series` scope
- ESM + CJS build, bundled CSS (`styles.css`, `tokens.css`)
- Storybook examples

### Changed

- README: product overview, data-flow example, multi-day quick start, limitations, event flags matrix, CSS/font setup, exports list
