import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactRecord, buildAttestationRecord, buildCommentRecord, buildDeclarationRecord, buildTicketRecord, closingRefs, commentFromView,
  commentText, editTicketText, linkClosingRefs, parseNumber, parseTicketRef, repoNameProblem, ticketFromView, ticketUri,
} from '../src/tangled.js';

const now = new Date('2026-11-10T10:00:00Z');
const inline = (text) => ({ $type: 'org.tangled.markup.markdown#inline', text });
const markdown = (text) => ({ $type: 'org.tangled.markup.markdown', text });

test('a PR is a ticket with a target branch', () => {
  assert.deepEqual(buildTicketRecord({ title: 'T', body: 'B', targetBranch: 'master', now }), {
    $type: 'org.tangled.track.ticket', title: inline('T'), body: markdown('B'), state: 'open', targetBranch: 'master', createdAt: now.toISOString(),
  });
});

test('an issue has no target branch, and a blank body is left out', () => {
  const r = buildTicketRecord({ title: 'T', body: '  ', now });
  assert.equal('body' in r, false);
  assert.equal('targetBranch' in r, false);
});

test('editing changes only what is given', () => {
  const value = { title: inline('Old'), body: markdown('Old'), state: 'open' };
  assert.deepEqual(editTicketText(value, { title: 'New' }), { title: inline('New'), body: markdown('Old'), state: 'open' });
  assert.deepEqual(editTicketText(value, { body: 'New' }), { title: inline('Old'), body: markdown('New'), state: 'open' });
  assert.equal('body' in editTicketText(value, { body: '' }), false);
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
    state: 'merged', labels: ['area:knot'], assignees: ['did:plc:b'], commentCount: undefined, stateUpdatedAt: undefined, target: { branch: 'master' },
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

test('a release file points at the annotated tag by its hash', () => {
  const r = buildArtifactRecord({ name: 'a.xpi', tagHash: '71a54b0b3ef0e0af9de7d32dee444dc875b5b430', blob: { size: 1 }, now });
  assert.deepEqual(r, {
    $type: 'org.tangled.repo.artifact',
    subject: { $type: 'org.tangled.git.oid', oid: '71a54b0b3ef0e0af9de7d32dee444dc875b5b430' },
    name: 'a.xpi',
    artifact: { size: 1 },
    createdAt: now.toISOString(),
  });
});

test('comments point at the exact version of their subject', () => {
  const r = buildCommentRecord({ subject: { uri: 'at://r/org.tangled.track.ticket/1', cid: 'bafy', value: {} }, body: 'Hi', now });
  assert.deepEqual(r, {
    $type: 'org.tangled.feed.comment',
    subject: { $type: 'com.atproto.repo.strongRef', uri: 'at://r/org.tangled.track.ticket/1', cid: 'bafy' },
    body: markdown('Hi'),
    createdAt: now.toISOString(),
  });
  assert.equal(commentText(r), 'Hi');
});

test('an attestation names the record and the change behind it', () => {
  assert.deepEqual(buildAttestationRecord({ uri: 'at://r/c/1', cid: 'bafy', 'x-tngl-change': 'abc' }, now), {
    $type: 'org.tangled.graph.attestation', subject: { uri: 'at://r/c/1', cid: 'bafy' }, change: 'abc', createdAt: now.toISOString(),
  });
  assert.equal('change' in buildAttestationRecord({ uri: 'u', cid: 'c' }, now), false);
});

test('a declaration points at the repo', () => {
  assert.deepEqual(buildDeclarationRecord({ repoDid: 'did:plc:new', now }), { $type: 'org.tangled.repo.declaration', repo: 'did:plc:new', createdAt: now.toISOString() });
});

test('closing keywords find issue numbers, links and addresses', () => {
  const text = [
    'Fixes #12 and closes: #3.',
    'Resolves https://tangled.org/alice.dev/app/issues/7',
    'fixed tangled.org/did:plc:repo/issues/8)',
    'Closes at://did:plc:a/org.tangled.track.ticket/3abc',
    'This fixes the bug; see #99. Prefixes #5 do not count.',
  ].join('\n');
  assert.deepEqual(closingRefs(text), [
    { number: 12 },
    { number: 3 },
    { number: 7, repo: 'alice.dev/app' },
    { number: 8, repo: 'did:plc:repo' },
    { uri: 'at://did:plc:a/org.tangled.track.ticket/3abc' },
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

test('a closing number that is a PR stays as text', () => {
  assert.equal(linkClosingRefs('Fixes #1, closes #2', 'did:plc:r', (n) => n !== 2), 'Fixes [#1](https://tangled.org/did:plc:r/issues/1), closes #2');
});

test('repo names follow the website rules', () => {
  assert.equal(repoNameProblem('tangled-cli'), null);
  assert.equal(repoNameProblem('a.b_c'), null);
  for (const bad of ['', 'a/b', '.hidden', 'end.', 'a..b', 'spa ce', 'ñ', 'self', 'SELF']) assert.notEqual(repoNameProblem(bad), null, bad);
});
