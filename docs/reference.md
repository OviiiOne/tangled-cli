# tgl reference

[Español](reference.es.md) · [Back to the README](../README.md)

## Commands

| Command | What it does |
|---|---|
| `tgl auth login` | Save your account and app password |
| `tgl auth status` | Show which account you are logged in with |
| `tgl auth logout` | Delete the saved app password from this computer |
| `tgl repo view` | Show a repo's owner, branches and addresses |
| `tgl repo set-default-branch <branch>` | Change the repo's default branch |
| `tgl pr create -t "Title" -b "Text"` | Open a PR from the current branch into the default branch |
| `tgl pr list [--state …] [--limit N]` | List PRs, newest first (open ones by default) |
| `tgl pr view <id\|branch> [--patch]` | Show a PR: description, changed files, comments |
| `tgl pr checkout <id\|branch>` | Bring a PR's changes into a local branch to try them |
| `tgl pr comment <id\|branch> -b "Text"` | Comment on a PR |
| `tgl pr close <id\|branch> [--merged]` | Close a PR, or mark it as merged |
| `tgl pr reopen <id>` | Reopen a closed PR |
| `tgl issue create -t "Title" -b "Text"` | Open an issue |
| `tgl issue list [--state …] [--limit N]` | List issues, newest first (open ones by default) |
| `tgl issue view <id>` | Show an issue with its comments |
| `tgl issue comment <id> -b "Text"` | Comment on an issue |
| `tgl issue close <id> [-b "Text"]` | Close an issue, optionally with a comment |
| `tgl issue reopen <id> [-b "Text"]` | Reopen an issue, optionally with a comment |
| `tgl release upload <tag> <files…>` | Attach files (e.g. a signed build) to a tag's release |
| `tgl release list [<tag>]` | Show the files attached to each release |

- The Tangled repo is taken from the git remote (`git@tangled.org:did:plc:...`), or given
  with `-R owner/name` or `-R did:plc:...`.
- Every command has `--help`. `pr create` and `release upload` have `--dry-run`, which
  checks everything without writing anything.
- Lists show the 30 newest by default; `--limit 0` shows all.
- `--json` prints the data for other programs to read.
- `pr checkout` creates a local branch with a PR's changes so you can try them. Your
  working copy must have no uncommitted changes. If the changes don't apply, nothing is
  left behind.
- `pr close --merged` doesn't merge anything; it only changes the PR's state. Merge
  locally and push.
- `-b` can be replaced by `-F file.md` to read the text from a file.
- `release upload`: the tag must be annotated (`git tag -a`), already pushed to Tangled,
  and the same tag as in your copy. Tangled accepts up to 50 MB per file. A tag can't get
  two files with the same name.
- Ids are the last part of each record's address, as shown by `list`. Tangled's `#N`
  numbers are assigned by its website and aren't available to other programs.
- Messages are in English, or in Spanish on Spanish systems. Force one with
  `TGL_LANG=en` or `TGL_LANG=es`.
- On Linux systems without a secret service, the app password falls back to a file only
  your user can read, and `tgl` tells you so.

## How it works

On Tangled, as everywhere on the AT Protocol, each person's data lives in their own
account. A PR or an issue is a record in its author's account that points at the repo.

- Writing (create, comment, close…) saves records to your account with your app password.
  Repo settings (`repo set-default-branch`) go to the repo's git server (its "knot") with
  a one-use token your account issues for that single action.
- Reading other people's PRs, issues and comments needs an index of "which records point
  at this repo". `tgl` uses two public, read-only community services from
  [microcosm](https://www.microcosm.blue): [Constellation](https://constellation.microcosm.blue)
  (that index) and [Slingshot](https://slingshot.microcosm.blue) (a fast cache of records,
  updated live). Neither ever sees your credentials. If Slingshot fails, records are read
  from their author's server. If Constellation is down, `tgl` warns you and still shows
  the records in your own account. Your own records are always read straight from your
  account.
- A state change (close, reopen, merge) only counts if Tangled would accept it: from the
  author, the repo owner, a collaborator or Tangled itself.

Records used: `sh.tangled.repo.pull` (with the changes as a gzipped `git format-patch`),
`.pull.status`, `sh.tangled.repo.issue`, `.issue.state`, `sh.tangled.feed.comment` (comments on both;
the older `.pull.comment` and `.issue.comment` are still read)
and `sh.tangled.repo.artifact` (a release file, linked to its tag by the tag's hash).

These formats have no official documentation and may change. They follow
[Tangled's lexicons](https://tangled.org/tangled.org/core/tree/master/lexicons),
including older formats still found in long-lived repos.

**Known limitation:** on large, old repos a few old PRs (mostly stacked PRs) may show a
different state from the website, which can't be rebuilt from public records alone.
Issues and PRs in the current format match the website.
