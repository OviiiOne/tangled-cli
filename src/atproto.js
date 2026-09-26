// Minimal AT Protocol client: identity resolution and authenticated XRPC calls.
import { TglError } from './errors.js';

const PLC_DIRECTORY = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';

async function readJson(res, what) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new TglError(`${what}: respuesta inesperada del servidor (HTTP ${res.status}).`);
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
    const res = await fetch(`https://${handle}/.well-known/atproto-did`);
    if (res.ok) {
      const did = (await res.text()).trim();
      if (did.startsWith('did:')) return did;
    }
  } catch {
    // Fall through to the DNS-aware public resolver.
  }
  const url = `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const data = await readJson(await fetch(url), `No se pudo encontrar la cuenta "${handle}"`);
  return data.did;
}

export async function resolveDidDoc(did) {
  let url;
  if (did.startsWith('did:plc:')) url = `${PLC_DIRECTORY}/${did}`;
  else if (did.startsWith('did:web:')) url = `https://${did.slice('did:web:'.length)}/.well-known/did.json`;
  else throw new TglError(`Identificador no soportado: ${did}`);
  return readJson(await fetch(url), `No se pudo resolver ${did}`);
}

// The "PDS" is the server that stores an account's records (for repos: their knot).
export async function resolvePds(did) {
  const doc = await resolveDidDoc(did);
  const service = doc.service?.find((s) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`);
  if (!service) throw new TglError(`${did} no tiene servidor de datos (PDS) declarado.`);
  return service.serviceEndpoint.replace(/\/$/, '');
}

export async function xrpcQuery(host, nsid, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
  return readJson(await fetch(`${host}/xrpc/${nsid}?${qs}`), nsid);
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
      return new Session(pds, await readJson(res, 'Inicio de sesión'));
    } catch (err) {
      if (err.status === 401) {
        throw new TglError('La cuenta o la contraseña de aplicación no son correctas. Vuelve a ejecutar "tgl auth login".');
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
}
