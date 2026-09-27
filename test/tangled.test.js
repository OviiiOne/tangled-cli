import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactRecord, buildCommentRecord, buildIssueRecord, commentText, buildIssueStateRecord, buildPullRecord, buildStatusRecord,
  buildRepoRecord, closingRefs, ISSUE_STATES, latestState, linkClosingRefs, parseNumber, PULL_STATES, repoNameProblem, tagHashFromRecord,
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

test('closing keywords find issue numbers, links and addresses', () => {
  const text = [
    'Fixes #12 and closes: #3.',
    'Resolves https://tangled.org/alice.dev/app/issues/7',
    'fixed tangled.org/did:plc:repo/issues/8)',
    'Closes at://did:plc:a/sh.tangled.repo.issue/3abc',
    'This fixes the bug; see #99. Prefixes #5 do not count.',
  ].join('\n');
  assert.deepEqual(closingRefs(text), [
    { number: 12 },
    { number: 3 },
    { number: 7, repo: 'alice.dev/app' },
    { number: 8, repo: 'did:plc:repo' },
    { uri: 'at://did:plc:a/sh.tangled.repo.issue/3abc' },
  ]);
});

test('website numbers', () => {
  assert.equal(parseNumber('#12'), 12);
  assert.equal(parseNumber('7'), 7);
  assert.equal(parseNumber('3mfq2kx7abcd2'), undefined);
  assert.equal(parseNumber(undefined), undefined);
});

test('closing numbers become links to the issue, and are still read back', () => {
  const linked = linkClosingRefs('Fixes #1, closes: #2. See #3.', 'did:plc:repo');
  assert.equal(linked, 'Fixes [#1](https://tangled.org/did:plc:repo/issues/1), closes: [#2](https://tangled.org/did:plc:repo/issues/2). See #3.');
  assert.equal(linkClosingRefs(linked, 'did:plc:repo'), linked);
  assert.deepEqual(closingRefs(linked), [{ number: 1, repo: 'did:plc:repo' }, { number: 2, repo: 'did:plc:repo' }]);
  assert.equal(linkClosingRefs(undefined, 'did:plc:repo'), undefined);
});

test('repo record matches the new-repo form', () => {
  const r = buildRepoRecord({ name: 'My-Tool', knot: 'knot1.tangled.sh', repoDid: 'did:plc:new', description: 'D', now });
  assert.equal(r.$type, 'sh.tangled.repo');
  assert.equal(r.name, 'My-Tool');
  assert.equal(r.description, 'D');
  assert.equal(r.spindle, undefined);
  assert.equal(r.labels.length, 5);
  assert.equal(buildRepoRecord({ name: 'tool', knot: 'k', repoDid: 'did:plc:x', now }).name, undefined);
});

test('repo names follow the website rules', () => {
  assert.equal(repoNameProblem('tangled-cli'), null);
  assert.equal(repoNameProblem('a.b_c'), null);
  for (const bad of ['', 'a/b', '.hidden', 'end.', 'a..b', 'spa ce', 'ñ']) assert.notEqual(repoNameProblem(bad), null, bad);
});
