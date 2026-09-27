// Tangled-specific knowledge: record formats and how to find a repository.
// Tangled's record formats are not officially documented and may change;
// they mirror the lexicons in https://tangled.org/tangled.org/core (lexicons/).
import { gunzipSync } from 'node:zlib';
import { fetchBlob, listAllRecords, resolveDidDoc, resolveHandle, resolvePds, xrpcQuery } from './atproto.js';
import { remoteUrls } from './git.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';

export const NSID = {
  repo: 'sh.tangled.repo',
  pull: 'sh.tangled.repo.pull',
  pullStatus: 'sh.tangled.repo.pull.status',
  comment: 'sh.tangled.feed.comment',
  legacyPullComment: 'sh.tangled.repo.pull.comment',
  artifact: 'sh.tangled.repo.artifact',
  collaborator: 'sh.tangled.repo.collaborator',
  issue: 'sh.tangled.repo.issue',
  issueState: 'sh.tangled.repo.issue.state',
  legacyIssueComment: 'sh.tangled.repo.issue.comment',
};

export const ISSUE_STATES = {
  open: 'sh.tangled.repo.issue.state.open',
  closed: 'sh.tangled.repo.issue.state.closed',
};

// Lexicon limit for a release file (sh.tangled.repo.artifact, maxSize).
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

export const PULL_STATES = {
  open: 'sh.tangled.repo.pull.status.open',
  closed: 'sh.tangled.repo.pull.status.closed',
  merged: 'sh.tangled.repo.pull.status.merged',
};

const WEB = 'https://tangled.org';

// Tangled's own account; the appview accepts its state changes on any repo.
export const TANGLED_DID = 'did:plc:wshs7t2adsemcrrd4snkeqli';

export function repoWebUrl(repoDid) {
  return `${WEB}/${repoDid}`;
}

// Public read-only git address; works without credentials.
export function repoGitUrl(repoDid) {
  return `${WEB}/${repoDid}`;
}

// The repo's git server (its "knot"), as declared in the repo's DID document: newer
// repos use a "#tangled_knot" service, older ones list the knot as their data server.
export async function knotOf(repoDid) {
  const doc = await resolveDidDoc(repoDid);
  const knot = doc.service?.find((s) => s.id === '#tangled_knot' || s.type === 'TangledKnot');
  if (knot) return new URL(knot.serviceEndpoint).origin;
  return resolvePds(repoDid);
}

// A PR's changes as git format-patch text. Most PRs carry them as a gzipped file
// (the newest round), very old ones inline, and some newer branch PRs none at all:
// then the repo's knot computes them from the branches, as Tangled's website does.
export async function pullPatch(pull, repoDid) {
  const round = pull.rounds?.at(-1);
  if (round) return gunzipSync(await fetchBlob(pull.author, round.patchBlob)).toString('utf8');
  if (pull.patch) return pull.patch;
  const sourceRepo = pull.source?.repo?.startsWith('did:') ? pull.source.repo : repoDid;
  if (!pull.source?.branch) return '';
  const data = await xrpcQuery(await knotOf(sourceRepo), 'sh.tangled.repo.compare', {
    repo: sourceRepo, rev1: pull.target.branch, rev2: pull.source.branch,
  });
  return data.patch ?? '';
}

// "#12" or "12": the number Tangled's website shows for an issue or PR.
export function parseNumber(ref) {
  return /^#?\d+$/.test(ref ?? '') ? Number(ref.replace('#', '')) : undefined;
}

// Numbers are assigned by the website and are in no record, so the at:// address is
// read from the item's web page (the data-aturi attribute of its "copy address"
// element, see appview/pages/templates). Null if there is no such item.
export async function uriForNumber(repoDid, kind, number) {
  const path = kind === 'pull' ? 'pulls' : 'issues';
  const res = await fetch(`${repoWebUrl(repoDid)}/${path}/${number}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok && res.status !== 404) {
    throw new TglError(t(`Could not look up #${number} on Tangled (HTTP ${res.status}).`, `No se pudo buscar el #${number} en Tangled (HTTP ${res.status}).`));
  }
  const collection = kind === 'pull' ? NSID.pull : NSID.issue;
  const m = (await res.text()).match(new RegExp(`data-aturi="(at://[^"/]+/${collection.replaceAll('.', '\\.')}/[a-z0-9]+)"`));
  return m?.[1] ?? null;
}

// Issues a PR says it closes, as GitHub reads them: "Fixes #12", "closes: <issue link>",
// "Resolves at://…/sh.tangled.repo.issue/…". Returns { number, repo? } or { uri }, where
// `repo` is the "owner/name" or DID from a link (to check it is this repo).
export function closingRefs(text) {
  const refs = [];
  for (const [, token] of (text ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(\S+)/gi)) {
    const ref = token.replace(/[.,;:!?)\]]+$/, '');
    const number = parseNumber(ref);
    const link = ref.match(/^(?:https?:\/\/)?tangled\.(?:org|sh)\/(did:[^/]+|[^/]+\/[^/]+)\/issues\/(\d+)$/);
    const uri = ref.match(new RegExp(`^at://[^/]+/${NSID.issue.replaceAll('.', '\\.')}/[a-z0-9]+$`));
    if (number !== undefined) refs.push({ number });
    else if (link) refs.push({ number: Number(link[2]), repo: link[1] });
    else if (uri) refs.push({ uri: uri[0] });
  }
  return refs;
}

// A PR comes from a fork when its source branch lives in another repo.
export function isFork(pull, repoDid) {
  return Boolean(pull.source?.repo) && pull.source.repo !== repoDid;
}

// Accepts "owner/name", a repo DID, or nothing (then reads the git remotes).
export async function resolveRepo(spec) {
  if (spec?.startsWith('did:')) return { repoDid: spec, label: spec };
  if (spec) {
    const [owner, name] = spec.split('/');
    if (!owner || !name) {
      throw new TglError(t(`Invalid repository: "${spec}". Use owner/name, e.g. tangled.org/core.`, `Repositorio no válido: "${spec}". Usa cuenta/nombre, por ejemplo tangled.org/core.`));
    }
    const ownerDid = owner.startsWith('did:') ? owner : await resolveHandle(owner);
    const records = await listAllRecords(await resolvePds(ownerDid), ownerDid, NSID.repo);
    const wanted = name.toLowerCase();
    const found = records.find((r) => r.uri.split('/').pop() === wanted) ??
      records.find((r) => r.value.name?.toLowerCase() === wanted);
    if (!found?.value.repoDid) throw new TglError(t(`Repository "${spec}" not found on Tangled.`, `No encuentro el repositorio "${spec}" en Tangled.`));
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
  throw new TglError(t(
    'This git repository has no Tangled remote. Pass the repo with -R owner/name.',
    'Este repositorio git no tiene ningún remoto de Tangled. Indica el repo con -R cuenta/nombre.',
  ));
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

// Mirrors appview/repo/artifact.go. The optional "repo" at-uri is left out: the
// appview looks repos up by repoDid first, and one repoDid can have several repo
// records (e.g. after a rename), so guessing one could point at the wrong name.
export function buildArtifactRecord({ repoDid, name, tagHash, blob, now = new Date() }) {
  return {
    $type: NSID.artifact,
    name,
    repoDid,
    tag: { $bytes: Buffer.from(tagHash, 'hex').toString('base64').replace(/=+$/, '') },
    artifact: blob,
    createdAt: now.toISOString(),
  };
}

export function tagHashFromRecord(record) {
  return Buffer.from(record.tag.$bytes, 'base64').toString('hex');
}

export function buildStatusRecord({ pullUri, state, now = new Date() }) {
  return { $type: NSID.pullStatus, pull: pullUri, status: PULL_STATES[state], createdAt: now.toISOString() };
}

// Comments on issues and PRs (lexicons/feed/comment.json). They point at their subject
// with a strong reference (address + content hash); a PR comment also names the
// revision it is about. The older per-kind comment collections are deprecated: Tangled
// no longer shows new ones, but old ones are still read.
export function buildCommentRecord({ subject, body, pullRoundIdx, now = new Date() }) {
  const record = {
    $type: NSID.comment,
    subject: { uri: subject.uri, cid: subject.cid },
    body: { $type: 'sh.tangled.markup.markdown', text: body, original: body },
    createdAt: now.toISOString(),
  };
  if (pullRoundIdx !== undefined) record.pullRoundIdx = pullRoundIdx;
  return record;
}

export function commentText(value) {
  return typeof value.body === 'string' ? value.body : value.body?.text ?? '';
}

export function buildIssueRecord({ repoDid, title, body, now = new Date() }) {
  return { $type: NSID.issue, repo: repoDid, title, body, createdAt: now.toISOString() };
}

export function buildIssueStateRecord({ issueUri, state, now = new Date() }) {
  return { $type: NSID.issueState, issue: issueUri, state: ISSUE_STATES[state], createdAt: now.toISOString() };
}

export function authorOf(uri) {
  return uri.replace('at://', '').split('/')[0];
}

// State of one PR or issue: its newest state record written by someone Tangled
// accepts (the author or the repo owner, see authorizeStateRecord in
// appview/ingester.go); with none it is open. `field` is "status" for PRs and
// "state" for issues; `known` maps short names to the record values.
export function latestState(stateRecords, { field, known, allowed }) {
  let latest;
  for (const r of stateRecords) {
    if (!allowed.has(authorOf(r.uri))) continue;
    if (!latest || r.value.createdAt > latest.value.createdAt) latest = r;
  }
  const names = Object.fromEntries(Object.entries(known).map(([k, v]) => [v, k]));
  return names[latest?.value[field]] ?? 'open';
}
