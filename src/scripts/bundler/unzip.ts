import yauzl from 'yauzl';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Readable } from 'stream';

function mkdirp(dir: string, cb: (err?: Error) => void) {
  if (dir === ".") return cb();
  fs.mkdir(dir, { recursive: true }, function(err) {
    cb(err || undefined);
  });
}

async function listTarEntries(filePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-tf', filePath], {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => {
      stdout += data.toString();
    });

    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code !== 0) {
        return reject(
          new Error(`tar listing failed with code ${code}\n${stderr}`)
        );
      }

      resolve(
        stdout
          .split(/\r?\n/)
          .map(x => x.trim())
          .filter(Boolean)
      );
    });
  });
}

function validateArchivePaths(
  entries: string[],
  outputDir: string
): void {
  const outputRoot = path.resolve(outputDir);

  for (const entry of entries) {
    if (path.isAbsolute(entry)) {
      throw new Error(`Archive contains absolute path: ${entry}`);
    }

    const resolved = path.resolve(outputRoot, entry);

    if (
      resolved !== outputRoot &&
      !resolved.startsWith(outputRoot + path.sep)
    ) {
      throw new Error(
        `Archive contains path traversal entry: ${entry}`
      );
    }
  }
}

async function unzipWithTar(
  filePath: string,
  outputDir: string,
  deleteZip: boolean
): Promise<void> {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const entries = await listTarEntries(filePath);
  validateArchivePaths(entries, outputDir);

  return new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-xf', filePath, '-C', outputDir],
      {
        windowsHide: true
      }
    );

    let stderr = '';

    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', async code => {
      if (code !== 0) {
        return reject(
          new Error(`tar extraction failed with code ${code}\n${stderr}`)
        );
      }

      if (deleteZip) {
        await fs.promises.unlink(filePath).catch(() => {});
      }

      resolve();
    });
  });
}

export async function unzipFile(
  filePath: string,
  outputDir: string,
  deleteZip: boolean = true
): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await unzipWithTar(filePath, outputDir, deleteZip);
      return;
    } catch (err: any) {
      if (err && err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, function(err, zipfile) {
      if (err) return reject(err);

      let handleCount = 0;

      function incrementHandleCount() {
        handleCount++;
      }

      function decrementHandleCount() {
        handleCount--;
        if (handleCount === 0) {
          resolve();
        }
      }

      incrementHandleCount();

      zipfile.on('close', async function() {
        if (deleteZip) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
        decrementHandleCount();
      });

      zipfile.readEntry();

      zipfile.on('entry', function(entry: yauzl.Entry) {
        if (entry.fileName.endsWith('/')) {
          mkdirp(path.join(outputDir, entry.fileName), function(err: Error | undefined) {
            if (err) return reject(err);
            zipfile.readEntry();
          });
        } else {
          const outputPath = path.join(outputDir, entry.fileName);

          mkdirp(path.dirname(outputPath), function(err: Error | undefined) {
            if (err) return reject(err);

            zipfile.openReadStream(entry, function(err: Error | null, readStream: Readable) {
              if (err) return reject(err);

              readStream.on('error', reject);

              readStream.on('end', function() {
                zipfile.readEntry();
              });

              const writeStream = fs.createWriteStream(outputPath);

              incrementHandleCount();

              writeStream.on('close', decrementHandleCount);
              writeStream.on('error', reject);

              readStream.pipe(writeStream);
            });
          });
        }
      });

      zipfile.on('error', reject);
    });
  });
}
