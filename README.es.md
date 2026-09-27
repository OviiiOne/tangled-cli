# tangled-cli (`tgl`)

[English](README.md)

![tgl en una terminal: lista PRs y marca una como fusionada](docs/banner.svg)

Herramienta de terminal para [Tangled](https://tangled.org), al estilo de `gh` para GitHub.

## Para qué sirve

Maneja un repositorio de Tangled sin salir de la terminal: pull requests, issues y archivos
de versión. Además hace algunas cosas que Tangled todavía no hace por sí solo:

- **Cerrar issues desde una PR.** Escribe `Fixes #12` en la PR; al marcarla como fusionada,
  la issue #12 se cierra con un comentario que nombra la PR.
- **Mantener una PR al día.** Una PR de Tangled se queda con los cambios con los que se
  creó. `tgl pr update` envía los commits nuevos de su rama como una revisión nueva.
- **Adjuntar archivos a una versión desde scripts**, por ejemplo una versión firmada.
- **Avisar de commits sin subir** antes de crear o actualizar una PR.
- **Trabajar desde la rama en la que estás:** `tgl pr view`, `tgl pr close --merged`… sin
  número de PR, o con el `#12` que muestra la web.

Encaja con repos duplicados en GitHub y Tangled: abres la PR en los dos, fusionas en local,
subes una vez y marcas la PR de Tangled como fusionada con `tgl`.

Sin dependencias de terceros: solo Node.js 20 o superior y git. Licencia MIT.

## Instalación

```bash
git clone https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift tangled-cli
cd tangled-cli
npm link
```

`npm link` deja el comando `tgl` disponible en cualquier terminal. Compruébalo con
`tgl --version`.

## Iniciar sesión

1. Crea una **contraseña de aplicación** para tu cuenta (no tu contraseña normal). En la
   app de Bluesky está en Ajustes → Privacidad y seguridad → Contraseñas de aplicación.
   Vale cualquier cuenta del AT Protocol.
2. Ejecuta `tgl auth login` y pégala cuando la pida.

Se guarda en el almacén de secretos de tu sistema (DPAPI en Windows, Llavero en macOS,
servicio de secretos en Linux), nunca en un repositorio. `tgl auth logout` la borra.

## Uso

Ejecuta `tgl` dentro de un repo git con un remoto de Tangled:

```bash
tgl pr create -t "Añadir modo oscuro" -b "Fixes #12"
tgl pr update                 # tras subir más commits
tgl pr close --merged         # tras fusionar: cierra la PR y la issue #12
tgl issue list
tgl release upload v1.2.0 build.zip
```

Todos los comandos tienen `--help`. La lista completa, las opciones y cómo funciona `tgl`
están en la [referencia](docs/reference.es.md).

## Repositorios

El mismo código está en las dos forjas; en cualquiera se pueden abrir issues y PRs.

- Tangled: https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift
- GitHub (espejo): https://github.com/OviiiOne/tangled-cli

## Licencia

[MIT](LICENSE)
