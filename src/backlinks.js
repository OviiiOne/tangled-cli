// Finds records written by *any* account that point at something (a repo, an
// issue, a PR). Each account keeps its own records, so this needs a public index:
// Constellation (https://constellation.microcosm.blue), a community AT Protocol
// service. It is read-only and never sees credentials. If it is down, results
// fall back to the logged-in account's own records, with a warning.
import { getRecord, listAllRecords, mapLimit } from './atproto.js';

const CONSTELLATION = 'https://constellation.microcosm.blue';

let warned = false;
function warnIndexDown(err) {
  if (warned) return;
  warned = true;
  console.error(`Aviso: el índice público (Constellation) no responde (${err.message}).`);
  console.error('Solo se muestran los registros de tu cuenta; puede faltar lo de otras personas.\n');
}

async function indexedUris(target, collection, path) {
  const uris = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ target, collection, path, limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    const res = await fetch(`${CONSTELLATION}/links?${qs}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    for (const r of page.linking_records) uris.push(`at://${r.did}/${r.collection}/${r.rkey}`);
    cursor = page.cursor;
  } while (cursor);
  return uris;
}

function valueAt(value, path) {
  return path.split('.').filter(Boolean).reduce((v, key) => v?.[key], value);
}

// The account's own records are listed directly: the index can lag a few seconds
// behind, and this keeps the tool working for the account's own data without it.
const ownCache = new Map();
function ownRecords(account, collection) {
  const key = `${account.did} ${collection}`;
  if (!ownCache.has(key)) ownCache.set(key, listAllRecords(account.pds, account.did, collection));
  return ownCache.get(key);
}

// Records of `collection` whose field at `path` (e.g. ".target.repo") equals `target`.
// `links` may list several {target, path} pairs: Tangled's record formats changed
// over time, so old and new records point at the same thing in different ways.
export async function recordsLinkingTo({ account, collection, links }) {
  const matches = (value) => links.some(({ target, path }) => valueAt(value, path) === target);
  const own = (await ownRecords(account, collection)).filter((r) => matches(r.value));
  const seen = new Set(own.map((r) => r.uri));
  const uris = new Set();
  try {
    for (const { target, path } of links) {
      for (const uri of await indexedUris(target, collection, path)) if (!seen.has(uri)) uris.add(uri);
    }
  } catch (err) {
    warnIndexDown(err);
  }
  // Each record lives on its author's own server; one being down must not hide the rest.
  const others = await mapLimit([...uris], 12, (uri) => getRecord(uri).catch(() => {
    unreachable += 1;
    return null;
  }));
  return [...own, ...others.filter((r) => r && matches(r.value))];
}

let unreachable = 0;

// Call once at the end of a command that read other people's records.
export function reportUnreachable() {
  if (unreachable) {
    console.error(`\nAviso: ${unreachable} registro(s) no se pudieron leer porque el servidor de su autor no respondió.`);
  }
}
