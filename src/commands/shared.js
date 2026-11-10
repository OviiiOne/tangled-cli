// Options and output helpers shared by several topics.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { apiList } from '../api.js';
import { handleOf } from '../atproto.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { editOnKnot } from '../knot.js';
import { applyLabelChanges, formatLabels, parseLabelArg, repoLabels } from '../labels.js';
import { commentFromView, editTicketText, parseNumber, repoWebUrl, resolveRepo } from '../tangled.js';
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

// An issue's or PR's comments, oldest first. Looking up who wrote them is one request
// each, so callers that don't show them can skip it.
export async function loadComments(subjectUri, { handles = true } = {}) {
  const comments = (await apiList('org.tangled.feed.listComments', { subject: subjectUri, order: 'asc' })).map(commentFromView);
  if (handles) await Promise.all(comments.map(async (c) => { c.authorHandle = await handleOf(c.author); }));
  return comments;
}

export function printComments(comments) {
  console.log(t(`\nComments (${comments.length}):`, `\nComentarios (${comments.length}):`));
  for (const c of comments) {
    console.log(`\n— ${c.authorHandle}, ${c.createdAt.slice(0, 16).replace('T', ' ')}`);
    console.log(c.body.trim().replace(/^/gm, '  '));
  }
}

// Changes the title and/or description of an issue or PR, keeping every other field.
// The knot decides who may. Returns the title it ends up with.
export async function editTitleBody(session, item, { title, body }) {
  if (title === undefined && body === undefined) {
    throw new TglError(t('Nothing to change: pass --title and/or --body.', 'Nada que cambiar: indica --title y/o --body.'));
  }
  if (title !== undefined && !title.trim()) throw new TglError(t('The title cannot be empty.', 'El título no puede estar vacío.'));
  const saved = await editOnKnot(session, item.uri, (value) => editTicketText(value, { title, body }));
  return saved.title.text;
}

// Labels of an issue or PR, for "view". People assigned to it show as an "assignee" label.
export async function itemLabels(repoDid, item) {
  const names = new Map(item.labels.length ? (await repoLabels(repoDid)).map((d) => [d.key, d.name]) : []);
  const labels = item.labels.map((key) => ({ name: names.get(key) ?? key, values: [] }));
  if (item.assignees.length) labels.push({ name: 'assignee', values: await Promise.all(item.assignees.map(handleOf)) });
  return labels;
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
      const defs = await repoLabels(repoDid);
      if (opts.add.length || opts.remove.length) {
        const add = await Promise.all(opts.add.map((arg) => parseLabelArg(arg, defs)));
        const remove = await Promise.all(opts.remove.map((arg) => parseLabelArg(arg, defs, { removing: true })));
        await editOnKnot(await openSession(), item.uri, (value) => applyLabelChanges(value, { add, remove }));
        console.log(t(`Labels of "${item.title}" updated.`, `Etiquetas de "${item.title}" actualizadas.`));
        return;
      }
      console.log(item.title);
      console.log(`${t('Labels', 'Etiquetas')}: ${formatLabels(await itemLabels(repoDid, item)) || t('(none)', '(ninguna)')}`);
      console.log(`${t("Repo's labels", 'Etiquetas del repo')}: ${defs.map((d) => d.name).join(', ') || t('(none)', '(ninguna)')}`);
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
