# tangled-cli (`tgl`)

[English](#english) · [Español](#español)

## English

A command-line tool for [Tangled](https://tangled.org), in the style of GitHub's `gh`.
It manages repositories, pull requests, issues and release files from the terminal.

No third-party dependencies: it only needs Node.js 20+ and git. MIT licensed.

### Install

```bash
npm link
```

Run it from this folder. It makes the `tgl` command available in any terminal.
Check it with `tgl --version`.

### Log in

1. Create an **app password** for your account. Don't use your main password. In the
   Bluesky app (bsky.app) it is under Settings → Privacy and security → App passwords.
   This works for any AT Protocol account, not only bsky.social ones.
2. Run `tgl auth login` in your terminal and paste it when asked. It is not shown while you type.

The app password is kept in your system's secret store, outside any repository:
DPAPI encryption on Windows, the Keychain on macOS, and the secret service (GNOME
Keyring, KWallet…) on Linux. On Linux systems without one, it falls back to a file
only your user can read, and tells you so. `tgl auth logout` deletes it.

### Commands

| Command | What it does |
|---|---|
| `tgl auth login` | Save your account and app password |
| `tgl auth status` | Show which account you are logged in with |
| `tgl auth logout` | Delete the saved app password from this computer |
| `tgl repo view` | Show a repo's owner, branches and addresses |
| `tgl repo set-default-branch <branch>` | Change the repo's default branch |
| `tgl pr create -t "Title" -b "Text"` | Open a PR from the current branch into the default branch |
| `tgl pr list [--state …] [--limit N]` | List PRs, newest first (open ones by default) |
| `tgl pr view <id\|branch> [--patch]` | Show a PR: description, changed files, comments |
| `tgl pr checkout <id\|branch>` | Bring a PR's changes into a local branch to try them |
| `tgl pr comment <id\|branch> -b "Text"` | Comment on a PR |
| `tgl pr close <id\|branch> [--merged]` | Close a PR, or mark it as merged |
| `tgl pr reopen <id>` | Reopen a closed PR |
| `tgl issue create -t "Title" -b "Text"` | Open an issue |
| `tgl issue list [--state …] [--limit N]` | List issues, newest first (open ones by default) |
| `tgl issue view <id>` | Show an issue with its comments |
| `tgl issue comment <id> -b "Text"` | Comment on an issue |
| `tgl issue close <id> [-b "Text"]` | Close an issue, optionally with a comment |
| `tgl issue reopen <id> [-b "Text"]` | Reopen an issue, optionally with a comment |
| `tgl release upload <tag> <files…>` | Attach files (e.g. a signed build) to a tag's release |
| `tgl release list [<tag>]` | Show the files attached to each release |

- The Tangled repo is taken from the git remote (`git@tangled.org:did:plc:...`), or given
  with `-R owner/name` or `-R did:plc:...`.
- Every command has `--help`. `pr create` and `release upload` have `--dry-run`, which
  checks everything without writing anything.
- Lists show the 30 newest by default; `--limit 0` shows all.
- `--json` prints the data for other programs to read.
- `pr checkout` creates a local branch with a PR's changes so you can try them. Your
  working copy must have no uncommitted changes. If the changes don't apply, nothing is
  left behind.
- `pr close --merged` doesn't merge anything; it only changes the PR's state. Merge
  locally and push.
- `-b` can be replaced by `-F file.md` to read the text from a file.
- `release upload`: the tag must be annotated (`git tag -a`), already pushed to Tangled,
  and the same tag as in your copy. Tangled accepts up to 50 MB per file. A tag can't get
  two files with the same name.
- Ids are the last part of each record's address, as shown by `list`. Tangled's `#N`
  numbers are assigned by its website and aren't available to other programs.
- Messages are in English, or in Spanish on Spanish systems. Force one with
  `TGL_LANG=en` or `TGL_LANG=es`.

### How it works

On Tangled, as everywhere on the AT Protocol, each person's data lives in their own
account. A PR or an issue is a record in its author's account that points at the repo.

- Writing (create, comment, close…) saves records to your account with your app password.
  Repo settings (`repo set-default-branch`) go to the repo's git server (its "knot") with
  a one-use token your account issues for that single action.
- Reading other people's PRs, issues and comments needs an index of "which records point
  at this repo". `tgl` uses two public, read-only community services from
  [microcosm](https://www.microcosm.blue): [Constellation](https://constellation.microcosm.blue)
  (that index) and [Slingshot](https://slingshot.microcosm.blue) (a fast cache of records,
  updated live). Neither ever sees your credentials. If Slingshot fails, records are read
  from their author's server. If Constellation is down, `tgl` warns you and still shows
  the records in your own account. Your own records are always read straight from your
  account.
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
Maneja repositorios, pull requests, issues y archivos de versión desde la terminal.

Sin dependencias de terceros: solo necesita Node.js 20 o superior y git. Licencia MIT.

### Instalación

```bash
npm link
```

Ejecútalo desde esta carpeta. Deja el comando `tgl` disponible en cualquier terminal.
Compruébalo con `tgl --version`.

### Iniciar sesión

1. Crea una **contraseña de aplicación** para tu cuenta. No uses tu contraseña normal. En la
   app de Bluesky (bsky.app) está en Ajustes → Privacidad y seguridad → Contraseñas de
   aplicación. Vale para cualquier cuenta del AT Protocol, no solo las de bsky.social.
2. Ejecuta `tgl auth login` en tu terminal y pégala cuando la pida. No se ve al escribir.

La contraseña se guarda en el almacén de secretos de tu sistema, fuera de cualquier
repositorio: cifrada con DPAPI en Windows, en el Llavero en macOS y en el servicio de
secretos (GNOME Keyring, KWallet…) en Linux. En los Linux que no tienen ninguno, se guarda
en un archivo que solo tu usuario puede leer, y `tgl` te avisa. `tgl auth logout` la borra.

### Comandos

| Comando | Qué hace |
|---|---|
| `tgl auth login` | Guardar tu cuenta y la contraseña de aplicación |
| `tgl auth status` | Ver con qué cuenta estás conectado |
| `tgl auth logout` | Borrar la contraseña guardada en este ordenador |
| `tgl repo view` | Ver dueño, ramas y direcciones de un repo |
| `tgl repo set-default-branch <rama>` | Cambiar la rama principal del repo |
| `tgl pr create -t "Título" -b "Texto"` | Abrir una PR de la rama actual hacia la rama principal |
| `tgl pr list [--state …] [--limit N]` | Listar las PRs, de más nueva a más vieja (por defecto, las abiertas) |
| `tgl pr view <id\|rama> [--patch]` | Ver una PR: descripción, archivos cambiados y comentarios |
| `tgl pr checkout <id\|rama>` | Traer los cambios de una PR a una rama local para probarlos |
| `tgl pr comment <id\|rama> -b "Texto"` | Comentar en una PR |
| `tgl pr close <id\|rama> [--merged]` | Cerrar una PR, o marcarla como fusionada |
| `tgl pr reopen <id>` | Volver a abrir una PR cerrada |
| `tgl issue create -t "Título" -b "Texto"` | Abrir una issue |
| `tgl issue list [--state …] [--limit N]` | Listar las issues, de más nueva a más vieja (por defecto, las abiertas) |
| `tgl issue view <id>` | Ver una issue con sus comentarios |
| `tgl issue comment <id> -b "Texto"` | Comentar en una issue |
| `tgl issue close <id> [-b "Texto"]` | Cerrar una issue, con un comentario opcional |
| `tgl issue reopen <id> [-b "Texto"]` | Volver a abrir una issue, con un comentario opcional |
| `tgl release upload <etiqueta> <archivos…>` | Adjuntar archivos (por ejemplo un .xpi firmado) a la versión de una etiqueta |
| `tgl release list [<etiqueta>]` | Ver los archivos subidos a cada versión |

- El repo de Tangled se deduce del remoto git (`git@tangled.org:did:plc:...`), o se indica
  con `-R cuenta/nombre` o `-R did:plc:...`.
- Todos los comandos tienen `--help`. `pr create` y `release upload` tienen `--dry-run`, que
  lo comprueba todo sin escribir nada.
- Las listas muestran las 30 más recientes; `--limit 0` las muestra todas.
- `--json` saca los datos para que los lean otros programas.
- `pr checkout` crea una rama local con los cambios de una PR para probarlos. Tu copia no
  puede tener cambios sin guardar en un commit. Si los cambios no encajan, no deja nada a medias.
- `pr close --merged` no fusiona nada: solo cambia el estado de la PR. El merge se hace en
  local y se sube con push.
- En lugar de `-b` se puede usar `-F archivo.md` para leer el texto de un archivo.
- `release upload`: la etiqueta tiene que ser anotada (`git tag -a`), estar ya subida a
  Tangled y ser la misma que en tu copia. Tangled admite hasta 50 MB por archivo. Una
  etiqueta no puede tener dos archivos con el mismo nombre.
- Los ids son la última parte de la dirección de cada registro, como los muestra `list`.
  Los números `#N` de Tangled los pone su web y no están disponibles para otros programas.
- Los mensajes salen en inglés, o en español si el sistema está en español. Para forzar
  uno: `TGL_LANG=en` o `TGL_LANG=es`.

### Cómo funciona

En Tangled, como en todo el AT Protocol, los datos de cada persona se guardan en su propia
cuenta. Una PR o una issue es un registro en la cuenta de quien la escribe, que apunta al repo.

- Escribir (crear, comentar, cerrar…) guarda registros en tu cuenta con tu contraseña de
  aplicación. Los ajustes del repo (`repo set-default-branch`) van al servidor git del repo
  (su "knot") con un pase de un solo uso que emite tu cuenta solo para esa acción.
- Leer PRs, issues y comentarios de otras personas necesita un índice de "qué registros
  apuntan a este repo". `tgl` usa dos servicios públicos de la comunidad, de
  [microcosm](https://www.microcosm.blue), que solo sirven para leer:
  [Constellation](https://constellation.microcosm.blue) (ese índice) y
  [Slingshot](https://slingshot.microcosm.blue) (una copia rápida de los registros, que se
  actualiza al momento). Ninguno ve nunca tus credenciales. Si Slingshot falla, los
  registros se leen del servidor de su autor. Si Constellation no responde, `tgl` avisa y
  sigue mostrando lo que está en tu cuenta. Tus propios registros se leen siempre
  directamente de tu cuenta.
- Un cambio de estado (cerrar, reabrir, fusionar) solo cuenta si Tangled lo aceptaría: del
  autor, del dueño del repo, de un colaborador o de la propia Tangled.

Los formatos no tienen documentación oficial y pueden cambiar. Siguen los
[lexicons de Tangled](https://tangled.org/tangled.org/core/tree/master/lexicons),
incluidos los formatos antiguos que aún hay en repos veteranos.

**Limitación conocida:** en repos grandes y antiguos, algunas PRs viejas (sobre todo las
"apiladas") pueden salir con un estado distinto del de la web, que no se puede reconstruir
solo con los registros públicos. Las issues y las PRs en el formato actual coinciden con la web.
