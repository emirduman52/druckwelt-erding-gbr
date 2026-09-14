import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Umgebung vor dem Import der App setzen
const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'druckwelt-test-'));
let webhookHits = [];
const webhookServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    webhookHits.push({ headers: req.headers, body: Buffer.concat(chunks).toString('latin1') });
    res.end('ok');
  });
});
await new Promise((r) => webhookServer.listen(0, r));

Object.assign(process.env, {
  STORAGE_DIR: storage,
  SERVE_STATIC: 'false',
  MAIL_ENABLED: 'true',
  MAIL_TRANSPORT: 'file',
  WEBHOOK_ENABLED: 'true',
  WEBHOOK_URL: `http://127.0.0.1:${webhookServer.address().port}/hook`,
  WEBHOOK_SECRET: 'test-secret',
  RATE_LIMIT_MAX: '100',
  MAX_FILE_MB: '1'
});

const { createApp } = await import('../src/app.js');
const { ensureStorage, readRecord } = await import('../src/storage.js');
const { safeFileName } = await import('../src/validation.js');

const quietLog = { info() {}, error() {} };
let server;
let baseUrl;

before(async () => {
  await ensureStorage();
  server = createApp({ log: quietLog }).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  webhookServer.close();
  await fs.rm(storage, { recursive: true, force: true });
});

function validForm() {
  const fd = new FormData();
  fd.append('type', 'druckauftrag');
  fd.append('service', 'Flyer / Broschüre');
  fd.append('format', 'A5');
  fd.append('quantity', '500');
  fd.append('name', 'Erika Mustermann');
  fd.append('email', 'erika@example.com');
  fd.append('message', 'Bitte 500 Flyer, beidseitig.');
  fd.append('consent', 'yes');
  return fd;
}

const waitFor = async (fn, timeout = 3000) => {
  const start = Date.now();
  for (;;) {
    const result = await fn().catch(() => null);
    if (result) return result;
    if (Date.now() - start > timeout) throw new Error('Timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};

test('nimmt eine gültige Anfrage mit Datei an, legt sie ab und verteilt sie', async () => {
  const fd = validForm();
  fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'Flyer Größe A5.pdf');

  const res = await fetch(`${baseUrl}/api/anfrage`, { method: 'POST', body: fd });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.ok, true);
  assert.match(body.reference, /^DWE-\d{6}-[A-Z2-9]{4}$/);

  const record = await waitFor(async () => {
    const r = await readRecord(body.reference);
    return r.dispatch.email && r.dispatch.webhook ? r : null;
  });

  assert.equal(record.customer.email, 'erika@example.com');
  assert.equal(record.files.length, 1);
  assert.equal(record.files[0].originalName, 'Flyer Größe A5.pdf');
  assert.equal(record.files[0].storedName, 'Flyer_Grosse_A5.pdf');
  assert.equal(record.dispatch.email.status, 'done');
  assert.equal(record.dispatch.webhook.status, 'done', record.dispatch.webhook.error);

  const outbox = await fs.readdir(path.join(storage, 'outbox'));
  assert.equal(outbox.length, 2, 'interne Mail + Kundenbestätigung');

  const hit = webhookHits.at(-1);
  assert.equal(hit.headers['x-druckwelt-reference'], body.reference);
  assert.match(hit.headers['x-druckwelt-signature'], /^sha256=[a-f0-9]{64}$/);
  assert.match(hit.headers['content-type'], /multipart\/form-data/);
});

test('lehnt fehlende Pflichtfelder mit Feldfehlern ab', async () => {
  const fd = new FormData();
  fd.append('type', 'frage');
  fd.append('email', 'kein-mail');
  const res = await fetch(`${baseUrl}/api/anfrage`, { method: 'POST', body: fd });
  const body = await res.json();

  assert.equal(res.status, 422);
  assert.deepEqual(Object.keys(body.errors).sort(), ['consent', 'email', 'message', 'name']);
});

test('lehnt nicht erlaubte Dateitypen ab', async () => {
  const fd = validForm();
  fd.append('files', new Blob(['MZ']), 'virus.exe');
  const res = await fetch(`${baseUrl}/api/anfrage`, { method: 'POST', body: fd });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.files);
});

test('lehnt zu große Dateien ab', async () => {
  const fd = validForm();
  fd.append('files', new Blob([Buffer.alloc(1024 * 1024 + 10)]), 'gross.pdf');
  const res = await fetch(`${baseUrl}/api/anfrage`, { method: 'POST', body: fd });
  assert.equal(res.status, 413);
});

test('Honeypot: Bot erhält Erfolg, es wird nichts gespeichert', async () => {
  const before = await fs.readdir(path.join(storage, 'inbox'));
  const fd = validForm();
  fd.append('website', 'http://spam.example');
  const res = await fetch(`${baseUrl}/api/anfrage`, { method: 'POST', body: fd });
  assert.equal(res.status, 201);
  const afterList = await fs.readdir(path.join(storage, 'inbox'));
  assert.equal(afterList.length, before.length);
});

test('safeFileName entschärft Pfade und Sonderzeichen', () => {
  const latin1 = (s) => Buffer.from(s, 'utf8').toString('latin1');
  assert.equal(safeFileName(latin1('../../etc/passwd')).storedName, 'passwd');
  assert.equal(safeFileName(latin1('Präsentation (final) v2.PDF')).storedName, 'Prasentation_final_v2.pdf');
});
