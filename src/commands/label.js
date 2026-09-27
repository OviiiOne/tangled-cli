import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import {
  buildLabelDefinitionRecord, LABEL_DEFINITION, LABEL_KINDS, labelKind, repoLabelDefs, repoRecord,
} from '../labels.js';
import { authorOf, NSID, resolveRepo, TANGLED_DID } from '../tangled.js';
import { openSession } from './auth.js';
import { jsonOption, printJson, repoOption } from './shared.js';

const SCOPE_WORDS = { [NSID.issue]: 'issues', [NSID.pull]: 'PRs' };

// A repo's labels are listed in its repo record, which lives in the owner's account:
// only the owner can add or remove them (appview/repo/repo.go, AddLabelDef).
async function ownRepoRecord(session, repoDid) {
  const record = await repoRecord(whoAmI(), repoDid);
  if (!record) throw new TglError(t('Could not find this repo on Tangled.', 'No encuentro este repo en Tangled.'));
  if (authorOf(record.uri) !== session.did) {
    throw new TglError(t("Only the repo's owner can create or remove its labels.", 'Solo el dueño del repo puede crear o quitar sus etiquetas.'));
  }
  return session.getOwnRecord(record.uri);
}

export default {
  name: 'label',
  summary: t("List, create and remove a repo's labels", 'Ver, crear y quitar las etiquetas de un repo'),
  commands: {
    list: {
      summary: t('List the labels a repo uses', 'Ver las etiquetas que usa un repo'),
      usage: t('Usage: tgl label list [--json] [-R owner/name]', 'Uso: tgl label list [--json] [-R cuenta/nombre]'),
      options: { ...repoOption, ...jsonOption },
      async run(opts) {
        const { repoDid, label } = await resolveRepo(opts.repo);
        const defs = await repoLabelDefs(whoAmI(), repoDid);
        if (opts.json) {
          printJson(defs.map((d) => ({ ...d, id: d.uri.split('/').pop() })));
          return;
        }
        if (!defs.length) {
          console.log(t(`${label} uses no labels.`, `${label} no usa etiquetas.`));
          return;
        }
        for (const d of defs) {
          const scope = (d.scope ?? []).map((s) => SCOPE_WORDS[s] ?? s).join(' + ') || t('all', 'todo');
          const origin = authorOf(d.uri) === TANGLED_DID ? ' (Tangled)' : '';
          console.log(`${d.name.padEnd(20)} ${labelKind(d).padEnd(18)} ${scope.padEnd(14)} ${d.color ?? ''}${origin}`);
        }
        console.log(t(
          '\nPut them on an issue or PR with: tgl issue label <issue> --add <name>',
          '\nPonlas en una issue o PR con: tgl issue label <issue> --add <nombre>',
        ));
      },
    },
    create: {
      summary: t('Create a label for a repo (owner only)', 'Crear una etiqueta para un repo (solo el dueño)'),
      usage: t([
        'Usage: tgl label create <name> [--kind <kind>] [--values a,b,c] [--multiple]',
        '                        [--for issues|prs|both] [--color #RRGGBB] [-R owner/name]',
        '',
        `  -k, --kind      ${Object.keys(LABEL_KINDS).join(' | ')} (default: simple, a label with no value)`,
        '      --values    Fixed choices for a text label, e.g. --values high,medium,low',
        '      --multiple  Allow several values at once (not for simple labels)',
        '      --for       Where it can be used (default: both)',
        '  -c, --color     Background color, e.g. #E11D48',
        '',
        'Examples:',
        '  tgl label create bug --color "#E11D48"',
        '  tgl label create priority --values high,medium,low --for issues',
        '  tgl label create reviewer --kind person --multiple --for prs',
      ], [
        'Uso: tgl label create <nombre> [--kind <tipo>] [--values a,b,c] [--multiple]',
        '                      [--for issues|prs|both] [--color #RRGGBB] [-R cuenta/nombre]',
        '',
        `  -k, --kind      ${Object.keys(LABEL_KINDS).join(' | ')} (por defecto, simple: una etiqueta sin valor)`,
        '      --values    Opciones fijas de una etiqueta de texto, p. ej. --values alta,media,baja',
        '      --multiple  Permitir varios valores a la vez (no en las simples)',
        '      --for       Dónde se puede usar (por defecto, both: issues y PRs)',
        '  -c, --color     Color de fondo, p. ej. #E11D48',
        '',
        'Ejemplos:',
        '  tgl label create bug --color "#E11D48"',
        '  tgl label create prioridad --values alta,media,baja --for issues',
        '  tgl label create revisor --kind person --multiple --for prs',
      ]).join('\n'),
      options: {
        ...repoOption,
        kind: { type: 'string', short: 'k', default: 'simple' },
        values: { type: 'string' },
        multiple: { type: 'boolean', default: false },
        for: { type: 'string', default: 'both' },
        color: { type: 'string', short: 'c' },
      },
      async run(opts, [name]) {
        const values = (opts.values ?? '').split(',').map((v) => v.trim()).filter(Boolean);
        const definition = buildLabelDefinitionRecord({ name, kind: opts.kind, values, multiple: opts.multiple, scope: opts.for, color: opts.color });
        const { repoDid, label } = await resolveRepo(opts.repo);
        const defs = await repoLabelDefs(whoAmI(), repoDid);
        if (defs.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
          throw new TglError(t(`${label} already has a label called "${name}".`, `${label} ya tiene una etiqueta llamada "${name}".`));
        }
        const session = await openSession();
        const repo = await ownRepoRecord(session, repoDid);
        // As the website does: the definition goes to the owner's account, then the repo
        // record starts listing it.
        const { uri } = await session.createRecord(LABEL_DEFINITION, definition);
        try {
          await session.putRecord(repo, { ...repo.value, labels: [...(repo.value.labels ?? []), uri] });
        } catch (err) {
          await session.deleteRecord(uri).catch(() => {});
          throw err;
        }
        console.log(t(`Label "${name}" created in ${label}.`, `Etiqueta "${name}" creada en ${label}.`));
      },
    },
    delete: {
      summary: t('Remove a label from a repo (owner only)', 'Quitar una etiqueta de un repo (solo el dueño)'),
      usage: t([
        'Usage: tgl label delete <name> [-R owner/name]',
        '',
        'The repo stops offering the label, and issues and PRs stop showing it. A label you',
        "created is deleted too, as on the website; Tangled's own labels (good-first-issue…)",
        'are only removed from this repo and can be added back later.',
      ], [
        'Uso: tgl label delete <nombre> [-R cuenta/nombre]',
        '',
        'El repo deja de ofrecer la etiqueta, y las issues y PRs dejan de mostrarla. Una',
        'etiqueta que creaste tú también se borra, como en la web; las de Tangled',
        '(good-first-issue…) solo se quitan de este repo y se pueden volver a añadir.',
      ]).join('\n'),
      options: repoOption,
      async run(opts, [name]) {
        if (!name) throw new TglError(t('Say which label: tgl label delete <name>', 'Indica la etiqueta: tgl label delete <nombre>'));
        const { repoDid, label } = await resolveRepo(opts.repo);
        const defs = await repoLabelDefs(whoAmI(), repoDid);
        const def = defs.find((d) => d.name.toLowerCase() === name.toLowerCase());
        if (!def) throw new TglError(t(`${label} has no label "${name}". See them with: tgl label list`, `${label} no tiene la etiqueta "${name}". Míralas con: tgl label list`));
        const session = await openSession();
        const repo = await ownRepoRecord(session, repoDid);
        await session.putRecord(repo, { ...repo.value, labels: (repo.value.labels ?? []).filter((u) => u !== def.uri) });
        if (authorOf(def.uri) === session.did) await session.deleteRecord(def.uri);
        console.log(t(`Label "${def.name}" removed from ${label}.`, `Etiqueta "${def.name}" quitada de ${label}.`));
      },
    },
  },
};
