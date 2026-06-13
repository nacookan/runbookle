export type ZipSource = Blob | Uint8Array | string;

export type ZipEntrySource = {
  path: string;
  data: ZipSource;
};

export type ZipEntry = {
  path: string;
  data: Uint8Array;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const CRC32_TABLE = createCrc32Table();

export async function createZip(entries: ZipEntrySource[]): Promise<Blob> {
  const fileParts: BlobPart[] = [];
  const centralDirectoryParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBytes = textEncoder.encode(entry.path);
    const dataBytes = await toUint8Array(entry.data);
    const crc32 = calculateCrc32(dataBytes);
    const localHeader = createLocalFileHeader(pathBytes, dataBytes, crc32);
    const centralDirectoryHeader = createCentralDirectoryHeader(pathBytes, dataBytes, crc32, offset);

    fileParts.push(localHeader, toArrayBuffer(pathBytes), toArrayBuffer(dataBytes));
    centralDirectoryParts.push(centralDirectoryHeader, toArrayBuffer(pathBytes));
    offset += localHeader.byteLength + pathBytes.byteLength + dataBytes.byteLength;
  }

  const centralDirectorySize = centralDirectoryParts.reduce((size, part) => size + getBlobPartSize(part), 0);
  const endOfCentralDirectory = createEndOfCentralDirectory(entries.length, centralDirectorySize, offset);

  return new Blob([...fileParts, ...centralDirectoryParts, endOfCentralDirectory], { type: 'application/zip' });
}

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('ZIPファイルの形式が正しくありません。');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const path = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (compressionMethod !== 0 || compressedSize !== uncompressedSize) {
      throw new Error('圧縮されたZIPファイルには対応していません。RunbookleでエクスポートしたZIPを選んでください。');
    }

    const data = readStoredEntryData(view, bytes, localHeaderOffset, compressedSize);
    entries.push({ path, data });
    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
}

export function readZipText(entry: ZipEntry): string {
  return textDecoder.decode(entry.data);
}

function createLocalFileHeader(pathBytes: Uint8Array, dataBytes: Uint8Array, crc32: number) {
  const header = new ArrayBuffer(30);
  const view = new DataView(header);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc32, true);
  view.setUint32(18, dataBytes.byteLength, true);
  view.setUint32(22, dataBytes.byteLength, true);
  view.setUint16(26, pathBytes.byteLength, true);
  view.setUint16(28, 0, true);

  return header;
}

function createCentralDirectoryHeader(pathBytes: Uint8Array, dataBytes: Uint8Array, crc32: number, localHeaderOffset: number) {
  const header = new ArrayBuffer(46);
  const view = new DataView(header);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc32, true);
  view.setUint32(20, dataBytes.byteLength, true);
  view.setUint32(24, dataBytes.byteLength, true);
  view.setUint16(28, pathBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);

  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const header = new ArrayBuffer(22);
  const view = new DataView(header);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return header;
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 65_557);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('ZIPファイルの形式が正しくありません。');
}

function readStoredEntryData(view: DataView, bytes: Uint8Array, localHeaderOffset: number, size: number) {
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error('ZIPファイルの形式が正しくありません。');
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraFieldLength;

  return bytes.slice(dataOffset, dataOffset + size);
}

async function toUint8Array(source: ZipSource) {
  if (typeof source === 'string') {
    return textEncoder.encode(source);
  }

  if (source instanceof Uint8Array) {
    return source;
  }

  return new Uint8Array(await source.arrayBuffer());
}

function getBlobPartSize(part: BlobPart) {
  if (typeof part === 'string') {
    return textEncoder.encode(part).byteLength;
  }

  if (part instanceof ArrayBuffer) {
    return part.byteLength;
  }

  if (ArrayBuffer.isView(part)) {
    return part.byteLength;
  }

  return part.size;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function calculateCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}
