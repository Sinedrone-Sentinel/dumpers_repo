import { SITE_COPYRIGHT, SITE_SUPPORT_LABEL, SITE_SUPPORT_URL, SITE_URL } from '../config/site'
import SiteBrandMark from '../components/SiteBrandMark'
import SiteBrandTitle from '../components/SiteBrandTitle'

const LAST_UPDATED = 'September 20, 2026'

export default function PrivacyRoute() {
  return (
    <div className="site-page-bg min-h-screen text-slate-200">
      <div className="site-shell mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center gap-3">
          <SiteBrandMark size="md" />
          <div>
            <SiteBrandTitle size="compact" titleAs="p" subtle align="left" layout="inline" />
            <p className="text-sm text-slate-400">Privacy Policy</p>
          </div>
        </header>

        <article className="site-surface space-y-6 p-5 sm:p-7 text-sm leading-relaxed text-slate-300">
          <div>
            <h1 className="text-2xl font-semibold text-white">Privacy Policy</h1>
            <p className="mt-1 text-xs text-slate-500">Last updated: {LAST_UPDATED}</p>
            <p className="mt-4">
              This Privacy Policy describes how <strong className="text-slate-100">Dumper&apos;s Repo</strong>{' '}
              ({SITE_URL}) collects, uses, and shares information when you use our website and related
              tools, including the optional <strong className="text-slate-100">Dumper Apps</strong>{' '}
              desktop app distributed via GitHub Releases (and related Python scripts for non-Windows).
            </p>
            <p className="mt-3">
              Dumper&apos;s Repo is a community site for Star Citizen crafting, tracking, and marketplace
              tools. It is not affiliated with Cloud Imperium Games.
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">1. Who this applies to</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Visitors browsing public pages or using Offline / guest preview tools</li>
              <li>Members who create an account and use signed-in features</li>
              <li>People who run BP Dumper to sync blueprint unlocks with our services</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">2. Information we collect</h2>

            <h3 className="pt-1 font-medium text-slate-100">Account &amp; profile</h3>
            <p>
              If you sign in with <strong className="text-slate-100">Google</strong> or{' '}
              <strong className="text-slate-100">Discord</strong> (via our authentication provider), we
              receive information those providers share for sign-in—typically email address, display name,
              and avatar URL. We store a profile for your account, which may include:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Email, display name, and avatar</li>
              <li>Optional RSI handle and whether it has been verified</li>
              <li>Account role / approval status (for community access control)</li>
              <li>Preference settings (for example craft inventory toggles, marketplace UI prefs)</li>
              <li>Connected account links you choose to manage in Settings</li>
            </ul>

            <h3 className="pt-2 font-medium text-slate-100">RSI handle verification (Citizen iD)</h3>
            <p>
              Members verify an RSI Handle with <strong className="text-slate-100">Link Citizen iD</strong>{' '}
              in Settings or welcome onboarding. That sends you to{' '}
              <strong className="text-slate-100">Citizen iD</strong> (citizenid.space) to prove you control
              the Spectrum / RSI account. After you approve the link, we receive Spectrum profile data
              such as your RSI handle, citizen and Spectrum IDs, display name, portrait, enlisted date,
              and organization affiliations. We store that snapshot plus OAuth tokens so the link can be
              maintained or revoked. Your Spectrum portrait becomes your site avatar.
            </p>
            <p>
              Removing the Citizen iD link in Settings un-verifies the handle and deletes the stored
              Spectrum / token data (blocked while you have an accepted deal). Deleting your account also
              revokes the Citizen iD link and removes that data. Officers may force or revoke verification
              for moderation. We do not store your RSI password, and we do not scrape your RSI Bio to
              verify you.
            </p>

            <h3 className="pt-2 font-medium text-slate-100">Usage of site tools (analytics)</h3>
            <p>
              We collect anonymous usage metrics to understand which tools people use and for how long
              (active time while the browser tab is visible). This includes:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A random visitor ID stored in your browser (local storage)</li>
              <li>Which tool / section you are using and active seconds</li>
              <li>Whether you are in guest / Offline Mode</li>
              <li>
                Approximate location derived once per visitor (country / region / city / timezone) via a
                one-time lookup through <strong className="text-slate-100">ipwho.is</strong> on our
                server—we do not retain your raw IP address in analytics storage
              </li>
            </ul>
            <p>
              When you are signed in, analytics events may be associated with your account for reporting.
              Site operators with elevated admin access are excluded from this tracking. Analytics records
              are retained on a rolling window of about 30 days.
            </p>

            <h3 className="pt-2 font-medium text-slate-100">AI chats (Smart Cracker Advisor and Help)</h3>
            <p>
              Signed-in members may use the Smart Cracker <strong className="text-slate-100">Advisor</strong>{' '}
              and the site <strong className="text-slate-100">Help</strong> chat. Both run on{' '}
              <strong className="text-slate-100">your</strong> Google Gemini API key—not a site-owned key.
              You can paste a key each visit, or save a copy that is encrypted in your browser with a lock
              phrase. We store only that ciphertext on your profile; the lock phrase is never stored, and
              we cannot read the key. One saved copy is shared by both chats. You can clear it in Settings.
            </p>
            <p>
              When you ask a question, your key and the question are sent to our servers, which forward
              the question to <strong className="text-slate-100">Google Gemini</strong>. Advisor may also
              send rock and loadout context you choose to include (for example mass, resistance,
              instability, ship, heads, modules, gadgets, and ore). Help includes which page you are on
              and a baked copy of the Information Archive so answers stay about this site. We do not keep
              the question text. Each chat is limited to 20 asks per hour. Super-admin usage reports keep
              about 30 days of counts and a one-way fingerprint of the key (not the key itself).
            </p>

            <h3 className="pt-2 font-medium text-slate-100">Content you create on the site</h3>
            <p>Depending on features you use, we may store:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Blueprint acquisitions, resource inventories, mission tracker data, mining ledger data</li>
              <li>Saved mining loadouts (synced across devices when you are signed in)</li>
              <li>
                Custom orders, marketplace listings, fulfillments, ratings, related event history, and
                private deal chat on accepted trades (removed when the deal ends)
              </li>
              <li>Support tickets and messages you submit</li>
              <li>Questionnaire / poll responses</li>
              <li>Partnership applications and related notes</li>
              <li>Contributor Team applications (including the GitHub username you provide)</li>
              <li>Notifications delivered in-app (dismissing a notification deletes it)</li>
              <li>
                Friend relationships, private friend groups, friend invite link tokens, and invite codes
                saved until the visitor verifies an RSI Handle. Until a request is accepted, other members
                see your RSI Handle only—not your display name
              </li>
              <li>Optional Discord webhook URLs you configure for personal or org alerts</li>
              <li>BP Dumper-related API credentials you generate for sync</li>
              <li>
                Optional file uploads for specific flows (for example org logos for admins, or temporary
                Request Services intel screenshots that are posted to the partner Discord destination and
                then removed from our storage after delivery)
              </li>
            </ul>

            <h3 className="pt-2 font-medium text-slate-100">Browser storage</h3>
            <p>
              We use browser local storage and session storage for sign-in session data, Offline / guest
              tool data, UI preferences, analytics visitor ID, friend-invite tokens during sign-in, and
              similar client-side state. We do not use a third-party advertising cookie stack on the site.
              The page also loads fonts from Google Fonts so the site can render consistently.
            </p>

            <h3 className="pt-2 font-medium text-slate-100">BP Dumper desktop app</h3>
            <p>
              If you install and run BP Dumper, the app reads Star Citizen log files on your computer
              (such as Game.log / log backups) to detect blueprint unlocks, and may send unlock-related
              events to our services / organization webhook so features like Live Mission Tracker can stay
              in sync. The Microsoft Store app asks you to choose your Star Citizen LIVE folder. The
              unsigned Windows exe and Python scripts may auto-detect that folder (or you can paste a
              path). Store updates come from the Microsoft Store. The exe does not auto-download or
              replace itself — download a new build from GitHub Releases.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">3. How we use information</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Provide and operate Dumper&apos;s Repo accounts, tools, and marketplace features</li>
              <li>Verify RSI handles through Citizen iD and enforce community rules / access controls</li>
              <li>Run Advisor and Help when you supply a Gemini key</li>
              <li>Send Discord notifications you or officers configure</li>
              <li>Respond to support tickets and moderate abuse</li>
              <li>Improve the site using aggregated usage analytics</li>
              <li>Sync blueprint unlocks when you use BP Dumper</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">4. How information is shared</h2>
            <p>We share information only as needed to run the service:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-slate-100">Other members:</strong> marketplace and fulfillment
                flows may show your display name and RSI handle so counterparties can coordinate trades.
                Accepted friends can browse each other&apos;s acquired blueprints and personal resources
              </li>
              <li>
                <strong className="text-slate-100">Officers / admins:</strong> elevated staff tools may
                show account identifiers (including email) for approval, support, and moderation
              </li>
              <li>
                <strong className="text-slate-100">Service providers:</strong> we host data with{' '}
                <strong className="text-slate-100">Supabase</strong> (authentication, database, storage,
                edge functions). Sign-in is handled through <strong className="text-slate-100">Google</strong>{' '}
                and/or <strong className="text-slate-100">Discord</strong> as you choose
              </li>
              <li>
                <strong className="text-slate-100">Citizen iD:</strong> RSI Handle verification uses
                Citizen iD OAuth; Citizen iD receives the information you approve in that sign-in
              </li>
              <li>
                <strong className="text-slate-100">Google Gemini:</strong> if you use Advisor or Help, your
                question (and related context described above) is sent to Google using the Gemini key you
                provided
              </li>
              <li>
                <strong className="text-slate-100">Google Fonts:</strong> your browser may request fonts
                from Google&apos;s font CDN when you load the site
              </li>
              <li>
                <strong className="text-slate-100">Discord:</strong> if webhooks or bot notifications are
                configured, event content (including Request Services details and intel screenshots) is
                delivered to the Discord destinations involved
              </li>
              <li>
                <strong className="text-slate-100">Geolocation lookup:</strong> a one-time IP-based lookup
                may be performed through <strong className="text-slate-100">ipwho.is</strong> to populate
                approximate location fields for analytics; raw IP is not kept in our analytics tables
              </li>
              <li>
                <strong className="text-slate-100">RSI website:</strong> public citizen pages may be fetched
                when a member checks whether an RSI handle exists on a Mining Ledger. That is not how
                account verification works
              </li>
              <li>
                <strong className="text-slate-100">Legal / safety:</strong> we may disclose information if
                required by law or to protect the service and its users from abuse or fraud
              </li>
            </ul>
            <p>
              We do not sell your personal information. Tips via third-party pages (for example{' '}
              {SITE_SUPPORT_URL.trim() ? (
                <a
                  href={SITE_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                >
                  {SITE_SUPPORT_LABEL}
                </a>
              ) : (
                'our tip page'
              )}
              ) are processed by those services under their own policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">5. Third-party links &amp; data we do not control</h2>
            <p>
              The site may link to external services (for example Discord, RSI, Citizen iD, partner
              portals, tip pages, or UEX-derived reference data baked into the app). Those services have
              their own privacy practices. Commodity pricing / shop reference data used for tools is
              generally packaged with the site rather than collected from your browser as a live
              personal-data feed.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">6. Retention</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Account and profile data: kept while your account remains on the service</li>
              <li>Marketplace / tracker / order history: kept as needed to operate those features</li>
              <li>Deal chat: removed when the related trade ends or times out</li>
              <li>Encrypted Gemini key copy: kept until you clear it or delete your account</li>
              <li>
                Site analytics, BP Dumper invoke analytics, and AI-chat usage rollups: about 30 days
                (rolling cleanup)
              </li>
              <li>Support tickets: removed after resolution as part of normal support handling</li>
              <li>Certain temporary uploads: deleted after the related delivery workflow completes</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">7. Security</h2>
            <p>
              We use industry-standard hosting controls, authenticated access, and database permissions /
              row-level security patterns to limit who can read or change data. No method of transmission
              or storage is perfectly secure; please use a strong unique password with your Google or
              Discord account and avoid sharing API keys, lock phrases, or webhook URLs.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">8. Children</h2>
            <p>
              Dumper&apos;s Repo is intended for adults and teens who already play Star Citizen and can
              create the accounts required by our sign-in providers. We do not knowingly collect personal
              information from children under 13. If you believe a child has provided us information,
              contact us through in-app Support (signed-in) so we can delete it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">9. Your choices</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Browse limited public / Offline tools without creating an account</li>
              <li>Update profile preferences and connected accounts in Settings</li>
              <li>
                Skip or complete RSI verification with Link Citizen iD (required only for certain
                marketplace, Friends, Discord webhook, and ledger features)
              </li>
              <li>Clear a saved Advisor / Help Gemini key in Settings without deleting your account</li>
              <li>Clear browser storage to remove local visitor IDs and Offline cached data</li>
              <li>Uninstall BP Dumper and revoke any API keys you created</li>
              <li>
                Delete your account from Settings (type DELETE to confirm). Super-admins cannot use
                self-delete. For privacy questions or corrections, use in-app Support after signing in
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">10. Contact</h2>
            <p>
              For privacy questions or data requests, sign in to Dumper&apos;s Repo and open{' '}
              <strong className="text-slate-100">Support</strong> from your avatar menu. You can also
              reach the site at{' '}
              <a
                href={SITE_URL}
                className="text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
              >
                {SITE_URL}
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">11. Changes</h2>
            <p>
              We may update this Privacy Policy as the service changes. The &quot;Last updated&quot; date
              at the top will change when we do. Continued use of the site after an update means you
              accept the revised policy.
            </p>
          </section>
        </article>

        <footer className="mt-8 space-y-1 text-center text-xs text-slate-500">
          <p>{SITE_COPYRIGHT}</p>
          <p>
            <a
              href="/"
              className="text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              Back to Dumper&apos;s Repo
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
