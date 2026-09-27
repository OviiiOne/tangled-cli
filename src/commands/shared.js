// Options and output helpers shared by several topics.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { buildLabelOpRecord, formatLabels, LABEL_OP, labelsOf, parseLabelArg, repoLabelDefs } from '../labels.js';
import { repoPeople } from '../repoData.js';
import { authorOf, commentText, NSID, parseNumber, repoWebUrl, resolveRepo } from '../tangled.js';
import { openSession } from './auth.js';

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

// Labels of an issue or PR, for "view": [] when the repo uses none.
export async function itemLabels(repoDid, item) {
  const defs = await repoLabelDefs(whoAmI(), repoDid);
  if (!defs.length) return [];
  return labelsOf(whoAmI(), item.uri, defs, (await repoPeople(whoAmI(), repoDid)).editors);
}

// "tgl issue label" and "tgl pr label". `find(opts, ref)` returns the issue or PR.
export function labelCommand(kind, find) {
  const what = kind === 'pull' ? { en: 'PR', es: 'PR', ref: '#number | id | branch', refEs: '#número | id | rama' } : { en: 'issue', es: 'issue', ref: '#number | id', refEs: '#número | id' };
  return {
    summary: t(`Add or remove labels on an ${what.en}, or list them`, `Poner o quitar etiquetas a una ${what.es}, o verlas`),
    usage: t([
      `Usage: tgl ${kind === 'pull' ? 'pr' : 'issue'} label <${what.ref}> [--add <label>]... [--remove <label>]... [-R owner/name]`,
      '',
      '  -a, --add     Label to add: its name, or name=value for labels that take one',
      '                (e.g. --add assignee=alice.bsky.social)',
      '  -r, --remove  Label to remove (name=value removes one value only)',
      '',
      "Without --add or --remove, shows its labels and the repo's labels.",
      "Only the repo's owner and collaborators can change labels.",
    ], [
      `Uso: tgl ${kind === 'pull' ? 'pr' : 'issue'} label <${what.refEs}> [--add <etiqueta>]... [--remove <etiqueta>]... [-R cuenta/nombre]`,
      '',
      '  -a, --add     Etiqueta que poner: su nombre, o nombre=valor en las que llevan valor',
      '                (p. ej. --add assignee=alice.bsky.social)',
      '  -r, --remove  Etiqueta que quitar (nombre=valor quita solo ese valor)',
      '',
      'Sin --add ni --remove, muestra sus etiquetas y las del repo.',
      'Solo el dueño del repo y sus colaboradores pueden cambiar etiquetas.',
    ]).join('\n'),
    options: {
      ...repoOption,
      add: { type: 'string', short: 'a', multiple: true, default: [] },
      remove: { type: 'string', short: 'r', multiple: true, default: [] },
    },
    async run(opts, [ref]) {
      const item = await find(opts, ref);
      const { repoDid } = await resolveRepo(opts.repo);
      const defs = await repoLabelDefs(whoAmI(), repoDid);
      if (!defs.length) throw new TglError(t('This repo uses no labels.', 'Este repo no usa etiquetas.'));
      const { editors } = await repoPeople(whoAmI(), repoDid);
      const current = await labelsOf(whoAmI(), item.uri, defs, editors);
      const collection = kind === 'pull' ? NSID.pull : NSID.issue;

      if (!opts.add.length && !opts.remove.length) {
        console.log(item.title);
        console.log(`${t('Labels', 'Etiquetas')}: ${formatLabels(current) || t('(none)', '(ninguna)')}`);
        const usable = defs.filter((d) => !d.scope?.length || d.scope.includes(collection));
        console.log(`${t("Repo's labels", 'Etiquetas del repo')}: ${usable.map((d) => (d.valueType?.type === 'null' ? d.name : `${d.name}=<${d.valueType?.format === 'did' ? t('person', 'persona') : t('value', 'valor')}>`)).join(', ')}`);
        return;
      }

      const session = await openSession();
      if (!editors.includes(session.did)) {
        throw new TglError(t("Only the repo's owner and collaborators can change labels.", 'Solo el dueño del repo y sus colaboradores pueden cambiar etiquetas.'));
      }
      const has = new Map(current.map((l) => [l.uri, new Set(l.raw)]));
      const remove = [];
      for (const arg of opts.remove) {
        const { def, value } = await parseLabelArg(arg, defs, collection, { removing: true });
        const values = value === undefined ? [...(has.get(def.uri) ?? [])] : [value].filter((v) => has.get(def.uri)?.has(v));
        remove.push(...values.map((v) => ({ key: def.uri, value: v })));
      }
      const add = [];
      for (const arg of opts.add) {
        const { def, value } = await parseLabelArg(arg, defs, collection);
        if (!has.get(def.uri)?.has(value)) add.push({ key: def.uri, value });
      }
      if (!add.length && !remove.length) {
        console.log(t(`Nothing to change on "${item.title}".`, `Nada que cambiar en "${item.title}".`));
        return;
      }
      await session.createRecord(LABEL_OP, buildLabelOpRecord({ subjectUri: item.uri, add, remove }));
      const nameOf = new Map(defs.map((d) => [d.uri, d.name]));
      const show = async (sign, { key, value }) => `${sign}${nameOf.get(key)}${value === 'null' ? '' : `=${value.startsWith('did:') ? await handleOf(value) : value}`}`;
      const changes = await Promise.all([...remove.map((o) => show('-', o)), ...add.map((o) => show('+', o))]);
      console.log(t(`Labels of "${item.title}" updated: ${changes.join(' ')}`, `Etiquetas de "${item.title}" actualizadas: ${changes.join(' ')}`));
    },
  };
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
