# tangled-cli (`tgl`)

A command-line tool for Tangled (tangled.org), in the style of `gh`.
Session state lives in `.claude/state.md` (local only, gitignored).

## Scope
- Typical workflow: a repo mirrored on GitHub and Tangled, where each finished branch gets
  a PR on both. Merging happens locally and reaches both forges in one push, so `tgl` only
  creates, lists and closes (or marks as merged) PRs. It never merges.
- Topics: `auth`, `pr`, `issue`, `release` (files attached to an annotated tag).

## Design
- Node.js ≥ 20 with NO dependencies (built-in fetch, zlib, child_process, node:test).
- One file per topic in `src/commands/`, registered in `src/cli.js`. A new topic must
  not require touching the existing ones.
- User-facing messages in Spanish. Code, comments and commits in English.
- `src/tangled.js` holds every Tangled record format. They are undocumented and may
  change: before touching them, re-read the lexicons and `appview/pulls/create.go` in
  https://tangled.org/tangled.org/core.
- Other accounts' records (PRs, issues, comments, states) are found through the public
  Constellation backlink index (`src/backlinks.js`), with the user's own records as a
  fallback. Old record formats point at the repo by a repo-record at-uri or other field
  names (`src/repoData.js`). Check listing changes against the web counts of a big repo
  such as `tangled.org/core`.
- Auth = app password, DPAPI-encrypted in `%APPDATA%\tgl\login.json`. The user types it
  in their own terminal (`tgl auth login`). Never read it, print it or ask for it.
- Never use or depend on the third-party CLIs `tg` / `tang`. Reading them as a reference
  for the API is fine.

## Testing
- `npm test`: unit tests of the pure parts.
- `tgl pr create --dry-run`: shows the record without writing anything.
- Real writes (records on Tangled) only with the user's approval, in this project's own
  repo or a throwaway one.
