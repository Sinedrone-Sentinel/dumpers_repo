# Contributing to Dumper's Repo

Thanks for helping improve Dumper's Repo and Dumper Apps.

## How we take changes

1. **Fork** (if needed) and create a branch from `main`.
2. Open a **pull request** targeting `main`. Direct pushes to `main` are blocked by the repository ruleset.
3. Wait for the required GitHub Actions check **`lint-and-build`** to pass.
4. A maintainer reviews and merges (solo maintainers may merge their own PRs after CI is green).

Pull requests are the contribution process. Issues are welcome for bugs and enhancements.

## Prerequisites

- Node **22+** and npm **11+** (see [`.nvmrc`](.nvmrc))
- Copy `.env.example` → `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for local UI work
- First-time Playwright (needed for `npm run build` prerender): `npx playwright install chromium`

See [README.md](README.md#for-developers) for full setup.

## Before you open a PR

From the repo root:

```bash
npm ci
npm run lint
npm test
npm run build
```

`npm test` runs the automated suites described below. CI runs the same lint → test → build sequence on every PR to `main`.

## Acceptable contributions

- Match existing TypeScript/React patterns and the site theme tokens (`site-*` classes in `src/index.css`).
- Do not commit secrets (`.env`, service-role keys, webhook URLs). Use GitHub Actions secrets / local env only.
- Do not commit `dist/`, `node_modules/`, or `extracted-data/`.
- Prefer small, focused PRs. Keep BP Dumper (`scripts/bp-dumper-py/`, `scripts/bp-dumper/`) changes in separate commits with a `dumper` Conventional Commit scope when you intend a dumper release (`feat(dumper): …` / `fix(dumper): …`).
- Marketplace / order mutations must go through existing Supabase **SECURITY DEFINER** RPCs — never add client `.insert` / `.update` / `.delete` on those tables for convenience. See `.cursor/rules/supabase-security.mdc` if you use Cursor.
- **DFP** (`public/dfp-engine.js`, `LICENSE.DFP`) is proprietary. Do not rehost, reverse, or replace the engine in PRs.

### Tests for new functionality

As major new functionality is added, add or extend automated coverage under `npm test` (unit checks in `scripts/tests/` and/or the mining-math suite). CI must stay green.

## Automated tests

| Command | What it runs |
|---------|----------------|
| `npm test` | Unit tests (`scripts/tests/`) + mining math verification (`scripts/verify-mining-math.mjs`) |
| `npm run verify-mining-math` | Mining / loadout math suite only |

## Bugs, feedback, and security

- **Bugs / enhancements:** [GitHub Issues](https://github.com/Sinedrone-Sentinel/dumpers_repo/issues) or in-app Support on [dumpers-repo.com](https://www.dumpers-repo.com).
- **Security vulnerabilities:** follow [SECURITY.md](SECURITY.md) — do not open a public issue for exploitable findings.

## License

By contributing, you agree that your contributions are licensed under the repository’s [Apache-2.0](LICENSE) license (DFP materials remain under [LICENSE.DFP](LICENSE.DFP)). Trademarks are reserved — [TRADEMARK.md](TRADEMARK.md).
