// Tangled-specific knowledge: record formats and how to find a repository.
// Tangled's record formats are not officially documented and may change;
// they mirror the lexicons in https://tangled.org/tangled.org/core (lexicons/).
import { listAllRecords, resolveHandle, resolvePds } from './atproto.js';
import { remoteUrls } from './git.js';
import { TglError } from './errors.js';

export const NSID = {
  repo: 'sh.tangled.repo',
  pull: 'sh.tangled.repo.pull',
  pullStatus: 'sh.tangled.repo.pull.status',
};

export const PULL_STATES = {
  open: 'sh.tangled.repo.pull.status.open',
  closed: 'sh.tangled.repo.pull.status.closed',
  merged: 'sh.tangled.repo.pull.status.merged',
};

const WEB = 'https://tangled.org';

export function repoWebUrl(repoDid) {
  return `${WEB}/${repoDid}`;
}

// Accepts "owner/name", a repo DID, or nothing (then reads the git remotes).
export async function resolveRepo(spec) {
  if (spec?.startsWith('did:')) return { repoDid: spec, label: spec };
  if (spec) {
    const [owner, name] = spec.split('/');
    if (!owner || !name) throw new TglError(`Repositorio no válido: "${spec}". Usa cuenta/nombre, por ejemplo oviiione.eu/newspal.`);
    const ownerDid = owner.startsWith('did:') ? owner : await resolveHandle(owner);
    const records = await listAllRecords(await resolvePds(ownerDid), ownerDid, NSID.repo);
    const wanted = name.toLowerCase();
    const found = records.find((r) => r.uri.split('/').pop() === wanted) ??
      records.find((r) => r.value.name?.toLowerCase() === wanted);
    if (!found?.value.repoDid) throw new TglError(`No encuentro el repositorio "${spec}" en Tangled.`);
    return { repoDid: found.value.repoDid, label: spec };
  }
  for (const url of remoteUrls()) {
    const m = url.match(/tangled\.(?:org|sh)[:/](did:[a-z]+:[A-Za-z0-9._:%-]+?)(?:\.git)?\/?$/);
    if (m) return { repoDid: m[1], label: m[1] };
  }
  for (const url of remoteUrls()) {
    const m = url.match(/tangled\.(?:org|sh)[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/);
    if (m) return resolveRepo(m[1]);
  }
  throw new TglError('Este repositorio git no tiene ningún remoto de Tangled. Indica el repo con -R cuenta/nombre.');
}

// Mirrors appview/pulls/create.go: target/source also carry a "repoDid" copy
// of "repo" for compatibility with knots that still read the old field name.
export function buildPullRecord({ repoDid, title, body, base, head, patchBlob, now = new Date() }) {
  const createdAt = now.toISOString();
  const record = {
    $type: NSID.pull,
    title,
    target: { repo: repoDid, repoDid, branch: base },
    source: { branch: head },
    rounds: [{ createdAt, patchBlob }],
    createdAt,
  };
  if (body) record.body = body;
  return record;
}

export function buildStatusRecord({ pullUri, state, now = new Date() }) {
  return { $type: NSID.pullStatus, pull: pullUri, status: PULL_STATES[state], createdAt: now.toISOString() };
}

// A pull's state is its newest status record; with none it is open.
export function pullStates(statusRecords) {
  const latest = new Map();
  for (const { value } of statusRecords) {
    const prev = latest.get(value.pull);
    if (!prev || value.createdAt > prev.createdAt) latest.set(value.pull, value);
  }
  const names = Object.fromEntries(Object.entries(PULL_STATES).map(([k, v]) => [v, k]));
  return (pullUri) => names[latest.get(pullUri)?.status] ?? 'open';
}
