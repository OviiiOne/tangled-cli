import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactRecord, buildCommentRecord, buildIssueRecord, commentText, buildIssueStateRecord, buildPullRecord, buildStatusRecord,
  ISSUE_STATES, latestState, PULL_STATES, tagHashFromRecord,
} from '../src/tangled.js';

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

test('state is the newest record by an allowed author, open by default', () => {
  const rec = (did, status, createdAt) => ({ uri: `at://${did}/sh.tangled.repo.pull.status/x`, value: { status, createdAt } });
  const opts = { field: 'status', known: PULL_STATES, allowed: new Set(['did:author', 'did:owner']) };
  assert.equal(latestState([], opts), 'open');
  assert.equal(latestState([
    rec('did:author', PULL_STATES.closed, '2026-01-02T00:00:00Z'),
    rec('did:owner', PULL_STATES.merged, '2026-01-03T00:00:00Z'),
    rec('did:author', PULL_STATES.open, '2026-01-01T00:00:00Z'),
  ], opts), 'merged');
  // Tangled ignores state changes from strangers, so must we.
  assert.equal(latestState([rec('did:stranger', PULL_STATES.closed, '2026-01-09T00:00:00Z')], opts), 'open');
});

test('issue records', () => {
  assert.deepEqual(buildIssueRecord({ repoDid: 'did:plc:repo', title: 'T', body: 'B', now }), {
    $type: 'sh.tangled.repo.issue', repo: 'did:plc:repo', title: 'T', body: 'B', createdAt: now.toISOString(),
  });
  assert.equal(buildIssueStateRecord({ issueUri: 'at://i', state: 'closed', now }).state, ISSUE_STATES.closed);
});

test('artifact tag is the annotated tag hash as unpadded base64 bytes', () => {
  // Real values from an artifact the Tangled website created for NewsPal v2.4.0.
  const r = buildArtifactRecord({ repoDid: 'did:plc:repo', name: 'a.xpi', tagHash: '71a54b0b3ef0e0af9de7d32dee444dc875b5b430', blob: {}, now });
  assert.deepEqual(r.tag, { $bytes: 'caVLCz7w4K+d59Mt7kRNyHW1tDA' });
  assert.equal(tagHashFromRecord(r), '71a54b0b3ef0e0af9de7d32dee444dc875b5b430');
  assert.equal(r.$type, 'sh.tangled.repo.artifact');
  assert.equal(r.repoDid, 'did:plc:repo');
});

test('comments use the shared feed.comment format with a strong reference', () => {
  const r = buildCommentRecord({ subject: { uri: 'at://did:x/sh.tangled.repo.pull/1', cid: 'bafy', extra: 1 }, body: 'Hi', pullRoundIdx: 0, now });
  assert.deepEqual(r, {
    $type: 'sh.tangled.feed.comment',
    subject: { uri: 'at://did:x/sh.tangled.repo.pull/1', cid: 'bafy' },
    body: { $type: 'sh.tangled.markup.markdown', text: 'Hi', original: 'Hi' },
    createdAt: now.toISOString(),
    pullRoundIdx: 0,
  });
  assert.equal(commentText(r), 'Hi');
  assert.equal(commentText({ body: 'old plain text' }), 'old plain text');
});
