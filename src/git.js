import { spawnSync } from 'node:child_process';
import { TglError } from './errors.js';

export function git(args, { cwd } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new TglError(`No se pudo ejecutar git: ${res.error.message}`);
  if (res.status !== 0) throw new TglError(`git ${args[0]} falló: ${res.stderr.trim()}`);
  return res.stdout;
}

export function currentBranch() {
  const name = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (name === 'HEAD') throw new TglError('No estás en ninguna rama (HEAD suelto). Indica la rama con --head.');
  return name;
}

export function remoteUrls() {
  const out = git(['remote', '-v']);
  return [...new Set(out.split('\n').map((l) => l.split(/\s+/)[1]).filter(Boolean))];
}

export function refExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;
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

// The same "git format-patch" text Tangled's own website stores for a branch PR.
export function formatPatch(base, head) {
  for (const ref of [base, head]) {
    if (!refExists(ref)) throw new TglError(`La rama o referencia "${ref}" no existe en este repositorio local.`);
  }
  const commits = git(['rev-list', '--count', `${base}..${head}`]).trim();
  if (commits === '0') throw new TglError(`"${head}" no tiene commits nuevos respecto a "${base}".`);
  return { patch: git(['format-patch', '--stdout', `${base}..${head}`]), commits: Number(commits) };
}
