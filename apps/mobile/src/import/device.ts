import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import LamplightEngine from '../../modules/lamplight-engine';
import type { Db } from '../data/db';
import type { DocumentSource } from '../data/library';
import { coverExtension, PICKER_TYPES, uriToPath } from './paths';
import { importFile, type ImportResult } from './run';

/** A file the app can read: from the picker, the share sheet or "Open with". */
export interface IncomingFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

async function saveCover(documentId: string, cover: { mime: string; data: Uint8Array }): Promise<string> {
  const dir = new Directory(Paths.document, 'covers');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${documentId}.${coverExtension(cover.mime)}`);
  await file.write(cover.data);
  return file.uri;
}

/**
 * Imports one local file into the library. The file must be readable by the app (a cache copy from the
 * picker, or a shared file). `temporary` copies are deleted afterwards (the library keeps the parsed text),
 * except a locked PDF's, which the caller retries with `password`.
 */
export async function importIncoming(
  db: Db,
  incoming: IncomingFile,
  source: DocumentSource,
  opts: { temporary?: boolean; password?: string } = {},
): Promise<ImportResult> {
  const file = new File(incoming.uri);
  let result: ImportResult | undefined;
  try {
    const bytes = await file.bytes();
    result = await importFile(
      db,
      {
        name: incoming.name,
        mime: incoming.mimeType ?? null,
        bytes,
        path: uriToPath(file.uri),
        ...(opts.temporary ? {} : { uri: incoming.uri }),
        ...(opts.password ? { password: opts.password } : {}),
        source,
      },
      {
        sha256: () => file.digest('SHA-256'),
        extractPdf: (path, password) => LamplightEngine.extractPdf(path, password),
        saveCover,
      },
    );
    return result;
  } finally {
    // A locked PDF's copy stays so the import can be retried with the password.
    const retry = result?.status === 'failed' && result.code === 'password';
    if (opts.temporary && !retry && file.exists) file.delete();
  }
}

/** Opens the system file picker and imports each chosen file. Returns null when the user cancels. */
export async function pickAndImport(db: Db): Promise<ImportResult[] | null> {
  const picked = await getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: true });
  if (picked.canceled) return null;
  const results: ImportResult[] = [];
  for (const asset of picked.assets) {
    results.push(
      await importIncoming(
        db,
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null },
        'file',
        {
          temporary: true,
        },
      ),
    );
  }
  return results;
}
