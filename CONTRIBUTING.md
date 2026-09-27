# Contributing to tgl

[Español](CONTRIBUTING.es.md)

Thanks for helping. Bug reports, ideas and pull requests are welcome on either forge:

- Tangled: https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift
- GitHub (mirror): https://github.com/OviiiOne/tangled-cli

## Reporting a bug

Open an issue with the command you ran, what you expected, what happened, and the output
of `tgl --version`, your OS and `node --version`. Never paste your app password or
anything from `tgl auth` storage.

## Setting up

```bash
git clone https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift tangled-cli
cd tangled-cli
npm link     # the tgl command now runs your copy
npm test
```

You need Node.js 20+ and git. There is nothing to install: `tgl` has no dependencies.

## How the code is laid out

- `src/cli.js` parses the command line; each topic (`auth`, `repo`, `pr`, `issue`, `label`,
  `release`) is one file in `src/commands/`. A new topic is a new file plus one line in
  `src/cli.js`, without touching the others.
- `src/tangled.js` holds Tangled's record formats. They are not officially documented:
  before changing one, read the lexicons and `appview/` in
  [tangled.org/core](https://tangled.org/tangled.org/core), and check what
  `appview/ingester.go` does with it (some fields are ignored).
- Other people's records are found through public indexes (`src/backlinks.js`,
  `src/atproto.js`); your own are always read from your own server.

## Rules for changes

- **No dependencies.** Only what Node.js ships with (fetch, zlib, child_process, node:test).
- **Every message is bilingual:** `t('English', 'Español')` from `src/i18n.js`. If you
  don't write Spanish, put the English text in both and say so in the PR.
- Code, comments and commit messages in English. Commits follow
  [Conventional Commits](https://www.conventionalcommits.org): `feat(pr): add …`,
  `fix(issue): …`, `docs: …`.
- Add a test in `test/` for pure logic (record shapes, parsing). Commands that talk to the
  network are tried by hand.
- Update `docs/reference.md` and `docs/reference.es.md` when a command changes.

## Trying changes safely

- Use `--dry-run` (`pr create`, `pr update`, `pr merge`, `release upload`) first.
- Real writes only in a repo of your own, e.g. one made with `tgl repo create`. Never
  test against other people's repos.
- For big read-only checks, use a scratch clone of `tangled.org/core` and compare the
  counts with the website.
- The first real write of a new kind of record must be checked on the Tangled website,
  not only read back with `tgl`: `tgl` can read records the website ignores.

## Pull requests

Open it on either forge. Describe what changes for the user and how you tried it. In the
description, only use "Fixes #N" for the issue it really fixes: both forges (and `tgl`)
act on those words.
