import ts from 'typescript';
import path from 'node:path';
let failed = false;
for (const app of ['apps/web', 'apps/api', 'packages/shared']) {
  const configPath = path.resolve(app, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  const files = config.fileNames.filter(
    (file) => !file.includes('/generated/') && !file.includes('\\generated\\'),
  );
  const fileSet = new Set(files.map((file) => path.resolve(file)));
  const graph = new Map();
  for (const file of fileSet) {
    const imports = ts.preProcessFile(ts.sys.readFile(file) ?? '', true, true).importedFiles;
    graph.set(
      file,
      imports
        .map(
          (item) =>
            ts.resolveModuleName(item.fileName, file, config.options, ts.sys).resolvedModule
              ?.resolvedFileName,
        )
        .filter(Boolean)
        .map((item) => path.resolve(item))
        .filter((item) => fileSet.has(item)),
    );
  }
  const visited = new Set(),
    active = new Set();
  function visit(file, trail) {
    if (active.has(file)) {
      console.error(
        'Ciclo:',
        [...trail, file].map((item) => path.relative(process.cwd(), item)).join(' -> '),
      );
      failed = true;
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    active.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...trail, file]);
    active.delete(file);
  }
  for (const file of fileSet) visit(file, []);
  console.log(app + ': ' + fileSet.size + ' arquivos analisados.');
}
if (failed) process.exitCode = 1;
else console.log('Nenhum ciclo entre imports locais detectado.');
