import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLabelChanges, buildLabelDefinitionRecord, labelSlug, parseLabelArg } from '../src/labels.js';

const defs = [{ key: 'bug', name: 'bug' }, { key: 'area-knot', name: 'Area Knot' }];
const token = (key) => ({ $type: 'org.tangled.label.defs#labelToken', key });

test('labels are named by name or key, whatever the case', async () => {
  assert.deepEqual(await parseLabelArg('BUG', defs), { key: 'bug' });
  assert.deepEqual(await parseLabelArg('area knot', defs), { key: 'area-knot' });
  await assert.rejects(() => parseLabelArg('nope', defs));
});

test('assignee takes an account, except when removing everyone', async () => {
  assert.deepEqual(await parseLabelArg('assignee=did:plc:a', defs), { person: 'did:plc:a' });
  assert.deepEqual(await parseLabelArg('assignee', defs, { removing: true }), { person: null });
  await assert.rejects(() => parseLabelArg('assignee', defs));
});

test('label changes keep the rest of the ticket', () => {
  const value = { title: { text: 'T' }, tangledLabels: [{ key: 'bug' }], assignees: ['did:plc:a'] };
  assert.deepEqual(applyLabelChanges(value, { add: [{ key: 'area-knot' }, { person: 'did:plc:b' }], remove: [{ person: 'did:plc:a' }] }), {
    title: { text: 'T' }, tangledLabels: [token('bug'), token('area-knot')], assignees: ['did:plc:b'],
  });
});

test('empty label lists are left out of the record', () => {
  const value = { title: { text: 'T' }, tangledLabels: [{ key: 'bug' }], assignees: ['did:plc:a'] };
  assert.deepEqual(applyLabelChanges(value, { add: [], remove: [{ key: 'bug' }, { person: null }] }), { title: { text: 'T' } });
});

test('label slugs follow the website', () => {
  assert.equal(labelSlug('  Good First Issue! '), 'good-first-issue');
  assert.equal(labelSlug('v1.2_x~y'), 'v1.2_x~y');
});

test('label definitions', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  assert.deepEqual(buildLabelDefinitionRecord({ name: 'bug', color: '#e1d', now }), {
    $type: 'org.tangled.label.definition', name: 'bug', color: '#EE11DD', createdAt: now.toISOString(),
  });
  assert.equal(buildLabelDefinitionRecord({ name: 'bug', now }).color, '#64748B');
  for (const bad of [{ name: '' }, { name: '!!!' }, { name: 'x'.repeat(65) }, { name: 'x', color: 'red' }]) {
    assert.throws(() => buildLabelDefinitionRecord(bad), undefined, JSON.stringify(bad));
  }
});
