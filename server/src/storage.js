import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { safeFileName } from './validation.js';

export const inboxDir = () => path.join(config.storageDir, 'inbox');
export const tmpDir = () => path.join(config.storageDir, 'tmp');

export async function ensureStorage() {
  await fs.mkdir(inboxDir(), { recursive: true });
  await fs.mkdir(tmpDir(), { recursive: true });
}

/** Vorgangsnummer im Format DWE-JJMMTT-XXXX, z. B. DWE-260914-7K3F */
export function createReference(date = new Date()) {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join('');
  return `DWE-${y}${m}${d}-${suffix}`;
}

export const requestDir = (reference) => path.join(inboxDir(), reference);

/**
 * Legt eine Anfrage dauerhaft ab: eigener Ordner, Dateien in files/, Metadaten in anfrage.json.
 * Erst wenn das geklappt hat, bekommt der Kunde eine Erfolgsmeldung.
 */
export async function persistRequest({ data, uploadedFiles, meta }) {
  const reference = createReference();
  const dir = requestDir(reference);
  const filesDir = path.join(dir, 'files');
  await fs.mkdir(filesDir, { recursive: true });

  const usedNames = new Set();
  const files = [];
  for (const file of uploadedFiles) {
    const { displayName, storedName } = safeFileName(file.originalname);
    let name = storedName;
    for (let i = 2; usedNames.has(name.toLowerCase()); i++) {
      const ext = path.extname(storedName);
      name = `${path.basename(storedName, ext)}-${i}${ext}`;
    }
    usedNames.add(name.toLowerCase());

    const target = path.join(filesDir, name);
    await fs.rename(file.path, target);
    files.push({
      originalName: displayName,
      storedName: name,
      size: file.size,
      mimeType: file.mimetype,
      path: path.join('files', name)
    });
  }

  const record = {
    schemaVersion: 1,
    reference,
    createdAt: new Date().toISOString(),
    ...data,
    consent: { given: true, at: new Date().toISOString() },
    files,
    meta,
    dispatch: {}
  };

  await writeRecord(record);
  return record;
}

export async function writeRecord(record) {
  const file = path.join(requestDir(record.reference), 'anfrage.json');
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function readRecord(reference) {
  const raw = await fs.readFile(path.join(requestDir(reference), 'anfrage.json'), 'utf8');
  return JSON.parse(raw);
}

export async function listReferences() {
  const entries = await fs.readdir(inboxDir(), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export const absoluteFilePath = (record, file) => path.join(requestDir(record.reference), file.path);

export async function removeTempFiles(uploadedFiles = []) {
  await Promise.all(uploadedFiles.map((f) => fs.rm(f.path, { force: true })));
}

/** Löscht Anfragen, die älter als RETENTION_DAYS sind. */
export async function purgeExpired() {
  if (!config.retentionDays) return 0;
  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const reference of await listReferences()) {
    try {
      const record = await readRecord(reference);
      if (Date.parse(record.createdAt) < cutoff) {
        await fs.rm(requestDir(reference), { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* unvollständiger Ordner – beim nächsten Lauf erneut prüfen */
    }
  }
  return removed;
}
