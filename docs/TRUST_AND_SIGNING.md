# Trust & code signing (BP Dumper)

## Product path

**Canonical client:** Python watcher in `scripts/bp-dumper-py/`, packaged as `DumperApps.exe` via `scripts/installer/build-exe.ps1`.

- Auto-detects Star Citizen installs (drive search for LIVE / Game.log).
- Member Windows download: GitHub Releases `DumperApps.exe`.
- Microsoft Store listing may remain published temporarily; it is **not** the primary trust or install path.

## OpenSSF Scorecard

Workflow: `.github/workflows/scorecard.yml`  
Badge / viewer: `https://scorecard.dev/viewer/?uri=github.com/Sinedrone-Sentinel/dumpers_repo`

Dependabot: [`.github/dependabot.yml`](../.github/dependabot.yml) (npm, Actions, pip under `scripts/bp-dumper-py`).

BP Dumper Python pin: `requests>=2.33.0`. Site + lockfile should stay at `npm audit` = 0 (unused `@semantic-release/npm` is stubbed under `scripts/stubs/`).

### Branch-Protection check needs a PAT

The default `GITHUB_TOKEN` cannot read branch protection (`Resource not accessible by integration`). Create a **fine-grained PAT** and store it as repo secret `SCORECARD_TOKEN`:

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate
2. Resource owner: your user/org; Repository access: only `dumpers_repo`
3. Permissions: **Administration → Read**, **Metadata → Read**, **Contents → Read**
4. Repo → Settings → Secrets and variables → Actions → New repository secret named `SCORECARD_TOKEN`
5. Re-run the **OpenSSF Scorecard** workflow

Without that secret, Branch-Protection stays errored even when `main` is protected.

### CII / OpenSSF Best Practices badge (separate from Scorecard)

[OpenSSF Baseline-1](https://www.bestpractices.dev/projects/13989) is earned (README badge: `/projects/13989/baseline`). Scorecard’s **CII-Best-Practices** check typically still needs the classic **Metal → Passing** questionnaire on the same project entry. Root [LICENSE](../LICENSE) is **Apache-2.0** (OSI). DFP remains proprietary under [LICENSE.DFP](../LICENSE.DFP).

## SignPath Free OSS

SignPath Foundation free OSS signing requires an **OSI-approved** license and no proprietary code in the signed artifact.

- Repository / Dumper Apps sources: **Apache-2.0** ([LICENSE](../LICENSE), `scripts/bp-dumper-py/LICENSE`)
- DFP engine files: **not** in `DumperApps.exe`; licensed separately under [LICENSE.DFP](../LICENSE.DFP)
- Trademarks: reserved ([TRADEMARK.md](../TRADEMARK.md) / [NOTICE](../NOTICE))
- **Code signing policy** (required credit + roles + privacy): [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)
- Download UI shows: *Free code signing provided by SignPath.io, certificate by SignPath Foundation*

Application submitted. After SignPath approves and links the GitHub trusted build system, configure CI secrets below.

## SignPath CI (after approval)

`.github/workflows/build-releases.yml` submits `DumperApps.exe` when these are set:

| Kind | Name |
|------|------|
| Secret | `SIGNPATH_API_TOKEN` |
| Variable | `SIGNPATH_ORGANIZATION_ID` |
| Variable | `SIGNPATH_PROJECT_SLUG` |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` |

In the SignPath project UI:

1. Connect this GitHub repo as a trusted build system
2. Create / upload artifact configuration slug **`dumper-apps-exe`** from `.signpath/artifact-configurations/dumper-apps-exe.xml` (product name **Dumper Apps**, version parameter)
3. Create a signing policy (approver = you) and copy the slugs / org id into the GitHub variables above

Then cut a dumper release (`v*` tag). Confirm the Actions run signs and uploads `DumperApps.exe`.

After the first signed release is live, set `SIGNPATH_SIGNING_LIVE = true` in `src/config/trustBadges.ts`.

## Gold standard realism

OpenSSF Best Practices **Gold** additionally requires (among other things) two unassociated significant contributors, ≥50% two-person review, high test coverage, and a security review. Solo-maintained projects often top out at **Passing** or **Silver**. Target remains Gold; expect Passing first.
