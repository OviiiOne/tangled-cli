import { parseArgs } from 'node:util';
import { TglError } from './errors.js';
import auth from './commands/auth.js';
import pr from './commands/pr.js';

// Each topic is a self-contained module: { name, summary, commands }.
// Adding a topic (release, issue, ...) means adding one file and one line here.
const TOPICS = [auth, pr];

function topicHelp(topic) {
  const lines = [`Uso: tgl ${topic.name} <comando> [opciones]`, '', topic.summary, '', 'Comandos:'];
  for (const [name, cmd] of Object.entries(topic.commands)) {
    lines.push(`  ${name.padEnd(10)} ${cmd.summary}`);
  }
  lines.push('', `Ayuda de un comando: tgl ${topic.name} <comando> --help`);
  return lines.join('\n');
}

function mainHelp() {
  const lines = ['tgl: maneja Tangled (tangled.org) desde la terminal.', '', 'Uso: tgl <tema> <comando> [opciones]', '', 'Temas:'];
  for (const t of TOPICS) lines.push(`  ${t.name.padEnd(10)} ${t.summary}`);
  lines.push('', 'Ayuda de un tema: tgl <tema> --help');
  return lines.join('\n');
}

export async function main(argv) {
  const [topicName, commandName, ...rest] = argv;

  if (!topicName || topicName === '--help' || topicName === '-h' || topicName === 'help') {
    console.log(mainHelp());
    return 0;
  }

  const topic = TOPICS.find((t) => t.name === topicName);
  if (!topic) {
    console.error(`Tema desconocido: "${topicName}".\n\n${mainHelp()}`);
    return 1;
  }

  if (!commandName || commandName === '--help' || commandName === '-h') {
    console.log(topicHelp(topic));
    return 0;
  }

  const command = topic.commands[commandName];
  if (!command) {
    console.error(`Comando desconocido: "tgl ${topicName} ${commandName}".\n\n${topicHelp(topic)}`);
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
