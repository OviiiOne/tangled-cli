# tangled-cli (`tgl`)

[English](#english) · [Español](#español)

## English

A command-line tool for [Tangled](https://tangled.org), in the style of GitHub's `gh`.
It manages pull requests, issues and release files from the terminal.

No third-party dependencies: it only needs Node.js 20+ and git.

### Install

```bash
npm link
```

Run it from this folder. It makes the `tgl` command available in any terminal.

### Log in

1. Create an **app password** for your account. Don't use your main password. In the
   Bluesky app (bsky.app) it is under Settings → Privacy and security → App passwords.
   This works for any AT Protocol account, not only bsky.social ones.
2. Run `tgl auth login` in your terminal and paste it when asked. It is not shown while you type.

On Windows it is stored encrypted with DPAPI in `%APPDATA%\tgl\login.json`, outside any
repository, and only your Windows user on that computer can decrypt it.
`tgl auth logout` deletes it.

### Commands

```text
tgl pr create -t "Title" -b "Description"    # current branch -> master
tgl pr list [--state open|closed|merged|all]
tgl pr view <id|branch> [--patch]
tgl pr comment <id|branch> -b "..."
tgl pr close <id|branch> [--merged]
tgl pr reopen <id>

tgl issue create -t "Title" -b "Description"
tgl issue list [--state open|closed|all]
tgl issue view <id>
tgl issue comment <id> -b "..."
tgl issue close <id> [-b "closing comment"]
tgl issue reopen <id>

tgl release upload v1.2.0 build.xpi [more files...]
tgl release list [v1.2.0]
```

- The Tangled repo is taken from the git remote (`git@tangled.org:did:plc:...`), or given
  with `-R owner/name` or `-R did:plc:...`.
- Every command has `--help`. `pr create` and `release upload` have `--dry-run`, which
  checks everything without writing anything.
- `pr close --merged` doesn't merge anything; it only changes the PR's state. Merge
  locally and push.
- `-b` can be replaced by `-F file.md` to read the text from a file.
- `release upload`: the tag must be annotated (`git tag -a`) and already pushed to
  Tangled, and be the same tag as in your copy. Tangled accepts up to 50 MB per file.
  A tag can't get two files with the same name.
- Ids are the last part of each record's address, as shown by `list`. Tangled's `#N`
  numbers are assigned by its website and aren't available to other programs.

### How it works

On Tangled, as everywhere on the AT Protocol, each person's data lives in their own
account. A PR or an issue is a record in its author's account that points at the repo.

- Writing (create, comment, close…) saves records to your account with your app password.
- Reading other people's PRs, issues and comments needs an index of "which records point
  at this repo". `tgl` uses [Constellation](https://constellation.microcosm.blue), a public,
  read-only AT Protocol index. It never sees your credentials. If it is down, `tgl`
  warns you and still shows the records in your own account.
- A state change (close, reopen, merge) only counts if Tangled would accept it: from the
  author, the repo owner, a collaborator or Tangled itself.

Records used: `sh.tangled.repo.pull` (with the changes as a gzipped `git format-patch`),
`.pull.status`, `.pull.comment`, `sh.tangled.repo.issue`, `.issue.state`, `.issue.comment`
and `sh.tangled.repo.artifact` (a release file, linked to its tag by the tag's hash).

These formats have no official documentation and may change. They follow
[Tangled's lexicons](https://tangled.org/tangled.org/core/tree/master/lexicons),
including older formats still found in long-lived repos.

**Known limitation:** on large, old repos a few old PRs (mostly stacked PRs) may show a
different state from the website, which can't be rebuilt from public records alone.
Issues and PRs in the current format match the website.

---

## Español

Herramienta de terminal para [Tangled](https://tangled.org), al estilo de `gh` para GitHub.
Maneja pull requests, issues y archivos de versión desde la terminal.

Sin dependencias de terceros: solo necesita Node.js 20 o superior y git.

### Instalación

```bash
npm link
```

Ejecútalo desde esta carpeta. Deja el comando `tgl` disponible en cualquier terminal.

### Iniciar sesión

1. Crea una **contraseña de aplicación** para tu cuenta. No uses tu contraseña normal. En la
   app de Bluesky (bsky.app) está en Ajustes → Privacidad y seguridad → Contraseñas de
   aplicación. Vale para cualquier cuenta del AT Protocol, no solo las de bsky.social.
2. Ejecuta `tgl auth login` en tu terminal y pégala cuando la pida. No se ve al escribir.

En Windows se guarda cifrada con DPAPI en `%APPDATA%\tgl\login.json`, fuera de cualquier
repositorio, y solo tu usuario de Windows en ese ordenador puede descifrarla.
`tgl auth logout` la borra.

### Comandos

Los mismos que en la [lista en inglés](#commands).

- El repo de Tangled se deduce del remoto git (`git@tangled.org:did:plc:...`), o se indica
  con `-R cuenta/nombre` o `-R did:plc:...`.
- Todos los comandos tienen `--help`. `pr create` y `release upload` tienen `--dry-run`, que
  lo comprueba todo sin escribir nada.
- `pr close --merged` no fusiona nada: solo cambia el estado de la PR. El merge se hace en
  local y se sube con push.
- En lugar de `-b` se puede usar `-F archivo.md` para leer el texto de un archivo.
- `release upload`: la etiqueta tiene que ser anotada (`git tag -a`), estar ya subida a
  Tangled y ser la misma que en tu copia. Tangled admite hasta 50 MB por archivo. Una
  etiqueta no puede tener dos archivos con el mismo nombre.
- Los ids son la última parte de la dirección de cada registro, como los muestra `list`.
  Los números `#N` de Tangled los pone su web y no están disponibles para otros programas.

### Cómo funciona

En Tangled, como en todo el AT Protocol, los datos de cada persona se guardan en su propia
cuenta. Una PR o una issue es un registro en la cuenta de quien la escribe, que apunta al repo.

- Escribir (crear, comentar, cerrar…) guarda registros en tu cuenta con tu contraseña de
  aplicación.
- Leer PRs, issues y comentarios de otras personas necesita un índice de "qué registros
  apuntan a este repo". `tgl` usa [Constellation](https://constellation.microcosm.blue), un
  índice público del AT Protocol que solo sirve para leer. Nunca ve tus credenciales. Si no
  responde, `tgl` avisa y sigue mostrando lo que está en tu cuenta.
- Un cambio de estado (cerrar, reabrir, fusionar) solo cuenta si Tangled lo aceptaría: del
  autor, del dueño del repo, de un colaborador o de la propia Tangled.

Los formatos no tienen documentación oficial y pueden cambiar. Siguen los
[lexicons de Tangled](https://tangled.org/tangled.org/core/tree/master/lexicons),
incluidos los formatos antiguos que aún hay en repos veteranos.

**Limitación conocida:** en repos grandes y antiguos, algunas PRs viejas (sobre todo las
"apiladas") pueden salir con un estado distinto del de la web, que no se puede reconstruir
solo con los registros públicos. Las issues y las PRs en el formato actual coinciden con la web.
