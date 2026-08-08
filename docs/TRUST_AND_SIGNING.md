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

Scorecard’s **CII-Best-Practices** check is 0 until the project has a badge at [bestpractices.dev](https://www.bestpractices.dev/). That is a questionnaire (Passing → Silver → Gold), not a GitHub setting. Proprietary root `LICENSE` blocks an honest Passing/Gold claim — see below.

## SignPath + OpenSSF Best Practices — license blocker

SignPath Foundation free OSS signing and OpenSSF Best Practices (Passing → Gold) require an **OSI-approved open-source license** and no proprietary components in the signed artifact.

This repository’s root [LICENSE](../LICENSE) is currently **proprietary**. Until BP Dumper (at minimum) is released under an OSI-approved license that SignPath accepts:

- SignPath OSS applications will be **rejected**
- OpenSSF Best Practices **Gold** (and Passing) cannot be honestly claimed

Options for the maintainer:

1. Relicense the **BP Dumper client** (`scripts/bp-dumper-py/` + packaging) under MIT/Apache-2.0 while keeping site/DFP proprietary (if legally clean), **or**
2. Relicense the whole public repo, **or**
3. Buy a commercial Authenticode cert / use a paid SignPath tier (not OSS Foundation)

## SignPath CI (ready after approval + OSI license)

`.github/workflows/build-releases.yml` will submit `DumperApps.exe` when these are set:

| Kind | Name |
|------|------|
| Secret | `SIGNPATH_API_TOKEN` |
| Variable | `SIGNPATH_ORGANIZATION_ID` |
| Variable | `SIGNPATH_PROJECT_SLUG` |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` |

Artifact config: `.signpath/artifact-configurations/dumper-apps-exe.xml`

After the first signed release, set `SIGNPATH_SIGNING_LIVE = true` in `src/config/trustBadges.ts`.

## Gold standard realism

OpenSSF Best Practices **Gold** additionally requires (among other things) two unassociated significant contributors, ≥50% two-person review, high test coverage, and a security review. Solo-maintained projects often top out at **Passing** or **Silver**. Target remains Gold; expect Passing first after relicensing.
