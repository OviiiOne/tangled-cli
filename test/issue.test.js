import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastActivity } from '../src/commands/issue.js';

const issue = { createdAt: '2026-01-01T00:00:00Z' };
const comment = (createdAt, body = 'Hi') => ({ createdAt, body });

test('an issue with no comments was last active when it was opened', () => {
  assert.equal(lastActivity(issue, []), issue.createdAt);
});

test('the newest comment counts', () => {
  assert.equal(lastActivity(issue, [comment('2026-03-01T00:00:00Z'), comment('2026-02-01T00:00:00Z')]), '2026-03-01T00:00:00Z');
});

test('a state change counts when Tangled reports it', () => {
  assert.equal(lastActivity({ ...issue, stateUpdatedAt: '2026-04-01T00:00:00Z' }, [comment('2026-02-01T00:00:00Z')]), '2026-04-01T00:00:00Z');
});

test('the stale comment itself is not activity', () => {
  assert.equal(lastActivity(issue, [comment('2026-05-01T00:00:00Z', ' Still needed? ')], 'Still needed?'), issue.createdAt);
});
