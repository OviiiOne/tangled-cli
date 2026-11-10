import { TglError } from '../errors.js';
import { t } from '../i18n.js';
import { deleteOnKnot, createOnKnot } from '../knot.js';
import { buildLabelDefinitionRecord, labelSlug, repoLabels } from '../labels.js';
import { NSID, resolveRepo } from '../tangled.js';
import { openSession } from './auth.js';
import { jsonOption, printJson, repoOption } from './shared.js';

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
        const defs = await repoLabels(repoDid);
        if (opts.json) {
          printJson(defs);
          return;
        }
        if (!defs.length) {
          console.log(t(`${label} uses no labels.`, `${label} no usa etiquetas.`));
          return;
        }
        for (const d of defs) console.log(`${d.name.padEnd(24)} ${d.color ?? ''}`);
      },
    },
    create: {
      summary: t('Create a label for a repo (owner only)', 'Crear una etiqueta para un repo (solo el dueño)'),
      usage: t([
        'Usage: tgl label create <name> [--color #RRGGBB] [-R owner/name]',
        '',
        '  -c, --color  Background color, e.g. #E11D48',
        '',
        "A deleted label's name can't be used again in that repo.",
      ], [
        'Uso: tgl label create <nombre> [--color #RRGGBB] [-R cuenta/nombre]',
        '',
        '  -c, --color  Color de fondo, p. ej. #E11D48',
        '',
        'El nombre de una etiqueta borrada no se puede volver a usar en ese repo.',
      ]).join('\n'),
      options: { ...repoOption, color: { type: 'string', short: 'c' } },
      async run(opts, [name]) {
        const definition = buildLabelDefinitionRecord({ name, color: opts.color });
        const { repoDid, label } = await resolveRepo(opts.repo);
        const defs = await repoLabels(repoDid);
        if (defs.some((d) => d.name.toLowerCase() === definition.name.toLowerCase())) {
          throw new TglError(t(`${label} already has a label called "${name}".`, `${label} ya tiene una etiqueta llamada "${name}".`));
        }
        await createOnKnot(await openSession(), repoDid, NSID.labelDefinition, definition, labelSlug(name));
        console.log(t(`Label "${definition.name}" created in ${label}.`, `Etiqueta "${definition.name}" creada en ${label}.`));
      },
    },
    delete: {
      summary: t('Remove a label from a repo (owner only)', 'Quitar una etiqueta de un repo (solo el dueño)'),
      usage: t([
        'Usage: tgl label delete <name> [-R owner/name]',
        '',
        "The repo stops offering the label. Its name can't be used again in that repo.",
      ], [
        'Uso: tgl label delete <nombre> [-R cuenta/nombre]',
        '',
        'El repo deja de ofrecer la etiqueta. Su nombre no se puede volver a usar en ese repo.',
      ]).join('\n'),
      options: repoOption,
      async run(opts, [name]) {
        if (!name) throw new TglError(t('Say which label: tgl label delete <name>', 'Indica la etiqueta: tgl label delete <nombre>'));
        const { repoDid, label } = await resolveRepo(opts.repo);
        const def = (await repoLabels(repoDid)).find((d) => d.name.toLowerCase() === name.toLowerCase());
        if (!def) throw new TglError(t(`${label} has no label "${name}". See them with: tgl label list`, `${label} no tiene la etiqueta "${name}". Míralas con: tgl label list`));
        await deleteOnKnot(await openSession(), `at://${repoDid}/${NSID.labelDefinition}/${def.key}`);
        console.log(t(`Label "${def.name}" removed from ${label}.`, `Etiqueta "${def.name}" quitada de ${label}.`));
      },
    },
  },
};
