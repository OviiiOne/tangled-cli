import { gzipSync } from 'node:zlib';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import {
  branchName, currentBranch, formatPatch, git, isWorkingTreeClean, localRefFor, refExists, remoteDefaultBranch, unpushedCommits,
} from '../git.js';
import { t } from '../i18n.js';
import { expandNumber, findById, isIdOf, loadItems, notFound, repoPeople } from '../repoData.js';
import {
  buildCommentRecord, buildIssueStateRecord, buildPullRecord, buildStatusRecord, closingRefs, isFork, NSID, pullPatch, repoGitUrl,
  repoWebUrl, resolveRepo,
} from '../tangled.js';
import { openSession } from './auth.js';
import {
  bodyOptions, checkState, day, editTitleBody, jsonOption, limitOption, loadComments, openInBrowser, parseLimit, parseWebRef,
  printComments, printJson, readBody, repoOption, webOption,
} from './shared.js';

const NO_REF_EN = 'Without a PR, the open PR of the current branch.';
const NO_REF_ES = 'Sin indicar PR, la PR abierta de la rama actual.';

const STATE_WORDS = {
  open: () => t('open', 'abierta'),
  closed: () => t('closed', 'cerrada'),
  merged: () => t('merged', 'fusionada'),
};

// Finds a PR by its #number, id, full at:// address, or the branch of an open PR in the
// same repo. With no ref, the current branch's open PR.
async function findPull(opts, ref) {
  if (!ref) {
    try {
      ref = currentBranch();
    } catch {
      throw new TglError(t('Say which PR: its #number, its id (tgl pr list) or its branch name.', 'Indica la PR: su #número, su id (tgl pr list) o el nombre de su rama.'));
    }
  }
  const { repoDid } = await resolveRepo(opts.repo);
  ref = await expandNumber('pull', repoDid, ref);
  const isBranch = (value) => value.source?.branch === ref && !isFork(value, repoDid);
  const found = await loadItems('pull', whoAmI(), repoDid, { match: (uri, value) => isIdOf(ref, uri) || isBranch(value) });
  const byId = found.find((p) => isIdOf(ref, p.uri));
  if (byId) return { pull: byId, repoDid };
  const open = found.filter((p) => p.state === 'open');
  if (open.length > 1) {
    throw new TglError(t(`Several open PRs come from branch "${ref}"; use the id (tgl pr list).`, `Hay varias PRs abiertas de la rama "${ref}"; usa su id (tgl pr list).`));
  }
  if (!open.length) throw notFound('pull', ref);
  return { pull: open[0], repoDid };
}

function changedFiles(patch) {
  return [...new Set([...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]))];
}

async function setPullState(opts, ref, state) {
  const { pull, repoDid } = await findPull(opts, ref);
  if (pull.state === state) {
    console.log(t(`PR "${pull.title}" was already ${STATE_WORDS[state]()}.`, `La PR "${pull.title}" ya estaba ${STATE_WORDS[state]()}.`));
    return;
  }
  const session = await openSession();
  await session.createRecord(NSID.pullStatus, buildStatusRecord({ pullUri: pull.uri, state }));
  console.log(t(`PR "${pull.title}" marked as ${STATE_WORDS[state]()}.`, `PR "${pull.title}" marcada como ${STATE_WORDS[state]()}.`));
  if (state === 'merged' && !opts['keep-issues']) await closeLinkedIssues(session, pull, repoDid);
}

// Closes the issues a merged PR says it fixes ("Fixes #12"), with a comment naming the
// PR. Tangled doesn't do this itself yet. Issues of other repos are left alone.
async function closeLinkedIssues(session, pull, repoDid) {
  const refs = closingRefs(`${pull.title}\n${pull.body ?? ''}`);
  if (!refs.length) return;
  const editors = new Set((await repoPeople(whoAmI(), repoDid)).editors);
  const done = new Set();
  for (const ref of refs) {
    const label = ref.uri ?? `#${ref.number}`;
    try {
      if (ref.repo && (await resolveRepo(ref.repo)).repoDid !== repoDid) continue;
      const issue = await findById('issue', whoAmI(), repoDid, ref.uri ?? `#${ref.number}`);
      if (done.has(issue.uri)) continue;
      done.add(issue.uri);
      if (issue.state === 'closed') {
        console.log(t(`Issue ${label} "${issue.title}" was already closed.`, `La issue ${label} "${issue.title}" ya estaba cerrada.`));
        continue;
      }
      // Tangled ignores state changes from anyone but the author, the owner and collaborators.
      if (issue.author !== session.did && !editors.has(session.did)) {
        console.log(t(`Issue ${label} not closed: only its author or the repo's owner can close it.`, `La issue ${label} no se ha cerrado: solo puede cerrarla quien la creó o el dueño del repo.`));
        continue;
      }
      // A public comment: in English whatever the user's language, like the rest of a repo.
      const body = `Closed by the merged PR "${pull.title}".`;
      await session.createRecord(NSID.comment, buildCommentRecord({ subject: issue, body }));
      await session.createRecord(NSID.issueState, buildIssueStateRecord({ issueUri: issue.uri, state: 'closed' }));
      console.log(t(`Issue ${label} "${issue.title}" closed.`, `Issue ${label} "${issue.title}" cerrada.`));
    } catch (err) {
      console.log(t(`Issue ${label} not closed: ${err.message}`, `La issue ${label} no se ha cerrado: ${err.message}`));
    }
  }
}

// Stops before creating or updating a PR from a branch with commits that aren't on
// Tangled yet: the PR would show changes that the repo's branch doesn't have.
function checkPushed(repoDid, branch, localRef, { force, dryRun }) {
  const missing = unpushedCommits(repoGitUrl(repoDid), branch, localRef);
  if (missing === 0 || force) return;
  const msg = missing === null
    ? t(`Branch "${branch}" is not on Tangled yet. Push it first (git push -u <remote> ${branch}).`, `La rama "${branch}" aún no está en Tangled. Súbela antes (git push -u <remoto> ${branch}).`)
    : t(`Branch "${branch}" has ${missing} commit${missing === 1 ? '' : 's'} not pushed to Tangled. Push first (git push).`, `La rama "${branch}" tiene ${missing} commit${missing === 1 ? '' : 's'} sin subir a Tangled. Súbelos antes (git push).`);
  const hint = t('Use --allow-unpushed to go ahead anyway.', 'Usa --allow-unpushed para seguir de todos modos.');
  if (dryRun) {
    console.log(t(`Warning: ${msg}`, `Aviso: ${msg}`));
    return;
  }
  throw new TglError(`${msg}\n${hint}`);
}

export default {
  name: 'pr',
  summary: t('Create, view, check out, edit, update, comment on and close pull requests', 'Crear, ver, probar, editar, actualizar, comentar y cerrar pull requests'),
  commands: {
    create: {
      summary: t("Open a PR from a branch into the repo's default branch", 'Abrir una PR de una rama hacia la rama principal del repo'),
      usage: t([
        'Usage: tgl pr create --title <title> [--body <text> | --body-file <file>]',
        '                     [--head <branch>] [--base <branch>] [-R owner/name] [--dry-run]',
        '',
        '  -t, --title      PR title (required)',
        '  -b, --body       Description',
        '  -F, --body-file  Read the description from a file',
        '  -H, --head       Branch with the changes (default: the current branch)',
        "  -B, --base       Target branch (default: the repo's default branch on Tangled)",
        "  -R, --repo       Tangled repo (default: this git repo's Tangled remote)",
        '      --dry-run    Show what would be created without creating anything',
        '      --allow-unpushed  Go ahead even if the branch has commits not pushed to Tangled',
        '',
        'The changes are computed in your local copy with "git format-patch base..head".',
        'Push the branch first: a Tangled PR keeps the changes it was created with.',
      ], [
        'Uso: tgl pr create --title <título> [--body <texto> | --body-file <archivo>]',
        '                   [--head <rama>] [--base <rama>] [-R cuenta/nombre] [--dry-run]',
        '',
        '  -t, --title      Título de la PR (obligatorio)',
        '  -b, --body       Descripción',
        '  -F, --body-file  Leer la descripción de un archivo',
        '  -H, --head       Rama con los cambios (por defecto, la rama actual)',
        '  -B, --base       Rama destino (por defecto, la rama principal del repo en Tangled)',
        '  -R, --repo       Repo de Tangled (por defecto, el remoto de Tangled de este git)',
        '      --dry-run    Enseñar lo que se crearía sin crear nada',
        '      --allow-unpushed  Seguir aunque la rama tenga commits sin subir a Tangled',
        '',
        'Los cambios se calculan en tu copia local con "git format-patch base..head".',
        'Sube la rama antes: una PR de Tangled se queda con los cambios con los que se creó.',
      ]).join('\n'),
      options: {
        ...repoOption,
        title: { type: 'string', short: 't' },
        ...bodyOptions,
        head: { type: 'string', short: 'H' },
        base: { type: 'string', short: 'B' },
        'dry-run': { type: 'boolean', default: false },
        'allow-unpushed': { type: 'boolean', default: false },
      },
      async run(opts) {
        if (!opts.title?.trim()) throw new TglError(t('Missing title: --title "..."', 'Falta el título: --title "..."'));
        const body = readBody(opts);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const head = opts.head ?? currentBranch();
        // The patch uses local refs; the record stores plain branch names.
        const base = opts.base ? branchName(opts.base) : remoteDefaultBranch(repoGitUrl(repoDid)) ?? 'master';
        const baseRef = opts.base ?? localRefFor(base);
        const headBranch = branchName(head);
        if (headBranch === base) {
          throw new TglError(t(`The PR branch and the target branch are the same ("${base}").`, `La rama de cambios y la de destino son la misma ("${base}").`));
        }
        const { patch, commits } = formatPatch(baseRef, head);
        const gz = gzipSync(Buffer.from(patch, 'utf8'));

        console.log(t(`Repository: ${label}`, `Repositorio: ${label}`));
        checkPushed(repoDid, headBranch, head, { force: opts['allow-unpushed'], dryRun: opts['dry-run'] });
        console.log(t(
          `PR: ${headBranch} -> ${base} (${commits} commit${commits === 1 ? '' : 's'}, ${gz.length}-byte compressed patch)`,
          `PR: ${headBranch} -> ${base} (${commits} commit${commits === 1 ? '' : 's'}, parche de ${gz.length} bytes comprimido)`,
        ));

        const fields = { repoDid, title: opts.title, body, base, head: headBranch };
        if (opts['dry-run']) {
          console.log(t('\nThis record would be created (nothing was created):', '\nSe crearía este registro (no se ha creado nada):'));
          printJson(buildPullRecord({ ...fields, patchBlob: t('<compressed patch>', '<parche comprimido>') }));
          return;
        }

        const session = await openSession();
        const patchBlob = await session.uploadBlob(gz, 'application/gzip');
        const { uri } = await session.createRecord(NSID.pull, buildPullRecord({ ...fields, patchBlob }));
        console.log(t(`\nPR created. Id: ${uri.split('/').pop()}`, `\nPR creada. Id: ${uri.split('/').pop()}`));
        console.log(t(`Address: ${uri}`, `Dirección: ${uri}`));
        console.log(t(
          `See it at: ${repoWebUrl(repoDid)}/pulls (Tangled may take a few seconds to show it)`,
          `Véla en: ${repoWebUrl(repoDid)}/pulls (Tangled puede tardar unos segundos en mostrarla)`,
        ));
      },
    },
    list: {
      summary: t("List the repo's PRs, newest first", 'Listar las PRs del repo, de más nueva a más vieja'),
      usage: t(
        'Usage: tgl pr list [--state open|closed|merged|all] [--limit N] [--web] [--json] [-R owner/name]\n\n  -L, --limit  How many to show (default 30; 0 = all)\n  -w, --web    Open the list in the browser',
        'Uso: tgl pr list [--state open|closed|merged|all] [--limit N] [--web] [--json] [-R cuenta/nombre]\n\n  -L, --limit  Cuántas mostrar (por defecto 30; 0 = todas)\n  -w, --web    Abrir la lista en el navegador',
      ),
      options: { ...repoOption, ...limitOption, ...jsonOption, ...webOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const state = checkState(opts.state, ['open', 'closed', 'merged', 'all']);
        if (opts.web) {
          openInBrowser(`${repoWebUrl((await resolveRepo(opts.repo)).repoDid)}/pulls${state === 'open' ? '' : `?state=${state}`}`);
          return;
        }
        const limit = parseLimit(opts.limit);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const pulls = await loadItems('pull', whoAmI(), repoDid, { state, limit });
        if (opts.json) {
          printJson(pulls.map(({ rounds, patch, ...p }) => ({ id: p.rkey, ...p })));
          return;
        }
        if (!pulls.length) {
          console.log(t(`No ${state} PRs in ${label}.`, `No hay PRs (${state}) en ${label}.`));
          return;
        }
        for (const p of pulls) {
          const from = isFork(p, repoDid) ? `(fork) ${p.source.branch}` : p.source?.branch ?? t('(patch)', '(parche)');
          console.log(`${p.rkey}  ${p.state.padEnd(6)}  ${day(p.createdAt).padEnd(10)}  ${`${from} -> ${p.target.branch}`.padEnd(28)}  ${p.title}  [${p.authorHandle}]`);
        }
        if (limit && pulls.length === limit) {
          console.log(t(`\nShowing the ${limit} newest. More with --limit 0 (all) or --limit N.`, `\nSe muestran las ${limit} más recientes. Más con --limit 0 (todas) o --limit N.`));
        }
      },
    },
    view: {
      summary: t('Show a PR: description, changed files and comments', 'Ver una PR: descripción, archivos cambiados y comentarios'),
      usage: t(
        `Usage: tgl pr view [<#number | id | branch>] [--patch] [--web] [--json] [-R owner/name]\n\n  --patch    Show the full changes\n  -w, --web  Open it in the browser\n\n${NO_REF_EN}`,
        `Uso: tgl pr view [<#número | id | rama>] [--patch] [--web] [--json] [-R cuenta/nombre]\n\n  --patch    Mostrar los cambios completos\n  -w, --web  Abrirla en el navegador\n\n${NO_REF_ES}`,
      ),
      options: { ...repoOption, ...jsonOption, ...webOption, patch: { type: 'boolean', default: false } },
      async run(opts, [ref]) {
        if (opts.web) {
          openInBrowser(await parseWebRef(opts, 'pull', ref));
          return;
        }
        const { pull, repoDid } = await findPull(opts, ref);
        const patch = await pullPatch(pull, repoDid);
        const files = changedFiles(patch);
        const comments = await loadComments(whoAmI(), pull.uri, { collection: NSID.legacyPullComment, path: '.pull' });
        const revisions = Math.max(pull.rounds?.length ?? 0, 1);
        if (opts.json) {
          const { rounds, patch: _inline, ...rest } = pull;
          printJson({ id: pull.rkey, ...rest, revisions, files, comments, ...(opts.patch ? { patch } : {}) });
          return;
        }
        const from = isFork(pull, repoDid) ? `(fork) ${pull.source.branch}` : pull.source?.branch ?? t('(patch)', '(parche)');
        console.log(pull.title);
        console.log(`${pull.state} · ${pull.authorHandle} · ${day(pull.createdAt)} · ${from} -> ${pull.target.branch} · ${t('revision', 'revisión')} ${revisions}`);
        if (pull.body) console.log(`\n${pull.body}`);
        console.log(t(`\nChanged files (${files.length}):`, `\nArchivos cambiados (${files.length}):`));
        for (const f of files) console.log(`  ${f}`);
        printComments(comments);
        if (opts.patch) console.log(`\n${patch}`);
      },
    },
    checkout: {
      summary: t("Bring a PR's changes into a local branch to try them", 'Traer los cambios de una PR a una rama local para probarlos'),
      usage: t([
        'Usage: tgl pr checkout <#number | id | branch> [--branch <name>] [-R owner/name]',
        '',
        "Creates a branch from the PR's target branch and applies the PR's commits to it.",
        '  --branch   Name of the new local branch (default: the PR branch, or pr-<id>)',
        '',
        'Your working copy must have no uncommitted changes. Run "git fetch" first so the',
        'target branch is up to date.',
      ], [
        'Uso: tgl pr checkout <#número | id | rama> [--branch <nombre>] [-R cuenta/nombre]',
        '',
        'Crea una rama a partir de la rama destino de la PR y le aplica los commits de la PR.',
        '  --branch   Nombre de la rama local nueva (por defecto, la de la PR, o pr-<id>)',
        '',
        'Tu copia no puede tener cambios sin guardar en un commit. Ejecuta antes "git fetch"',
        'para que la rama destino esté al día.',
      ]).join('\n'),
      options: { ...repoOption, branch: { type: 'string' } },
      async run(opts, [ref]) {
        if (!isWorkingTreeClean()) {
          throw new TglError(t('You have uncommitted changes. Commit or stash them first.', 'Tienes cambios sin guardar. Haz commit o guárdalos aparte (git stash) antes.'));
        }
        const { pull, repoDid } = await findPull(opts, requireRef(ref));
        const patch = await pullPatch(pull, repoDid);
        if (!patch.trim()) throw new TglError(t('This PR has no changes to bring.', 'Esta PR no tiene cambios que traer.'));
        const baseRef = localRefFor(pull.target.branch);
        const wanted = opts.branch ?? pull.source?.branch;
        const branch = wanted && !refExists(`refs/heads/${wanted}`) ? wanted : `pr-${pull.rkey}`;
        if (refExists(`refs/heads/${branch}`)) {
          throw new TglError(t(`Branch "${branch}" already exists. Choose another name with --branch.`, `La rama "${branch}" ya existe. Elige otro nombre con --branch.`));
        }
        const previous = currentBranch();
        git(['switch', '-c', branch, baseRef]);
        try {
          if (/^From [0-9a-f]{40} /m.test(patch)) {
            git(['am', '--3way'], { input: patch });
          } else {
            // A plain diff (PR created by pasting a patch): apply it as one commit.
            git(['apply', '--index'], { input: patch });
            git(['commit', '-m', pull.title]);
          }
        } catch (err) {
          spawnQuiet(['am', '--abort']);
          spawnQuiet(['switch', previous]);
          spawnQuiet(['branch', '-D', branch]);
          // Keep git's first error line; its "hint:" lines describe a state we just undid.
          const reason = err.message.split('\n')[0];
          throw new TglError(t(
            `The PR's changes do not apply on ${baseRef} (maybe it is out of date: try "git fetch"). Nothing was changed.\n${reason}`,
            `Los cambios de la PR no encajan sobre ${baseRef} (quizá está desactualizada: prueba "git fetch"). No se ha cambiado nada.\n${reason}`,
          ));
        }
        console.log(t(`You are now on branch "${branch}" with the changes of "${pull.title}".`, `Estás en la rama "${branch}" con los cambios de "${pull.title}".`));
        console.log(t(`Back to where you were: git switch ${previous}`, `Para volver a donde estabas: git switch ${previous}`));
      },
    },
    comment: {
      summary: t('Comment on a PR', 'Comentar en una PR'),
      usage: t(
        `Usage: tgl pr comment [<#number | id | branch>] (--body <text> | --body-file <file>) [-R owner/name]\n\n${NO_REF_EN}`,
        `Uso: tgl pr comment [<#número | id | rama>] (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]\n\n${NO_REF_ES}`,
      ),
      options: { ...repoOption, ...bodyOptions },
      async run(opts, [ref]) {
        const body = readBody(opts, { required: true });
        const { pull } = await findPull(opts, ref);
        const session = await openSession();
        const pullRoundIdx = Math.max((pull.rounds?.length ?? 1) - 1, 0);
        await session.createRecord(NSID.comment, buildCommentRecord({ subject: pull, body, pullRoundIdx }));
        console.log(t(`Comment posted on "${pull.title}".`, `Comentario publicado en "${pull.title}".`));
      },
    },
    edit: {
      summary: t("Change a PR's title or description", 'Cambiar el título o la descripción de una PR'),
      usage: t([
        'Usage: tgl pr edit [<#number | id | branch>] [--title <title>] [--body <text> | --body-file <file>] [-R owner/name]',
        '',
        "Only the PR's author can edit it. Fields you leave out stay as they are.",
        NO_REF_EN,
      ], [
        'Uso: tgl pr edit [<#número | id | rama>] [--title <título>] [--body <texto> | --body-file <archivo>] [-R cuenta/nombre]',
        '',
        'Solo quien creó la PR puede editarla. Lo que no indiques se queda como está.',
        NO_REF_ES,
      ]).join('\n'),
      options: { ...repoOption, title: { type: 'string', short: 't' }, ...bodyOptions },
      async run(opts, [ref]) {
        const body = readBody(opts);
        const { pull } = await findPull(opts, ref);
        const session = await openSession();
        const value = await editTitleBody(session, pull, { title: opts.title, body }, { en: 'PR', es: 'PR' });
        console.log(t(`PR "${value.title}" updated.`, `PR "${value.title}" actualizada.`));
      },
    },
    update: {
      summary: t("Send a PR's branch again after new commits (a new revision)", 'Volver a enviar la rama de una PR tras nuevos commits (una revisión nueva)'),
      usage: t([
        'Usage: tgl pr update [<#number | id | branch>] [--allow-unpushed] [--dry-run] [-R owner/name]',
        '',
        'A Tangled PR keeps the changes it was sent with; commits added to the branch later',
        'only show up after this. It adds a new revision, as "resubmit" on the website does.',
        NO_REF_EN,
        '',
        '      --dry-run         Check everything without changing the PR',
        '      --allow-unpushed  Go ahead even if the branch has commits not pushed to Tangled',
      ], [
        'Uso: tgl pr update [<#número | id | rama>] [--allow-unpushed] [--dry-run] [-R cuenta/nombre]',
        '',
        'Una PR de Tangled se queda con los cambios con los que se envió; los commits que se',
        'añaden después a la rama solo aparecen tras esto. Añade una revisión nueva, como',
        '"resubmit" en la web.',
        NO_REF_ES,
        '',
        '      --dry-run         Comprobarlo todo sin cambiar la PR',
        '      --allow-unpushed  Seguir aunque la rama tenga commits sin subir a Tangled',
      ]).join('\n'),
      options: { ...repoOption, 'dry-run': { type: 'boolean', default: false }, 'allow-unpushed': { type: 'boolean', default: false } },
      async run(opts, [ref]) {
        const { pull, repoDid } = await findPull(opts, ref);
        if (pull.state !== 'open') throw new TglError(t(`PR "${pull.title}" is ${STATE_WORDS[pull.state]()}; only open PRs can be updated.`, `La PR "${pull.title}" está ${STATE_WORDS[pull.state]()}; solo se pueden actualizar las abiertas.`));
        if (pull.author !== whoAmI().did) throw new TglError(t('Only its author can update this PR.', 'Solo quien creó la PR puede actualizarla.'));
        if (!pull.rounds?.length || !pull.source?.branch || isFork(pull, repoDid)) {
          throw new TglError(t('tgl can only update PRs sent from a branch of this repo.', 'tgl solo puede actualizar PRs enviadas desde una rama de este repo.'));
        }
        const head = localRefFor(pull.source.branch);
        const { patch, commits } = formatPatch(localRefFor(pull.target.branch), head);
        if (patch === await pullPatch(pull, repoDid)) {
          console.log(t(`PR "${pull.title}" is already up to date with ${head}.`, `La PR "${pull.title}" ya está al día con ${head}.`));
          return;
        }
        checkPushed(repoDid, pull.source.branch, head, { force: opts['allow-unpushed'], dryRun: opts['dry-run'] });
        const revision = pull.rounds.length + 1;
        const summary = t(
          `PR "${pull.title}": revision ${revision} from ${head} (${commits} commit${commits === 1 ? '' : 's'})`,
          `PR "${pull.title}": revisión ${revision} desde ${head} (${commits} commit${commits === 1 ? '' : 's'})`,
        );
        if (opts['dry-run']) {
          console.log(t(`${summary}. Nothing was changed (--dry-run).`, `${summary}. No se ha cambiado nada (--dry-run).`));
          return;
        }
        const session = await openSession();
        const current = await session.getOwnRecord(pull.uri);
        const patchBlob = await session.uploadBlob(gzipSync(Buffer.from(patch, 'utf8')), 'application/gzip');
        // Rounds are append-only (lexicons/pulls/pull.json): Tangled may reject other changes.
        const rounds = [...(current.value.rounds ?? []), { createdAt: new Date().toISOString(), patchBlob }];
        await session.putRecord(current, { ...current.value, rounds });
        console.log(t(`${summary}: sent.`, `${summary}: enviada.`));
      },
    },
    close: {
      summary: t('Close a PR (or mark it merged with --merged)', 'Cerrar una PR (o marcarla como fusionada con --merged)'),
      usage: t([
        'Usage: tgl pr close [<#number | id | branch>] [--merged [--keep-issues]] [-R owner/name]',
        '',
        '  <#number | id | branch>  The PR (default: the open PR of the current branch)',
        '  --merged                 Mark it as merged instead of closed',
        '  --keep-issues            With --merged, leave open the issues the PR says it fixes',
        '',
        "This doesn't merge anything: it only changes the PR's state on Tangled.",
        'With --merged, issues named in the PR as "Fixes #12" (also "Closes", "Resolves",',
        'or with a link to the issue) are closed with a comment naming the PR.',
      ], [
        'Uso: tgl pr close [<#número | id | rama>] [--merged [--keep-issues]] [-R cuenta/nombre]',
        '',
        '  <#número | id | rama>  La PR (por defecto, la PR abierta de la rama actual)',
        '  --merged               Marcarla como fusionada en vez de cerrada',
        '  --keep-issues          Con --merged, dejar abiertas las issues que la PR dice resolver',
        '',
        'No fusiona nada: solo cambia el estado de la PR en Tangled.',
        'Con --merged, las issues que la PR nombra como "Fixes #12" (también "Closes",',
        '"Resolves", o con un enlace a la issue) se cierran con un comentario que nombra la PR.',
      ]).join('\n'),
      options: { ...repoOption, merged: { type: 'boolean', default: false }, 'keep-issues': { type: 'boolean', default: false } },
      run: (opts, [ref]) => setPullState(opts, ref, opts.merged ? 'merged' : 'closed'),
    },
    reopen: {
      summary: t('Reopen a closed PR', 'Volver a abrir una PR cerrada'),
      usage: t('Usage: tgl pr reopen <#number | id> [-R owner/name]', 'Uso: tgl pr reopen <#número | id> [-R cuenta/nombre]'),
      options: repoOption,
      run: (opts, [ref]) => setPullState(opts, requireRef(ref), 'open'),
    },
  },
};

function requireRef(ref) {
  if (!ref) throw new TglError(t('Say which PR: its #number or its id (tgl pr list).', 'Indica la PR: su #número o su id (tgl pr list).'));
  return ref;
}

function spawnQuiet(args) {
  try {
    git(args);
  } catch {
    // Best-effort cleanup.
  }
}
