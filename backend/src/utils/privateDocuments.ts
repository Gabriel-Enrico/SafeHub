export const PRIVATE_DOCUMENT_BUCKET = 'cliente-documentos';
export const MAX_PRIVATE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const PRIVATE_DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function hasValidPrivateDocumentSignature(
  extension: string,
  bytes: Buffer
): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'jpg' || extension === 'jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'png')
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
