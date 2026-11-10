# tangled-cli (`tgl`)

A public, MIT-licensed command-line tool for Tangled (tangled.org), in the style of `gh`.
Session state lives in `.claude/state.md` (local only, gitignored).

## Scope
- Typical workflow: a repo mirrored on GitHub and Tangled, where each finished branch gets
  a PR on both. The owner's own flow merges locally and reaches both forges in one push,
  then marks the PR as merged. `tgl pr merge` exists for everyone else.
- Topics: `auth`, `repo`, `pr`, `issue`, `label`, `release` (files attached to an annotated tag).
- Built for the public, not only this project's owner: any repo, default branch, OS or language.

## Design
- Node.js ≥ 22 with NO dependencies (built-in fetch, child_process, node:test).
- One file per topic in `src/commands/`, registered in `src/cli.js`. A new topic must
  not require touching the existing ones.
- Every user-facing message goes through `t(english, spanish)` (`src/i18n.js`); the
  language follows the system (`TGL_LANG` overrides). Code, comments and commits in English.
- `src/tangled.js` holds every Tangled record format. Before touching them, re-read
  `lexicons/org/tangled/` and `web/src/lib/api/` in https://tangled.org/tangled.org/core,
  and https://tangled.org/docs/reference/records/.
- Reads go through Tangled's public API, bobbin (`src/api.js`, `src/repoData.js`). Issues
  and PRs are `org.tangled.track.ticket` records on the repo's knot. Check listing changes
  against the web counts of a big repo such as `tangled.org/core`.
- Writes go to the repo's knot and are attested from the user's account (`src/knot.js`).
- Knot operations use a service-auth token from the user's PDS (`Session.callService`),
  addressed to the repo DID (the knot's did:web only for creating and deleting repos); the
  knot is found in the repo DID document.
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
