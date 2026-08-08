# Code signing policy

**Free code signing provided by SignPath.io, certificate by SignPath Foundation.**

This policy covers **Dumper Apps** (DumperApps.exe) built from this repository and published via [GitHub Releases](https://github.com/Sinedrone-Sentinel/dumpers_repo/releases).

## What is signed

- Artifact: DumperApps.exe (Python watcher packaged for Windows)
- Source: [Sinedrone-Sentinel/dumpers_repo](https://github.com/Sinedrone-Sentinel/dumpers_repo)
- Build: GitHub Actions workflow Build Executables on Release (.github/workflows/build-releases.yml)
- SignPath artifact configuration: .signpath/artifact-configurations/dumper-apps-exe.xml

The proprietary DFP engine (LICENSE.DFP) is **not** bundled in DumperApps.exe.

## Team roles

Solo-maintained project. Until additional maintainers are added:

| Role | Who |
|------|-----|
| Authors (committers) | [Sinedrone-Sentinel](https://github.com/Sinedrone-Sentinel) (repository owner) |
| Reviewers | [Sinedrone-Sentinel](https://github.com/Sinedrone-Sentinel) |
| Approvers (SignPath signing approval) | [Sinedrone-Sentinel](https://github.com/Sinedrone-Sentinel) |

Pull requests to main require the lint-and-build check. Direct pushes to main are blocked by repository rules.

## Privacy

Dumper Apps reads local Star Citizen log files and sends blueprint / mission events to Dumper's Repo using **your** personal API key only when you configure it.

- Site privacy policy: [https://dumpers-repo.com/privacy](https://dumpers-repo.com/privacy)
- For the desktop app itself: this program will not transfer any information to other networked systems unless specifically requested by the user (API key + chosen webhook events).

## Related docs

- [Trust & signing](TRUST_AND_SIGNING.md) — Scorecard, SignPath CI secrets, release flow
- [SECURITY.md](../SECURITY.md) — vulnerability reporting
