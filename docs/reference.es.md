# Referencia de tgl

[English](reference.md) · [Volver al README](../README.es.md)

## Comandos

| Comando | Qué hace |
|---|---|
| `tgl auth login` | Guardar tu cuenta y la contraseña de aplicación |
| `tgl auth status` | Ver con qué cuenta estás conectado |
| `tgl auth logout` | Borrar la contraseña guardada en este ordenador |
| `tgl repo view [--web]` | Ver dueño, ramas y direcciones de un repo |
| `tgl repo create <nombre> [-d "Texto"]` | Crear un repo nuevo y vacío en Tangled |
| `tgl repo set-default-branch <rama>` | Cambiar la rama principal del repo |
| `tgl pr create -t "Título" -b "Texto"` | Abrir una PR de la rama actual hacia la rama principal |
| `tgl pr list [--state …] [--limit N] [--web]` | Listar las PRs, de más nueva a más vieja (por defecto, las abiertas) |
| `tgl pr view [<pr>] [--patch] [--web]` | Ver una PR: descripción, archivos cambiados y comentarios |
| `tgl pr checkout <pr>` | Traer los cambios de una PR a una rama local para probarlos |
| `tgl pr comment [<pr>] -b "Texto"` | Comentar en una PR |
| `tgl pr edit [<pr>] [-t "Título"] [-b "Texto"]` | Cambiar el título o la descripción de una PR |
| `tgl pr update [<pr>]` | Volver a enviar la rama tras nuevos commits (una revisión nueva) |
| `tgl pr label <pr> [--add …] [--remove …]` | Poner o quitar etiquetas a una PR, o verlas |
| `tgl pr merge [<pr>] [--dry-run]` | Fusionar una PR en el servidor de Tangled y cerrar las issues que resuelve |
| `tgl pr close [<pr>] [--merged]` | Cerrar una PR, o marcarla como fusionada y cerrar las issues que resuelve |
| `tgl pr reopen <pr>` | Volver a abrir una PR cerrada |
| `tgl issue create -t "Título" -b "Texto"` | Abrir una issue |
| `tgl issue list [--state …] [--limit N] [--web]` | Listar las issues, de más nueva a más vieja (por defecto, las abiertas) |
| `tgl issue view <issue> [--web]` | Ver una issue con sus comentarios |
| `tgl issue edit <issue> [-t "Título"] [-b "Texto"]` | Cambiar el título o la descripción de una issue |
| `tgl issue comment <issue> -b "Texto"` | Comentar en una issue |
| `tgl issue label <issue> [--add …] [--remove …]` | Poner o quitar etiquetas a una issue, o verlas |
| `tgl issue stale [--days N] [--dry-run]` | Etiquetar las issues abiertas sin actividad reciente |
| `tgl issue close <issue> [-b "Texto"]` | Cerrar una issue, con un comentario opcional |
| `tgl issue reopen <issue> [-b "Texto"]` | Volver a abrir una issue, con un comentario opcional |
| `tgl label list` | Ver las etiquetas que usa un repo |
| `tgl label create <nombre> [--kind …] [--values …]` | Crear una etiqueta para tu repo |
| `tgl label delete <nombre>` | Quitar una etiqueta de tu repo |
| `tgl release upload <etiqueta> <archivos…>` | Adjuntar archivos (por ejemplo un .xpi firmado) a la versión de una etiqueta |
| `tgl release list [<etiqueta>]` | Ver los archivos subidos a cada versión |

- El repo de Tangled se deduce del remoto git (`git@tangled.org:did:plc:...`), o se indica
  con `-R cuenta/nombre` o `-R did:plc:...`.
- `<pr>` e `<issue>` son el número que muestra la web (`12` o `#12`) o el id que muestra
  `list`; una PR también se puede indicar por su rama. `[<pr>]` se puede omitir: entonces es
  la PR abierta de la rama actual.
- Todos los comandos tienen `--help`. `pr create`, `pr update`, `pr merge` y
  `release upload` tienen `--dry-run`, que lo comprueba todo sin escribir nada.
- Las listas muestran las 30 más recientes; `--limit 0` las muestra todas.
- `--json` saca los datos para que los lean otros programas.
- `pr checkout` crea una rama local con los cambios de una PR para probarlos. Tu copia no
  puede tener cambios sin guardar en un commit. Si los cambios no encajan, no deja nada a medias.
- Hay dos formas de terminar una PR. `pr merge` hace que el servidor de Tangled la aplique,
  como el botón de fusionar de la web: se mantiene cada commit, con hashes nuevos, así que
  después trae la rama destino con pull (y súbela a cualquier copia, p. ej. GitHub). O
  fusiona en local, sube con push y ejecuta `pr close --merged`, que no fusiona nada: solo
  cambia el estado de la PR. Las dos cierran las issues nombradas como `Fixes #12` (o
  `Closes`, `Resolves`, o con un enlace a la issue) en el título o la descripción de la PR,
  o en un comentario suyo de quien la creó o del dueño o los colaboradores del repo, con un
  comentario que enlaza a la PR;
  `--keep-issues` las deja abiertas. Solo issues del mismo repo, y solo si puedes cerrarlas.
  `pr create` y `pr edit` convierten ese `#12` en un enlace a la issue (Tangled muestra un
  `#12` suelto como texto), y el comentario de cierre enlaza de vuelta a la PR.
- `pr create` y `pr update` se paran si la rama tiene commits sin subir a Tangled
  (`--allow-unpushed` sigue de todos modos). Una PR de Tangled se queda con los cambios con
  los que se envió: tras nuevos commits, súbelos y ejecuta `pr update`.
- `pr edit`, `pr update` e `issue edit` solo funcionan con tus propias PRs e issues.
- Etiquetas: `--add good-first-issue`, o `--add assignee=alice.bsky.social` en las que
  llevan valor. `--add` y `--remove` se pueden repetir. Solo el dueño del repo y sus
  colaboradores pueden cambiarlas; `label` sin opciones muestra las etiquetas del repo.
- `label create` crea tus propias etiquetas: `--kind simple` (sin valor, por defecto),
  `text`, `person`, `number` o `yes-no`; `--values alta,media,baja` para opciones fijas;
  `--multiple` para varios valores a la vez; `--for issues|prs|both`; `--color "#E11D48"`.
  Solo el dueño del repo puede crear o quitar etiquetas. `label delete` también borra una
  etiqueta que creaste tú; las de Tangled solo se quitan del repo.
- `issue stale` pone una etiqueta (por defecto `stale`; créala antes con
  `tgl label create stale --for issues`) a las issues abiertas sin comentarios ni cambios de
  estado en `--days` días (por defecto 60), y se la quita cuando vuelven a tener actividad.
  Solo etiqueta; `--comment "…"` además publica un comentario. Para ejecutarlo cada día,
  usa una pipeline programada (abajo).
- En una pipeline de CI, inicia sesión con variables de entorno en vez de `tgl auth login`:
  `TGL_ACCOUNT` (tu cuenta o DID) y `TGL_APP_PASSWORD` (una contraseña de aplicación aparte,
  guardada como secreto de la pipeline; Tangled nunca da los secretos a las pipelines de PRs
  que vienen de forks). Por ejemplo, `.tangled/workflows/stale.yml`:

  ```yaml
  when:
    - event: schedule
      schedule:
        - cron: "H 6 * * *"
  engine: microvm
  image: nixos
  dependencies:
    - nodejs_22
  environment:
    TGL_ACCOUNT: "ana.bsky.social"   # TGL_APP_PASSWORD va en Settings → Secrets
  steps:
    - name: "Marcar issues paradas"
      command: npx --yes tangled-cli issue stale --days 60 -R "$TANGLED_REPO_DID/$TANGLED_REPO_NAME"
  ```
- `repo create` crea un repo vacío (rama principal `main`, servidor `knot1.tangled.sh`);
  `--remote tangled` además lo añade como remoto git. Para las pipelines, elige un servidor
  de CI con `--spindle spindle.tangled.sh` o luego en los ajustes del repo en la web.
- `--web` abre la página en el navegador. Las páginas de PRs e issues van por número, así
  que con un id o una rama se abre la lista.
- En lugar de `-b` se puede usar `-F archivo.md` para leer el texto de un archivo.
- `release upload`: la etiqueta tiene que ser anotada (`git tag -a`), estar ya subida a
  Tangled y ser la misma que en tu copia. Tangled admite hasta 50 MB por archivo. Una
  etiqueta no puede tener dos archivos con el mismo nombre.
- Los ids son la última parte de la dirección de cada registro, como los muestra `list`.
  Los números los pone la web de Tangled y no están en ningún registro: `tgl` los lee de la
  página web de cada una, y `list` muestra ids, no números.
- Los mensajes salen en inglés, o en español si el sistema está en español. Para forzar
  uno: `TGL_LANG=en` o `TGL_LANG=es`.
- En los Linux sin servicio de secretos, la contraseña de aplicación se guarda en un archivo
  que solo tu usuario puede leer, y `tgl` te avisa.

## Cómo funciona

En Tangled, como en todo el AT Protocol, los datos de cada persona se guardan en su propia
cuenta. Una PR o una issue es un registro en la cuenta de quien la escribe, que apunta al repo.

- Escribir (crear, comentar, cerrar…) guarda registros en tu cuenta con tu contraseña de
  aplicación. Los ajustes del repo, las fusiones y los repos nuevos (`repo set-default-branch`,
  `pr merge`, `repo create`) van al servidor git del repo
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
