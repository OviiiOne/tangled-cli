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

// The same "git format-patch" text Tangled's own website stores for a branch PR.
export function formatPatch(base, head) {
  for (const ref of [base, head]) {
    if (!refExists(ref)) throw new TglError(`La rama o referencia "${ref}" no existe en este repositorio local.`);
  }
  const commits = git(['rev-list', '--count', `${base}..${head}`]).trim();
  if (commits === '0') throw new TglError(`"${head}" no tiene commits nuevos respecto a "${base}".`);
  return { patch: git(['format-patch', '--stdout', `${base}..${head}`]), commits: Number(commits) };
}
