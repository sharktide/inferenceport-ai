const { glob } = require('glob');
const fs = require('fs/promises');
const path = require('path');

(async () => {
  const gitignorePath = path.resolve('.gitignore');
  const tsFiles = await glob('**/*.ts', { ignore: ['node_modules/**'] });

  const generatedFiles = [];

  for (const tsFile of tsFiles) {
    const base = tsFile.replace(/\.ts$/, '');
    for (const ext of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
      const target = `${base}${ext}`;
      generatedFiles.push(target);
      try {
        await fs.unlink(target);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Failed to delete ${target}:`, err);
        }
      }
    }
  }

  try {
    const existing = await fs.readFile(gitignorePath, 'utf-8');
    const lines = new Set(existing.split(/\r?\n/).map(line => line.trim()));

    let updated = false;
    for (const file of generatedFiles) {
      if (!lines.has(file)) {
        lines.add(file);
        updated = true;
      }
    }

    if (updated) {
      const sorted = Array.from(lines).filter(Boolean).sort();
      await fs.writeFile(gitignorePath, sorted.join('\n') + '\n', 'utf-8');
      console.log('.gitignore updated with generated files.');
    }
  } catch (err) {
    console.error('Failed to update .gitignore:', err);
  }
})();
