// Loads a repo's PRs or issues, with their current state, from Tangled's API.
import { apiFind, apiList, apiQuery } from './api.js';
import { handleOf } from './atproto.js';
import { recordsLinkingTo } from './backlinks.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';
import { authorOf, NSID, parseTicketRef, TANGLED_DID, ticketFromView, ticketUri } from './tangled.js';

// `states` maps tgl's state names to the API's. Tangled has "completed" for merged PRs;
// an issue can be closed either way, and tgl shows both as closed.
const KINDS = {
  pull: { list: 'org.tangled.repo.listPulls', stateParam: 'status', states: { open: ['open'], closed: ['closed'], merged: ['completed'] } },
  issue: { list: 'org.tangled.repo.listIssues', stateParam: 'state', states: { open: ['open'], closed: ['closed', 'completed'] } },
};

// Old-format owners and collaborators, from sh.tangled.* records. Only the commands
// paused until they write Tangled's new format still use this.
export async function repoPeople(account, repoDid) {
  const records = await recordsLinkingTo({ account, collection: NSID.repo, links: [{ target: repoDid, path: '.repoDid' }] });
  const recordUris = records.map((r) => r.uri);
  const collaborators = await recordsLinkingTo({
    account,
    collection: NSID.collaborator,
    links: [{ target: repoDid, path: '.repoDid' }, { target: repoDid, path: '.repo' }, ...recordUris.map((u) => ({ target: u, path: '.repo' }))],
  });
  const owners = new Set(records.map((r) => authorOf(r.uri)));
  return {
    recordUris,
    // Only collaborator records written by the owner count.
    editors: [...owners, ...collaborators.filter((c) => owners.has(authorOf(c.uri))).map((c) => c.value.subject), TANGLED_DID],
  };
}

// Items newest first. `state` filters ("all" for none); `limit` stops early (0 = no limit).
export async function loadItems(kind, repoDid, { state = 'all', limit = 0 } = {}) {
  const k = KINDS[kind];
  const wanted = state === 'all' ? [undefined] : k.states[state];
  const lists = await Promise.all(wanted.map((s) => apiList(k.list, { subject: repoDid, [k.stateParam]: s }, { limit })));
  const items = lists.flat().map((view) => ticketFromView(kind, view)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result = limit ? items.slice(0, limit) : items;
  const handles = new Map(result.map((i) => [i.author, null]));
  await Promise.all([...handles.keys()].map(async (did) => handles.set(did, await handleOf(did))));
  for (const item of result) item.authorHandle = handles.get(item.author);
  return result;
}

// Adds a PR's revisions, oldest first, and the branch its newest one came from.
export async function withRounds(pull) {
  const { items } = await apiQuery('org.tangled.temp.review.listPatches', { ticket: pull.uri, order: 'asc', limit: 500 });
  const rounds = items.map((i) => i.value);
  return { ...pull, rounds, source: rounds.at(-1)?.source };
}

// Finds one item by its number on the website ("#12" or "12") or its full at:// address.
export async function findById(kind, repoDid, ref) {
  const rkey = parseTicketRef(ref, repoDid);
  const view = rkey === undefined ? null : await apiFind('org.tangled.track.getTicketView', { uri: ticketUri(repoDid, rkey) });
  // Issues and PRs share their numbers: a PR is a ticket with a target branch.
  if (!view || Boolean(view.targetBranch) !== (kind === 'pull')) throw notFound(kind, ref);
  const item = ticketFromView(kind, view);
  item.authorHandle = view.author?.handle ?? await handleOf(item.author);
  return kind === 'pull' ? withRounds(item) : item;
}

export function notFound(kind, ref) {
  return new TglError(kind === 'pull'
    ? t(`No PR "${ref}" in this repository. See them with "tgl pr list".`, `No encuentro ninguna PR "${ref}" en este repositorio. Míralas con "tgl pr list".`)
    : t(`No issue "${ref}" in this repository. See them with "tgl issue list".`, `No encuentro ninguna issue "${ref}" en este repositorio. Míralas con "tgl issue list".`));
}
