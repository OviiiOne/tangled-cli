import { handleOf } from '../atproto.js';
import { recordsLinkingTo } from '../backlinks.js';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { git, remoteDefaultBranch } from '../git.js';
import { t } from '../i18n.js';
import { authorOf, knotOf, NSID, repoGitUrl, repoWebUrl, resolveRepo } from '../tangled.js';
import { openSession } from './auth.js';
import { jsonOption, printJson, repoOption } from './shared.js';

function remoteBranches(url) {
  return [...git(['ls-remote', '--heads', url]).matchAll(/\trefs\/heads\/(\S+)$/gm)].map((m) => m[1]);
}

export default {
  name: 'repo',
  summary: t('View a repository and change its settings', 'Ver un repositorio y cambiar sus ajustes'),
  commands: {
    view: {
      summary: t('Show owner, branches and addresses of a repo', 'Ver dueño, ramas y direcciones de un repo'),
      usage: t('Usage: tgl repo view [--json] [-R owner/name]', 'Uso: tgl repo view [--json] [-R cuenta/nombre]'),
      options: { ...repoOption, ...jsonOption },
      async run(opts) {
        const { repoDid } = await resolveRepo(opts.repo);
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
