import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import tarStream, { type Headers } from 'tar-stream';

export interface FileResult {
  data: Buffer;
  path: string;
  type: Pick<Headers, 'type'>['type'];
}

const decompressTar = (input: Readable): Promise<FileResult[]> => {
  const extract = tarStream.extract();
  const files: FileResult[] = [];

  extract.on('entry', (header, stream, next) => {
    const chunks: Uint8Array[] = [];

    stream.on('data', (data) => chunks.push(data));
    stream.on('end', () => {
      files.push({
        data: Buffer.concat(chunks),
        path: header.name,
        type: header.type,
      });
      next();
    });

    stream.resume();
  });

  input.pipe(extract);

  return new Promise((resolve, reject) => {
    input.on('error', reject);
    extract.on('finish', () => resolve(files));
    extract.on('error', reject);
  });
};

export const decompressTarGz = (input: Readable): Promise<FileResult[]> => {
  const unzip = zlib.createGunzip();
  const result = decompressTar(unzip);
  input.pipe(unzip);
  return result;
};
