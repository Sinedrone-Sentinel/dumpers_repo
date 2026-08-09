# Trust & code signing (BP Dumper)

> The in-app **Contributor Team** program grants public-repo collaborator seats only -- it does **not** grant SignPath access, code-signing rights, or GitHub Actions secrets.

## Product path

**Canonical Windows download:** native Go client in `scripts/bp-dumper-go/`, packaged as `DumperApps.exe` via `scripts/installer/build-exe.ps1` (no PyInstaller, no UPX).

- Auto-detects Star Citizen installs (drive search for LIVE / Game.log); members can paste a path to override. Updates are manual GitHub downloads (no self-replace).
- Member Windows download: GitHub Releases `DumperApps.exe`.
- Python watcher in `scripts/bp-dumper-py/` remains the protocol/reference client (and for non-Windows scripting).
- Microsoft Store listing may remain published temporarily; it is **not** the primary trust or install path.

### Why not PyInstaller on Windows

PyInstaller `--onefile` extracts a shared bootloader fingerprint that multiple AV engines (including Microsoft `Trojan:Win32/Wacatac.B!ml`) frequently mark malicious even when the app is clean. That hurts member trust when screenshots of VirusTotal “Trojan” labels circulate. The Go Windows build is a normal native PE; the publish gate still requires **0 VirusTotal malicious** detections before a release leaves draft.

## OpenSSF Scorecard

Workflow: `.github/workflows/scorecard.yml`  
Badge / viewer: `https://scorecard.dev/viewer/?uri=github.com/Sinedrone-Sentinel/dumpers_repo`

Dependabot: [`.github/dependabot.yml`](../.github/dependabot.yml) (npm, Actions, pip under `scripts/bp-dumper-py`, Go under `scripts/bp-dumper-go` when configured).

BP Dumper Python pin (scripts path): `requests>=2.33.0`. Windows release binary is Go. Site + lockfile should stay at `npm audit` = 0 (unused `@semantic-release/npm` is stubbed under `scripts/stubs/`).

### Release BP Dumper needs a PAT (RELEASE_TOKEN)

Protect main requires PRs and status checks. The default Actions GITHUB_TOKEN (github-actions[bot]) **cannot** push version-bump commits from semantic-release.

The ruleset allows **Repository admin** to bypass. Store a fine-grained PAT for @Sinedrone-Sentinel as repo secret **RELEASE_TOKEN**:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate
2. Resource owner: your user; Repository access: only dumpers_repo
3. Permissions: **Contents → Read and write**, **Metadata → Read**, **Pull requests → Read and write**
   - Do **not** rely on the PAT for gh workflow run — the release job uses the Actions GITHUB_TOKEN for that step.
4. Repo → Settings → Secrets → Actions → New secret RELEASE_TOKEN

Workflow: .github/workflows/release-dumper.yml

### Branch-Protection check needs a PAT

The default `GITHUB_TOKEN` cannot read branch protection (`Resource not accessible by integration`). Create a **fine-grained PAT** and store it as repo secret `SCORECARD_TOKEN`:

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate
2. Resource owner: your user/org; Repository access: only `dumpers_repo`
3. Permissions: **Administration → Read**, **Metadata → Read**, **Contents → Read**
4. Repo → Settings → Secrets and variables → Actions → New repository secret named `SCORECARD_TOKEN`
5. Re-run the **OpenSSF Scorecard** workflow

Without that secret, Branch-Protection stays errored even when `main` is protected.

### CII / OpenSSF Best Practices badge (separate from Scorecard)

[OpenSSF Best Practices Passing](https://www.bestpractices.dev/projects/13989) and [Baseline-2](https://www.bestpractices.dev/projects/13989) are earned (README badges: `/projects/13989/badge` and `/projects/13989/baseline`). Scorecard’s **CII-Best-Practices** check should reflect Passing after the next Scorecard scan. Root [LICENSE](../LICENSE) is **Apache-2.0** (OSI). DFP remains proprietary under [LICENSE.DFP](../LICENSE.DFP).

## VirusTotal release gate (required before download)

GitHub does not offer a native “required check before `/releases/latest/download` updates.” We enforce the same outcome in CI:

1. **semantic-release** creates a **draft** GitHub Release (`draftRelease: true` in `release.config.js`).
2. Drafts are **ignored** by `/releases/latest` — members keep downloading the previous published `DumperApps.exe`.
3. `.github/workflows/build-releases.yml` builds the exe, optional SignPath, checksums/cosign, then runs **`scripts/ci/virustotal-release-gate.mjs`**.
4. Only if VirusTotal completes with **0 malicious** detections does the workflow upload assets and set **`draft: false`** (publish).

If `VT_API_KEY` is missing or the gate fails, the release stays draft / unpublished — **no new live download**.

### Setup (one-time)

1. Create a free VirusTotal account → profile → **API key**
2. Repo → Settings → Secrets and variables → Actions → New secret **`VT_API_KEY`**
3. Re-run **Build Executables on Release** for any stuck draft tag if needed

Optional: `VT_MAX_MALICIOUS` (workflow env, default `0`) if you ever need to temporarily tolerate a documented false positive — prefer fixing/reporting the FP instead.

Published releases include `VIRUSTOTAL.txt` / `VIRUSTOTAL.json` and a VirusTotal section in the release notes.

## SignPath Free OSS

SignPath Foundation free OSS signing requires an **OSI-approved** license and no proprietary code in the signed artifact.

- Repository / Dumper Apps sources: **Apache-2.0** ([LICENSE](../LICENSE), `scripts/bp-dumper-py/LICENSE`; Go Windows client under the same repo license)
- DFP engine files: **not** in `DumperApps.exe`; licensed separately under [LICENSE.DFP](../LICENSE.DFP)
- Trademarks: reserved ([TRADEMARK.md](../TRADEMARK.md) / [NOTICE](../NOTICE))
- **Code signing policy** (required credit + roles + privacy): [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)
- Download UI shows: *Free code signing provided by SignPath.io, certificate by SignPath Foundation*

Application submitted. Credit + policy are already on the site.

### SignPath — YOUR next steps after approval

> **When SignPath emails approval (or you get org/API access):** tell Cursor *“SignPath is approved”* — the agent is instructed to run this list — **or** work the boxes yourself.

- [ ] **GitHub Actions secret:** `SIGNPATH_API_TOKEN`
- [ ] **GitHub Actions variables:** `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`
- [ ] **SignPath UI:** link this GitHub repo as a trusted build system
- [ ] **SignPath UI:** artifact configuration slug **`dumper-apps-exe`** matches `.signpath/artifact-configurations/dumper-apps-exe.xml`
- [ ] **SignPath UI:** signing policy exists (you are the approver); copy slugs/ids into GitHub vars above
- [ ] **Release:** cut a dumper `v*` release; confirm Actions signs and publishes `DumperApps.exe` (not the “unsigned” warning)
- [ ] **Site flag:** set `SIGNPATH_SIGNING_LIVE = true` in `src/config/trustBadges.ts` (PR + green CI) — **only after** a signed release exists

## Release integrity (checksums + cosign)

Every `v*` / release publish from `.github/workflows/build-releases.yml` (after VirusTotal gate) also uploads:

- `VIRUSTOTAL.txt` / `VIRUSTOTAL.json` — scan permalink + stats from the publish gate
- `SHA256SUMS` — hashes of release assets
- `SHA256SUMS.sig` — Sigstore **cosign** keyless signature (GitHub Actions OIDC)

How to verify: [VERIFY_RELEASE.md](VERIFY_RELEASE.md). This satisfies OpenSSF Baseline **OSPS-BR-06.01** (signed manifest of asset hashes) even when SignPath Authenticode is not yet configured.

## SignPath CI details

`.github/workflows/build-releases.yml` submits `DumperApps.exe` when the secret + three variables above are set. Without them, the workflow still publishes an **Authenticode-unsigned** exe (checksums + cosign still apply) and logs a warning.

## Gold standard realism

OpenSSF Best Practices **Gold** additionally requires (among other things) two unassociated significant contributors, ≥50% two-person review, high test coverage, and a security review. Solo-maintained projects often top out at **Passing** or **Silver**. Target remains Gold; expect Passing first.
