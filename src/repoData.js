// Loads a repo's PRs or issues from every account, with their current state.
import { handleOf, mapLimit } from './atproto.js';
import { recordsLinkingTo } from './backlinks.js';
import { TglError } from './errors.js';
import { authorOf, ISSUE_STATES, latestState, NSID, PULL_STATES, TANGLED_DID } from './tangled.js';

// How each kind of record points at its repo, oldest formats included:
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
async function repoPeople(account, repoDid) {
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

// Old PR records kept the branch and patch in other fields.
// Some very old records also lack a creation date.
function normalize(kind, value) {
  value = { ...value, createdAt: value.createdAt || '' };
  if (kind !== 'pull' || value.target) return value;
  return { ...value, target: { repo: value.targetRepo, branch: value.targetBranch } };
}

export async function loadItems(kind, account, repoDid) {
  const k = KINDS[kind];
  const { recordUris, editors } = await repoPeople(account, repoDid);
  const links = [
    ...k.paths.did.map((path) => ({ target: repoDid, path })),
    ...recordUris.flatMap((target) => k.paths.uri.map((path) => ({ target, path }))),
  ];
  const records = await recordsLinkingTo({ account, collection: k.collection, links });
  const handles = new Map();
  const items = await mapLimit(records, 12, async (r) => {
    const author = authorOf(r.uri);
    const states = await recordsLinkingTo({ account, collection: k.stateCollection, links: [{ target: r.uri, path: k.subjectPath }] });
    if (!handles.has(author)) handles.set(author, handleOf(author));
    return {
      ...normalize(kind, r.value),
      uri: r.uri,
      rkey: r.uri.split('/').pop(),
      author,
      state: latestState(states, { field: k.stateField, known: k.known, allowed: new Set([author, ...editors]) }),
    };
  });
  for (const item of items) item.authorHandle = await handles.get(item.author);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Finds an item by its id (the last part of its address) or its full at:// address.
export function pickById(items, ref, what) {
  const found = items.find((i) => i.rkey === ref || i.uri === ref);
  if (!found) throw new TglError(`No encuentro ${what} "${ref}" en este repositorio. Mira los ids con "tgl ${what === 'la PR' ? 'pr' : 'issue'} list".`);
  return found;
}
