# tangled-cli (`tgl`)

A public, MIT-licensed command-line tool for Tangled (tangled.org), in the style of `gh`.
Session state lives in `.claude/state.md` (local only, gitignored).

## Scope
- Typical workflow: a repo mirrored on GitHub and Tangled, where each finished branch gets
  a PR on both. Merging happens locally and reaches both forges in one push, so `tgl`
  creates, lists and closes (or marks as merged) PRs. It doesn't merge.
- Topics: `auth`, `repo`, `pr`, `issue`, `release` (files attached to an annotated tag).
- Built for the public, not only this project's owner: any repo, default branch, OS or language.

## Design
- Node.js ≥ 20 with NO dependencies (built-in fetch, zlib, child_process, node:test).
- One file per topic in `src/commands/`, registered in `src/cli.js`. A new topic must
  not require touching the existing ones.
- Every user-facing message goes through `t(english, spanish)` (`src/i18n.js`); the
  language follows the system (`TGL_LANG` overrides). Code, comments and commits in English.
- `src/tangled.js` holds every Tangled record format. They are undocumented and may
  change: before touching them, re-read the lexicons and `appview/` in
  https://tangled.org/tangled.org/core.
- Other accounts' records (PRs, issues, comments, states) are found through the public
  Constellation backlink index (`src/backlinks.js`) and read through the Slingshot cache
  with the author's server as fallback (`src/atproto.js`); the user's own records are
  always read directly. Old record formats point at the repo by a repo-record at-uri or
  other field names (`src/repoData.js`). Check listing changes against the web counts of a
  big repo such as `tangled.org/core`.
- Knot operations (e.g. `repo set-default-branch`) use a service-auth token from the
  user's PDS (`Session.callService`); the knot is found in the repo DID document.
- Auth = app password in the OS secret store (`src/credentials.js`: DPAPI, Keychain,
  secret-tool, 0600 file as a last resort). The user types it in their own terminal
  (`tgl auth login`). Never read it, print it or ask for it. The macOS and Linux paths
  have not been run on a real machine yet.
- Never use or depend on the third-party CLIs `tg` / `tang`. Reading them as a reference
  for the API is fine.

## Testing
- `npm test`: unit tests of the pure parts.
- `--dry-run` on `pr create` and `release upload` shows what would be written.
- Try `pr checkout` and other big-repo reads in a scratch clone of `tangled.org/core`,
  never in the project folder.
- Real writes (records on Tangled) only with the user's approval, in this project's own
  repo or a throwaway one.
