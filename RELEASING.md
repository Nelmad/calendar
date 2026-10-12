# Releasing

`@nelmad/calendar` is released only through the
[Release workflow](.github/workflows/release.yml) with npm staged publishing.
GitHub Actions stages the version through npm trusted publishing: no npm token
is stored anywhere, and the version carries a provenance attestation that links
it to the commit and workflow run. A staged version is not public until a
maintainer approves it with 2FA, so a compromised GitHub account or workflow
cannot release on its own.

## Steps

1. Open a pull request that bumps `version` in `package.json` and moves the
   `CHANGELOG.md` entry from "Unreleased" to `## [x.y.z] - YYYY-MM-DD`.
2. Merge it into `main` once CI is green.
3. In the Actions tab run **Release** on `main`. The workflow typechecks,
   tests, builds and stages the version: a stable version with the `latest`
   dist-tag, a prerelease (`0.2.0-alpha.2`) with `next`, so `latest` never
   moves to a prerelease. The dist-tag of a staged version cannot be changed.
4. Approve the staged version on npmjs.com: package page → **Staged Packages**
   → **Approve**, confirmed with your security key. The CLI alternative is
   `npm stage approve <stage-id>`; the stage id is in the workflow summary.
5. The workflow waits up to 30 minutes for the approval and then creates the
   `vX.Y.Z` tag and GitHub Release. If you approve later, run **Release**
   again: it sees the version on npm and only creates the tag.

A rerun never stages a version twice: npm keeps one index for staged and
published versions. To discard a staged version, reject it on npmjs.com or
with `npm stage reject <stage-id>`.

## Trusted publisher

The package settings on npmjs.com list one trusted publisher. All fields are
case-sensitive and cannot be edited after creation:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `Nelmad` |
| Repository | `calendar` |
| Workflow filename | `release.yml` |
| Environment | `npm-publish` |
| Allowed actions | staged publishing only (`npm publish` and `npm dist-tag` off) |

A new trusted publisher must be used within two days, otherwise npm expires it.
`repository.url` in `package.json` must match this repository exactly. The
GitHub environment `npm-publish` accepts deployments from `main` only.
Publishing access is set to "Require two-factor authentication and disallow
tokens".

## Mistakes

Never unpublish a version: consumers and lockfiles may already depend on it.
Deprecate it and release a fix instead:

```bash
npm deprecate @nelmad/calendar@<version> "<reason>; use <fixed version>"
```
