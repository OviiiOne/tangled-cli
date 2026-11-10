import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TglError } from '../src/errors.js';
import issue from '../src/commands/issue.js';

// Until they have been tried against Tangled's new format, these must stop before doing anything.
const PAUSED = ['create', 'edit', 'comment', 'stale', 'close', 'reopen'];
const isPaused = (err) => err instanceof TglError && err.message.includes('tangled.org');

for (const name of PAUSED) {
  test(`tgl issue ${name} is paused`, async () => {
    await assert.rejects(async () => issue.commands[name].run({}, ['1']), isPaused);
  });
}

test('changing an issue\'s labels is paused', async () => {
  await assert.rejects(async () => issue.commands.label.run({ add: ['bug'], remove: [] }, ['1']), isPaused);
});
