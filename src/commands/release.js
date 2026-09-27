import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { recordsLinkingTo } from '../backlinks.js';
import { whoAmI } from '../credentials.js';
import { TglError } from '../errors.js';
import { annotatedTagHash, remoteTags } from '../git.js';
import { t } from '../i18n.js';
import { repoPeople } from '../repoData.js';
import {
  authorOf, buildArtifactRecord, MAX_ARTIFACT_BYTES, NSID, repoGitUrl, repoWebUrl, resolveRepo, tagHashFromRecord,
} from '../tangled.js';
import { openSession } from './auth.js';
import { day, jsonOption, printJson, repoOption } from './shared.js';

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

// Release files from anyone Tangled accepts them from: the owner and collaborators.
async function loadArtifacts(account, repoDid) {
  const { recordUris, editors } = await repoPeople(account, repoDid);
  const records = await recordsLinkingTo({
    account,
    collection: NSID.artifact,
    links: [{ target: repoDid, path: '.repoDid' }, ...recordUris.map((u) => ({ target: u, path: '.repo' }))],
  });
  return records
    .filter((r) => editors.includes(authorOf(r.uri)) || authorOf(r.uri) === account.did)
    .map((r) => ({ rkey: r.uri.split('/').pop(), tagHash: tagHashFromRecord(r.value), ...r.value }));
}

export default {
  name: 'release',
  summary: t('Attach files (e.g. a signed build) to a version tag', 'Adjuntar archivos (por ejemplo un .xpi firmado) a una versión'),
  commands: {
    upload: {
      summary: t("Upload one or more files to a tag's release", 'Subir uno o varios archivos a la versión de una etiqueta'),
      usage: t([
        'Usage: tgl release upload <tag> <file> [<file>...] [-R owner/name] [--dry-run]',
        '',
        '  <tag>       Annotated tag (git tag -a) already pushed to Tangled, e.g. v2.4.1',
        '  <file>      Files to attach (up to 50 MB each)',
        '  --dry-run   Check everything without uploading anything',
      ], [
        'Uso: tgl release upload <etiqueta> <archivo> [<archivo>...] [-R cuenta/nombre] [--dry-run]',
        '',
        '  <etiqueta>   Etiqueta anotada (git tag -a) ya subida a Tangled, por ejemplo v2.4.1',
        '  <archivo>    Archivos a adjuntar (máximo 50 MB cada uno)',
        '  --dry-run    Comprobarlo todo sin subir nada',
      ]).join('\n'),
      options: { ...repoOption, 'dry-run': { type: 'boolean', default: false } },
      async run(opts, [tag, ...files]) {
        if (!tag || !files.length) {
          throw new TglError(t('Give the tag and at least one file: tgl release upload v1.0.0 build.zip', 'Indica la etiqueta y al menos un archivo: tgl release upload v1.0.0 archivo.xpi'));
        }
        const { repoDid, label } = await resolveRepo(opts.repo);

        // The tag must be the same object locally and on Tangled, or the file
        // would be attached to a version Tangled cannot show.
        const tagHash = annotatedTagHash(tag);
        const published = remoteTags(repoGitUrl(repoDid)).get(tag);
        if (!published) {
          throw new TglError(t(`Tag "${tag}" is not on Tangled yet. Push it first (git push origin ${tag}).`, `La etiqueta "${tag}" no está en Tangled todavía. Súbela primero (git push origin ${tag}).`));
        }
        if (published !== tagHash) {
          throw new TglError(t(`Tag "${tag}" on Tangled is not the same as in your local copy.`, `La etiqueta "${tag}" de Tangled no es la misma que la de tu copia local.`));
        }

        const existing = (await loadArtifacts(whoAmI(), repoDid)).filter((a) => a.tagHash === tagHash);
        const uploads = files.map((file) => {
          const size = statSync(file).size;
          const name = basename(file);
          if (size > MAX_ARTIFACT_BYTES) {
            throw new TglError(t(`"${name}" is ${formatSize(size)}; Tangled accepts up to 50 MB.`, `"${name}" ocupa ${formatSize(size)}; Tangled admite hasta 50 MB.`));
          }
          if (existing.some((a) => a.name === name)) {
            throw new TglError(t(`Release ${tag} already has a file named "${name}".`, `La versión ${tag} ya tiene un archivo llamado "${name}".`));
          }
          return { file, name, size, mimeType: mimeTypeOf(file) };
        });

        console.log(t(`Repository: ${label}`, `Repositorio: ${label}`));
        console.log(t(`Release: ${tag}`, `Versión: ${tag}`));
        for (const u of uploads) console.log(`  ${u.name} (${formatSize(u.size)}, ${u.mimeType})`);
        if (opts['dry-run']) {
          console.log(t('\nAll good. Nothing was uploaded (--dry-run).', '\nTodo correcto. No se ha subido nada (--dry-run).'));
          return;
        }

        const session = await openSession();
        for (const u of uploads) {
          const blob = await session.uploadBlob(readFileSync(u.file), u.mimeType);
          await session.createRecord(NSID.artifact, buildArtifactRecord({ repoDid, name: u.name, tagHash, blob }));
          console.log(t(`Uploaded: ${u.name}`, `Subido: ${u.name}`));
        }
        console.log(t(
          `\nSee it at: ${repoWebUrl(repoDid)}/tags (Tangled may take a few seconds to show it)`,
          `\nMírala en:${repoWebUrl(repoDid)}/tags (Tangled puede tardar unos segundos en mostrarla)`,
        ));
      },
    },
    list: {
      summary: t('Show the files attached to each release', 'Ver los archivos subidos a cada versión'),
      usage: t('Usage: tgl release list [<tag>] [--json] [-R owner/name]', 'Uso: tgl release list [<etiqueta>] [--json] [-R cuenta/nombre]'),
      options: { ...repoOption, ...jsonOption },
      async run(opts, [tag]) {
        const { repoDid, label } = await resolveRepo(opts.repo);
        const names = new Map([...remoteTags(repoGitUrl(repoDid))].map(([name, hash]) => [hash, name]));
        const artifacts = (await loadArtifacts(whoAmI(), repoDid))
          .map((a) => ({ ...a, tag: names.get(a.tagHash) ?? t(`(deleted tag ${a.tagHash.slice(0, 7)})`, `(etiqueta borrada ${a.tagHash.slice(0, 7)})`) }))
          .filter((a) => !tag || a.tag === tag)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (opts.json) {
          printJson(artifacts.map((a) => ({ id: a.rkey, name: a.name, tag: a.tag, tagHash: a.tagHash, size: a.artifact.size, mimeType: a.artifact.mimeType, createdAt: a.createdAt })));
          return;
        }
        if (!artifacts.length) {
          console.log(tag
            ? t(`No files attached to ${tag} in ${label}.`, `No hay archivos subidos a ${tag} en ${label}.`)
            : t(`No release files in ${label}.`, `No hay archivos subidos en ${label}.`));
          return;
        }
        for (const a of artifacts) {
          console.log(`${a.tag.padEnd(10)}  ${day(a.createdAt)}  ${formatSize(a.artifact.size).padStart(9)}  ${a.name}`);
        }
      },
    },
  },
};
