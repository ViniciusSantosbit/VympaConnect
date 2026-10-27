import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
// Deixar o SO escolher uma porta livre sem interferir na API iniciada manualmente.
async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

let child;
let closed;
let finished = false;
let spawnError;
let stdoutBytes = 0;
let stderrBytes = 0;
let interrupted;
const requests = new AbortController();
function interrupt(signal) {
  interrupted = signal;
  requests.abort();
}
const onSigint = () => interrupt('SIGINT');
const onSigterm = () => interrupt('SIGTERM');
process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

function assertRunning() {
  if (interrupted) throw new Error(`Smoke test interrompido por ${interrupted}.`);
  if (spawnError)
    throw new Error(`Falha ao criar processo da API: ${spawnError.code ?? 'UNKNOWN'}.`);
  if (finished || child.exitCode !== null || child.signalCode !== null)
    throw new Error(
      `API encerrou antes da validação (código ${child.exitCode}, sinal ${child.signalCode}).`,
    );
}

async function request(url) {
  const response = await fetch(url, {
    signal: AbortSignal.any([requests.signal, AbortSignal.timeout(2000)]),
    redirect: 'error',
  });
  // Consumir o corpo dentro do timeout também limita servidores que só enviam headers.
  return { ok: response.ok, body: await response.text() };
}

try {
  const port = await availablePort();
  if (interrupted) throw new Error(`Smoke test interrompido por ${interrupted}.`);
  child = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/main.js'], {
    cwd: new URL('../../apps/api/', import.meta.url),
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', (error) => {
    spawnError = error;
  });
  closed = new Promise((resolve) =>
    child.once('close', () => {
      finished = true;
      resolve();
    }),
  );
  child.stdout.on('data', (chunk) => {
    stdoutBytes += chunk.length;
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
  });
  console.log(
    `API real: PID ${child.pid ?? 'pendente'}, porta ${port}; aguardando bootstrap (60s).`,
  );
  const deadline = performance.now() + 60_000;
  let ready = false;
  while (performance.now() < deadline) {
    assertRunning();
    try {
      const response = await request(`http://127.0.0.1:${port}/api/v1/health`);
      const body = JSON.parse(response.body);
      if (response.ok && body.status === 'ok' && body.service === 'vympa-connect-api') {
        assertRunning();
        ready = true;
        break;
      }
    } catch {
      /* Aguardar bootstrap real com PostgreSQL. */
    }
    await setTimeout(500);
  }
  if (!ready) throw new Error('Timeout ao iniciar API.');
  for (const path of ['/api/docs', '/api/docs-json']) {
    assertRunning();
    const response = await request(`http://127.0.0.1:${port}${path}`);
    if (!response.ok) throw new Error('Swagger indisponível: ' + path);
  }
  assertRunning();
  console.log('Bootstrap real, health e Swagger validados com PostgreSQL.');
} catch (error) {
  console.error(error.message);
  // Não imprimir logs completos: erros de drivers podem conter configuração sensível.
  console.error(`Bytes capturados: stdout=${stdoutBytes}, stderr=${stderrBytes}.`);
  console.error('Verifique acesso à rede local/PostgreSQL e permissões do ambiente de execução.');
  process.exitCode = 1;
} finally {
  try {
    if (child && !finished) {
      // Node direto, sem shell/npm intermediário: sinalizar somente o filho deste teste.
      child.kill('SIGTERM');
      if (
        !(await Promise.race([closed.then(() => true), setTimeout(5000, false, { ref: false })]))
      ) {
        child.kill('SIGKILL');
        if (
          !(await Promise.race([closed.then(() => true), setTimeout(5000, false, { ref: false })]))
        ) {
          console.error('Não foi possível confirmar encerramento da API do smoke test.');
          process.exitCode = 1;
        }
      }
    }
    if (child?.pid && finished) console.log(`Processo da API ${child.pid} encerrado.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}
