import path from 'path';
import fs from 'fs';

// User-uploaded recipe images live here and are served at /uploads/<file>
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

export function ensureUploadsDir(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
