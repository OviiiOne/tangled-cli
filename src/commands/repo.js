import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { git, remoteDefaultBranch } from '../git.js';
import { t } from '../i18n.js';
import {
  authorOf, buildRepoRecord, DEFAULT_KNOT, knotOf, NSID, repoGitUrl, repoNameProblem, repoWebUrl, resolveRepo,
} from '../tangled.js';
import { openSession } from './auth.js';
import { jsonOption, openInBrowser, printJson, repoOption, webOption } from './shared.js';

function remoteBranches(url) {
  return [...git(['ls-remote', '--heads', url]).matchAll(/\trefs\/heads\/(\S+)$/gm)].map((m) => m[1]);
}

function remoteNames() {
  return git(['remote']).split('\n').filter(Boolean);
}

async function ownRecordExists(session, uri) {
  try {
    await session.getOwnRecord(uri);
    return true;
  } catch (err) {
    if (err.xrpcError === 'RecordNotFound' || err.status === 404) return false;
    throw err;
  }
}

export default {
  name: 'repo',
  summary: t('View a repository and change its settings', 'Ver un repositorio y cambiar sus ajustes'),
  commands: {
    view: {
      summary: t('Show owner, branches and addresses of a repo', 'Ver dueño, ramas y direcciones de un repo'),
      usage: t(
        'Usage: tgl repo view [--web] [--json] [-R owner/name]\n\n  -w, --web  Open the repo in the browser',
        'Uso: tgl repo view [--web] [--json] [-R cuenta/nombre]\n\n  -w, --web  Abrir el repo en el navegador',
      ),
      options: { ...repoOption, ...jsonOption, ...webOption },
      async run(opts) {
        const { repoDid } = await resolveRepo(opts.repo);
        if (opts.web) {
          openInBrowser(repoWebUrl(repoDid));
          return;
        }
        const records = await recordsLinkingTo({ account: whoAmI(), collection: NSID.repo, links: [{ target: repoDid, path: '.repoDid' }] });
        // A rename leaves an older record behind; the newest one has the current name.
        const record = records.sort((a, b) => (b.value.createdAt ?? '').localeCompare(a.value.createdAt ?? ''))[0];
        const url = repoGitUrl(repoDid);
        const info = {
          did: repoDid,
          name: record?.value.name ?? record?.uri.split('/').pop(),
          owner: record ? await handleOf(authorOf(record.uri)) : undefined,
          description: record?.value.description,
          defaultBranch: remoteDefaultBranch(url),
          branches: remoteBranches(url),
          web: repoWebUrl(repoDid),
          gitHttps: url,
          gitSsh: `git@tangled.org:${repoDid}`,
        };
        if (opts.json) {
          printJson(info);
          return;
        }
        console.log(`${info.owner}/${info.name}`);
        if (info.description) console.log(info.description);
        console.log('');
        console.log(`${t('Default branch', 'Rama principal')}: ${info.defaultBranch ?? t('(none)', '(ninguna)')}`);
        console.log(`${t('Branches', 'Ramas')}: ${info.branches.join(', ') || t('(none)', '(ninguna)')}`);
        console.log(`Web: ${info.web}`);
        console.log(`Git (HTTPS): ${info.gitHttps}`);
        console.log(`Git (SSH): ${info.gitSsh}`);
      },
    },
    create: {
      summary: t('Create a new repository on Tangled', 'Crear un repositorio nuevo en Tangled'),
      usage: t([
        'Usage: tgl repo create <name> [--description <text>] [--branch <name>] [--knot <host>]',
        '                       [--spindle <host>] [--remote <name>]',
        '',
        '  -d, --description  Short description (up to 140 characters)',
        '  -b, --branch       Default branch (default: main)',
        `      --knot         Git server to host it on (default: ${DEFAULT_KNOT})`,
        '      --spindle      CI server for its pipelines, e.g. spindle.tangled.sh (default: none)',
        '      --remote       Also add it as a git remote with this name to the current git repo',
        '',
        'The repo starts empty: push to it afterwards.',
      ], [
        'Uso: tgl repo create <nombre> [--description <texto>] [--branch <nombre>] [--knot <servidor>]',
        '                     [--spindle <servidor>] [--remote <nombre>]',
        '',
        '  -d, --description  Descripción corta (hasta 140 caracteres)',
        '  -b, --branch       Rama principal (por defecto, main)',
        `      --knot         Servidor git donde alojarlo (por defecto, ${DEFAULT_KNOT})`,
        '      --spindle      Servidor de CI para sus pipelines, p. ej. spindle.tangled.sh (por defecto, ninguno)',
        '      --remote       Añadirlo también como remoto git con este nombre al repo git actual',
        '',
        'El repo nace vacío: súbele código después.',
      ]).join('\n'),
      options: {
        description: { type: 'string', short: 'd' },
        branch: { type: 'string', short: 'b', default: 'main' },
        knot: { type: 'string', default: DEFAULT_KNOT },
        spindle: { type: 'string' },
        remote: { type: 'string' },
      },
      async run(opts, [rawName]) {
        const name = rawName?.replace(/\.git$/, '');
        const problem = repoNameProblem(name);
        if (problem) throw new TglError(problem);
        if (opts.description && [...opts.description].length > 140) {
          throw new TglError(t('The description must be 140 characters or fewer.', 'La descripción no puede pasar de 140 caracteres.'));
        }
        if (opts.remote && remoteNames().includes(opts.remote)) {
          throw new TglError(t(`This git repo already has a remote called "${opts.remote}".`, `Este repo git ya tiene un remoto llamado "${opts.remote}".`));
        }
        const rkey = name.toLowerCase();
        const session = await openSession();
        const uri = `at://${session.did}/${NSID.repo}/${rkey}`;
        if (await ownRecordExists(session, uri)) {
          throw new TglError(t(`You already have a repository called "${rkey}" (or an old record of a renamed one).`, `Ya tienes un repositorio llamado "${rkey}" (o el registro antiguo de uno renombrado).`));
        }
        // As the website does: the knot creates the git repo and its DID, then the
        // record on the user's account announces it to Tangled.
        const knot = opts.knot.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const { repoDid } = await session.callService(`https://${knot}`, 'sh.tangled.repo.create', { rkey, name: rkey, defaultBranch: opts.branch });
        if (!repoDid) throw new TglError(t(`The knot ${knot} did not return the new repo's DID.`, `El knot ${knot} no ha devuelto el DID del repo nuevo.`));
        try {
          await session.createRecord(NSID.repo, buildRepoRecord({ name, knot, repoDid, description: opts.description, spindle: opts.spindle }), { rkey });
        } catch (err) {
          await session.callService(`https://${knot}`, 'sh.tangled.repo.delete', { repo: repoDid, did: session.did, name: rkey, rkey }).catch(() => {});
          throw err;
        }
        const ssh = `git@tangled.org:${repoDid}`;
        console.log(t(`Repository ${session.handle}/${name} created.`, `Repositorio ${session.handle}/${name} creado.`));
        console.log(`DID: ${repoDid}`);
        console.log(`Web: ${repoWebUrl(repoDid)}`);
        console.log(`Git (SSH): ${ssh}`);
        if (opts.remote) {
          git(['remote', 'add', opts.remote, ssh]);
          console.log(t(`Remote "${opts.remote}" added. Push with: git push -u ${opts.remote} ${opts.branch}`, `Remoto "${opts.remote}" añadido. Sube con: git push -u ${opts.remote} ${opts.branch}`));
        } else {
          console.log(t(`To push an existing repo: git remote add tangled ${ssh} && git push -u tangled ${opts.branch}`, `Para subir un repo que ya tienes: git remote add tangled ${ssh} && git push -u tangled ${opts.branch}`));
        }
      },
    },
    'set-default-branch': {
      summary: t("Change the repo's default branch", 'Cambiar la rama principal del repo'),
      usage: t(
        'Usage: tgl repo set-default-branch <branch> [-R owner/name]\n\nOnly the owner or a collaborator can do it. The branch must exist on Tangled.',
        'Uso: tgl repo set-default-branch <rama> [-R cuenta/nombre]\n\nSolo lo puede hacer el dueño o un colaborador. La rama tiene que existir en Tangled.',
      ),
      options: repoOption,
      async run(opts, [branch]) {
        if (!branch) throw new TglError(t('Say which branch: tgl repo set-default-branch main', 'Indica la rama: tgl repo set-default-branch master'));
        const { repoDid, label } = await resolveRepo(opts.repo);
        const url = repoGitUrl(repoDid);
        if (!remoteBranches(url).includes(branch)) {
          throw new TglError(t(`Branch "${branch}" does not exist on Tangled. Push it first.`, `La rama "${branch}" no existe en Tangled. Súbela primero.`));
        }
        const knot = await knotOf(repoDid);
        const session = await openSession();
        await session.callService(knot, 'sh.tangled.repo.setDefaultBranch', { repo: repoDid, defaultBranch: branch });
        console.log(t(`Default branch of ${label} is now "${branch}".`, `La rama principal de ${label} ahora es "${branch}".`));
      },
    },
  },
};
