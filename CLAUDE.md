# tangled-cli (`tgl`)

Our own command-line tool for Tangled (tangled.org), in the style of `gh`. The general
working rules are in the global `~/.claude/CLAUDE.md`; this file only covers this project.
Session state lives in `.claude/state.md` (local only, gitignored).

## Purpose
- Main use: close each finished NewsPal branch with a PR on Tangled as well as on GitHub
  (NewsPal: `C:\Users\ovied\intruth-factcheck`, Tangled repo `oviiione.eu/newspal`).
- Merging happens locally and reaches GitHub and Tangled in one push. `tgl` only creates,
  lists and closes (or marks as merged) PRs. It never merges.
- Next candidates, in order: `tgl release` (attach the signed .xpi to a tag, i.e. the
  `sh.tangled.repo.artifact` record), then `tgl issue`.

## Design
- Node.js ≥ 20 with NO dependencies (built-in fetch, zlib, child_process, node:test).
- One file per topic in `src/commands/`, registered in `src/cli.js`. A new topic must
  not require touching the existing ones.
- User-facing messages in Spanish. Code, comments and commits in English.
- `src/tangled.js` holds every Tangled record format. They are undocumented and may
  change: before touching them, re-read the lexicons and `appview/pulls/create.go` in
  https://tangled.org/tangled.org/core.
- Auth = app password, DPAPI-encrypted in `%APPDATA%\tgl\login.json`. The user types it
  in their own terminal (`tgl auth login`). Never read it, print it or ask for it.
- Never use or depend on the third-party CLIs `tg` / `tang`. Reading them as a reference
  for the API is fine.

## Testing
- `npm test`: unit tests of the pure parts.
- `tgl pr create --dry-run`: shows the record without writing anything.
- Real writes go only to a throwaway test repo, never NewsPal, until the user approves.
