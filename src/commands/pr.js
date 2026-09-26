import { gunzipSync, gzipSync } from 'node:zlib';
import { fetchBlob } from '../atproto.js';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { branchName, currentBranch, formatPatch } from '../git.js';
import { loadItems, pickById } from '../repoData.js';
import {
  buildPullCommentRecord, buildPullRecord, buildStatusRecord, NSID, repoWebUrl, resolveRepo,
} from '../tangled.js';
import { openSession } from './auth.js';
import { bodyOptions, printComments, readBody, repoOption } from './shared.js';

// Finds a PR by its id, full at:// address, or the branch of an open PR.
function pickPull(pulls, ref) {
  const byBranch = pulls.filter((p) => p.source?.branch === ref && p.state === 'open' && !p.source?.repo);
  if (!pulls.some((p) => p.rkey === ref || p.uri === ref)) {
    if (byBranch.length === 1) return byBranch[0];
    if (byBranch.length > 1) throw new TglError(`Hay varias PRs abiertas de la rama "${ref}"; usa su id (tgl pr list).`);
  }
  return pickById(pulls, ref, 'la PR');
}

export default {
  name: 'pr',
  summary: 'Crear, ver, comentar y cerrar pull requests',
  commands: {
    create: {
      summary: 'Crear una PR de una rama hacia master',
      usage: [
        'Uso: tgl pr create --title <título> [--body <texto> | --body-file <archivo>]',
        '                   [--head <rama>] [--base <rama>] [-R cuenta/nombre] [--dry-run]',
        '',
        '  -t, --title      Título de la PR (obligatorio)',
        '  -b, --body       Descripción',
        '  -F, --body-file  Leer la descripción de un archivo',
        '  -H, --head       Rama con los cambios (por defecto, la rama actual)',
        '  -B, --base       Rama destino (por defecto master)',
        '  -R, --repo       Repo de Tangled (por defecto, el remoto de Tangled de este git)',
        '      --dry-run    Enseñar lo que se crearía sin crear nada',
        '',
        'Los cambios se calculan en tu copia local con "git format-patch base..head".',
      ].join('\n'),
      options: {
        ...repoOption,
        title: { type: 'string', short: 't' },
        ...bodyOptions,
        head: { type: 'string', short: 'H' },
        base: { type: 'string', short: 'B', default: 'master' },
        'dry-run': { type: 'boolean', default: false },
      },
      async run(opts) {
        if (!opts.title?.trim()) throw new TglError('Falta el título: --title "..."');
        const body = readBody(opts);
        const head = opts.head ?? currentBranch();
        // The patch uses the refs as given; the record stores plain branch names.
        const base = branchName(opts.base);
        const headBranch = branchName(head);
        if (headBranch === base) throw new TglError(`La rama de cambios y la de destino son la misma ("${base}").`);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const { patch, commits } = formatPatch(opts.base, head);
        const gz = gzipSync(Buffer.from(patch, 'utf8'));

        console.log(`Repositorio: ${label}`);
        console.log(`PR: ${headBranch} -> ${base} (${commits} commit${commits === 1 ? '' : 's'}, parche de ${gz.length} bytes comprimido)`);

        const fields = { repoDid, title: opts.title, body, base, head: headBranch };
        if (opts['dry-run']) {
          const preview = buildPullRecord({ ...fields, patchBlob: '<parche comprimido>' });
          console.log('\nSe crearía este registro (no se ha creado nada):');
          console.log(JSON.stringify(preview, null, 2));
          return;
        }

        const session = await openSession();
        const patchBlob = await session.uploadBlob(gz, 'application/gzip');
        const record = buildPullRecord({ ...fields, patchBlob });
        const { uri } = await session.createRecord(NSID.pull, record);
        console.log(`\nPR creada. Id: ${uri.split('/').pop()}`);
        console.log(`Dirección: ${uri}`);
        console.log(`Véla en: ${repoWebUrl(repoDid)}/pulls (Tangled puede tardar unos segundos en mostrarla)`);
      },
    },
    list: {
      summary: 'Listar las PRs de este repositorio',
      usage: 'Uso: tgl pr list [--state open|closed|merged|all] [-R cuenta/nombre]',
      options: { ...repoOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const valid = ['open', 'closed', 'merged', 'all'];
        if (!valid.includes(opts.state)) throw new TglError(`--state debe ser uno de: ${valid.join(', ')}`);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const pulls = (await loadItems('pull', whoAmI(), repoDid)).filter((p) => opts.state === 'all' || p.state === opts.state);
        if (!pulls.length) {
          console.log(`No hay PRs (${opts.state}) en ${label}.`);
          return;
        }
        for (const p of pulls) {
          const from = p.source?.repo ? `(fork) ${p.source.branch}` : p.source?.branch ?? '(parche)';
          console.log(`${p.rkey}  ${p.state.padEnd(6)}  ${p.createdAt.slice(0, 10)}  ${`${from} -> ${p.target.branch}`.padEnd(28)}  ${p.title}  [${p.authorHandle}]`);
        }
      },
    },
    view: {
      summary: 'Ver una PR: descripción, archivos cambiados y comentarios',
      usage: [
        'Uso: tgl pr view <id | rama> [--patch] [-R cuenta/nombre]',
        '',
        '  --patch   Mostrar los cambios completos',
      ].join('\n'),
      options: { ...repoOption, patch: { type: 'boolean', default: false } },
      async run(opts, [ref]) {
        if (!ref) throw new TglError('Indica qué PR ver: su id (tgl pr list) o el nombre de su rama.');
        const { repoDid } = await resolveRepo(opts.repo);
        const account = whoAmI();
        const pull = pickPull(await loadItems('pull', account, repoDid), ref);
        // Old PRs kept the patch inline instead of in rounds.
        const round = pull.rounds?.at(-1);
        const patch = round ? gunzipSync(await fetchBlob(pull.author, round.patchBlob)).toString('utf8') : pull.patch ?? '';
        const files = [...new Set([...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]))];

        console.log(`${pull.title}`);
        console.log(`${pull.state} · ${pull.authorHandle} · ${pull.createdAt.slice(0, 10)} · ${pull.source?.branch ?? '(parche)'} -> ${pull.target.branch} · revisión ${pull.rounds?.length ?? 1}`);
        if (pull.body) console.log(`\n${pull.body}`);
        console.log(`\nArchivos cambiados (${files.length}):`);
        for (const f of files) console.log(`  ${f}`);
        await printComments(account, pull.uri, NSID.pullComment, '.pull');
        if (opts.patch) console.log(`\n${patch}`);
      },
    },
    comment: {
      summary: 'Comentar en una PR',
      usage: 'Uso: tgl pr comment <id | rama> (--body <texto> | --body-file <archivo>) [-R cuenta/nombre]',
      options: { ...repoOption, ...bodyOptions },
      async run(opts, [ref]) {
        if (!ref) throw new TglError('Indica en qué PR comentar: su id (tgl pr list) o el nombre de su rama.');
        const body = readBody(opts, { required: true });
        const { repoDid } = await resolveRepo(opts.repo);
        const pull = pickPull(await loadItems('pull', whoAmI(), repoDid), ref);
        const session = await openSession();
        await session.createRecord(NSID.pullComment, buildPullCommentRecord({ pullUri: pull.uri, body }));
        console.log(`Comentario publicado en "${pull.title}".`);
      },
    },
    close: {
      summary: 'Cerrar una PR (o marcarla como fusionada con --merged)',
      usage: [
        'Uso: tgl pr close <id | rama> [--merged] [-R cuenta/nombre]',
        '',
        '  <id | rama>  El id que muestra "tgl pr list", o el nombre de la rama de la PR',
        '  --merged     Marcarla como fusionada en vez de cerrada',
        '',
        'No fusiona nada: solo cambia el estado de la PR en Tangled.',
      ].join('\n'),
      options: { ...repoOption, merged: { type: 'boolean', default: false } },
      async run(opts, [ref]) {
        if (!ref) throw new TglError('Indica qué PR cerrar: su id (tgl pr list) o el nombre de su rama.');
        await setPullState(opts, ref, opts.merged ? 'merged' : 'closed');
      },
    },
    reopen: {
      summary: 'Volver a abrir una PR cerrada',
      usage: 'Uso: tgl pr reopen <id> [-R cuenta/nombre]',
      options: repoOption,
      async run(opts, [ref]) {
        if (!ref) throw new TglError('Indica qué PR reabrir: su id (tgl pr list --state all).');
        await setPullState(opts, ref, 'open');
      },
    },
  },
};

const STATE_WORDS = { open: 'abierta', closed: 'cerrada', merged: 'fusionada' };

async function setPullState(opts, ref, state) {
  const { repoDid } = await resolveRepo(opts.repo);
  const pull = pickPull(await loadItems('pull', whoAmI(), repoDid), ref);
  if (pull.state === state) {
    console.log(`La PR "${pull.title}" ya estaba ${STATE_WORDS[state]}.`);
    return;
  }
  const session = await openSession();
  await session.createRecord(NSID.pullStatus, buildStatusRecord({ pullUri: pull.uri, state }));
  console.log(`PR "${pull.title}" marcada como ${STATE_WORDS[state]}.`);
}
