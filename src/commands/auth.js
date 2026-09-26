import { resolveHandle, resolvePds, Session } from '../atproto.js';
import { deleteLogin, loadLogin, promptHidden, promptLine, readLoginInfo, saveLogin } from '../credentials.js';
import { TglError } from '../errors.js';

// Opens a session with the saved login. Used by every command that writes.
export async function openSession() {
  const login = loadLogin();
  return Session.login(login.pds, login.did, login.password);
}

export default {
  name: 'auth',
  summary: 'Iniciar o cerrar sesión con tu cuenta de Tangled',
  commands: {
    login: {
      summary: 'Guardar tu cuenta y una contraseña de aplicación',
      usage: [
        'Uso: tgl auth login [--handle <cuenta>]',
        '',
        'Pide la contraseña de aplicación sin mostrarla en pantalla, comprueba que funciona',
        'y la guarda cifrada en tu perfil de usuario (fuera de cualquier proyecto).',
      ].join('\n'),
      options: { handle: { type: 'string' } },
      async run({ handle }) {
        handle ||= await promptLine('Tu cuenta (por ejemplo oviiione.eu): ');
        if (!handle) throw new TglError('Hace falta la cuenta.');
        const did = await resolveHandle(handle);
        const pds = await resolvePds(did);
        const password = await promptHidden('Contraseña de aplicación (no se verá al escribir): ');
        if (!password) throw new TglError('No se escribió ninguna contraseña.');
        const session = await Session.login(pds, did, password);
        saveLogin({ handle: session.handle, did, pds, password });
        console.log(`Sesión comprobada y guardada para ${session.handle}.`);
      },
    },
    status: {
      summary: 'Ver con qué cuenta estás conectado',
      usage: 'Uso: tgl auth status',
      async run() {
        const info = readLoginInfo();
        if (!info) throw new TglError('No has iniciado sesión. Ejecuta "tgl auth login".');
        const session = await openSession();
        console.log(`Conectado como ${session.handle} (${info.did})`);
        console.log(`Servidor: ${info.pds}`);
        console.log(`Credenciales guardadas en: ${info.file}`);
      },
    },
    logout: {
      summary: 'Borrar la contraseña guardada en este ordenador',
      usage: 'Uso: tgl auth logout\n\nPara invalidarla del todo, bórrala también en los ajustes de tu cuenta.',
      async run() {
        deleteLogin();
        console.log('Credenciales borradas de este ordenador.');
      },
    },
  },
};
