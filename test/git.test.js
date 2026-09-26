import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripRefPrefix } from '../src/git.js';

test('local and remote-tracking refs become plain branch names', () => {
  assert.equal(stripRefPrefix('refs/heads/master'), 'master');
  assert.equal(stripRefPrefix('refs/heads/fix/base-remote-ref'), 'fix/base-remote-ref');
  assert.equal(stripRefPrefix('refs/remotes/origin/master'), 'master');
  assert.equal(stripRefPrefix('refs/remotes/upstream/feat/x'), 'feat/x');
});

test('anything else is left to the caller', () => {
  assert.equal(stripRefPrefix(''), undefined);
  assert.equal(stripRefPrefix('refs/tags/v1.0.0'), undefined);
});
