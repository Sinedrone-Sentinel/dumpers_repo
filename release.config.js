/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
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
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'scripts/bp-dumper/version.json',
          'scripts/bp-dumper/package.json',
          'scripts/bp-dumper/CHANGELOG.md',
          'scripts/bp-dumper-go/main.go',
          'scripts/bp-dumper-py/_version.py',
          'scripts/bp-dumper-py/_min_game_version.py',
          'src/data/bp-dumper-version.json',
        ],
        message: 'chore(release): bp-dumper ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  ],
}
