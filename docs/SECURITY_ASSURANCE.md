# Security assessment & assurance notes

Baseline-oriented assessment of the most likely and impactful security problems for released software (site + Dumper Apps). This is not a formal third-party audit.

## Threat model (summary)

| Threat | Impact | Mitigations |
|--------|--------|-------------|
| Stolen member session / XSS | Account abuse, data exposure | React escaping; avoid `dangerouslySetInnerHTML` for untrusted HTML; HTTPS-only site |
| Client forging marketplace / role changes | Fraud, privilege escalation | RLS; DEFINER RPCs with server-side checks; privileged profile columns not client-writable |
| Leaked service_role or webhook secrets | Full backend compromise | Secrets in Actions / Supabase only; never `VITE_*`; secret scanning / `.gitignore` |
| Malicious or compromised dependency | Supply-chain RCE in CI or clients | Lockfiles; Dependabot; pinned Actions SHAs; CodeQL |
| Fake Dumper Apps binary | Member runs malware | GitHub Releases over HTTPS; `SHA256SUMS` + cosign-signed manifest ([VERIFY_RELEASE.md](VERIFY_RELEASE.md)); SignPath Authenticode when live |
| Dumper Apps abused to steal RSI passwords | Credential theft | App design: no RSI/CIG password prompts ([SECURITY.md](../SECURITY.md)) |

## Attack surface (release)

- Public HTTPS site and OAuth/sign-in
- Supabase API surface allowed by anon JWT + RLS
- Edge Functions (service_role server-side)
- Windows `DumperApps.exe` + local filesystem/log access
- GitHub Actions release pipeline

## Secure design principles applied

- Least privilege (anon key in browser; job-level Actions permissions)
- Defense in depth (UI checks are not the security boundary; RLS/RPCs are)
- Separated credentials (env/Actions secrets, member `dr_…` keys rotatable without rebuild)
- Published TLS only for delivery and API calls

## Common weakness classes countered

- **Authz bypass:** marketplace writes via checked RPCs, not broad client table writes
- **Secret leakage:** documented policy; CI least privilege on PRs
- **Injection:** parameterized DB access via Supabase client/RPCs; no shelling of untrusted PR text in workflows

For vulnerability reporting and disclosure, see [SECURITY.md](../SECURITY.md).
