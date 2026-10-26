import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const port = 3101;
const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/main.js'], {
  cwd: new URL('../../apps/api/', import.meta.url),
  env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port) },
  stdio: 'pipe',
});
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error('API encerrou antes de iniciar.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.service === 'vympa-connect-api') {
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
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    if (!response.ok) throw new Error('Swagger indisponível: ' + path);
  }
  console.log('Bootstrap real, health e Swagger validados com PostgreSQL.');
} catch (error) {
  console.error(error.message);
  // Não imprimir logs completos: erros de drivers podem conter configuração sensível.
  console.error('Consulte o log local da API para diagnóstico. Bytes capturados:', output.length);
  process.exitCode = 1;
} finally {
  child.kill();
}
