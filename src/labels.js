// Labels on issues and PRs. A repo's labels are org.tangled.label.definition records on
// its knot, and each ticket lists the keys of its own. People assigned to a ticket are a
// separate field, which tgl shows and sets as an "assignee" label.
import { apiList } from './api.js';
import { resolveHandle } from './atproto.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';
import { NSID } from './tangled.js';

const ASSIGNEE = 'assignee';
const DEFAULT_COLOR = '#64748B';

// The labels a repo offers: [{ key, name, color }], oldest first.
export async function repoLabels(repoDid) {
  const items = await apiList('org.tangled.label.listDefinitions', { subject: repoDid, order: 'asc' });
  return items.map((i) => ({ key: i.uri.split('/').pop(), name: i.value.name, color: i.value.color }));
}

export function formatLabels(labels) {
  return labels.map((l) => (l.values.length ? `${l.name}: ${l.values.join(', ')}` : l.name)).join(' · ');
}

// "bug" or "assignee=alice.test" given on the command line -> { key } or { person }.
// A bare "assignee" (only when removing) means everyone: { person: null }.
export async function parseLabelArg(arg, defs, { removing = false } = {}) {
  const [name, ...rest] = arg.split('=');
  if (name.toLowerCase() === ASSIGNEE && !defs.some((d) => d.key === ASSIGNEE)) {
    const value = rest.join('=').replace(/^@/, '');
    if (!value) {
      if (removing) return { person: null };
      throw new TglError(t('Say who: assignee=<account>', 'Indica quién: assignee=<cuenta>'));
    }
    return { person: value.startsWith('did:') ? value : await resolveHandle(value) };
  }
  const def = defs.find((d) => d.name.toLowerCase() === arg.toLowerCase() || d.key === arg.toLowerCase());
  if (!def) throw new TglError(t(`This repo has no label "${arg}". Its labels: ${defs.map((d) => d.name).join(', ')}`, `Este repo no tiene la etiqueta "${arg}". Sus etiquetas: ${defs.map((d) => d.name).join(', ')}`));
  return { key: def.key };
}

// A ticket record with labels and assignees changed; `add` and `remove` come from
// parseLabelArg. Empty lists are left out of the record, as the website does.
export function applyLabelChanges(value, { add, remove }) {
  const keys = new Set((value.tangledLabels ?? []).map((l) => l.key));
  const people = new Set(value.assignees ?? []);
  for (const { key, person } of remove) {
    if (key) keys.delete(key);
    else if (person) people.delete(person);
    else people.clear();
  }
  for (const { key, person } of add) {
    if (key) keys.add(key);
    else people.add(person);
  }
  const { tangledLabels: _labels, assignees: _people, ...next } = value;
  if (keys.size) next.tangledLabels = [...keys].map((key) => ({ $type: 'org.tangled.label.defs#labelToken', key }));
  if (people.size) next.assignees = [...people];
  return next;
}

// The knot wants a slug as a label's record key (web/src/lib/api/labels.ts).
export function labelSlug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

// Throws a TglError if the name or color is not valid.
export function buildLabelDefinitionRecord({ name, color, now = new Date() }) {
  if (!name?.trim() || [...name].length > 64 || !labelSlug(name)) {
    throw new TglError(t('A label name has up to 64 characters and at least one letter or number.', 'El nombre de una etiqueta tiene hasta 64 caracteres y al menos una letra o número.'));
  }
  let hex = color?.trim() || DEFAULT_COLOR;
  if (/^#?[a-fA-F0-9]{3}$/.test(hex)) hex = `#${[...hex.replace('#', '')].map((c) => c + c).join('')}`;
  if (!/^#?[a-fA-F0-9]{6}$/.test(hex)) throw new TglError(t('--color must be a hex color, e.g. #E11D48.', '--color debe ser un color hexadecimal, p. ej. #E11D48.'));
  return { $type: NSID.labelDefinition, name: name.trim(), color: `#${hex.replace('#', '').toUpperCase()}`, createdAt: now.toISOString() };
}
