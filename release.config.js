/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        // Highest matching release type wins (not first-match). Never use a bare
        // `{ release: false }` catch-all — it matches every commit and indexOf(false)
        // beats minor/patch, so no version ever cuts. Deny non-dumper scopes explicitly.
        releaseRules: [
          { breaking: true, scope: 'dumper', release: 'major' },
          { type: 'feat', scope: 'dumper', release: 'minor' },
          { type: 'fix', scope: 'dumper', release: 'patch' },
          { type: 'perf', scope: 'dumper', release: 'patch' },
          { type: 'refactor', scope: 'dumper', release: 'patch' },
          { type: 'style', scope: 'dumper', release: 'patch' },
          { type: 'feat', scope: '!dumper', release: false },
          { type: 'fix', scope: '!dumper', release: false },
          { type: 'perf', scope: '!dumper', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        writerOpts: {
          commitsSort: ['scope', 'subject'],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'scripts/bp-dumper/CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'node scripts/sync-dumper-version.mjs ${nextRelease.version} && node scripts/lib/syncDumperMinGameVersion.mjs',
        publishCmd:
          'gh workflow run build-releases.yml -f tag_name=v${nextRelease.version}',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'scripts/bp-dumper/version.json',
          'scripts/bp-dumper/package.json',
          'scripts/bp-dumper/CHANGELOG.md',
          'scripts/bp-dumper-py/_version.py',
          'scripts/bp-dumper-py/_min_game_version.py',
          'scripts/bp-dumper-go/version.txt',
          'scripts/bp-dumper-go/mingame.txt',
          'src/data/bp-dumper-version.json',
        ],
        message: 'chore(release): bp-dumper ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        // Keep GitHub Release draft until build-releases.yml passes VirusTotal and publishes assets.
        // /releases/latest ignores drafts, so members keep the previous published exe until the gate passes.
        draftRelease: true,
      },
    ],
  ],
}
