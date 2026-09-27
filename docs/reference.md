# tgl reference

[Español](reference.es.md) · [Back to the README](../README.md)

## Commands

| Command | What it does |
|---|---|
| `tgl auth login` | Save your account and app password |
| `tgl auth status` | Show which account you are logged in with |
| `tgl auth logout` | Delete the saved app password from this computer |
| `tgl repo view [--web]` | Show a repo's owner, branches and addresses |
| `tgl repo create <name> [-d "Text"]` | Create a new, empty repo on Tangled |
| `tgl repo set-default-branch <branch>` | Change the repo's default branch |
| `tgl pr create -t "Title" -b "Text"` | Open a PR from the current branch into the default branch |
| `tgl pr list [--state …] [--limit N] [--web]` | List PRs, newest first (open ones by default) |
| `tgl pr view [<pr>] [--patch] [--web]` | Show a PR: description, changed files, comments |
| `tgl pr checkout <pr>` | Bring a PR's changes into a local branch to try them |
| `tgl pr comment [<pr>] -b "Text"` | Comment on a PR |
| `tgl pr edit [<pr>] [-t "Title"] [-b "Text"]` | Change a PR's title or description |
| `tgl pr update [<pr>]` | Send the branch again after new commits (a new revision) |
| `tgl pr label <pr> [--add …] [--remove …]` | Add or remove labels on a PR, or list them |
| `tgl pr merge [<pr>] [--dry-run]` | Merge a PR on Tangled's server and close the issues it fixes |
| `tgl pr close [<pr>] [--merged]` | Close a PR, or mark it as merged and close the issues it fixes |
| `tgl pr reopen <pr>` | Reopen a closed PR |
| `tgl issue create -t "Title" -b "Text"` | Open an issue |
| `tgl issue list [--state …] [--limit N] [--web]` | List issues, newest first (open ones by default) |
| `tgl issue view <issue> [--web]` | Show an issue with its comments |
| `tgl issue edit <issue> [-t "Title"] [-b "Text"]` | Change an issue's title or description |
| `tgl issue comment <issue> -b "Text"` | Comment on an issue |
| `tgl issue label <issue> [--add …] [--remove …]` | Add or remove labels on an issue, or list them |
| `tgl issue close <issue> [-b "Text"]` | Close an issue, optionally with a comment |
| `tgl issue reopen <issue> [-b "Text"]` | Reopen an issue, optionally with a comment |
| `tgl release upload <tag> <files…>` | Attach files (e.g. a signed build) to a tag's release |
| `tgl release list [<tag>]` | Show the files attached to each release |

- The Tangled repo is taken from the git remote (`git@tangled.org:did:plc:...`), or given
  with `-R owner/name` or `-R did:plc:...`.
- `<pr>` and `<issue>` are the number the website shows (`12` or `#12`) or the id shown by
  `list`; a PR can also be named by its branch. `[<pr>]` can be left out: then it is the
  open PR of the current branch.
- Every command has `--help`. `pr create`, `pr update`, `pr merge` and `release upload`
  have `--dry-run`, which checks everything without writing anything.
- Lists show the 30 newest by default; `--limit 0` shows all.
- `--json` prints the data for other programs to read.
- `pr checkout` creates a local branch with a PR's changes so you can try them. Your
  working copy must have no uncommitted changes. If the changes don't apply, nothing is
  left behind.
- There are two ways to finish a PR. `pr merge` has Tangled's server apply it, like the
  website's merge button: each commit is kept, with new hashes, so afterwards pull the
  target branch (and push it to any mirror, e.g. GitHub). Or merge locally, push, and run
  `pr close --merged`, which doesn't merge anything; it only changes the PR's state.
  Both close the issues named as `Fixes #12` (or `Closes`,
  `Resolves`, or with a link to the issue) in the PR's title or description, or in a
  comment on it by its author or the repo's owner or collaborators, with a comment
  linking to the PR; `--keep-issues`
  leaves them open. Only issues of the same repo, and only if you may close them.
  `pr create` and `pr edit` turn that `#12` into a link to the issue (Tangled shows a
  plain `#12` as text), and the closing comment links back to the PR.
- `pr create` and `pr update` stop if the branch has commits that aren't pushed to Tangled
  (`--allow-unpushed` goes ahead anyway). A Tangled PR keeps the changes it was sent with:
  after new commits, push them and run `pr update`.
- `pr edit`, `pr update` and `issue edit` only work on your own PRs and issues.
- Labels: `--add good-first-issue`, or `--add assignee=alice.bsky.social` for labels that
  take a value. `--add` and `--remove` can be repeated. Only the repo's owner and
  collaborators can change labels; `label` with no options shows the repo's labels.
- `repo create` makes an empty repo (default branch `main`, host `knot1.tangled.sh`);
  `--remote tangled` also adds it as a git remote. For pipelines, pick a CI server with
  `--spindle spindle.tangled.sh` or later in the repo's settings on the website.
- `--web` opens the page in your browser. PR and issue pages go by number, so with an id or
  a branch the list opens instead.
- `-b` can be replaced by `-F file.md` to read the text from a file.
- `release upload`: the tag must be annotated (`git tag -a`), already pushed to Tangled,
  and the same tag as in your copy. Tangled accepts up to 50 MB per file. A tag can't get
  two files with the same name.
- Ids are the last part of each record's address, as shown by `list`. Numbers are
  assigned by Tangled's website and are in no record: `tgl` reads them from the item's web
  page, and `list` shows ids, not numbers.
- Messages are in English, or in Spanish on Spanish systems. Force one with
  `TGL_LANG=en` or `TGL_LANG=es`.
- On Linux systems without a secret service, the app password falls back to a file only
  your user can read, and `tgl` tells you so.

## How it works

On Tangled, as everywhere on the AT Protocol, each person's data lives in their own
account. A PR or an issue is a record in its author's account that points at the repo.

- Writing (create, comment, close…) saves records to your account with your app password.
  Repo settings, merges and new repos (`repo set-default-branch`, `pr merge`,
  `repo create`) go to the repo's git server (its "knot") with a one-use token your
  account issues for that single action.
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
