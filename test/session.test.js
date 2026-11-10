import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/atproto.js';

const pds = 'https://pds.test';
const saved = { accessJwt: 'old-access', refreshJwt: 'old-refresh' };
const json = (status, body) => new Response(JSON.stringify(body), { status });

// Runs `Session.resume` against fake server answers, one per method, and lists the calls.
async function resumeWith(answers) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const nsid = url.split('/xrpc/')[1];
    calls.push({ nsid, auth: init.headers.authorization });
    if (answers[nsid] instanceof Error) throw answers[nsid];
    return answers[nsid];
  };
  try {
    return { session: await Session.resume(pds, saved), calls };
  } finally {
    globalThis.fetch = original;
  }
}

test('a session the server still accepts is used as it is', async () => {
  const { session, calls } = await resumeWith({ 'com.atproto.server.getSession': json(200, { did: 'did:plc:a', handle: 'a.test' }) });
  assert.deepEqual(calls, [{ nsid: 'com.atproto.server.getSession', auth: 'Bearer old-access' }]);
  assert.equal(session.did, 'did:plc:a');
  assert.deepEqual(session.tokens, saved);
});

test('an expired session is renewed with its refresh token', async () => {
  const { session, calls } = await resumeWith({
    'com.atproto.server.getSession': json(400, { error: 'ExpiredToken' }),
    'com.atproto.server.refreshSession': json(200, { did: 'did:plc:a', handle: 'a.test', accessJwt: 'new-access', refreshJwt: 'new-refresh' }),
  });
  assert.equal(calls[1].auth, 'Bearer old-refresh');
  assert.deepEqual(session.tokens, { accessJwt: 'new-access', refreshJwt: 'new-refresh' });
});

test('a session that cannot be renewed asks for a new login', async () => {
  const { session } = await resumeWith({
    'com.atproto.server.getSession': json(401, {}),
    'com.atproto.server.refreshSession': json(401, {}),
  });
  assert.equal(session, null);
});

test('a network failure asks for a new login instead of crashing', async () => {
  const { session } = await resumeWith({ 'com.atproto.server.getSession': new Error('offline') });
  assert.equal(session, null);
});
