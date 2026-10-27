import pg from 'pg';
import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { databaseOptions, loadDatabaseEnvironment } from '../src/config/database-environment.ts';
import { databaseDiagnostic } from './database-diagnostic.mjs';

let client;
let stage = 'configuração';
try {
  if (process.env.VYMPA_DATABASE_TARGET !== 'supabase')
    throw new Error('Seleção Supabase obrigatória.');
  loadDatabaseEnvironment();
  const options = databaseOptions(process.env.DATABASE_URL);
  const url = new URL(options.connectionString);
  console.log(
    'Supabase: ambiente remoto carregado; configuração CA válida; verificação TLS obrigatória.',
  );
  stage = 'DNS';
  await lookup(url.hostname, { family: 4 });
  console.log('Supabase: resolução DNS IPv4 aprovada.');
  stage = 'TCP';
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port), family: 4 });
    const finish = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(5000, () => finish(Object.assign(new Error(), { code: 'ETIMEDOUT' })));
    socket.once('error', finish);
    socket.once('connect', () => finish());
  });
  console.log('Supabase: conectividade TCP na porta 5432 aprovada.');
  stage = 'TLS/autenticação PostgreSQL';
  client = new pg.Client({ ...options, query_timeout: 5000 });
  // Evento de transporte do pg; só informa sucesso após a verificação nativa de cadeia e hostname.
  client.connection.on('sslconnect', () => {
    client.connection.stream.once('secureConnect', () => {
      if (client.connection.stream.authorized === true)
        console.log('Supabase: cadeia TLS e hostname verificados.');
    });
  });
  await client.connect();
  stage = 'SELECT 1';
  const result = await client.query('SELECT 1');
  if (result.rowCount !== 1) throw new Error('Resultado inesperado.');
  console.log('Supabase: autenticação e SELECT 1 aprovados; nenhum dado alterado.');
} catch (error) {
  console.error('Supabase não validado; etapa ' + stage + ': ' + databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  try {
    await client?.end();
  } catch (error) {
    console.error('Supabase: falha ao encerrar conexão: ' + databaseDiagnostic(error));
    process.exitCode = 1;
  }
}
