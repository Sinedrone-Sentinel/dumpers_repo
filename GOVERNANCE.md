# Governance

Dumper's Repo (`dumpers_repo`) uses a **benevolent dictator / lead-maintainer** model.

## Decision-making

- **Lead maintainer** makes final decisions on roadmap, merges to `main`, releases, and security response.
- Proposed changes are discussed via **GitHub pull requests** and **GitHub Issues**.
- Direct pushes to `main` are blocked; changes land through PRs with required CI (`lint-and-build`).

## Roles and responsibilities

| Role | Who (current) | Responsibilities |
|------|---------------|------------------|
| Lead maintainer | GitHub `@Sinedrone-Sentinel` (Michael Linzenmeyer / RSI `Sinedrone_Sentinel`) | Merge PRs, cut Dumper Apps releases, operate production Supabase/Edge/Discord, security response, OpenSSF/BadgeApp entry |
| Contributor | Anyone via PR | Propose code/docs; follow [CONTRIBUTING.md](CONTRIBUTING.md) including DCO |
| Member (site) | Approved dumpers-repo.com accounts | Use member tools; not repository admins |

Officer / site-admin roles inside the product UI are **application roles**, not GitHub repository admin roles.

## Members with access to sensitive resources

While the project is solo-maintained, the following sensitive access is held by the lead maintainer only:

- GitHub repository **admin** (rulesets, Actions secrets/variables, Releases)
- Production **Supabase** project (including service-role / dashboard)
- **GitHub Actions** secrets (deploy, Discord-related, SignPath when configured, Scorecard PAT)
- Domain / hosting for **dumpers-repo.com** (GitHub Pages + DNS as applicable)
- **SignPath** organization (when approved) for Authenticode signing

No other GitHub collaborators currently have admin or secrets access. Granting escalated access to anyone new requires an explicit review by the lead maintainer (see below).

## Escalated permissions policy

Before a collaborator is granted access to sensitive resources (repo admin, Actions secrets, Supabase service role, SignPath, production DNS/hosting):

1. The lead maintainer reviews the person's need and trustworthiness.
2. Access is granted at the **least privilege** required for the task.
3. Access is recorded by updating this document's sensitive-access table in the same change window when practical.

## Continuity

If the lead maintainer is unavailable, continuity relies on:

- GitHub account recovery and org/repo ownership recovery procedures
- Offline recovery materials for critical secrets/DNS (maintainer-held, not in this repository)
- Public FLOSS source under Apache-2.0 so the community can fork if needed

A second named public maintainer is not required for Baseline Level 2 documentation of who holds access today.
