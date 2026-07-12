# Dumper's Repo brand guidelines

**Owner:** Michael Linzenmeyer (RSI: Sinedrone_Sentinel)

## Protected identity

- **Dumper's Repo** (product name)
- **Buy. Craft. Sell.** (slogan)
- Application header branding and logo treatment shipped with this repository (the **Dumper's Repo** product mark)

Registration with a trademark office is not required for these guidelines to
apply. The name is used in commerce by the reference deployment at
[dumpers-repo.com](https://www.dumpers-repo.com).

## Franchise deployments

Licensed franchises **must**:

- Keep "Dumper's Repo" visible in the primary app header
- Ship this file and the LICENSE unchanged
- Not imply they are the official dumpers-repo.com instance unless authorized

Franchises **may** customize footer copyright, domain, Supabase backend,
member-approval workflows, and **org logo** (the PNG shown on blueprint detail
card flip animations). Upload your org logo in **Settings → Site** (super-admin)
after running migration `089_org_logo.sql`. Do not commit your org logo PNG to
the franchise repo — it is stored in your Supabase project, not in git.

## Dumper's Fair-Value Price (DFP)

DFP is proprietary to Michael Linzenmeyer. Franchises must use the official
canonical DFP engine URL in production. Do not publish, document, or
reimplement the formula.

Super-admins may hide DFP prices in the UI only with the mandatory footer
notice defined in LICENSE.

## Questions

Contact the licensor through the official Dumper's Repo deployment.
