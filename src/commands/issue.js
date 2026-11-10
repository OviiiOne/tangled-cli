import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { createOnKnot, postComment, setTicketState } from '../knot.js';
import { formatLabels } from '../labels.js';
import { findById, loadItems } from '../repoData.js';
import { buildTicketRecord, NSID, repoWebUrl, resolveRepo, TICKET_STATES } from '../tangled.js';
import { openSession } from './auth.js';
import {
  bodyOptions, checkState, day, editTitleBody, itemLabels, jsonOption, labelCommand, limitOption, loadComments, openInBrowser,
  parseLimit, parseWebRef, printComments, printJson, readBody, repoOption, webOption, writesPaused,
} from './shared.js';

const STATE_WORDS = { open: () => t('open', 'abierta'), closed: () => t('closed', 'cerrada') };

async function findIssue(opts, ref) {
  if (!ref) throw new TglError(t('Say which issue: its #number (tgl issue list).', 'Indica la issue: su #número (tgl issue list).'));
  const { repoDid } = await resolveRepo(opts.repo);
  return findById('issue', repoDid, ref);
}

async function setIssueState(opts, ref, state) {
  writesPaused();
  const body = readBody(opts);
  const issue = await findIssue(opts, ref);
  if (issue.state === state) {
    console.log(t(`Issue "${issue.title}" was already ${STATE_WORDS[state]()}.`, `La issue "${issue.title}" ya estaba ${STATE_WORDS[state]()}.`));
    return;
  }
  const session = await openSession();
  if (body?.trim()) await postComment(session, issue.uri, body);
  await setTicketState(session, issue.uri, TICKET_STATES[state]);
  console.log(t(`Issue "${issue.title}" marked as ${STATE_WORDS[state]()}.`, `Issue "${issue.title}" marcada como ${STATE_WORDS[state]()}.`));
}

const commentOnChange = () => t(
  '  -b, --body       Also post this comment\n  -F, --body-file  Read the comment from a file',
  '  -b, --body       Publicar también este comentario\n  -F, --body-file  Leer el comentario de un archivo',
);

export default {
  name: 'issue',
  summary: t('Create, view, edit, label, comment on and close issues', 'Crear, ver, editar, etiquetar, comentar y cerrar issues'),
  commands: {
    create: {
      summary: t('Open an issue', 'Abrir una issue'),
      usage: t(
        'Usage: tgl issue create --title <title> (--body <text> | --body-file <file>) [-R owner/name]\n\nTangled requires both a title and a description.',
        'Uso: tgl issue create --title <título> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]\n\nTangled exige título y descripción.',
      ),
      options: { ...repoOption, title: { type: 'string', short: 't' }, ...bodyOptions },
      async run(opts) {
        writesPaused();
        if (!opts.title?.trim()) throw new TglError(t('Missing title: --title "..."', 'Falta el título: --title "..."'));
        const body = readBody(opts, { required: true });
        const { repoDid, label } = await resolveRepo(opts.repo);
        const { uri } = await createOnKnot(await openSession(), repoDid, NSID.ticket, buildTicketRecord({ title: opts.title, body }));
        console.log(t(`Issue #${uri.split('/').pop()} created in ${label}.`, `Issue #${uri.split('/').pop()} creada en ${label}.`));
        console.log(t(
          `See it at: ${repoWebUrl(repoDid)}/issues (Tangled may take a few seconds to show it)`,
          `Mírala en: ${repoWebUrl(repoDid)}/issues (Tangled puede tardar unos segundos en mostrarla)`,
        ));
      },
    },
    list: {
      summary: t("List the repo's issues, newest first", 'Listar las issues del repo, de más nueva a más vieja'),
      usage: t(
        'Usage: tgl issue list [--state open|closed|all] [--limit N] [--json] [-R owner/name]\n\n  -L, --limit  How many to show (default 30; 0 = all)',
        'Uso: tgl issue list [--state open|closed|all] [--limit N] [--json] [-R cuenta/nombre]\n\n  -L, --limit  Cuántas mostrar (por defecto 30; 0 = todas)',
      ),
      options: { ...repoOption, ...limitOption, ...jsonOption, ...webOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const state = checkState(opts.state, ['open', 'closed', 'all']);
        if (opts.web) {
          openInBrowser(`${repoWebUrl((await resolveRepo(opts.repo)).repoDid)}/issues${state === 'open' ? '' : `?state=${state}`}`);
          return;
        }
        const limit = parseLimit(opts.limit);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const issues = await loadItems('issue', repoDid, { state, limit });
        if (opts.json) {
          printJson(issues.map((i) => ({ id: i.rkey, ...i })));
          return;
        }
        if (!issues.length) {
          console.log(t(`No ${state} issues in ${label}.`, `No hay issues (${state}) en ${label}.`));
          return;
        }
        for (const i of issues) {
          console.log(`#${i.rkey}  ${i.state.padEnd(6)}  ${day(i.createdAt).padEnd(10)}  ${i.title}  [${i.authorHandle}]`);
        }
        if (limit && issues.length === limit) {
          console.log(t(`\nShowing the ${limit} newest. More with --limit 0 (all) or --limit N.`, `\nSe muestran las ${limit} más recientes. Más con --limit 0 (todas) o --limit N.`));
        }
      },
    },
    view: {
      summary: t('Show an issue with its comments', 'Ver una issue con sus comentarios'),
      usage: t(
        'Usage: tgl issue view <#number | id> [--web] [--json] [-R owner/name]\n\n  -w, --web  Open it in the browser',
        'Uso: tgl issue view <#número | id> [--web] [--json] [-R cuenta/nombre]\n\n  -w, --web  Abrirla en el navegador',
      ),
      options: { ...repoOption, ...jsonOption, ...webOption },
      async run(opts, [ref]) {
        if (opts.web) {
          openInBrowser(await parseWebRef(opts, 'issue', ref));
          return;
        }
        const issue = await findIssue(opts, ref);
        const [comments, labels] = await Promise.all([
          loadComments(issue.uri),
          itemLabels((await resolveRepo(opts.repo)).repoDid, issue),
        ]);
        if (opts.json) {
          printJson({ id: issue.rkey, ...issue, labels: labels.map(({ raw, ...l }) => l), comments });
          return;
        }
        console.log(issue.title);
        console.log(`${issue.state} · ${issue.authorHandle} · ${day(issue.createdAt)}`);
        if (labels.length) console.log(`${t('Labels', 'Etiquetas')}: ${formatLabels(labels)}`);
        if (issue.body) console.log(`\n${issue.body}`);
        printComments(comments);
      },
    },
    edit: {
      summary: t("Change an issue's title or description", 'Cambiar el título o la descripción de una issue'),
      usage: t([
        'Usage: tgl issue edit <#number | id> [--title <title>] [--body <text> | --body-file <file>] [-R owner/name]',
        '',
        "Only the issue's author can edit it. Fields you leave out stay as they are.",
      ], [
        'Uso: tgl issue edit <#número | id> [--title <título>] [--body <texto> | --body-file <archivo>] [-R cuenta/nombre]',
        '',
        'Solo quien creó la issue puede editarla. Lo que no indiques se queda como está.',
      ]).join('\n'),
      options: { ...repoOption, title: { type: 'string', short: 't' }, ...bodyOptions },
      async run(opts, [ref]) {
        writesPaused();
        const body = readBody(opts);
        const issue = await findIssue(opts, ref);
        const title = await editTitleBody(await openSession(), issue, { title: opts.title, body });
        console.log(t(`Issue "${title}" updated.`, `Issue "${title}" actualizada.`));
      },
    },
    comment: {
      summary: t('Comment on an issue', 'Comentar en una issue'),
      usage: t(
        'Usage: tgl issue comment <#number | id> (--body <text> | --body-file <file>) [-R owner/name]',
        'Uso: tgl issue comment <#número | id> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]',
      ),
      options: { ...repoOption, ...bodyOptions },
      async run(opts, [ref]) {
        writesPaused();
        const body = readBody(opts, { required: true });
        const issue = await findIssue(opts, ref);
        await postComment(await openSession(), issue.uri, body);
        console.log(t(`Comment posted on "${issue.title}".`, `Comentario publicado en "${issue.title}".`));
      },
    },
    label: labelCommand('issue', findIssue),
    stale: {
      summary: t('Label open issues with no recent activity (e.g. from a scheduled pipeline)', 'Etiquetar las issues abiertas sin actividad reciente (p. ej. desde una pipeline programada)'),
      usage: t([
        'Usage: tgl issue stale [--days N] [--label <name>] [--comment <text>] [--dry-run] [-R owner/name]',
        '',
        '  -d, --days     Days without activity before an issue is stale (default: 60)',
        '  -l, --label    Label to put on stale issues (default: stale)',
        '      --comment  Also post this comment when an issue becomes stale',
        '      --dry-run  Only show what would change',
        '',
        'Activity is the issue itself, its comments and its state changes. When a stale issue',
        'gets activity again, the label is taken off. Create the label first, once:',
        '  tgl label create stale --for issues',
        "Only the repo's owner and collaborators can label issues.",
      ], [
        'Uso: tgl issue stale [--days N] [--label <nombre>] [--comment <texto>] [--dry-run] [-R cuenta/nombre]',
        '',
        '  -d, --days     Días sin actividad para que una issue quede parada (por defecto, 60)',
        '  -l, --label    Etiqueta que poner a las issues paradas (por defecto, stale)',
        '      --comment  Publicar también este comentario cuando una issue quede parada',
        '      --dry-run  Solo mostrar lo que cambiaría',
        '',
        'Cuenta como actividad la propia issue, sus comentarios y sus cambios de estado. Cuando',
        'una issue parada vuelve a tener actividad, se le quita la etiqueta. Crea antes la',
        'etiqueta, una vez:',
        '  tgl label create stale --for issues',
        'Solo el dueño del repo y sus colaboradores pueden etiquetar issues.',
      ]).join('\n'),
      options: {
        ...repoOption,
        days: { type: 'string', short: 'd', default: '60' },
        label: { type: 'string', short: 'l', default: 'stale' },
        comment: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      run: writesPaused,
    },
    close: {
      summary: t('Close an issue (optionally with a comment)', 'Cerrar una issue (con un comentario opcional)'),
      usage: `${t('Usage: tgl issue close <#number | id> [--body <comment> | --body-file <file>] [-R owner/name]', 'Uso: tgl issue close <#número | id> [--body <comentario> | --body-file <archivo>] [-R cuenta/nombre]')}\n\n${commentOnChange()}`,
      options: { ...repoOption, ...bodyOptions },
      run: (opts, [ref]) => setIssueState(opts, ref, 'closed'),
    },
    reopen: {
      summary: t('Reopen an issue (optionally with a comment)', 'Volver a abrir una issue (con un comentario opcional)'),
      usage: `${t('Usage: tgl issue reopen <#number | id> [--body <comment> | --body-file <file>] [-R owner/name]', 'Uso: tgl issue reopen <#número | id> [--body <comentario> | --body-file <archivo>] [-R cuenta/nombre]')}\n\n${commentOnChange()}`,
      options: { ...repoOption, ...bodyOptions },
      run: (opts, [ref]) => setIssueState(opts, ref, 'open'),
    },
  },
};
