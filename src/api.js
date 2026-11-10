// Tangled's public read API ("bobbin", https://tangled.org/docs/api/bobbin/). It indexes
// every repo's issues, PRs, comments, labels and files, and needs no login.
import { xrpcQuery } from './atproto.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';

export const API = 'https://api.tangled.org';
const MAX_PAGE = 1000;

export function apiQuery(nsid, params) {
  return xrpcQuery(API, nsid, params);
}

// A query for something that may not exist: null instead of a "not found" error.
export async function apiFind(nsid, params) {
  try {
    return await apiQuery(nsid, params);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Every item of a paged list, in the order the API gives them; `limit` stops early (0 = all).
export async function apiList(nsid, params, { limit = 0 } = {}) {
  const items = [];
  let cursor;
  do {
    const size = limit ? Math.min(limit - items.length, MAX_PAGE) : MAX_PAGE;
    const page = await apiQuery(nsid, { ...params, limit: size, cursor });
    items.push(...page.items);
    cursor = page.items.length && (!limit || items.length < limit) ? page.cursor : undefined;
  } while (cursor);
  return items;
}

// A query that answers with plain text instead of JSON.
export async function apiText(nsid, params) {
  const res = await fetch(`${API}/xrpc/${nsid}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new TglError(t(`Tangled could not answer ${nsid} (HTTP ${res.status}).`, `Tangled no ha podido responder a ${nsid} (HTTP ${res.status}).`));
  return res.text();
}
