// Minimal AT Protocol client: identity resolution and authenticated XRPC calls.
import { TglError } from './errors.js';
import { t } from './i18n.js';

const PLC_DIRECTORY = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';

async function readJson(res, what) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const err = new TglError(t(`${what}: unexpected server response (HTTP ${res.status}).`, `${what}: respuesta inesperada del servidor (HTTP ${res.status}).`));
    err.status = res.status;
    throw err;
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
    this.refreshJwt = data.refreshJwt;
  }

  // Picks up a saved session: as it is if the server still accepts it, or renewed if not.
  // Null when neither works, so the caller logs in again.
  static async resume(pds, { accessJwt, refreshJwt }) {
    const call = (method, nsid, token) => fetch(`${pds}/xrpc/${nsid}`, { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    try {
      const current = await call('GET', 'com.atproto.server.getSession', accessJwt);
      if (current.ok) return new Session(pds, { ...(await current.json()), accessJwt, refreshJwt });
      const renewed = await call('POST', 'com.atproto.server.refreshSession', refreshJwt);
      return renewed.ok ? new Session(pds, await renewed.json()) : null;
    } catch {
      return null;
    }
  }

  // Ends a saved session on the server, so its tokens stop working. Best effort.
  static async end(pds, { refreshJwt }) {
    await fetch(`${pds}/xrpc/com.atproto.server.deleteSession`, { method: 'POST', headers: { authorization: `Bearer ${refreshJwt}` }, signal: AbortSignal.timeout(15_000) }).catch(() => {});
  }

  get tokens() {
    return { accessJwt: this.accessJwt, refreshJwt: this.refreshJwt };
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
      // Servers cap logins per account.
      if (err.status === 429) {
        throw new TglError(t(
          'Your account\'s server refused the login: too many in a short time. Wait a few minutes and try again.',
          'El servidor de tu cuenta ha rechazado el inicio de sesión: demasiados en poco tiempo. Espera unos minutos y vuelve a probar.',
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

  async createRecord(collection, record, { rkey } = {}) {
    return this.procedure('com.atproto.repo.createRecord', { repo: this.did, collection, record, ...(rkey ? { rkey } : {}) });
  }

  // One of this account's records, or null if it has no such record.
  async findOwnRecord(collection, rkey) {
    try {
      return await xrpcQuery(this.pds, 'com.atproto.repo.getRecord', { repo: this.did, collection, rkey });
    } catch (err) {
      if (err.xrpcError === 'RecordNotFound' || err.status === 404) return null;
      throw err;
    }
  }

  // Calls a procedure on another service (e.g. a Tangled knot) as this account, with a
  // short-lived token from the account's server that only allows one method. `aud` is who
  // the token is for: the service itself unless it says otherwise.
  async callService(host, nsid, body, { aud = `did:web:${new URL(host).host}`, lxm = nsid, contentType = 'application/json' } = {}) {
    const qs = new URLSearchParams({ aud, lxm, exp: String(Math.floor(Date.now() / 1000) + 60) });
    const res = await fetch(`${this.pds}/xrpc/com.atproto.server.getServiceAuth?${qs}`, {
      headers: { authorization: `Bearer ${this.accessJwt}` },
    });
    const { token } = await readJson(res, 'com.atproto.server.getServiceAuth');
    const call = await fetch(`${host}/xrpc/${nsid}`, {
      method: 'POST',
      headers: { 'content-type': contentType, authorization: `Bearer ${token}` },
      body: contentType === 'application/json' ? JSON.stringify(body) : body,
    });
    return readJson(call, nsid);
  }
}
