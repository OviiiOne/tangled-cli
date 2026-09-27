import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelDefinitionRecord, buildLabelOpRecord, foldLabelOps } from '../src/labels.js';

const def = (name, extra = {}) => ({ uri: `at://did:plc:t/sh.tangled.label.definition/${name}`, name, ...extra });
const bug = def('bug', { valueType: { type: 'null' } });
const area = def('area', { valueType: { type: 'string' }, scope: ['sh.tangled.repo.issue'] });
const assignee = def('assignee', { multiple: true, valueType: { type: 'string', format: 'did' } });
const defs = [bug, area, assignee];

let n = 0;
const op = (did, at, add = [], del = []) => ({
  uri: `at://${did}/sh.tangled.label.op/${String(n++).padStart(4, '0')}`,
  value: { performedAt: at, add: add.map(([d, value]) => ({ key: d.uri, value })), delete: del.map(([d, value]) => ({ key: d.uri, value })) },
});

test('label ops replay in date order', () => {
  const ops = [
    op('did:plc:a', '2026-01-02T00:00:00Z', [], [[bug, 'null']]),
    op('did:plc:a', '2026-01-01T00:00:00Z', [[bug, 'null'], [area, 'appview']]),
    op('did:plc:a', '2026-01-03T00:00:00Z', [[area, 'knot']]),
  ];
  const state = foldLabelOps(ops, defs, { subjectCollection: 'sh.tangled.repo.issue' });
  assert.equal(state.has(bug.uri), false);
  assert.deepEqual([...state.get(area.uri)], ['knot']);
});

test('multi-value labels keep every value; outsiders and out-of-scope ops are skipped', () => {
  const ops = [
    op('did:plc:a', '2026-01-01T00:00:00Z', [[assignee, 'did:plc:x'], [assignee, 'did:plc:y']]),
    op('did:plc:a', '2026-01-02T00:00:00Z', [], [[assignee, 'did:plc:x']]),
    op('did:plc:stranger', '2026-01-03T00:00:00Z', [[bug, 'null']]),
    op('did:plc:a', '2026-01-04T00:00:00Z', [[area, 'appview']]),
  ];
  const state = foldLabelOps(ops, defs, { subjectCollection: 'sh.tangled.repo.pull', allowed: new Set(['did:plc:a']) });
  assert.deepEqual([...state.get(assignee.uri)], ['did:plc:y']);
  assert.equal(state.has(bug.uri), false);
  assert.equal(state.has(area.uri), false);
});

test('label op record', () => {
  const now = new Date('2026-09-27T10:00:00Z');
  const r = buildLabelOpRecord({ subjectUri: 'at://did:plc:a/sh.tangled.repo.issue/1', add: [{ key: bug.uri, value: 'null' }], remove: [], now });
  assert.deepEqual(r, {
    $type: 'sh.tangled.label.op',
    subject: 'at://did:plc:a/sh.tangled.repo.issue/1',
    add: [{ key: bug.uri, value: 'null' }],
    delete: [],
    performedAt: now.toISOString(),
  });
});

test('label definitions follow the website rules', () => {
  const now = new Date('2026-09-27T10:00:00Z');
  assert.deepEqual(buildLabelDefinitionRecord({ name: 'bug', color: '#e1d', now }), {
    $type: 'sh.tangled.label.definition',
    name: 'bug',
    valueType: { type: 'null', format: 'any' },
    scope: ['sh.tangled.repo.issue', 'sh.tangled.repo.pull'],
    multiple: false,
    color: '#EE11DD',
    createdAt: now.toISOString(),
  });
  const priority = buildLabelDefinitionRecord({ name: 'priority', values: ['high', 'low'], scope: 'issues', now });
  assert.deepEqual(priority.valueType, { type: 'string', format: 'any', enum: ['high', 'low'] });
  assert.deepEqual(priority.scope, ['sh.tangled.repo.issue']);
  assert.equal(buildLabelDefinitionRecord({ name: 'reviewer', kind: 'person', multiple: true, now }).valueType.format, 'did');
  for (const bad of [{ name: '-x' }, { name: 'a b' }, { name: 'x', multiple: true }, { name: 'x', color: 'red' }, { name: 'x', scope: 'all' }, { name: 'x', kind: 'person', values: ['a'] }]) {
    assert.throws(() => buildLabelDefinitionRecord(bad), undefined, JSON.stringify(bad));
  }
});
