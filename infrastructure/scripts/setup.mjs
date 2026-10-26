import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
for (const directory of ['.', 'apps/web', 'apps/api']) {
  const target = directory + '/.env';
  try {
    await access(target);
    console.log('Preservado: ' + target);
  } catch {
    await copyFile(directory + '/.env.example', target, constants.COPYFILE_EXCL);
    console.log('Criado: ' + target);
  }
}
