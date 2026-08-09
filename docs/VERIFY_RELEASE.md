# Verify a Dumper Apps release

Official Windows builds are published on [GitHub Releases](https://github.com/Sinedrone-Sentinel/dumpers_repo/releases) as `DumperApps.exe`.

Each release also includes:

- **`SHA256SUMS`** — hex digests of release assets (including `DumperApps.exe`)
- **`SHA256SUMS.sig`** — Sigstore/cosign **bundle** signature over `SHA256SUMS` (keyless OIDC from GitHub Actions)

Each published Windows build is **VirusTotal-gated in CI** before the GitHub Release leaves draft (see [TRUST_AND_SIGNING.md](TRUST_AND_SIGNING.md)). Releases include `VIRUSTOTAL.txt` with the report URL.

Optional later: Authenticode signature via SignPath (see [TRUST_AND_SIGNING.md](TRUST_AND_SIGNING.md)).

## 1. Check the file hash

```bash
# Linux / macOS / Git Bash
sha256sum -c SHA256SUMS --ignore-missing
```

On Windows (PowerShell), compute the hash and compare to the `DumperApps.exe` line in `SHA256SUMS`:

```powershell
Get-FileHash .\DumperApps.exe -Algorithm SHA256
```

## 2. Verify the signed manifest (cosign)

Install [cosign](https://docs.sigstore.dev/cosign/system_config/installation/), download `SHA256SUMS` and `SHA256SUMS.sig` from the same release, then:

```bash
cosign verify-blob \
  --bundle SHA256SUMS.sig \
  --certificate-identity-regexp "https://github.com/Sinedrone-Sentinel/dumpers_repo/.github/workflows/build-releases.yml@refs/tags/v.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  SHA256SUMS
```

A successful verify confirms the checksum manifest was produced by this repository's release workflow (expected release process / identity).
## 3. VirusTotal report

Download `VIRUSTOTAL.txt` from the same release (or open the VirusTotal section in the release notes). The first line is the GUI report for that exact `DumperApps.exe` SHA-256:

```text
https://www.virustotal.com/gui/file/<sha256>
```

You can also hash the exe locally and open `https://www.virustotal.com/gui/file/<your-sha256>`.
