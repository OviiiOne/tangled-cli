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
| `tgl issue stale [--days N] [--dry-run]` | Label open issues with no recent activity |
| `tgl issue close <issue> [-b "Text"]` | Close an issue, optionally with a comment |
| `tgl issue reopen <issue> [-b "Text"]` | Reopen an issue, optionally with a comment |
| `tgl label list` | List the labels a repo uses |
| `tgl label create <name> [--color …]` | Create a label for your repo |
| `tgl label delete <name>` | Remove a label from your repo |
| `tgl release upload <tag> <files…>` | Attach files (e.g. a signed build) to a tag's release |
| `tgl release list [<tag>]` | Show the files attached to each release |

- The Tangled repo is taken from the git remote (`git@tangled.org:did:plc:...`), or given
  with `-R owner/name` or `-R did:plc:...`.
- `<pr>` and `<issue>` are the number the website and `list` show (`12` or `#12`). Issues
  and PRs share their numbers. A PR can also be named by its branch. `[<pr>]` can be left
  out: then it is the open PR of the current branch.
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
- `pr create` and `pr update` stop if the branch has commits that aren't pushed to Tangled:
  it only accepts commits that are on the branch. A Tangled PR keeps the changes it was sent
  with: after new commits, push them and run `pr update`.
- Tangled decides who may edit, close or merge, and `tgl` shows its answer if it refuses.
- Labels: `--add good-first-issue`, and `--add assignee=alice.bsky.social` to assign someone.
  `--add` and `--remove` can be repeated; `--remove assignee` removes everyone. `label` with
  no options shows the repo's labels.
- `label create` makes your own labels, with an optional `--color "#E11D48"`. Only the repo's
  owner can create or delete them, and a deleted label's name can't be used again in that repo.
- `issue stale` puts a label (default `stale`, create it first with
  `tgl label create stale`) on open issues with no recent comments or reported state changes
  in `--days` days (default 60), and takes it off when they get activity again. It only
  labels; `--comment "…"` also posts a comment. To run it every day, use a scheduled pipeline
  (below).
- In a CI pipeline, log in with environment variables instead of `tgl auth login`:
  `TGL_ACCOUNT` (your handle or DID) and `TGL_APP_PASSWORD` (a separate app password,
  stored as a pipeline secret; Tangled never gives secrets to pipelines of PRs from
  forks). For example, `.tangled/workflows/stale.yml`:

  ```yaml
  when:
    - event: schedule
      schedule:
        - cron: "H 6 * * *"
  engine: microvm
  image: nixos
  dependencies:
    - nodejs_22
  environment:
    TGL_ACCOUNT: "alice.bsky.social"   # TGL_APP_PASSWORD goes in Settings → Secrets
  steps:
    - name: "Mark stale issues"
      command: npx --yes tangled-cli issue stale --days 60 -R "$TANGLED_REPO_DID/$TANGLED_REPO_NAME"
  ```
- `repo create` makes an empty repo (default branch `main`, host `knot1.tangled.sh`);
  `--remote tangled` also adds it as a git remote. For pipelines, pick a CI server with
  `--spindle spindle.tangled.sh` or later in the repo's settings on the website.
- `--web` opens the page in your browser. PR and issue pages go by number, so with a
  branch the list opens instead.
- `-b` can be replaced by `-F file.md` to read the text from a file.
- `release upload`: the tag must be annotated (`git tag -a`), already pushed to Tangled,
  and the same tag as in your copy. Tangled accepts up to 50 MB per file. A tag can't get
  two files with the same name.
- Commands that only read don't need you to log in.
- PRs from before Tangled's migration keep no changes, so `pr view` lists no files for them.
- Messages are in English, or in Spanish on Spanish systems. Force one with
  `TGL_LANG=en` or `TGL_LANG=es`.
- On Linux systems without a secret service, the app password falls back to a file only
  your user can read, and `tgl` tells you so.

## How it works

On Tangled, a repo's issues, PRs, comments and labels live with the repo, on its git
server (its "knot"). An issue and a PR are the same kind of record, a "ticket"; a PR is a
ticket with a target branch, and each of its revisions is another record.

`tgl` reads all of this through [Tangled's public API](https://tangled.org/docs/api/bobbin/),
which needs no login. To write, it sends the record to the knot with a one-use token your
account issues for that single action, then saves a signed confirmation ("attestation") in
your own account, as the website does. The records follow
[Tangled's lexicons](https://tangled.org/tangled.org/core/tree/master/lexicons/org/tangled)
and [its records reference](https://tangled.org/docs/reference/records/).
