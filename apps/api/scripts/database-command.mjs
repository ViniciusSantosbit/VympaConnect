import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadDatabaseEnvironment } from '../src/config/database-environment.ts';

const [target, command, ...args] = process.argv.slice(2);
const prismaCommands = {
  generate: ['generate'],
  validate: ['validate'],
  status: ['migrate', 'status'],
  migrate: ['migrate', 'dev'],
  deploy: ['migrate', 'deploy'],
};
try {
  if (!['local', 'supabase'].includes(target)) throw new Error('Selecione local ou supabase.');
  if (target === 'supabase' && !['check', 'prepare', 'start'].includes(command))
    throw new Error('Operação remota bloqueada nesta etapa.');
  if (args.length) throw new Error('Argumentos adicionais bloqueados.');
  process.env.VYMPA_DATABASE_TARGET = target;
  if (command === 'prepare') {
    console.log('SUPABASE: nenhuma conexão ou migration executada.');
    console.log(
      'Deploy futuro: revisar todos os SQL em prisma/migrations; verificar tabelas existentes e necessidade de baseline; confirmar backup e restauração; testar em staging; obter aprovação explícita do projeto vympa-connect-admin.',
    );
    console.log(
      'O deploy remoto permanece bloqueado nesta etapa. Session pooler será usado também pela CLI, sem shadow database remoto.',
    );
    process.exit(0);
  }
  if (!['generate', 'validate'].includes(command)) loadDatabaseEnvironment();
  let entry;
  let childArgs;
  if (prismaCommands[command]) {
    entry = '../../../node_modules/prisma/build/index.js';
    childArgs = prismaCommands[command];
  } else if (command === 'dev') {
    entry = '../../../node_modules/@nestjs/cli/bin/nest.js';
    childArgs = ['start', '--watch'];
  } else if (command === 'start') {
    entry = '../dist/main.js';
    childArgs = [];
  } else if (command === 'check') {
    entry = target === 'local' ? './check-database.mjs' : './check-supabase.mjs';
    childArgs = [];
  } else throw new Error('Comando não permitido.');
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(entry, import.meta.url)), ...childArgs],
    {
      cwd: new URL('../', import.meta.url),
      env: process.env,
      stdio: 'inherit',
    },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
