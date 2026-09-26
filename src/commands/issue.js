import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { loadItems, pickById } from '../repoData.js';
import {
  buildIssueCommentRecord, buildIssueRecord, buildIssueStateRecord, NSID, repoWebUrl, resolveRepo,
} from '../tangled.js';
import { openSession } from './auth.js';
import { bodyOptions, printComments, readBody, repoOption } from './shared.js';

const STATE_WORDS = { open: 'abierta', closed: 'cerrada' };

async function findIssue(opts, ref) {
  if (!ref) throw new TglError('Indica la issue: su id (tgl issue list).');
  const { repoDid } = await resolveRepo(opts.repo);
  return pickById(await loadItems('issue', whoAmI(), repoDid), ref, 'la issue');
}

async function setIssueState(opts, ref, state) {
  const issue = await findIssue(opts, ref);
  if (issue.state === state) {
    console.log(`La issue "${issue.title}" ya estaba ${STATE_WORDS[state]}.`);
    return;
  }
  const session = await openSession();
  const body = readBody(opts);
  if (body?.trim()) {
    await session.createRecord(NSID.issueComment, buildIssueCommentRecord({ issueUri: issue.uri, body }));
  }
  await session.createRecord(NSID.issueState, buildIssueStateRecord({ issueUri: issue.uri, state }));
  console.log(`Issue "${issue.title}" marcada como ${STATE_WORDS[state]}.`);
}

export default {
  name: 'issue',
  summary: 'Crear, ver, comentar y cerrar issues',
  commands: {
    create: {
      summary: 'Abrir una issue',
      usage: [
        'Uso: tgl issue create --title <título> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]',
        '',
        'Tangled exige título y descripción.',
      ].join('\n'),
      options: { ...repoOption, title: { type: 'string', short: 't' }, ...bodyOptions },
      async run(opts) {
        if (!opts.title?.trim()) throw new TglError('Falta el título: --title "..."');
        const body = readBody(opts, { required: true });
        const { repoDid, label } = await resolveRepo(opts.repo);
        const session = await openSession();
        const { uri } = await session.createRecord(NSID.issue, buildIssueRecord({ repoDid, title: opts.title, body }));
        console.log(`Issue creada en ${label}. Id: ${uri.split('/').pop()}`);
        console.log(`Véla en: ${repoWebUrl(repoDid)}/issues (Tangled puede tardar unos segundos en mostrarla)`);
      },
    },
    list: {
      summary: 'Listar las issues de este repositorio',
      usage: 'Uso: tgl issue list [--state open|closed|all] [-R cuenta/nombre]',
      options: { ...repoOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const valid = ['open', 'closed', 'all'];
        if (!valid.includes(opts.state)) throw new TglError(`--state debe ser uno de: ${valid.join(', ')}`);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const issues = (await loadItems('issue', whoAmI(), repoDid)).filter((i) => opts.state === 'all' || i.state === opts.state);
        if (!issues.length) {
          console.log(`No hay issues (${opts.state}) en ${label}.`);
          return;
        }
        for (const i of issues) {
          console.log(`${i.rkey}  ${i.state.padEnd(6)}  ${i.createdAt.slice(0, 10)}  ${i.title}  [${i.authorHandle}]`);
        }
      },
    },
    view: {
      summary: 'Ver una issue con sus comentarios',
      usage: 'Uso: tgl issue view <id> [-R cuenta/nombre]',
      options: repoOption,
      async run(opts, [ref]) {
        const issue = await findIssue(opts, ref);
        console.log(issue.title);
        console.log(`${issue.state} · ${issue.authorHandle} · ${issue.createdAt.slice(0, 10)}`);
        if (issue.body) console.log(`\n${issue.body}`);
        await printComments(whoAmI(), issue.uri, NSID.issueComment, '.issue');
      },
    },
    comment: {
      summary: 'Comentar en una issue',
      usage: 'Uso: tgl issue comment <id> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]',
      options: { ...repoOption, ...bodyOptions },
      async run(opts, [ref]) {
        const body = readBody(opts, { required: true });
        const issue = await findIssue(opts, ref);
        const session = await openSession();
        await session.createRecord(NSID.issueComment, buildIssueCommentRecord({ issueUri: issue.uri, body }));
        console.log(`Comentario publicado en "${issue.title}".`);
      },
    },
    close: {
      summary: 'Cerrar una issue (opcionalmente con un comentario)',
      usage: 'Uso: tgl issue close <id> [--body <comentario> | --body-file <archivo>] [-R cuenta/nombre]',
      options: { ...repoOption, ...bodyOptions },
      run: (opts, [ref]) => setIssueState(opts, ref, 'closed'),
    },
    reopen: {
      summary: 'Volver a abrir una issue',
      usage: 'Uso: tgl issue reopen <id> [--body <comentario> | --body-file <archivo>] [-R cuenta/nombre]',
      options: { ...repoOption, ...bodyOptions },
      run: (opts, [ref]) => setIssueState(opts, ref, 'open'),
    },
  },
};
