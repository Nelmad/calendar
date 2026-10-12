# Releasing

`@nelmad/calendar` is published only from GitHub Actions by the
[Release workflow](.github/workflows/release.yml) through npm trusted
publishing. No npm token is stored anywhere; every version gets a provenance
attestation that links the tarball on npm to the commit and workflow run.

## Steps

1. Open a pull request that bumps `version` in `package.json` and moves the
   `CHANGELOG.md` entry from "Unreleased" to `## [x.y.z] - YYYY-MM-DD`.
2. Merge it into `main` once CI is green.
3. In the Actions tab run **Release** on `main`. The workflow:
   - skips the run if this version is already on npm, so a rerun is safe;
   - publishes a stable version with the `latest` dist-tag and a prerelease
     (`0.2.0-alpha.2`) with `next`, so `latest` never moves to a prerelease;
   - creates the `vX.Y.Z` tag and GitHub Release only after npm accepted the
     version.

## Trusted publisher

The package settings on npmjs.com list one trusted publisher. All fields are
case-sensitive:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `Nelmad` |
| Repository | `calendar` |
| Workflow filename | `release.yml` |
| Environment | `npm-publish` |

A new trusted publisher must be used for a successful publish within two days,
otherwise npm expires it. `repository.url` in `package.json` must match this
repository exactly. Publishing access is set to "Require two-factor
authentication and disallow tokens", which does not affect trusted publishing.

## Mistakes

Never unpublish a version: consumers and lockfiles may already depend on it.
Deprecate it and release a fix instead:

```bash
npm deprecate @nelmad/calendar@<version> "<reason>; use <fixed version>"
```
