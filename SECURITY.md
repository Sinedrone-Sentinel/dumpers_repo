# Security Policy

## Supported software

This repository powers **Dumper's Repo** ([dumpers-repo.com](https://dumpers-repo.com)) and the **BP Dumper** desktop watcher. Canonical Windows `DumperApps.exe` is the Go client in `scripts/bp-dumper-go/` (Python in `scripts/bp-dumper-py/` is the reference / non-Windows zip).

## What BP Dumper does (and does not)

BP Dumper:

- Searches for / accepts a path to your local Star Citizen install (`LIVE` / `Game.log` and log backups)
- Sends blueprint unlock and mission/session events to the official Dumper's Repo webhook using **your** personal API key (`dr_…`)
- Does **not** ask for RSI passwords, email passwords, or CIG account credentials
- Does **not** pull your craft bench or inventory from CIG servers

## Reporting a vulnerability

Please report security issues privately — do not open a public GitHub issue for exploitable vulnerabilities.

1. Use **GitHub private vulnerability reporting** on this repository (Security → Report a vulnerability), **or**
2. Open a Support ticket on dumpers-repo.com (preferred for authenticated members) and mark it as a security / bug report without posting exploit detail publicly.

Include:

- Affected component (site, BP Dumper, Edge Function name if known)
- Steps to reproduce
- Impact assessment
- Whether you have a suggested fix

We aim to acknowledge reports within **7 days** and to ship a fix or mitigation as quickly as practical for confirmed issues.

## Preferred disclosure

Coordinated disclosure: give us a reasonable window to patch before public write-ups. Credit is offered if you want it (unless you request anonymity).

## Response process

1. Acknowledge the report (target: within **7 days**).
2. Triage severity and affected component (site, Dumper Apps, Edge Function).
3. Develop and ship a fix or mitigation as quickly as practical for confirmed issues.
4. Credit the reporter in the advisory or release notes unless anonymity was requested.

## Public vulnerability data

When a vulnerability in **this project's results** is confirmed and addressed, we publish it via **GitHub Security Advisories** for this repository (and release notes when users should upgrade). There are no advisories published to date; that archive will grow as issues are disclosed.

See also [docs/SECURITY_ASSURANCE.md](docs/SECURITY_ASSURANCE.md) and [docs/VERIFY_RELEASE.md](docs/VERIFY_RELEASE.md).
