// Tangled-specific knowledge: record formats and how to find a repository.
// Tangled's record formats are not officially documented and may change;
// they mirror the lexicons in https://tangled.org/tangled.org/core (lexicons/).
import { apiFind, apiText } from './api.js';
import { resolveDidDoc, resolveHandle, resolvePds } from './atproto.js';
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

// Issues and PRs are one record type, kept in the repo's own account on its knot.
const TICKET = 'org.tangled.track.ticket';

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

// A PR's changes as git format-patch text, computed by Tangled from its newest revision.
// PRs migrated from the old format have the same start and end commit: no changes kept.
export async function pullPatch(pull, repoDid) {
  const round = pull.rounds?.at(-1);
  if (!round || round.base.oid === round.head.oid) return '';
  return apiText('org.tangled.temp.git.formatPatch', { repo: repoDid, from: round.base.oid, to: round.head.oid });
}

// "#12" or "12": the number Tangled's website shows for an issue or PR.
export function parseNumber(ref) {
  return /^#?\d+$/.test(ref ?? '') ? Number(ref.replace('#', '')) : undefined;
}

export function ticketUri(repoDid, rkey) {
  return `at://${repoDid}/${TICKET}/${rkey}`;
}

// The record key of a ticket named by its number, its at:// address in this repo, or a
// knot-minted id (13 characters). Undefined for anything else, such as a branch name.
export function parseTicketRef(ref, repoDid) {
  const number = parseNumber(ref);
  if (number !== undefined) return String(number);
  if (ref?.startsWith(`${ticketUri(repoDid, '')}`)) return ref.split('/').pop();
  return /^[234567a-z]{13}$/.test(ref ?? '') ? ref : undefined;
}

// An issue or PR as tgl uses it, from a list item ({ author: did, value: record }) or a
// ticket view (the record's fields at the top, author as a profile). Merged PRs are
// "completed" on Tangled.
export function ticketFromView(kind, view) {
  const record = view.value ?? view;
  const state = view.state ?? record.state;
  const item = {
    uri: view.uri,
    cid: view.cid,
    rkey: view.uri.split('/').pop(),
    author: view.author?.did ?? view.author,
    title: record.title?.text ?? '',
    body: record.body?.text,
    createdAt: record.createdAt ?? '',
    state: state === 'completed' ? (kind === 'pull' ? 'merged' : 'closed') : state,
    labels: (record.tangledLabels ?? []).map((l) => l.key),
    assignees: record.assignees ?? [],
  };
  if (kind === 'pull') item.target = { branch: record.targetBranch };
  return item;
}

export function commentFromView(view) {
  return { uri: view.uri, author: view.editor, body: commentText(view), createdAt: view.createdAt ?? '' };
}

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(\S+)/gi;

// Tangled's website shows "#12" as plain text (it isn't GitHub), so "Fixes #12" becomes
// "Fixes [#12](https://tangled.org/<repo DID>/issues/12)": the text still reads "#12",
// but it links to the issue. Plain "#12" without a keyword is left alone: issues and PRs
// are numbered separately, so it could be either.
export function linkClosingRefs(text, repoDid) {
  return text?.replace(/\b((?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+)#(\d+)\b/gi, `$1[#$2](${repoWebUrl(repoDid)}/issues/$2)`);
}

// Issues a PR says it closes, as GitHub reads them: "Fixes #12", "closes: <issue link>",
// "Resolves at://…/sh.tangled.repo.issue/…". Returns { number, repo? } or { uri }, where
// `repo` is the "owner/name" or DID from a link (to check it is this repo).
export function closingRefs(text) {
  const refs = [];
  for (const [, token] of (text ?? '').matchAll(CLOSING)) {
    // A markdown link, as linkClosingRefs writes it: "[#12](https://tangled.org/…/issues/12)".
    const ref = (token.match(/^\[[^\]]*\]\(([^)\s]+)\)/)?.[1] ?? token).replace(/[.,;:!?)\]]+$/, '');
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
    const found = await apiFind('org.tangled.repo.getRepoByName', { owner: ownerDid, name });
    if (!found) throw new TglError(t(`Repository "${spec}" not found on Tangled.`, `No encuentro el repositorio "${spec}" en Tangled.`));
    return { repoDid: authorOf(found.uri), label: spec };
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

// Labels a new repo starts with on Tangled's website (LABEL_DEFAULTS in appview/config).
export const DEFAULT_LABELS = ['wontfix', 'good-first-issue', 'duplicate', 'documentation', 'assignee']
  .map((name) => `at://${TANGLED_DID}/sh.tangled.label.definition/${name}`);

export const DEFAULT_KNOT = 'knot1.tangled.sh';

// Same rules as ValidateRepoName in appview/models/repo.go. Returns an error message or null.
export function repoNameProblem(name) {
  if (!name) return t('The repository name cannot be empty.', 'El nombre del repositorio no puede estar vacío.');
  if (name.length > 100) return t('The name must be 100 characters or fewer.', 'El nombre no puede pasar de 100 caracteres.');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return t('The name can only have letters, numbers, dots, hyphens and underscores.', 'El nombre solo puede tener letras, números, puntos, guiones y guiones bajos.');
  }
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) {
    return t('The name cannot start or end with a dot, or have two dots in a row.', 'El nombre no puede empezar ni acabar en punto, ni tener dos puntos seguidos.');
  }
  return null;
}

// Mirrors Repo.AsRecord in appview/models/repo.go, as written by the new-repo form
// (appview/state/state.go): the record key is the lowercase name, and "name" only
// appears when it differs from it.
export function buildRepoRecord({ name, knot, repoDid, description, spindle, now = new Date() }) {
  const record = { $type: NSID.repo, knot, labels: DEFAULT_LABELS, repoDid, createdAt: now.toISOString() };
  if (name !== name.toLowerCase()) record.name = name;
  if (description) record.description = description;
  if (spindle) record.spindle = spindle;
  return record;
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
