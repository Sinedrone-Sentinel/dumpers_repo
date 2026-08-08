# Dependencies

How this project **selects**, **obtains**, and **tracks** external dependencies.

## Scope

| Ecosystem | Manifest / lockfile | Used for |
|-----------|---------------------|----------|
| npm | [`package.json`](../package.json) + [`package-lock.json`](../package-lock.json) | Site (Vite/React), tooling, CI |
| Python (pip) | [`scripts/bp-dumper-py/requirements.txt`](../scripts/bp-dumper-py/requirements.txt) | BP Dumper / Dumper Apps watcher |
| GitHub Actions | Pinned `uses: org/action@sha` in `.github/workflows/` | CI, release, Scorecard, CodeQL |

Generated game data under `src/data/` is produced by our parse scripts from extracted game files — not third-party package registries.

## Selection

- Prefer well-maintained packages with clear licenses compatible with Apache-2.0 distribution of this repository.
- Avoid adding dependencies for one-liners already covered by the stack.
- **DFP** (`public/dfp-engine.js`) is proprietary and is **not** treated as a FLOSS dependency of Dumper Apps; it is not bundled into `DumperApps.exe`.

## Obtaining

- Contributors and CI install with **`npm ci`** (lockfile-exact) and the pinned Python requirements for the dumper.
- Do not commit `node_modules/` or ad-hoc vendored copies of npm/pip packages.

## Tracking and updates

- **Dependabot** ([`.github/dependabot.yml`](../.github/dependabot.yml)) opens weekly PRs for npm, GitHub Actions, and pip (`scripts/bp-dumper-py`).
- Maintainers review Dependabot PRs, run CI, and merge security-relevant updates promptly.
- `npm audit` / GitHub Dependabot alerts are monitored for known vulnerabilities in direct and transitive deps.

## Updating a dependency

1. Prefer Dependabot PR, or bump the manifest and refresh the lockfile locally (`npm install` / requirements pin).
2. Open a PR; ensure `lint-and-build` (and CodeQL when applicable) stay green.
3. For BP Dumper runtime deps, keep changes in `dumper`-scoped commits when a release is intended.
