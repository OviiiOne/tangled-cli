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
| `tgl label create <nombre> [--color …]` | Crear una etiqueta para tu repo |
| `tgl label delete <nombre>` | Quitar una etiqueta de tu repo |
| `tgl release upload <etiqueta> <archivos…>` | Adjuntar archivos (por ejemplo un .xpi firmado) a la versión de una etiqueta |
| `tgl release list [<etiqueta>]` | Ver los archivos subidos a cada versión |

- El repo de Tangled se deduce del remoto git (`git@tangled.org:did:plc:...`), o se indica
  con `-R cuenta/nombre` o `-R did:plc:...`.
- `<pr>` e `<issue>` son el número que muestran la web y `list` (`12` o `#12`). Las issues y
  las PRs comparten numeración. Una PR también se puede indicar por su rama. `[<pr>]` se
  puede omitir: entonces es la PR abierta de la rama actual.
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
- `pr create` y `pr update` se paran si la rama tiene commits sin subir a Tangled: solo acepta
  commits que estén en la rama. Una PR de Tangled se queda con los cambios con los que se
  envió: tras nuevos commits, súbelos y ejecuta `pr update`.
- Tangled decide quién puede editar, cerrar o fusionar, y `tgl` muestra su respuesta si lo rechaza.
- Etiquetas: `--add good-first-issue`, y `--add assignee=alice.bsky.social` para asignar a
  alguien. `--add` y `--remove` se pueden repetir; `--remove assignee` quita a todo el mundo.
  `label` sin opciones muestra las etiquetas del repo.
- `label create` crea tus propias etiquetas, con un `--color "#E11D48"` opcional. Solo el dueño
  del repo puede crearlas o borrarlas, y el nombre de una etiqueta borrada no se puede volver
  a usar en ese repo.
- `issue stale` pone una etiqueta (por defecto `stale`; créala antes con
  `tgl label create stale`) a las issues abiertas sin comentarios ni cambios de
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
  que con una rama se abre la lista.
- En lugar de `-b` se puede usar `-F archivo.md` para leer el texto de un archivo.
- `release upload`: la etiqueta tiene que ser anotada (`git tag -a`), estar ya subida a
  Tangled y ser la misma que en tu copia. Tangled admite hasta 50 MB por archivo. Una
  etiqueta no puede tener dos archivos con el mismo nombre.
- Los comandos que solo leen no necesitan iniciar sesión.
- Las PRs anteriores a la migración de Tangled no guardan sus cambios, así que `pr view` no
  lista archivos en ellas.
- Los mensajes salen en inglés, o en español si el sistema está en español. Para forzar
  uno: `TGL_LANG=en` o `TGL_LANG=es`.
- En los Linux sin servicio de secretos, la contraseña de aplicación se guarda en un archivo
  que solo tu usuario puede leer, y `tgl` te avisa.

## Cómo funciona

En Tangled, las issues, PRs, comentarios y etiquetas de un repo se guardan junto al repo, en
su servidor git (su "knot"). Una issue y una PR son el mismo tipo de registro, un "ticket";
una PR es un ticket con rama de destino, y cada una de sus revisiones es otro registro.

`tgl` lee todo esto con la [API pública de Tangled](https://tangled.org/docs/api/bobbin/),
que no necesita iniciar sesión. Para escribir, envía el registro al knot con un pase de un
solo uso que emite tu cuenta para esa acción, y guarda en tu cuenta una confirmación firmada
("attestation"), igual que la web. Los registros siguen los
[lexicons de Tangled](https://tangled.org/tangled.org/core/tree/master/lexicons/org/tangled)
y su [referencia de registros](https://tangled.org/docs/reference/records/).
