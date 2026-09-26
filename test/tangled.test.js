import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPullRecord, buildStatusRecord, pullStates, PULL_STATES } from '../src/tangled.js';

const now = new Date('2026-09-26T10:00:00Z');

test('pull record matches the shape Tangled writes', () => {
  const blob = { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'application/gzip', size: 10 };
  const r = buildPullRecord({ repoDid: 'did:plc:repo', title: 'T', body: 'B', base: 'master', head: 'feat', patchBlob: blob, now });
  assert.deepEqual(r, {
    $type: 'sh.tangled.repo.pull',
    title: 'T',
    body: 'B',
    target: { repo: 'did:plc:repo', repoDid: 'did:plc:repo', branch: 'master' },
    source: { branch: 'feat' },
    rounds: [{ createdAt: now.toISOString(), patchBlob: blob }],
    createdAt: now.toISOString(),
  });
});

test('body is omitted when empty', () => {
  const r = buildPullRecord({ repoDid: 'd', title: 'T', base: 'm', head: 'h', patchBlob: {}, now });
  assert.equal('body' in r, false);
});

test('status record', () => {
  assert.deepEqual(buildStatusRecord({ pullUri: 'at://x', state: 'merged', now }), {
    $type: 'sh.tangled.repo.pull.status',
    pull: 'at://x',
    status: PULL_STATES.merged,
    createdAt: now.toISOString(),
  });
});

test('pull state is the newest status record, open by default', () => {
  const stateOf = pullStates([
    { value: { pull: 'a', status: PULL_STATES.closed, createdAt: '2026-01-02T00:00:00Z' } },
    { value: { pull: 'a', status: PULL_STATES.open, createdAt: '2026-01-01T00:00:00Z' } },
    { value: { pull: 'b', status: PULL_STATES.merged, createdAt: '2026-01-01T00:00:00Z' } },
  ]);
  assert.equal(stateOf('a'), 'closed');
  assert.equal(stateOf('b'), 'merged');
  assert.equal(stateOf('c'), 'open');
});
