// Loads a repo's PRs or issues from every account, with their current state.
import { handleOf, mapLimit } from './atproto.js';
import { linkedRecordBatches, recordsLinkingTo } from './backlinks.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';
import {
  authorOf, ISSUE_STATES, latestState, NSID, parseNumber, PULL_STATES, TANGLED_DID, uriForNumber,
} from './tangled.js';

// How each kind of record points at its repo, newest format first:
// "did" = the repo DID, "uri" = an at:// address of one of the repo's records.
const KINDS = {
  pull: {
    collection: NSID.pull,
    paths: { did: ['.target.repo', '.target.repoDid'], uri: ['.target.repo', '.targetRepo'] },
    stateCollection: NSID.pullStatus, stateField: 'status', known: PULL_STATES, subjectPath: '.pull',
  },
  issue: {
    collection: NSID.issue,
    paths: { did: ['.repo'], uri: ['.repo'] },
    stateCollection: NSID.issueState, stateField: 'state', known: ISSUE_STATES, subjectPath: '.issue',
  },
};

// The repo's sh.tangled.repo records (in the owner's account; more than one after
// a rename) and the collaborators the owner has added. Both may change states.
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

// Old PR records kept the branch and patch in other fields; some lack a date.
function normalize(kind, value) {
  value = { ...value, createdAt: value.createdAt || '' };
  if (kind !== 'pull' || value.target) return value;
  return { ...value, target: { repo: value.targetRepo, branch: value.targetBranch } };
}

// Items newest first. `state` filters ("all" for none); `limit` stops early (0 = no limit);
// `match(uri, value)` skips records before their state is looked up (the costly part).
export async function loadItems(kind, account, repoDid, { state = 'all', limit = 0, match } = {}) {
  const k = KINDS[kind];
  const { recordUris, editors } = await repoPeople(account, repoDid);
  const links = [
    ...k.paths.did.map((path) => ({ target: repoDid, path })),
    ...recordUris.flatMap((target) => k.paths.uri.map((path) => ({ target, path }))),
  ];
  const items = [];
  for await (const batch of linkedRecordBatches({ account, collection: k.collection, links })) {
    const candidates = match ? batch.filter((r) => match(r.uri, normalize(kind, r.value))) : batch;
    const withState = await mapLimit(candidates, 16, async (r) => {
      const author = authorOf(r.uri);
      const states = await recordsLinkingTo({ account, collection: k.stateCollection, links: [{ target: r.uri, path: k.subjectPath }] });
      return {
        ...normalize(kind, r.value),
        uri: r.uri,
        cid: r.cid,
        rkey: r.uri.split('/').pop(),
        author,
        state: latestState(states, { field: k.stateField, known: k.known, allowed: new Set([author, ...editors]) }),
      };
    });
    items.push(...withState.filter((i) => state === 'all' || i.state === state));
    if (limit && items.length >= limit) break;
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result = limit ? items.slice(0, limit) : items;
  const handles = new Map(result.map((i) => [i.author, null]));
  await Promise.all([...handles.keys()].map(async (did) => handles.set(did, await handleOf(did))));
  for (const item of result) item.authorHandle = handles.get(item.author);
  return result;
}

export function isIdOf(ref, uri) {
  return uri === ref || uri.split('/').pop() === ref;
}

// A website number ("#12") becomes the item's at:// address; other refs are kept.
export async function expandNumber(kind, repoDid, ref) {
  const number = parseNumber(ref);
  if (number === undefined) return ref;
  const uri = await uriForNumber(repoDid, kind, number);
  if (!uri) throw notFound(kind, `#${number}`);
  return uri;
}

// Finds one item by its id (the last part of its address), its full at:// address,
// or its number on the website ("#12").
export async function findById(kind, account, repoDid, ref) {
  const wanted = await expandNumber(kind, repoDid, ref);
  const [found] = await loadItems(kind, account, repoDid, { limit: 1, match: (uri) => isIdOf(wanted, uri) });
  if (found) return found;
  throw notFound(kind, ref);
}

export function notFound(kind, ref) {
  return new TglError(kind === 'pull'
    ? t(`No PR "${ref}" in this repository. See them with "tgl pr list".`, `No encuentro ninguna PR "${ref}" en este repositorio. Míralas con "tgl pr list".`)
    : t(`No issue "${ref}" in this repository. See them with "tgl issue list".`, `No encuentro ninguna issue "${ref}" en este repositorio. Míralas con "tgl issue list".`));
}
