import { readFile, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const rows = [];
for (const workspace of ['', 'apps/web', 'apps/api', 'packages/shared']) {
  const filename = workspace ? workspace + '/package.json' : 'package.json';
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[kind] ?? {})) {
      if (name.startsWith('@vympa/')) continue;
      const entry =
        lock.packages[(workspace ? workspace + '/' : '') + 'node_modules/' + name] ??
        lock.packages['node_modules/' + name];
      if (!entry?.version) throw new Error('Versão não resolvida: ' + name);
      manifest[kind][name] = entry.version;
      rows.push('| ' + (workspace || 'raiz') + ' | ' + name + ' | ' + entry.version + ' |');
    }
  }
  await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
  // Mantém os manifests de workspace no lockfile alinhados, sem alterar resolução.
  for (const kind of ['dependencies', 'devDependencies']) {
    if (manifest[kind]) lock.packages[workspace][kind] = manifest[kind];
  }
}
await writeFile('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
await writeFile(
  'docs/requirements/versions.md',
  '# Versões instaladas\n\nInventário das dependências diretas resolvidas em 26/10/2026. Node.js 24.22.1 LTS e npm 11.19.1 usados na validação. Versões fixadas nos manifests; resoluções transitivas no package-lock.json.\n\n| Workspace | Pacote | Versão |\n| --- | --- | --- |\n' +
    rows.join('\n') +
    '\n\nOverride Multer 2.5.0: corrige GHSA-q7qp-rjg7-q26m na dependência transitiva de @nestjs/platform-express 12.2.0. Revisar o override ao atualizar NestJS.\n',
);
