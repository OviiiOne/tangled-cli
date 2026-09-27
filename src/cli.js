import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { reportUnreachable } from './backlinks.js';
import { TglError } from './errors.js';
import { t } from './i18n.js';
import auth from './commands/auth.js';
import issue from './commands/issue.js';
import label from './commands/label.js';
import pr from './commands/pr.js';
import release from './commands/release.js';
import repo from './commands/repo.js';

// Each topic is a self-contained module: { name, summary, commands }.
// Adding a topic means adding one file and one line here.
const TOPICS = [auth, repo, pr, issue, label, release];

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function topicHelp(topic) {
  const lines = [t(`Usage: tgl ${topic.name} <command> [options]`, `Uso: tgl ${topic.name} <comando> [opciones]`), '', topic.summary, '', t('Commands:', 'Comandos:')];
  for (const [name, cmd] of Object.entries(topic.commands)) {
    lines.push(`  ${name.padEnd(10)} ${cmd.summary}`);
  }
  lines.push('', t(`Help for a command: tgl ${topic.name} <command> --help`, `Ayuda de un comando: tgl ${topic.name} <comando> --help`));
  return lines.join('\n');
}

function mainHelp() {
  const lines = [
    t('tgl: work with Tangled (tangled.org) from the terminal.', 'tgl: maneja Tangled (tangled.org) desde la terminal.'),
    '',
    t('Usage: tgl <topic> <command> [options]', 'Uso: tgl <tema> <comando> [opciones]'),
    '',
    t('Topics:', 'Temas:'),
  ];
  for (const topic of TOPICS) lines.push(`  ${topic.name.padEnd(10)} ${topic.summary}`);
  lines.push(
    '',
    t('Help for a topic: tgl <topic> --help', 'Ayuda de un tema: tgl <tema> --help'),
    t('Version: tgl --version', 'Versión: tgl --version'),
  );
  return lines.join('\n');
}

export async function main(argv) {
  const [topicName, commandName, ...rest] = argv;

  if (topicName === '--version' || topicName === '-v') {
    console.log(`tgl ${VERSION}`);
    return 0;
  }

  if (!topicName || topicName === '--help' || topicName === '-h' || topicName === 'help') {
    console.log(mainHelp());
    return 0;
  }

  const topic = TOPICS.find((x) => x.name === topicName);
  if (!topic) {
    console.error(`${t(`Unknown topic: "${topicName}".`, `Tema desconocido: "${topicName}".`)}\n\n${mainHelp()}`);
    return 1;
  }

  if (!commandName || commandName === '--help' || commandName === '-h') {
    console.log(topicHelp(topic));
    return 0;
  }

  const command = topic.commands[commandName];
  if (!command) {
    console.error(`${t(`Unknown command: "tgl ${topicName} ${commandName}".`, `Comando desconocido: "tgl ${topicName} ${commandName}".`)}\n\n${topicHelp(topic)}`);
    return 1;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(`${command.summary}\n\n${command.usage}`);
    return 0;
  }

  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: command.options ?? {},
      allowPositionals: true,
      strict: true,
    });
    await command.run(values, positionals);
    reportUnreachable();
    return 0;
  } catch (err) {
    if (err instanceof TglError) {
      console.error(`Error: ${err.message}`);
    } else if (err?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      console.error(`Error: ${err.message}\n\n${command.usage}`);
    } else {
      console.error(err);
    }
    return 1;
  }
}
