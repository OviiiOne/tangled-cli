import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { listAllRecords } from '../atproto.js';
import { readLoginInfo } from '../credentials.js';
import { TglError } from '../errors.js';
import { annotatedTagHash, remoteTags } from '../git.js';
import {
  buildArtifactRecord, MAX_ARTIFACT_BYTES, NSID, repoGitUrl, repoWebUrl, resolveRepo, tagHashFromRecord,
} from '../tangled.js';
import { openSession } from './auth.js';

const MIME_TYPES = {
  '.xpi': 'application/x-xpinstall',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function mimeTypeOf(file) {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function whoAmI() {
  const info = readLoginInfo();
  if (!info) throw new TglError('No has iniciado sesión. Ejecuta "tgl auth login" en tu terminal.');
  return info;
}

async function loadArtifacts(account, repoDid) {
  const records = await listAllRecords(account.pds, account.did, NSID.artifact);
  return records
    .filter((r) => r.value.repoDid === repoDid)
    .map((r) => ({ rkey: r.uri.split('/').pop(), tagHash: tagHashFromRecord(r.value), ...r.value }));
}

export default {
  name: 'release',
  summary: 'Adjuntar archivos (por ejemplo un .xpi firmado) a una versión',
  commands: {
    upload: {
      summary: 'Subir uno o varios archivos a la versión de una etiqueta',
      usage: [
        'Uso: tgl release upload <etiqueta> <archivo> [<archivo>...] [-R cuenta/nombre] [--dry-run]',
        '',
        '  <etiqueta>   Etiqueta anotada (git tag -a) ya subida a Tangled, por ejemplo v2.4.1',
        '  <archivo>    Archivos a adjuntar (máximo 50 MB cada uno)',
        '  --dry-run    Comprobarlo todo sin subir nada',
      ].join('\n'),
      options: { repo: { type: 'string', short: 'R' }, 'dry-run': { type: 'boolean', default: false } },
      async run(opts, [tag, ...files]) {
        if (!tag || !files.length) throw new TglError('Indica la etiqueta y al menos un archivo: tgl release upload v1.0.0 archivo.xpi');
        const { repoDid, label } = await resolveRepo(opts.repo);

        // The tag must be the same object locally and on Tangled, or the file
        // would be attached to a version Tangled cannot show.
        const tagHash = annotatedTagHash(tag);
        const published = remoteTags(repoGitUrl(repoDid)).get(tag);
        if (!published) throw new TglError(`La etiqueta "${tag}" no está en Tangled todavía. Súbela primero (git push origin ${tag}).`);
        if (published !== tagHash) throw new TglError(`La etiqueta "${tag}" de Tangled no es la misma que la de tu copia local.`);

        const existing = (await loadArtifacts(whoAmI(), repoDid)).filter((a) => a.tagHash === tagHash);
        const uploads = files.map((file) => {
          const size = statSync(file).size;
          const name = basename(file);
          if (size > MAX_ARTIFACT_BYTES) throw new TglError(`"${name}" ocupa ${formatSize(size)}; Tangled admite hasta 50 MB.`);
          if (existing.some((a) => a.name === name)) throw new TglError(`La versión ${tag} ya tiene un archivo llamado "${name}".`);
          return { file, name, size, mimeType: mimeTypeOf(file) };
        });

        console.log(`Repositorio: ${label}`);
        console.log(`Versión: ${tag}`);
        for (const u of uploads) console.log(`  ${u.name} (${formatSize(u.size)}, ${u.mimeType})`);
        if (opts['dry-run']) {
          console.log('\nTodo correcto. No se ha subido nada (--dry-run).');
          return;
        }

        const session = await openSession();
        for (const u of uploads) {
          const blob = await session.uploadBlob(readFileSync(u.file), u.mimeType);
          await session.createRecord(NSID.artifact, buildArtifactRecord({ repoDid, name: u.name, tagHash, blob }));
          console.log(`Subido: ${u.name}`);
        }
        console.log(`\nVéla en: ${repoWebUrl(repoDid)}/tags (Tangled puede tardar unos segundos en mostrarla)`);
      },
    },
    list: {
      summary: 'Ver los archivos subidos a cada versión',
      usage: 'Uso: tgl release list [<etiqueta>] [-R cuenta/nombre]\n\nMuestra solo los archivos subidos con tu cuenta.',
      options: { repo: { type: 'string', short: 'R' } },
      async run(opts, [tag]) {
        const { repoDid, label } = await resolveRepo(opts.repo);
        const names = new Map([...remoteTags(repoGitUrl(repoDid))].map(([name, hash]) => [hash, name]));
        const artifacts = (await loadArtifacts(whoAmI(), repoDid))
          .map((a) => ({ ...a, tag: names.get(a.tagHash) ?? `(etiqueta borrada ${a.tagHash.slice(0, 7)})` }))
          .filter((a) => !tag || a.tag === tag)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!artifacts.length) {
          console.log(`No hay archivos subidos${tag ? ` a ${tag}` : ''} en ${label}.`);
          return;
        }
        for (const a of artifacts) {
          console.log(`${a.tag.padEnd(10)}  ${a.createdAt.slice(0, 10)}  ${formatSize(a.artifact.size).padStart(9)}  ${a.name}`);
        }
      },
    },
  },
};
