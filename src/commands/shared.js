// Options and output helpers shared by several topics.
import { readFileSync } from 'node:fs';
import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { authorOf } from '../tangled.js';

export const repoOption = { repo: { type: 'string', short: 'R' } };
export const jsonOption = { json: { type: 'boolean', default: false } };
export const limitOption = { limit: { type: 'string', short: 'L', default: '30' } };

export const bodyOptions = {
  body: { type: 'string', short: 'b' },
  'body-file': { type: 'string', short: 'F' },
};

export function readBody(opts, { required = false } = {}) {
  const body = opts['body-file'] ? readFileSync(opts['body-file'], 'utf8') : opts.body;
  if (required && !body?.trim()) throw new TglError(t('Missing text: --body "..." or --body-file file.md', 'Falta el texto: --body "..." o --body-file archivo.md'));
  return body;
}

export function parseLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new TglError(t('--limit must be a whole number (0 = no limit).', '--limit debe ser un número entero (0 = sin límite).'));
  return n;
}

export function checkState(value, valid) {
  if (!valid.includes(value)) throw new TglError(t(`--state must be one of: ${valid.join(', ')}`, `--state debe ser uno de: ${valid.join(', ')}`));
  return value;
}

export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function day(isoDate) {
  return (isoDate ?? '').slice(0, 10);
}

export async function loadComments(account, subjectUri, collection, path) {
  const records = await recordsLinkingTo({ account, collection, links: [{ target: subjectUri, path }] });
  const comments = records
    .map((r) => ({ uri: r.uri, author: authorOf(r.uri), body: r.value.body ?? '', createdAt: r.value.createdAt ?? '' }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await Promise.all(comments.map(async (c) => { c.authorHandle = await handleOf(c.author); }));
  return comments;
}

export function printComments(comments) {
  console.log(t(`\nComments (${comments.length}):`, `\nComentarios (${comments.length}):`));
  for (const c of comments) {
    console.log(`\n— ${c.authorHandle}, ${c.createdAt.slice(0, 16).replace('T', ' ')}`);
    console.log(c.body.trim().replace(/^/gm, '  '));
  }
}
