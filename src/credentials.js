// Stores the login outside the project, in the user's profile.
// On Windows the app password is encrypted with DPAPI: only this Windows
// user on this computer can decrypt it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TglError } from './errors.js';

const IS_WINDOWS = process.platform === 'win32';

export function configDir() {
  return process.env.APPDATA ? join(process.env.APPDATA, 'tgl') : join(homedir(), '.config', 'tgl');
}

function loginFile() {
  return join(configDir(), 'login.json');
}

// Calls DPAPI through .NET directly rather than the SecureString cmdlets: when started
// from PowerShell 7, the inherited PSModulePath stops Windows PowerShell from loading them.
const LOAD_DPAPI = "[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); " +
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser; ';

// The secret travels through stdin, never as a command-line argument,
// so it does not show up in the list of running processes.
function powershell(script, input) {
  const env = { ...process.env };
  delete env.PSModulePath;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LOAD_DPAPI + script], {
    input,
    env,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new TglError(`No se pudo usar el cifrado de Windows: ${res.stderr.trim() || res.error?.message}`);
  }
  return res.stdout.trim();
}

function protect(secret) {
  if (!IS_WINDOWS) return { scheme: 'plain', value: secret };
  const value = powershell(
    '$b = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); ' +
      '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b, $null, $scope))',
    secret,
  );
  return { scheme: 'dpapi', value };
}

function unprotect({ scheme, value }) {
  if (scheme === 'plain') return value;
  if (scheme === 'dpapi') {
    return powershell(
      '$e = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ' +
        '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($e, $null, $scope)))',
      value,
    );
  }
  throw new TglError(`Formato de credenciales desconocido: ${scheme}`);
}

export function saveLogin({ handle, did, pds, password }) {
  mkdirSync(configDir(), { recursive: true });
  const data = { handle, did, pds, password: protect(password), savedAt: new Date().toISOString() };
  writeFileSync(loginFile(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadLogin() {
  if (!existsSync(loginFile())) {
    throw new TglError('No has iniciado sesión. Ejecuta "tgl auth login" en tu terminal.');
  }
  const data = JSON.parse(readFileSync(loginFile(), 'utf8'));
  return { ...data, password: unprotect(data.password) };
}

export function readLoginInfo() {
  if (!existsSync(loginFile())) return null;
  const { handle, did, pds, savedAt } = JSON.parse(readFileSync(loginFile(), 'utf8'));
  return { handle, did, pds, savedAt, file: loginFile() };
}

export function deleteLogin() {
  rmSync(loginFile(), { force: true });
}

// Reads a line from the terminal without echoing what is typed.
export function promptHidden(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    throw new TglError('Este comando necesita una terminal interactiva: ejecútalo tú en tu propia terminal.');
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
          reject(new TglError('Cancelado.'));
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
