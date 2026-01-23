import { extract } from 'tar';
import stream from 'node:stream/promises';
import { Readable } from 'stream';
export async function untgzStream(tgzStream, outputDir) {
    return await stream.finished(tgzStream.pipe(extract({
        cwd: outputDir,
    })));
}
//# sourceMappingURL=untgz.js.map