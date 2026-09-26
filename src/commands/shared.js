// Options and output helpers shared by several topics.
import { readFileSync } from 'node:fs';
import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { TglError } from '../errors.js';
import { authorOf } from '../tangled.js';

export const repoOption = { repo: { type: 'string', short: 'R' } };

export const bodyOptions = {
  body: { type: 'string', short: 'b' },
  'body-file': { type: 'string', short: 'F' },
};

export function readBody(opts, { required = false } = {}) {
  const body = opts['body-file'] ? readFileSync(opts['body-file'], 'utf8') : opts.body;
  if (required && !body?.trim()) throw new TglError('Falta el texto: --body "..." o --body-file archivo.md');
  return body;
}

export async function printComments(account, subjectUri, collection, path) {
  const comments = (await recordsLinkingTo({ account, collection, links: [{ target: subjectUri, path }] }))
    .sort((a, b) => (a.value.createdAt ?? '').localeCompare(b.value.createdAt ?? ''));
  console.log(`\nComentarios (${comments.length}):`);
  for (const c of comments) {
    const who = await handleOf(authorOf(c.uri));
    console.log(`\n— ${who}, ${(c.value.createdAt ?? '').slice(0, 16).replace('T', ' ')}`);
    console.log(c.value.body.trim().replace(/^/gm, '  '));
  }
}
