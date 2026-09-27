# tangled-cli (`tgl`)

[English](README.md)

![tgl en una terminal: lista PRs, y al marcar una como fusionada cierra su issue](docs/banner.svg)

Herramienta de terminal para [Tangled](https://tangled.org), al estilo de `gh` para GitHub.

## Para qué sirve

Maneja Tangled sin salir de la terminal: crea repos, y abre, etiqueta, fusiona y cierra pull
requests e issues; adjunta archivos de versión. Además hace algunas cosas que Tangled todavía no hace por sí solo:

- **Cerrar issues desde una PR.** Escribe `Fixes #12` en la PR; al marcarla como fusionada,
  la issue #12 se cierra con un comentario que nombra la PR.
- **Mantener una PR al día.** Una PR de Tangled se queda con los cambios con los que se
  creó. `tgl pr update` envía los commits nuevos de su rama como una revisión nueva.
- **Adjuntar archivos a una versión desde scripts**, por ejemplo una versión firmada.
- **Avisar de commits sin subir** antes de crear o actualizar una PR.
- **Trabajar desde la rama en la que estás:** `tgl pr view`, `tgl pr close --merged`… sin
  número de PR, o con el `#12` que muestra la web.

Fusiona PRs en Tangled con `tgl pr merge` o, en repos duplicados en GitHub y Tangled: abre
la PR en los dos, fusiona en local, sube una vez y marca la PR de Tangled como fusionada con
`tgl pr close --merged`.

Sin dependencias de terceros: solo Node.js 20 o superior y git. Licencia MIT.

## Instalación

```bash
npm install -g tangled-cli
```

Esto instala el comando `tgl`. Compruébalo con `tgl --version`.

Desde el código, para probar cambios aún no publicados:

```bash
git clone https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift tangled-cli
cd tangled-cli
npm link
```

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

El mismo código está en las dos forjas; en cualquiera se pueden abrir issues y PRs. Mira
[cómo contribuir](CONTRIBUTING.es.md).

- Tangled: https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift
- GitHub (espejo): https://github.com/OviiiOne/tangled-cli

## Licencia

[MIT](LICENSE)
