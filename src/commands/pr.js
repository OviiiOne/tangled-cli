import { gzipSync } from 'node:zlib';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import {
  branchName, currentBranch, formatPatch, git, isWorkingTreeClean, localRefFor, refExists, remoteDefaultBranch,
} from '../git.js';
import { t } from '../i18n.js';
import { isIdOf, loadItems, notFound } from '../repoData.js';
import {
  buildCommentRecord, buildPullRecord, buildStatusRecord, isFork, NSID, pullPatch, repoGitUrl, repoWebUrl, resolveRepo,
} from '../tangled.js';
import { openSession } from './auth.js';
import {
  bodyOptions, checkState, day, jsonOption, limitOption, loadComments, parseLimit, printComments, printJson, readBody, repoOption,
} from './shared.js';

const STATE_WORDS = {
  open: () => t('open', 'abierta'),
  closed: () => t('closed', 'cerrada'),
  merged: () => t('merged', 'fusionada'),
};

// Finds a PR by its id, full at:// address, or the branch of an open PR in the same repo.
async function findPull(opts, ref) {
  if (!ref) throw new TglError(t('Say which PR: its id (tgl pr list) or its branch name.', 'Indica la PR: su id (tgl pr list) o el nombre de su rama.'));
  const { repoDid } = await resolveRepo(opts.repo);
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
  const { pull } = await findPull(opts, ref);
  if (pull.state === state) {
    console.log(t(`PR "${pull.title}" was already ${STATE_WORDS[state]()}.`, `La PR "${pull.title}" ya estaba ${STATE_WORDS[state]()}.`));
    return;
  }
  const session = await openSession();
  await session.createRecord(NSID.pullStatus, buildStatusRecord({ pullUri: pull.uri, state }));
  console.log(t(`PR "${pull.title}" marked as ${STATE_WORDS[state]()}.`, `PR "${pull.title}" marcada como ${STATE_WORDS[state]()}.`));
}

export default {
  name: 'pr',
  summary: t('Create, view, check out, comment on and close pull requests', 'Crear, ver, probar, comentar y cerrar pull requests'),
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
        '',
        'The changes are computed in your local copy with "git format-patch base..head".',
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
        '',
        'Los cambios se calculan en tu copia local con "git format-patch base..head".',
      ]).join('\n'),
      options: {
        ...repoOption,
        title: { type: 'string', short: 't' },
        ...bodyOptions,
        head: { type: 'string', short: 'H' },
        base: { type: 'string', short: 'B' },
        'dry-run': { type: 'boolean', default: false },
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
        'Usage: tgl pr list [--state open|closed|merged|all] [--limit N] [--json] [-R owner/name]\n\n  -L, --limit  How many to show (default 30; 0 = all)',
        'Uso: tgl pr list [--state open|closed|merged|all] [--limit N] [--json] [-R cuenta/nombre]\n\n  -L, --limit  Cuántas mostrar (por defecto 30; 0 = todas)',
      ),
      options: { ...repoOption, ...limitOption, ...jsonOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const state = checkState(opts.state, ['open', 'closed', 'merged', 'all']);
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
        'Usage: tgl pr view <id | branch> [--patch] [--json] [-R owner/name]\n\n  --patch   Show the full changes',
        'Uso: tgl pr view <id | rama> [--patch] [--json] [-R cuenta/nombre]\n\n  --patch   Mostrar los cambios completos',
      ),
      options: { ...repoOption, ...jsonOption, patch: { type: 'boolean', default: false } },
      async run(opts, [ref]) {
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
        'Usage: tgl pr checkout <id | branch> [--branch <name>] [-R owner/name]',
        '',
        "Creates a branch from the PR's target branch and applies the PR's commits to it.",
        '  --branch   Name of the new local branch (default: the PR branch, or pr-<id>)',
        '',
        'Your working copy must have no uncommitted changes. Run "git fetch" first so the',
        'target branch is up to date.',
      ], [
        'Uso: tgl pr checkout <id | rama> [--branch <nombre>] [-R cuenta/nombre]',
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
        const { pull, repoDid } = await findPull(opts, ref);
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
        'Usage: tgl pr comment <id | branch> (--body <text> | --body-file <file>) [-R owner/name]',
        'Uso: tgl pr comment <id | rama> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]',
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
    close: {
      summary: t('Close a PR (or mark it merged with --merged)', 'Cerrar una PR (o marcarla como fusionada con --merged)'),
      usage: t([
        'Usage: tgl pr close <id | branch> [--merged] [-R owner/name]',
        '',
        '  <id | branch>  The id shown by "tgl pr list", or the PR branch name',
        '  --merged       Mark it as merged instead of closed',
        '',
        "This doesn't merge anything: it only changes the PR's state on Tangled.",
      ], [
        'Uso: tgl pr close <id | rama> [--merged] [-R cuenta/nombre]',
        '',
        '  <id | rama>  El id que muestra "tgl pr list", o el nombre de la rama de la PR',
        '  --merged     Marcarla como fusionada en vez de cerrada',
        '',
        'No fusiona nada: solo cambia el estado de la PR en Tangled.',
      ]).join('\n'),
      options: { ...repoOption, merged: { type: 'boolean', default: false } },
      run: (opts, [ref]) => setPullState(opts, ref, opts.merged ? 'merged' : 'closed'),
    },
    reopen: {
      summary: t('Reopen a closed PR', 'Volver a abrir una PR cerrada'),
      usage: t('Usage: tgl pr reopen <id> [-R owner/name]', 'Uso: tgl pr reopen <id> [-R cuenta/nombre]'),
      options: repoOption,
      run: (opts, [ref]) => setPullState(opts, ref, 'open'),
    },
  },
};

function spawnQuiet(args) {
  try {
    git(args);
  } catch {
    // Best-effort cleanup.
  }
}
