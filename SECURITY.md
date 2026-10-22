# Security policy

## Supported versions

Security fixes are released for the latest published minor version of
`@nelmad/calendar`. Older versions are not patched; upgrade to the latest
release.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public
issue or pull request for a security problem.

Include the affected version, a description of the impact and the steps or code
needed to reproduce it. You will get a reply within 7 days. Once a fix is
released, the advisory is published with credit to the reporter unless you ask
otherwise.

## Verifying releases

Every release is built and published from GitHub Actions through npm trusted
publishing and carries a provenance attestation that links the package to its
source commit and workflow run (see [RELEASING.md](RELEASING.md)). To verify the
packages installed in your project:

```bash
npm audit signatures
```
