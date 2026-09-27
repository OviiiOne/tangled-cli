// Minimal AT Protocol client: identity resolution and authenticated XRPC calls.
import { TglError } from './errors.js';
import { t } from './i18n.js';

const PLC_DIRECTORY = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';
// Slingshot (https://slingshot.microcosm.blue) is a public, read-only cache of AT
// Protocol records: much faster than asking each author's own server, which may be
// slow or down. Records are still checked against the author's server if it fails.
const SLINGSHOT = 'https://slingshot.microcosm.blue';

async function readJson(res, what) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new TglError(t(`${what}: unexpected server response (HTTP ${res.status}).`, `${what}: respuesta inesperada del servidor (HTTP ${res.status}).`));
  }
  if (!res.ok) {
    const detail = [data.error, data.message].filter(Boolean).join(': ');
    const err = new TglError(`${what}: ${detail || `HTTP ${res.status}`}`);
    err.status = res.status;
    err.xrpcError = data.error;
    throw err;
  }
  return data;
}

export async function resolveHandle(handle) {
  handle = handle.replace(/^@/, '').toLowerCase();
  try {
    const res = await fetch(`https://${handle}/.well-known/atproto-did`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const did = (await res.text()).trim();
      if (did.startsWith('did:')) return did;
    }
  } catch {
    // Fall through to the DNS-aware public resolver.
  }
  const url = `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const data = await readJson(await fetch(url), t(`Could not find account "${handle}"`, `No se pudo encontrar la cuenta "${handle}"`));
  return data.did;
}

export async function resolveDidDoc(did) {
  let url;
  if (did.startsWith('did:plc:')) url = `${PLC_DIRECTORY}/${did}`;
  else if (did.startsWith('did:web:')) url = `https://${did.slice('did:web:'.length)}/.well-known/did.json`;
  else throw new TglError(t(`Unsupported identifier: ${did}`, `Identificador no soportado: ${did}`));
  return readJson(await fetch(url, { signal: AbortSignal.timeout(15_000) }), t(`Could not resolve ${did}`, `No se pudo resolver ${did}`));
}

// The "PDS" is the server that stores an account's records (for repos: their knot).
export async function resolvePds(did) {
  const doc = await resolveDidDoc(did);
  const service = doc.service?.find((s) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`);
  if (!service) throw new TglError(t(`${did} declares no data server (PDS).`, `${did} no tiene servidor de datos (PDS) declarado.`));
  return service.serviceEndpoint.replace(/\/$/, '');
}

export async function xrpcQuery(host, nsid, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
  // Other people's servers can hang; don't let one stall the whole command.
  return readJson(await fetch(`${host}/xrpc/${nsid}?${qs}`, { signal: AbortSignal.timeout(15_000) }), nsid);
}

// Lists every record of a collection, following pagination.
export async function listAllRecords(pds, repo, collection) {
  const records = [];
  let cursor;
  do {
    const page = await xrpcQuery(pds, 'com.atproto.repo.listRecords', { repo, collection, limit: 100, cursor });
    records.push(...page.records);
    cursor = page.records.length ? page.cursor : undefined;
  } while (cursor);
  return records;
}

const pdsCache = new Map();

function cachedPds(did) {
  if (!pdsCache.has(did)) pdsCache.set(did, resolvePds(did));
  return pdsCache.get(did);
}

// Fetches one record by its at:// address; null if it was deleted.
export async function getRecord(uri) {
  const [did, collection, rkey] = uri.replace('at://', '').split('/');
  const params = { repo: did, collection, rkey };
  for (const host of [SLINGSHOT, null]) {
    try {
      const data = await xrpcQuery(host ?? await cachedPds(did), 'com.atproto.repo.getRecord', params);
      return { uri, cid: data.cid, value: data.value };
    } catch (err) {
      if (host === null) {
        if (err.xrpcError === 'RecordNotFound') return null;
        throw err;
      }
      // Any cache failure (including "not found", which may just be stale): ask the author's server.
    }
  }
}

// Downloads a file (blob) attached to one of `did`'s records.
export async function fetchBlob(did, blob) {
  const qs = new URLSearchParams({ did, cid: blob.ref.$link });
  const res = await fetch(`${await cachedPds(did)}/xrpc/com.atproto.sync.getBlob?${qs}`);
  if (!res.ok) throw new TglError(t(`Could not download the attached file (HTTP ${res.status}).`, `No se pudo descargar el archivo adjunto (HTTP ${res.status}).`));
  return Buffer.from(await res.arrayBuffer());
}

// Public handle of an account, or its DID if it has none.
export async function handleOf(did) {
  try {
    const aka = (await resolveDidDoc(did)).alsoKnownAs?.find((a) => a.startsWith('at://'));
    return aka ? aka.slice('at://'.length) : did;
  } catch {
    return did;
  }
}

// Runs fn over items with at most `limit` requests in flight.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class Session {
  constructor(pds, data) {
    this.pds = pds;
    this.did = data.did;
    this.handle = data.handle;
    this.accessJwt = data.accessJwt;
  }

  static async login(pds, identifier, password) {
    const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    try {
      return new Session(pds, await readJson(res, t('Login', 'Inicio de sesión')));
    } catch (err) {
      if (err.status === 401) {
        throw new TglError(t(
          'Wrong account or app password. Run "tgl auth login" again.',
          'La cuenta o la contraseña de aplicación no son correctas. Vuelve a ejecutar "tgl auth login".',
        ));
      }
      throw err;
    }
  }

  async procedure(nsid, body, { contentType = 'application/json' } = {}) {
    const res = await fetch(`${this.pds}/xrpc/${nsid}`, {
      method: 'POST',
      headers: { 'content-type': contentType, authorization: `Bearer ${this.accessJwt}` },
      body: contentType === 'application/json' ? JSON.stringify(body) : body,
    });
    return readJson(res, nsid);
  }

  async uploadBlob(bytes, mimeType) {
    const data = await this.procedure('com.atproto.repo.uploadBlob', bytes, { contentType: mimeType });
    return data.blob;
  }

  async createRecord(collection, record) {
    return this.procedure('com.atproto.repo.createRecord', { repo: this.did, collection, record });
  }

  // One of this account's records, read from its own server (never a cache) so an
  // edit starts from the latest version.
  async getOwnRecord(uri) {
    const [, collection, rkey] = uri.replace('at://', '').split('/');
    const data = await xrpcQuery(this.pds, 'com.atproto.repo.getRecord', { repo: this.did, collection, rkey });
    return { uri, cid: data.cid, value: data.value };
  }

  // Replaces a record only if it is still the version read (`swapRecord` = its cid),
  // so a change made meanwhile elsewhere is never overwritten.
  async putRecord({ uri, cid }, record) {
    const [, collection, rkey] = uri.replace('at://', '').split('/');
    return this.procedure('com.atproto.repo.putRecord', { repo: this.did, collection, rkey, record, swapRecord: cid });
  }

  // Calls a procedure on another service (e.g. a Tangled knot) as this account, with a
  // short-lived token from the account's server that only allows that one method.
  async callService(host, nsid, body) {
    const qs = new URLSearchParams({ aud: `did:web:${new URL(host).host}`, lxm: nsid, exp: String(Math.floor(Date.now() / 1000) + 60) });
    const res = await fetch(`${this.pds}/xrpc/com.atproto.server.getServiceAuth?${qs}`, {
      headers: { authorization: `Bearer ${this.accessJwt}` },
    });
    const { token } = await readJson(res, 'com.atproto.server.getServiceAuth');
    const call = await fetch(`${host}/xrpc/${nsid}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return readJson(call, nsid);
  }
}
