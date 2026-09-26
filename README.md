# tangled-cli (`tgl`)

Herramienta de terminal para manejar [Tangled](https://tangled.org), al estilo de `gh` para GitHub.
Organizada por temas: `tgl pr ...`; en el futuro `tgl release ...`, `tgl issue ...`.

Sin dependencias externas: solo necesita Node.js 20 o superior y git.

## Instalación

```bash
npm link
```

Desde esta carpeta. Deja el comando `tgl` disponible en cualquier terminal.

## Iniciar sesión

1. En los ajustes de tu cuenta (tu servidor, por ejemplo eurosky.social), crea una
   **contraseña de aplicación**. No uses tu contraseña normal.
2. Ejecuta `tgl auth login` en tu terminal y pégala cuando la pida (no se ve al escribir).

Se guarda cifrada con Windows (DPAPI) en `%APPDATA%\tgl\login.json`, fuera de cualquier
repositorio. Solo tu usuario de Windows en este ordenador puede descifrarla.
`tgl auth logout` la borra.

## Pull requests

```text
tgl pr create -t "Título" -b "Descripción"   # rama actual -> master
tgl pr list [--state open|closed|merged|all]
tgl pr close <id|rama> [--merged]
```

- El repo de Tangled se deduce del remoto git (`git@tangled.org:did:plc:...`), o con `-R cuenta/nombre`.
- `pr create --dry-run` enseña lo que se crearía sin crear nada.
- `pr close` no fusiona: solo cambia el estado. El merge se hace en local y se sube con push.
- `pr list` muestra solo las PRs creadas con tu cuenta.

## Cómo funciona

En Tangled cada PR es un registro del AT Protocol guardado en la cuenta de quien la crea:

- `sh.tangled.repo.pull`: título, ramas y los cambios (`git format-patch`, comprimido con gzip,
  subido como archivo adjunto).
- `sh.tangled.repo.pull.status`: cada cambio de estado (abierta, cerrada, fusionada).

Estos formatos no tienen documentación oficial y pueden cambiar. Se copian de los
[lexicons de Tangled](https://tangled.org/tangled.org/core/tree/master/lexicons).
