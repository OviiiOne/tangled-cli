import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactRecord, buildCommentRecord, buildIssueRecord, commentFromView, commentText, buildIssueStateRecord, buildPullRecord, buildStatusRecord,
  buildRepoRecord, closingRefs, ISSUE_STATES, linkClosingRefs, parseNumber, parseTicketRef, PULL_STATES, repoNameProblem, tagHashFromRecord,
  ticketFromView, ticketUri,
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

test('a list item becomes a ticket', () => {
  const view = {
    author: 'did:plc:a', cid: 'bafy', state: 'completed', uri: 'at://did:plc:r/org.tangled.track.ticket/20',
    value: {
      title: { text: 'T' }, body: { text: 'B' }, createdAt: '2026-09-27T14:31:12Z', targetBranch: 'master',
      tangledLabels: [{ key: 'area:knot' }], assignees: ['did:plc:b'],
    },
  };
  assert.deepEqual(ticketFromView('pull', view), {
    uri: view.uri, cid: 'bafy', rkey: '20', author: 'did:plc:a', title: 'T', body: 'B', createdAt: '2026-09-27T14:31:12Z',
    state: 'merged', labels: ['area:knot'], assignees: ['did:plc:b'], target: { branch: 'master' },
  });
});

test('a ticket view has its fields at the top and the author as a profile', () => {
  const view = { author: { did: 'did:plc:a', handle: 'a.test' }, cid: 'c', state: 'open', uri: 'at://r/org.tangled.track.ticket/2', title: { text: 'T' }, createdAt: 'x' };
  const issue = ticketFromView('issue', view);
  assert.equal(issue.author, 'did:plc:a');
  assert.equal(issue.title, 'T');
  assert.equal(issue.body, undefined);
  assert.deepEqual(issue.labels, []);
  assert.equal('target' in issue, false);
});

test('a completed issue counts as closed', () => {
  assert.equal(ticketFromView('issue', { author: 'd', state: 'completed', uri: 'at://r/c/1', value: {} }).state, 'closed');
});

test('tickets are named by number, address or minted id, not by branch', () => {
  const repo = 'did:plc:r';
  assert.equal(parseTicketRef('#20', repo), '20');
  assert.equal(parseTicketRef('20', repo), '20');
  assert.equal(parseTicketRef(ticketUri(repo, '20'), repo), '20');
  assert.equal(parseTicketRef('3mwizalubuq2s', repo), '3mwizalubuq2s');
  assert.equal(parseTicketRef('feat/v0.4.0', repo), undefined);
  assert.equal(parseTicketRef('at://did:plc:other/org.tangled.track.ticket/20', repo), undefined);
});

test('a comment view names its author as its editor', () => {
  const view = { uri: 'at://r/org.tangled.feed.comment/x', editor: 'did:plc:a', body: { text: 'Hi' }, createdAt: 'x' };
  assert.deepEqual(commentFromView(view), { uri: view.uri, author: 'did:plc:a', body: 'Hi', createdAt: 'x' });
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
