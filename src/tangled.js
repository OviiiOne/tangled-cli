// Tangled-specific knowledge: record formats and how to find a repository.
// Tangled's record formats are not officially documented and may change;
// they mirror the lexicons in https://tangled.org/tangled.org/core (lexicons/).
import { apiFind, apiText } from './api.js';
import { resolveDidDoc, resolveHandle, resolvePds } from './atproto.js';
import { remoteUrls } from './git.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';

export const NSID = {
  // Issues and PRs are one record type, kept in the repo's own account on its knot.
  ticket: 'org.tangled.track.ticket',
  comment: 'org.tangled.feed.comment',
  artifact: 'org.tangled.repo.artifact',
  labelDefinition: 'org.tangled.label.definition',
  // These two live in the user's own account.
  declaration: 'org.tangled.repo.declaration',
  attestation: 'org.tangled.graph.attestation',
};

// tgl's state names -> the ticket's "state" field.
export const TICKET_STATES = { open: 'open', closed: 'closed', merged: 'completed' };

// Lexicon limit for a release file (org.tangled.repo.artifact, maxSize).
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

const WEB = 'https://tangled.org';

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
  return `at://${repoDid}/${NSID.ticket}/${rkey}`;
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
    commentCount: view.commentCount,
    stateUpdatedAt: view.stateUpdatedAt,
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
// but it links to the issue. Plain "#12" without a keyword is left alone.
export function linkClosingRefs(text, repoDid) {
  return text?.replace(/\b((?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+)#(\d+)\b/gi, `$1[#$2](${repoWebUrl(repoDid)}/issues/$2)`);
}

// Issues a PR says it closes, as GitHub reads them: "Fixes #12", "closes: <issue link>",
// "Resolves at://…/org.tangled.track.ticket/…". Returns { number, repo? } or { uri }, where
// `repo` is the "owner/name" or DID from a link (to check it is this repo).
export function closingRefs(text) {
  const refs = [];
  for (const [, token] of (text ?? '').matchAll(CLOSING)) {
    // A markdown link, as linkClosingRefs writes it: "[#12](https://tangled.org/…/issues/12)".
    const ref = (token.match(/^\[[^\]]*\]\(([^)\s]+)\)/)?.[1] ?? token).replace(/[.,;:!?)\]]+$/, '');
    const number = parseNumber(ref);
    const link = ref.match(/^(?:https?:\/\/)?tangled\.(?:org|sh)\/(did:[^/]+|[^/]+\/[^/]+)\/issues\/(\d+)$/);
    const uri = ref.match(new RegExp(`^at://[^/]+/${NSID.ticket.replaceAll('.', '\\.')}/[a-z0-9]+$`));
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
  if (spec?.startsWith('did:') && !spec.includes('/')) return { repoDid: spec, label: spec };
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

const markdown = (text) => ({ $type: 'org.tangled.markup.markdown', text });

// An issue, or a PR when it has a target branch (web/src/lib/api/ticket.ts). The knot
// refuses an empty body, so a blank one is left out.
export function buildTicketRecord({ title, body, targetBranch, now = new Date() }) {
  const record = {
    $type: NSID.ticket,
    title: { $type: 'org.tangled.markup.markdown#inline', text: title },
    state: 'open',
    createdAt: now.toISOString(),
  };
  if (body?.trim()) record.body = markdown(body);
  if (targetBranch) record.targetBranch = targetBranch;
  return record;
}

// `title` and `body` are left as they are when undefined; a blank body removes it.
export function editTicketText(value, { title, body }) {
  const next = { ...value };
  if (title !== undefined) next.title = { $type: 'org.tangled.markup.markdown#inline', text: title };
  if (body !== undefined) {
    if (body.trim()) next.body = { ...value.body, ...markdown(body) };
    else delete next.body;
  }
  return next;
}

// A release file, attached to the annotated tag's object by its hash.
export function buildArtifactRecord({ name, tagHash, blob, now = new Date() }) {
  return {
    $type: NSID.artifact,
    subject: { $type: 'org.tangled.git.oid', oid: tagHash },
    name,
    artifact: blob,
    createdAt: now.toISOString(),
  };
}

// The user's confirmation that a record written on a knot is really theirs. `saved` is
// the knot's answer to the write; "x-tngl-change" names the exact change behind it.
export function buildAttestationRecord(saved, now = new Date()) {
  const record = { $type: NSID.attestation, subject: { uri: saved.uri, cid: saved.cid }, createdAt: now.toISOString() };
  if (saved['x-tngl-change']) record.change = saved['x-tngl-change'];
  return record;
}

export const DEFAULT_KNOT = 'knot1.tangled.sh';

// Same rules as validateRepoName in web/src/lib/api/repoCreate.ts. Returns an error message or null.
export function repoNameProblem(name) {
  if (!name) return t('The repository name cannot be empty.', 'El nombre del repositorio no puede estar vacío.');
  if (name.toLowerCase() === 'self') return t('"self" is a reserved name.', '"self" es un nombre reservado.');
  if (name.length > 100) return t('The name must be 100 characters or fewer.', 'El nombre no puede pasar de 100 caracteres.');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return t('The name can only have letters, numbers, dots, hyphens and underscores.', 'El nombre solo puede tener letras, números, puntos, guiones y guiones bajos.');
  }
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) {
    return t('The name cannot start or end with a dot, or have two dots in a row.', 'El nombre no puede empezar ni acabar en punto, ni tener dos puntos seguidos.');
  }
  return null;
}

// The owner's half of a repo's ownership claim, in their own account. The record key is
// the lowercase name; the knot keeps the other half.
export function buildDeclarationRecord({ repoDid, now = new Date() }) {
  return { $type: NSID.declaration, repo: repoDid, createdAt: now.toISOString() };
}

// Comments point at their subject with a strong reference (address + content hash).
export function buildCommentRecord({ subject, body, now = new Date() }) {
  return {
    $type: NSID.comment,
    subject: { $type: 'com.atproto.repo.strongRef', uri: subject.uri, cid: subject.cid },
    body: markdown(body),
    createdAt: now.toISOString(),
  };
}

export function commentText(value) {
  return value.body?.text ?? '';
}

export function authorOf(uri) {
  return uri.replace('at://', '').split('/')[0];
}
