import { File, Paths } from 'expo-file-system';
import { createErrorLog } from './errorLog';

const file = () => new File(Paths.document, 'errors.json');

/** The app's error log, in a small file next to the library (Settings › Diagnostics shows it). */
export const errorLog = createErrorLog({
  read: () => {
    const f = file();
    return f.exists ? f.textSync() : null;
  },
  write: (text) => file().writeSync(text),
});
