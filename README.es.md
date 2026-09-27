# tangled-cli (`tgl`)

[English](README.md)

![tgl en una terminal: lista PRs y marca una como fusionada](docs/banner.svg)

Herramienta de terminal para [Tangled](https://tangled.org), al estilo de `gh` para GitHub.

## Para qué sirve

Maneja un repositorio de Tangled sin salir de la terminal: abrir, listar, probar, comentar
y cerrar pull requests; crear y seguir issues; y adjuntar archivos (por ejemplo una versión
firmada) a una release.

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
tgl pr create -t "Añadir modo oscuro" -b "Añade un tema oscuro"
tgl pr list
tgl pr close <id> --merged
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
