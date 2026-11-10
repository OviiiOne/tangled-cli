import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TglError } from '../src/errors.js';
import issue from '../src/commands/issue.js';
import label from '../src/commands/label.js';
import pr from '../src/commands/pr.js';
import release from '../src/commands/release.js';
import repo from '../src/commands/repo.js';

// Until they write Tangled's new format, these must stop before doing anything.
const PAUSED = [
  [pr, ['create', 'comment', 'edit', 'update', 'merge', 'close', 'reopen']],
  [issue, ['create', 'edit', 'comment', 'stale', 'close', 'reopen']],
  [label, ['create', 'delete']],
  [release, ['upload']],
  [repo, ['create', 'set-default-branch']],
];

for (const [topic, commands] of PAUSED) {
  for (const name of commands) {
    test(`tgl ${topic.name} ${name} is paused`, async () => {
      await assert.rejects(async () => topic.commands[name].run({ add: [], remove: [] }, ['1']), (err) => err instanceof TglError && err.message.includes('tangled.org'));
    });
  }
}

test('changing labels is paused, for PRs and issues', async () => {
  for (const topic of [pr, issue]) {
    await assert.rejects(async () => topic.commands.label.run({ add: ['bug'], remove: [] }, ['1']), (err) => err instanceof TglError && err.message.includes('tangled.org'));
  }
});
