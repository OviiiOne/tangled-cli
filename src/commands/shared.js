// Options and output helpers shared by several topics.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { authorOf, commentText, NSID, parseNumber, repoWebUrl, resolveRepo } from '../tangled.js';

export const repoOption = { repo: { type: 'string', short: 'R' } };
export const jsonOption = { json: { type: 'boolean', default: false } };
export const limitOption = { limit: { type: 'string', short: 'L', default: '30' } };
export const webOption = { web: { type: 'boolean', short: 'w', default: false } };

// Opens a page in the default browser without waiting for it.
export function openInBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
  console.log(t(`Opening ${url}`, `Abriendo ${url}`));
}

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

// Comments in the current format plus those in the deprecated per-kind collection.
export async function loadComments(account, subjectUri, legacy) {
  const [current, old] = await Promise.all([
    recordsLinkingTo({ account, collection: NSID.comment, links: [{ target: subjectUri, path: '.subject.uri' }] }),
    recordsLinkingTo({ account, collection: legacy.collection, links: [{ target: subjectUri, path: legacy.path }] }),
  ]);
  const comments = [...current, ...old]
    .map((r) => ({ uri: r.uri, author: authorOf(r.uri), body: commentText(r.value), createdAt: r.value.createdAt ?? '' }))
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

// Changes the title and/or description of one of your own issues or PRs, keeping every
// other field (Tangled's website edits them the same way: putRecord with swapRecord).
export async function editTitleBody(session, item, { title, body }, what) {
  if (item.author !== session.did) {
    throw new TglError(t(`Only its author can edit this ${what.en}.`, `Solo quien la creó puede editar esta ${what.es}.`));
  }
  if (title === undefined && body === undefined) {
    throw new TglError(t('Nothing to change: pass --title and/or --body.', 'Nada que cambiar: indica --title y/o --body.'));
  }
  if (title !== undefined && !title.trim()) throw new TglError(t('The title cannot be empty.', 'El título no puede estar vacío.'));
  const current = await session.getOwnRecord(item.uri);
  const value = { ...current.value };
  if (title !== undefined) value.title = title;
  if (body !== undefined) value.body = body;
  await session.putRecord(current, value);
  return value;
}

// Web address of an issue or PR. Tangled's pages go by number ("#12"), which records
// don't carry, so for an id or a branch the list page is opened instead.
export async function parseWebRef(opts, kind, ref) {
  const list = `${repoWebUrl((await resolveRepo(opts.repo)).repoDid)}/${kind === 'pull' ? 'pulls' : 'issues'}`;
  const number = parseNumber(ref);
  if (number !== undefined) return `${list}/${number}`;
  console.log(t(
    "Tangled's pages go by #number, which tgl can't get from an id or a branch: opening the list.",
    'Las páginas de Tangled van por #número, que tgl no puede sacar de un id o una rama: abro la lista.',
  ));
  return list;
}
