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

// The secret travels through stdin, never as a command-line argument,
// so it does not show up in the list of running processes.
function powershell(script, input) {
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
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
    '$p = [Console]::In.ReadToEnd(); ConvertTo-SecureString -String $p -AsPlainText -Force | ConvertFrom-SecureString',
    secret,
  );
  return { scheme: 'dpapi', value };
}

function unprotect({ scheme, value }) {
  if (scheme === 'plain') return value;
  if (scheme === 'dpapi') {
    return powershell(
      '$e = [Console]::In.ReadToEnd().Trim(); $s = ConvertTo-SecureString -String $e; [Console]::Out.Write([Net.NetworkCredential]::new("", $s).Password)',
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
