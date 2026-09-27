# Contribuir a tgl

[English](CONTRIBUTING.md)

Gracias por ayudar. Los avisos de fallos, las ideas y las pull requests son bienvenidos en
cualquiera de las dos forjas:

- Tangled: https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift
- GitHub (copia): https://github.com/OviiiOne/tangled-cli

## Avisar de un fallo

Abre una issue con el comando que ejecutaste, lo que esperabas, lo que pasó, y la salida de
`tgl --version`, tu sistema y `node --version`. Nunca pegues tu contraseña de aplicación ni
nada de lo que guarda `tgl auth`.

## Preparar el entorno

```bash
git clone https://tangled.org/did:plc:e6a2dywiq22fgtsjrujrkift tangled-cli
cd tangled-cli
npm link     # el comando tgl ejecuta ahora tu copia
npm test
```

Necesitas Node.js 20 o superior y git. No hay nada que instalar: `tgl` no tiene dependencias.

## Cómo está organizado el código

- `src/cli.js` lee la línea de comandos; cada tema (`auth`, `repo`, `pr`, `issue`,
  `release`) es un archivo en `src/commands/`. Un tema nuevo es un archivo nuevo y una
  línea en `src/cli.js`, sin tocar los demás.
- `src/tangled.js` tiene los formatos de registro de Tangled. No están documentados
  oficialmente: antes de cambiar uno, lee los lexicons y `appview/` en
  [tangled.org/core](https://tangled.org/tangled.org/core), y mira qué hace
  `appview/ingester.go` con él (algunos campos se ignoran).
- Los registros de otras personas se encuentran con índices públicos (`src/backlinks.js`,
  `src/atproto.js`); los tuyos se leen siempre de tu propio servidor.

## Normas para los cambios

- **Sin dependencias.** Solo lo que trae Node.js (fetch, zlib, child_process, node:test).
- **Todos los mensajes son bilingües:** `t('English', 'Español')` de `src/i18n.js`. Si no
  escribes español, pon el texto en inglés en los dos y dilo en la PR.
- Código, comentarios y mensajes de commit en inglés. Los commits siguen
  [Conventional Commits](https://www.conventionalcommits.org/es/): `feat(pr): add …`,
  `fix(issue): …`, `docs: …`.
- Añade una prueba en `test/` para la lógica pura (formas de registro, lectura de texto).
  Los comandos que hablan con la red se prueban a mano.
- Actualiza `docs/reference.md` y `docs/reference.es.md` cuando cambie un comando.

## Probar cambios sin riesgo

- Usa primero `--dry-run` (`pr create`, `pr update`, `pr merge`, `release upload`).
- Escrituras reales solo en un repo tuyo, por ejemplo uno creado con `tgl repo create`.
  Nunca pruebes en repos de otras personas.
- Para comprobaciones grandes de solo lectura, usa una copia aparte de `tangled.org/core` y
  compara los números con la web.
- La primera escritura real de un tipo de registro nuevo hay que comprobarla en la web de
  Tangled, no solo leyéndola con `tgl`: `tgl` puede leer registros que la web ignora.

## Pull requests

Ábrela en cualquiera de las dos forjas. Explica qué cambia para quien lo usa y cómo lo has
probado. En la descripción, usa "Fixes #N" solo para la issue que de verdad resuelve: las
dos forjas (y `tgl`) actúan con esas palabras.
