import { spawnSync } from 'node:child_process';
import { TglError } from './errors.js';
import { t } from './i18n.js';

export function git(args, { cwd, input } = {}) {
  const res = spawnSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new TglError(t(`Could not run git: ${res.error.message}`, `No se pudo ejecutar git: ${res.error.message}`));
  if (res.status !== 0) throw new TglError(t(`git ${args[0]} failed: ${res.stderr.trim()}`, `git ${args[0]} falló: ${res.stderr.trim()}`));
  return res.stdout;
}

export function currentBranch() {
  const name = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (name === 'HEAD') {
    throw new TglError(t('You are not on a branch (detached HEAD). Pass the branch with --head.', 'No estás en ninguna rama (HEAD suelto). Indica la rama con --head.'));
  }
  return name;
}

export function remoteUrls() {
  const out = git(['remote', '-v']);
  return [...new Set(out.split('\n').map((l) => l.split(/\s+/)[1]).filter(Boolean))];
}

export function refExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;
}

export function isWorkingTreeClean() {
  return git(['status', '--porcelain', '--untracked-files=no']).trim() === '';
}

// Branch name as the forge knows it: "origin/master" and "master" are both "master".
export function branchName(ref) {
  const full = spawnSync('git', ['rev-parse', '--symbolic-full-name', ref], { encoding: 'utf8' }).stdout.trim();
  return stripRefPrefix(full) ?? ref;
}

export function stripRefPrefix(fullRef) {
  if (fullRef.startsWith('refs/heads/')) return fullRef.slice('refs/heads/'.length);
  const remote = fullRef.match(/^refs\/remotes\/[^/]+\/(.+)$/);
  return remote ? remote[1] : undefined;
}

// A local ref for a branch of the forge: the local branch, or else a remote-tracking copy.
export function localRefFor(branch) {
  if (refExists(`refs/heads/${branch}`)) return branch;
  for (const remote of git(['remote']).split('\n').filter(Boolean)) {
    if (refExists(`refs/remotes/${remote}/${branch}`)) return `${remote}/${branch}`;
  }
  throw new TglError(t(
    `Branch "${branch}" is not in your local copy. Run "git fetch" first.`,
    `La rama "${branch}" no está en tu copia local. Ejecuta antes "git fetch".`,
  ));
}

// The branch a remote repository's HEAD points at (e.g. "main" or "master").
// HEAD can point at a branch that doesn't exist (a repo created empty whose first
// push used another name); then fall back to the only branch, or main, or master.
export function remoteDefaultBranch(url) {
  const out = git(['ls-remote', '--symref', url]);
  const heads = [...out.matchAll(/^[0-9a-f]{40}\trefs\/heads\/(\S+)$/gm)].map((m) => m[1]);
  const head = out.match(/^ref: refs\/heads\/(\S+)\tHEAD/m)?.[1];
  if (head && heads.includes(head)) return head;
  if (heads.length === 1) return heads[0];
  return ['main', 'master'].find((b) => heads.includes(b));
}

// Hash of an annotated tag object: what Tangled attaches release files to.
export function annotatedTagHash(tag) {
  if (!refExists(`refs/tags/${tag}`)) {
    throw new TglError(t(`Tag "${tag}" does not exist in this local repository.`, `La etiqueta "${tag}" no existe en este repositorio local.`));
  }
  if (git(['cat-file', '-t', `refs/tags/${tag}`]).trim() !== 'tag') {
    throw new TglError(t(
      `"${tag}" is a lightweight tag. Tangled only accepts annotated tags (git tag -a).`,
      `"${tag}" es una etiqueta ligera. Tangled solo acepta etiquetas anotadas (git tag -a).`,
    ));
  }
  return git(['rev-parse', `refs/tags/${tag}`]).trim();
}

// Tag name -> tag object hash, as published on a remote.
export function remoteTags(url) {
  const tags = new Map();
  for (const line of git(['ls-remote', '--tags', url]).split('\n')) {
    const [hash, ref] = line.split('\t');
    if (ref && !ref.endsWith('^{}')) tags.set(ref.slice('refs/tags/'.length), hash);
  }
  return tags;
}

// The same "git format-patch" text Tangled's own website stores for a branch PR.
export function formatPatch(base, head) {
  for (const ref of [base, head]) {
    if (!refExists(ref)) {
      throw new TglError(t(`Branch or ref "${ref}" does not exist in this local repository.`, `La rama o referencia "${ref}" no existe en este repositorio local.`));
    }
  }
  const commits = git(['rev-list', '--count', `${base}..${head}`]).trim();
  if (commits === '0') throw new TglError(t(`"${head}" has no new commits compared to "${base}".`, `"${head}" no tiene commits nuevos respecto a "${base}".`));
  return { patch: git(['format-patch', '--stdout', `${base}..${head}`]), commits: Number(commits) };
}
