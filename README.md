# tangled-cli (`tgl`)

[Español](README.es.md)

![tgl in a terminal: listing PRs, and marking one as merged closes its issue](docs/banner.svg)

A command-line tool for [Tangled](https://tangled.org), in the style of GitHub's `gh`.

## What it's for

Manage Tangled without leaving the terminal: create repos, and open, label, merge and
close pull requests and issues; attach release files. It also does a few things Tangled doesn't do on its own yet:

- **Close issues from a PR.** Write `Fixes #12` in the PR; when you mark it as merged,
  issue #12 is closed with a comment naming the PR.
- **Keep a PR up to date.** A Tangled PR keeps the changes it was created with.
  `tgl pr update` sends the new commits of its branch as a new revision.
- **Attach release files from scripts**, such as a signed build, to a tag.
- **Catch unpushed commits** before a PR is created or updated.
- **Work from the branch you're on:** `tgl pr view`, `tgl pr close --merged`… with no PR
  number, or with the `#12` the website shows.

Merge PRs on Tangled with `tgl pr merge`, or, for repos mirrored on GitHub and Tangled:
open the PR on both, merge locally, push once, and mark the Tangled PR as merged with
`tgl pr close --merged`.

No third-party dependencies: only Node.js 20+ and git. MIT licensed.

## Install

```bash
npm install -g tangled-cli
```

This installs the `tgl` command. Check it with `tgl --version`.

From source, to try unreleased changes:

```bash
git clone https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift tangled-cli
cd tangled-cli
npm link
```

## Log in

1. Create an **app password** for your account (not your main password). In the Bluesky
   app it is under Settings → Privacy and security → App passwords. Any AT Protocol
   account works.
2. Run `tgl auth login` and paste it when asked.

It is kept in your system's secret store (Windows DPAPI, macOS Keychain, Linux secret
service), never in a repository. `tgl auth logout` deletes it.

## Use

Run `tgl` inside a git repo with a Tangled remote:

```bash
tgl pr create -t "Add dark mode" -b "Fixes #12"
tgl pr update                 # after pushing more commits
tgl pr close --merged         # after merging: closes the PR and issue #12
tgl issue list
tgl release upload v1.2.0 build.zip
```

Every command has `--help`. The full list, options and how `tgl` works are in the
[reference](docs/reference.md).

## Repositories

The same code lives on both forges; either works for issues and PRs. See
[how to contribute](CONTRIBUTING.md).

- Tangled: https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift
- GitHub (mirror): https://github.com/OviiiOne/tangled-cli

## License

[MIT](LICENSE)
