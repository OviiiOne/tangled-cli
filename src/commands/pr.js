import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { listAllRecords } from '../atproto.js';
import { readLoginInfo } from '../credentials.js';
import { TglError } from '../errors.js';
import { branchName, currentBranch, formatPatch } from '../git.js';
import { buildPullRecord, buildStatusRecord, NSID, pullStates, repoWebUrl, resolveRepo } from '../tangled.js';
import { openSession } from './auth.js';

const repoOption = { repo: { type: 'string', short: 'R' } };

function whoAmI() {
  const info = readLoginInfo();
  if (!info) throw new TglError('No has iniciado sesión. Ejecuta "tgl auth login" en tu terminal.');
  return info;
}

// Reads only this account's own PRs: they are the records it has written.
async function loadPulls(account, repoDid) {
  const [pulls, statuses] = await Promise.all([
    listAllRecords(account.pds, account.did, NSID.pull),
    listAllRecords(account.pds, account.did, NSID.pullStatus),
  ]);
  const stateOf = pullStates(statuses);
  return pulls
    .filter((r) => r.value.target?.repo === repoDid)
    .map((r) => ({ uri: r.uri, rkey: r.uri.split('/').pop(), state: stateOf(r.uri), ...r.value }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Finds a PR by its id (rkey), full at:// address, or source branch name.
function pickPull(pulls, ref) {
  const byId = pulls.find((p) => p.rkey === ref || p.uri === ref);
  if (byId) return byId;
  const byBranch = pulls.filter((p) => p.source?.branch === ref && p.state === 'open');
  if (byBranch.length === 1) return byBranch[0];
  if (byBranch.length > 1) throw new TglError(`Hay varias PRs abiertas de la rama "${ref}"; usa su id (tgl pr list).`);
  throw new TglError(`No encuentro ninguna PR "${ref}" en este repositorio. Mira los ids con "tgl pr list".`);
}

export default {
  name: 'pr',
  summary: 'Crear, listar y cerrar pull requests',
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
        body: { type: 'string', short: 'b' },
        'body-file': { type: 'string', short: 'F' },
        head: { type: 'string', short: 'H' },
        base: { type: 'string', short: 'B', default: 'master' },
        'dry-run': { type: 'boolean', default: false },
      },
      async run(opts) {
        if (!opts.title?.trim()) throw new TglError('Falta el título: --title "..."');
        const body = opts['body-file'] ? readFileSync(opts['body-file'], 'utf8') : opts.body;
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
      summary: 'Listar tus PRs de este repositorio',
      usage: [
        'Uso: tgl pr list [--state open|closed|merged|all] [-R cuenta/nombre]',
        '',
        'Muestra solo las PRs creadas con tu cuenta (las de otras personas se guardan en sus cuentas).',
      ].join('\n'),
      options: { ...repoOption, state: { type: 'string', short: 's', default: 'open' } },
      async run(opts) {
        const valid = ['open', 'closed', 'merged', 'all'];
        if (!valid.includes(opts.state)) throw new TglError(`--state debe ser uno de: ${valid.join(', ')}`);
        const { repoDid, label } = await resolveRepo(opts.repo);
        const pulls = (await loadPulls(whoAmI(), repoDid)).filter((p) => opts.state === 'all' || p.state === opts.state);
        if (!pulls.length) {
          console.log(`No hay PRs (${opts.state}) tuyas en ${label}.`);
          return;
        }
        for (const p of pulls) {
          const branch = `${p.source?.branch ?? '?'} -> ${p.target.branch}`;
          console.log(`${p.rkey}  ${p.state.padEnd(6)}  ${p.createdAt.slice(0, 10)}  ${branch.padEnd(28)}  ${p.title}`);
        }
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
        const { repoDid } = await resolveRepo(opts.repo);
        const pull = pickPull(await loadPulls(whoAmI(), repoDid), ref);
        const state = opts.merged ? 'merged' : 'closed';
        if (pull.state === state) {
          console.log(`La PR "${pull.title}" ya estaba ${state === 'merged' ? 'fusionada' : 'cerrada'}.`);
          return;
        }
        const session = await openSession();
        await session.createRecord(NSID.pullStatus, buildStatusRecord({ pullUri: pull.uri, state }));
        console.log(`PR "${pull.title}" marcada como ${state === 'merged' ? 'fusionada' : 'cerrada'}.`);
      },
    },
  },
};
