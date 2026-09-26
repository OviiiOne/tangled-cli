// Stores the login outside any project, in the user's profile. The app password
// goes to the operating system's secret store:
// - Windows: encrypted with DPAPI (only this Windows user on this computer can decrypt it).
// - macOS: the login Keychain.
// - Linux: the desktop secret service (GNOME Keyring, KWallet...) through secret-tool;
//   if there is none, a file readable only by the user, with a warning.
// The secret always travels through stdin, never as a command-line argument,
// so it does not show up in the list of running processes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TglError } from './errors.js';
import { t } from './i18n.js';

const SERVICE = 'tgl';

export function configDir() {
  if (process.env.APPDATA) return join(process.env.APPDATA, 'tgl');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tgl');
}

function loginFile() {
  return join(configDir(), 'login.json');
}

function run(cmd, args, input) {
  const res = spawnSync(cmd, args, { input, encoding: 'utf8' });
  return { ok: !res.error && res.status === 0, out: res.stdout ?? '', err: (res.stderr || res.error?.message || '').trim() };
}

// --- Windows: DPAPI ---
// Calls DPAPI through .NET directly rather than the SecureString cmdlets: when started
// from PowerShell 7, the inherited PSModulePath stops Windows PowerShell from loading them.
const LOAD_DPAPI = "[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); " +
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser; ';

function powershell(script, input) {
  const env = { ...process.env };
  delete env.PSModulePath;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LOAD_DPAPI + script], { input, env, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new TglError(t(`Could not use Windows encryption: ${res.stderr.trim() || res.error?.message}`, `No se pudo usar el cifrado de Windows: ${res.stderr.trim() || res.error?.message}`));
  }
  return res.stdout.trim();
}

// --- macOS: Keychain. `security -i` reads its command from stdin. ---
function keychainQuote(s) {
  return `"${s.replace(/[\\"]/g, '\\$&')}"`;
}

const STORES = {
  dpapi: {
    save: (_did, secret) => powershell(
      '$b = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); ' +
        '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b, $null, $scope))',
      secret,
    ),
    load: (_did, value) => powershell(
      '$e = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ' +
        '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($e, $null, $scope)))',
      value,
    ),
    remove: () => {},
  },
  keychain: {
    save: (did, secret) => {
      const r = run('security', ['-i'], `add-generic-password -U -a ${keychainQuote(did)} -s ${SERVICE} -w ${keychainQuote(secret)}\n`);
      if (!r.ok) throw new TglError(t(`Could not save to the Keychain: ${r.err}`, `No se pudo guardar en el Llavero: ${r.err}`));
      return null;
    },
    load: (did) => {
      const r = run('security', ['find-generic-password', '-a', did, '-s', SERVICE, '-w']);
      if (!r.ok) throw new TglError(t('The app password is not in the Keychain. Run "tgl auth login".', 'La contraseña de aplicación no está en el Llavero. Ejecuta "tgl auth login".'));
      return r.out.replace(/\n$/, '');
    },
    remove: (did) => run('security', ['delete-generic-password', '-a', did, '-s', SERVICE]),
  },
  'secret-service': {
    save: (did, secret) => {
      const r = run('secret-tool', ['store', `--label=tgl (${did})`, 'service', SERVICE, 'account', did], secret);
      if (!r.ok) throw new Error(r.err);
      return null;
    },
    load: (did) => {
      const r = run('secret-tool', ['lookup', 'service', SERVICE, 'account', did]);
      if (!r.ok || !r.out) throw new TglError(t('The app password is not in the secret store. Run "tgl auth login".', 'La contraseña de aplicación no está en el almacén de secretos. Ejecuta "tgl auth login".'));
      return r.out.replace(/\n$/, '');
    },
    remove: (did) => run('secret-tool', ['clear', 'service', SERVICE, 'account', did]),
  },
  // Last resort on Linux without a secret service; the file is created with mode 600.
  file: {
    save: (_did, secret) => secret,
    load: (_did, value) => value,
    remove: () => {},
  },
};

function saveSecret(did, secret) {
  if (process.platform === 'win32') return { scheme: 'dpapi', value: STORES.dpapi.save(did, secret) };
  if (process.platform === 'darwin') return { scheme: 'keychain', value: STORES.keychain.save(did, secret) };
  try {
    return { scheme: 'secret-service', value: STORES['secret-service'].save(did, secret) };
  } catch {
    console.error(t(
      'Warning: no system secret store found (secret-tool). The app password is saved in a file only your user can read.',
      'Aviso: no hay almacén de secretos del sistema (secret-tool). La contraseña se guarda en un archivo que solo tu usuario puede leer.',
    ));
    return { scheme: 'file', value: secret };
  }
}

function storeFor(scheme) {
  // "plain" was the name of the file scheme in tgl 0.1.
  const store = STORES[scheme === 'plain' ? 'file' : scheme];
  if (!store) throw new TglError(t(`Unknown credentials format: ${scheme}`, `Formato de credenciales desconocido: ${scheme}`));
  return store;
}

function notLoggedIn() {
  return new TglError(t('You are not logged in. Run "tgl auth login" in your terminal.', 'No has iniciado sesión. Ejecuta "tgl auth login" en tu terminal.'));
}

export function saveLogin({ handle, did, pds, password }) {
  mkdirSync(configDir(), { recursive: true });
  const data = { handle, did, pds, password: saveSecret(did, password), savedAt: new Date().toISOString() };
  writeFileSync(loginFile(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadLogin() {
  if (!existsSync(loginFile())) throw notLoggedIn();
  const data = JSON.parse(readFileSync(loginFile(), 'utf8'));
  return { ...data, password: storeFor(data.password.scheme).load(data.did, data.password.value) };
}

export function readLoginInfo() {
  if (!existsSync(loginFile())) return null;
  const { handle, did, pds, savedAt, password } = JSON.parse(readFileSync(loginFile(), 'utf8'));
  return { handle, did, pds, savedAt, store: password.scheme, file: loginFile() };
}

// The logged-in account (no password needed): for reading public records.
export function whoAmI() {
  const info = readLoginInfo();
  if (!info) throw notLoggedIn();
  return info;
}

export function deleteLogin() {
  const info = readLoginInfo();
  if (info) storeFor(info.store).remove(info.did);
  rmSync(loginFile(), { force: true });
}

// Reads a line from the terminal without echoing what is typed.
export function promptHidden(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    throw new TglError(t('This command needs an interactive terminal: run it yourself in your own terminal.', 'Este comando necesita una terminal interactiva: ejecútalo tú en tu propia terminal.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new TglError(t('Cancelled.', 'Cancelado.')));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

export async function promptLine(question) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
