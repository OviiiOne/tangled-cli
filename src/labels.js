// Labels on issues and PRs (lexicons/label). A repo record lists the label definitions
// the repo uses; each change is a sh.tangled.label.op record in the account of whoever
// made it, and the current labels come from replaying those changes in order, as
// ApplyLabelOps in appview/models/label.go does.
import { getRecord, handleOf, mapLimit, resolveHandle } from './atproto.js';
import { recordsLinkingTo } from './backlinks.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';
import { authorOf, NSID } from './tangled.js';

export const LABEL_OP = 'sh.tangled.label.op';

// The label definitions of a repo, from its newest repo record (a rename leaves an
// older one behind). Definitions that can't be read are left out.
export async function repoLabelDefs(account, repoDid) {
  const records = await recordsLinkingTo({ account, collection: NSID.repo, links: [{ target: repoDid, path: '.repoDid' }] });
  const record = records.sort((a, b) => (b.value.createdAt ?? '').localeCompare(a.value.createdAt ?? ''))[0];
  const defs = await mapLimit(record?.value.labels ?? [], 8, async (uri) => {
    const def = await getRecord(uri).catch(() => null);
    return def && { uri, ...def.value };
  });
  return defs.filter(Boolean);
}

// Current labels as a Map of definition address -> Set of values, from label op
// records ({ uri, value }). Same order and rules as the website: by date, then author
// and record key, deletes before additions; a single-value label keeps only its last
// value; ops by people who can't label, or out of the label's scope, are skipped.
export function foldLabelOps(ops, defs, { subjectCollection, allowed }) {
  const byUri = new Map(defs.map((d) => [d.uri, d]));
  const flat = [];
  for (const op of ops) {
    const did = authorOf(op.uri);
    if (allowed && !allowed.has(did)) continue;
    const base = { at: op.value.performedAt ?? '', did, rkey: op.uri.split('/').pop() };
    for (const o of op.value.delete ?? []) flat.push({ ...base, rank: 0, key: o.key, value: o.value, del: true });
    for (const o of op.value.add ?? []) flat.push({ ...base, rank: 1, key: o.key, value: o.value, del: o.value === '' });
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  flat.sort((a, b) => cmp(a.at, b.at) || cmp(a.did, b.did) || cmp(a.rkey, b.rkey) || a.rank - b.rank || cmp(a.key, b.key) || cmp(a.value, b.value));

  const state = new Map();
  for (const op of flat) {
    const def = byUri.get(op.key);
    if (!def) continue;
    if (subjectCollection && def.scope?.length && !def.scope.includes(subjectCollection)) continue;
    const values = state.get(op.key);
    if (op.del) {
      if (!values?.has(op.value)) continue;
      if (def.multiple) values.delete(op.value);
      else state.delete(op.key);
      if (values?.size === 0) state.delete(op.key);
    } else if (def.multiple) {
      state.set(op.key, (values ?? new Set()).add(op.value));
    } else {
      state.set(op.key, new Set([op.value]));
    }
  }
  return state;
}

// Labels of one issue or PR: [{ uri, name, values }], values shown as handles for
// people (e.g. "assignee") and left out for plain labels.
export async function labelsOf(account, subjectUri, defs, editors) {
  const ops = await recordsLinkingTo({ account, collection: LABEL_OP, links: [{ target: subjectUri, path: '.subject' }] });
  const state = foldLabelOps(ops, defs, { subjectCollection: subjectUri.split('/')[3], allowed: new Set(editors) });
  const labels = [];
  for (const def of defs) {
    const values = state.get(def.uri);
    if (!values) continue;
    const shown = def.valueType?.type === 'null' ? [] : await Promise.all([...values].map((v) => (v.startsWith('did:') ? handleOf(v) : v)));
    labels.push({ uri: def.uri, name: def.name, values: shown, raw: [...values] });
  }
  return labels;
}

export function formatLabels(labels) {
  return labels.map((l) => (l.values.length ? `${l.name}: ${l.values.join(', ')}` : l.name)).join(' · ');
}

// "name" or "name=value" given on the command line -> { def, value } ready for a label op.
// Plain labels take the value "null"; people can be given by handle.
export async function parseLabelArg(arg, defs, subjectCollection, { removing = false } = {}) {
  const [name, ...rest] = arg.split('=');
  const def = defs.find((d) => d.name.toLowerCase() === name.toLowerCase() || d.uri.split('/').pop() === name.toLowerCase());
  if (!def) {
    const names = defs.filter((d) => !d.scope?.length || d.scope.includes(subjectCollection)).map((d) => d.name);
    throw new TglError(t(`This repo has no label "${name}". Its labels: ${names.join(', ')}`, `Este repo no tiene la etiqueta "${name}". Sus etiquetas: ${names.join(', ')}`));
  }
  if (def.scope?.length && !def.scope.includes(subjectCollection)) {
    throw new TglError(t(`Label "${def.name}" can't be used here.`, `La etiqueta "${def.name}" no se puede usar aquí.`));
  }
  let value = rest.join('=');
  const type = def.valueType?.type;
  if (type === 'null') {
    if (value) throw new TglError(t(`Label "${def.name}" takes no value.`, `La etiqueta "${def.name}" no lleva valor.`));
    return { def, value: 'null' };
  }
  if (!value) {
    if (removing) return { def, value: undefined };
    throw new TglError(t(`Label "${def.name}" needs a value: ${def.name}=<value>`, `La etiqueta "${def.name}" necesita un valor: ${def.name}=<valor>`));
  }
  if (def.valueType?.format === 'did' && !value.startsWith('did:')) value = await resolveHandle(value.replace(/^@/, ''));
  if (type === 'integer' && !/^-?\d+$/.test(value)) {
    throw new TglError(t(`Label "${def.name}" takes a whole number.`, `La etiqueta "${def.name}" lleva un número entero.`));
  }
  if (type === 'boolean' && !['true', 'false'].includes(value)) {
    throw new TglError(t(`Label "${def.name}" takes true or false.`, `La etiqueta "${def.name}" lleva true o false.`));
  }
  if (def.valueType?.enum?.length && !def.valueType.enum.includes(value)) {
    throw new TglError(t(`Label "${def.name}" takes one of: ${def.valueType.enum.join(', ')}`, `La etiqueta "${def.name}" lleva uno de: ${def.valueType.enum.join(', ')}`));
  }
  return { def, value };
}

export function buildLabelOpRecord({ subjectUri, add, remove, now = new Date() }) {
  return {
    $type: LABEL_OP,
    subject: subjectUri,
    add: add.map(({ key, value }) => ({ key, value })),
    delete: remove.map(({ key, value }) => ({ key, value })),
    performedAt: now.toISOString(),
  };
}
