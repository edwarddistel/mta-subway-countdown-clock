import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function jsFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? jsFiles(path) : entry.name.endsWith('.js') ? [path] : [];
  });
}
for (const file of [...jsFiles('src'), ...jsFiles('public'), ...jsFiles('test'), ...jsFiles('scripts')]) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('All JavaScript files passed Node syntax checks.');
