import { resolveHandle, resolvePds, Session } from '../atproto.js';
import { deleteLogin, loadLogin, promptHidden, promptLine, readLoginInfo, saveLogin } from '../credentials.js';
import { TglError } from '../errors.js';
import { t } from '../i18n.js';

// Opens a session with the saved login. Used by every command that writes.
export async function openSession() {
  const login = loadLogin();
  return Session.login(login.pds, login.did, login.password);
}

const STORE_NAMES = {
  dpapi: () => t('Windows encryption (DPAPI)', 'cifrado de Windows (DPAPI)'),
  keychain: () => t('macOS Keychain', 'Llavero de macOS'),
  'secret-service': () => t('system secret store', 'almacén de secretos del sistema'),
  file: () => t('file readable only by you', 'archivo que solo tú puedes leer'),
  plain: () => t('file readable only by you', 'archivo que solo tú puedes leer'),
};

export default {
  name: 'auth',
  summary: t('Log in or out of your Tangled account', 'Iniciar o cerrar sesión con tu cuenta de Tangled'),
  commands: {
    login: {
      summary: t('Save your account and an app password', 'Guardar tu cuenta y una contraseña de aplicación'),
      usage: t(
        'Usage: tgl auth login [--handle <account>]\n\nAsks for the app password without showing it, checks that it works and stores it\nin your system\'s secret store, outside any project.',
        'Uso: tgl auth login [--handle <cuenta>]\n\nPide la contraseña de aplicación sin mostrarla, comprueba que funciona y la guarda\nen el almacén de secretos de tu sistema, fuera de cualquier proyecto.',
      ),
      options: { handle: { type: 'string' } },
      async run({ handle }) {
        handle ||= await promptLine(t('Your account (e.g. alice.bsky.social): ', 'Tu cuenta (por ejemplo ana.bsky.social): '));
        if (!handle) throw new TglError(t('The account is required.', 'Hace falta la cuenta.'));
        const did = await resolveHandle(handle);
        const pds = await resolvePds(did);
        const password = await promptHidden(t('App password (hidden while typing): ', 'Contraseña de aplicación (no se verá al escribir): '));
        if (!password) throw new TglError(t('No password was entered.', 'No se escribió ninguna contraseña.'));
        const session = await Session.login(pds, did, password);
        saveLogin({ handle: session.handle, did, pds, password });
        console.log(t(`Login checked and saved for ${session.handle}.`, `Sesión comprobada y guardada para ${session.handle}.`));
      },
    },
    status: {
      summary: t('Show which account you are logged in with', 'Ver con qué cuenta estás conectado'),
      usage: t('Usage: tgl auth status', 'Uso: tgl auth status'),
      async run() {
        const info = readLoginInfo();
        if (!info) throw new TglError(t('You are not logged in. Run "tgl auth login".', 'No has iniciado sesión. Ejecuta "tgl auth login".'));
        const session = await openSession();
        console.log(t(`Logged in as ${session.handle} (${info.did})`, `Conectado como ${session.handle} (${info.did})`));
        console.log(t(`Server: ${info.pds}`, `Servidor: ${info.pds}`));
        console.log(t(`App password stored in: ${STORE_NAMES[info.store]()}`, `Contraseña guardada en: ${STORE_NAMES[info.store]()}`));
      },
    },
    logout: {
      summary: t('Delete the saved app password from this computer', 'Borrar la contraseña guardada en este ordenador'),
      usage: t(
        'Usage: tgl auth logout\n\nTo revoke it completely, also delete it in your account settings.',
        'Uso: tgl auth logout\n\nPara invalidarla del todo, bórrala también en los ajustes de tu cuenta.',
      ),
      async run() {
        deleteLogin();
        console.log(t('Credentials deleted from this computer.', 'Credenciales borradas de este ordenador.'));
      },
    },
  },
};
