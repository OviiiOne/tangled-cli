// Finds records written by *any* account that point at something (a repo, an
// issue, a PR). Each account keeps its own records, so this needs a public index:
// Constellation (https://constellation.microcosm.blue), a community AT Protocol
// service. It is read-only and never sees credentials. If it is down, results
// fall back to the logged-in account's own records, with a warning.
import { getRecord, listAllRecords, mapLimit } from './atproto.js';
import { t } from './i18n.js';

const CONSTELLATION = 'https://constellation.microcosm.blue';

let warned = false;
function warnIndexDown(err) {
  if (warned) return;
  warned = true;
  console.error(t(
    `Warning: the public index (Constellation) is not responding (${err.message}).\nOnly records in your own account are shown; other people's may be missing.\n`,
    `Aviso: el índice público (Constellation) no responde (${err.message}).\nSolo se muestran los registros de tu cuenta; puede faltar lo de otras personas.\n`,
  ));
}

// Pages of at:// addresses, newest first (Constellation's order).
async function* indexedUriPages(target, collection, path) {
  let cursor;
  do {
    const qs = new URLSearchParams({ target, collection, path, limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    const res = await fetch(`${CONSTELLATION}/links?${qs}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    yield page.linking_records.map((r) => `at://${r.did}/${r.collection}/${r.rkey}`);
    cursor = page.cursor;
  } while (cursor);
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

let unreachable = 0;

// Records of `collection` whose field at `path` (e.g. ".target.repo") equals `target`,
// yielded in batches so callers can stop early. The account's own records come first,
// then everyone's, newest first. `links` may list several {target, path} pairs:
// Tangled's record formats changed over time, so old and new records point at the
// same thing in different ways (the newest format should be listed first).
export async function* linkedRecordBatches({ account, collection, links }) {
  const matches = (value) => links.some(({ target, path }) => valueAt(value, path) === target);
  const own = (await ownRecords(account, collection)).filter((r) => matches(r.value));
  if (own.length) yield own;
  const seen = new Set(own.map((r) => r.uri));
  try {
    for (const { target, path } of links) {
      for await (const page of indexedUriPages(target, collection, path)) {
        const uris = page.filter((u) => !seen.has(u));
        uris.forEach((u) => seen.add(u));
        // Each record lives on its author's server; one being down must not hide the rest.
        const records = await mapLimit(uris, 16, (uri) => getRecord(uri).catch(() => {
          unreachable += 1;
          return null;
        }));
        const found = records.filter((r) => r && matches(r.value));
        if (found.length) yield found;
      }
    }
  } catch (err) {
    warnIndexDown(err);
  }
}

export async function recordsLinkingTo(query) {
  const all = [];
  for await (const batch of linkedRecordBatches(query)) all.push(...batch);
  return all;
}

// Call once at the end of a command that read other people's records.
export function reportUnreachable() {
  if (unreachable) {
    console.error(t(
      `\nWarning: ${unreachable} record(s) could not be read because their author's server did not respond.`,
      `\nAviso: ${unreachable} registro(s) no se pudieron leer porque el servidor de su autor no respondió.`,
    ));
  }
}
