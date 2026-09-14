import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { rateLimit } from './rateLimit.js';
import { hasAllowedExtension, isBot, validateFields } from './validation.js';
import { createReference, persistRequest, removeTempFiles, tmpDir } from './storage.js';
import { runPipeline } from './pipeline.js';

export function createApp({ log = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN'
    });
    next();
  });

  /* ── CORS (nur wenn Website und API auf verschiedenen Domains laufen) ── */
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        Vary: 'Origin'
      });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  /* ── Upload-Verarbeitung ── */
  const upload = multer({
    dest: tmpDir(),
    limits: {
      files: config.uploads.maxFiles,
      fileSize: config.uploads.maxFileBytes,
      fields: 30,
      fieldSize: 64 * 1024
    },
    fileFilter(req, file, cb) {
      if (!hasAllowedExtension(file.originalname, config.uploads.allowedExtensions)) {
        const err = new Error('UNSUPPORTED_TYPE');
        err.code = 'UNSUPPORTED_TYPE';
        return cb(err);
      }
      cb(null, true);
    }
  }).array('files', config.uploads.maxFiles);

  const mb = (bytes) => Math.round(bytes / 1024 / 1024);

  function handleUpload(req, res, next) {
    upload(req, res, async (err) => {
      if (!err) return next();
      await removeTempFiles(req.files);
      const messages = {
        LIMIT_FILE_SIZE: `Eine Datei ist größer als ${mb(config.uploads.maxFileBytes)} MB.`,
        LIMIT_FILE_COUNT: `Maximal ${config.uploads.maxFiles} Dateien möglich.`,
        LIMIT_UNEXPECTED_FILE: `Maximal ${config.uploads.maxFiles} Dateien möglich.`,
        UNSUPPORTED_TYPE: 'Mindestens eine Datei hat ein nicht unterstütztes Format.'
      };
      const message = messages[err.code];
      if (message) {
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 422).json({ ok: false, message, errors: { files: message } });
      }
      log.error('Upload-Fehler:', err);
      res.status(400).json({ ok: false, message: 'Die Anfrage konnte nicht gelesen werden.' });
    });
  }

  app.post('/api/anfrage', rateLimit(config.rateLimit), handleUpload, async (req, res) => {
    const files = req.files || [];
    const body = req.body || {};

    try {
      // Bots bekommen eine unauffällige Erfolgsantwort, es wird aber nichts gespeichert
      if (isBot(body)) {
        await removeTempFiles(files);
        return res.status(201).json({ ok: true, reference: createReference() });
      }

      const { data, errors } = validateFields(body);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > config.uploads.maxTotalBytes) {
        errors.files = `Alle Dateien zusammen dürfen höchstens ${mb(config.uploads.maxTotalBytes)} MB groß sein.`;
      }

      if (Object.keys(errors).length) {
        await removeTempFiles(files);
        return res.status(422).json({ ok: false, message: 'Bitte prüfen Sie Ihre Angaben.', errors });
      }

      const record = await persistRequest({
        data,
        uploadedFiles: files,
        meta: {
          userAgent: (req.get('User-Agent') || '').slice(0, 300),
          // IP nur gehasht speichern (Missbrauchsnachweis ohne Klartext-IP)
          ipHash: crypto.createHash('sha256').update(String(req.ip)).digest('hex').slice(0, 16)
        }
      });

      res.status(201).json({ ok: true, reference: record.reference });

      // Weiterverarbeitung im Hintergrund – die Anfrage ist bereits sicher abgelegt
      runPipeline(record.reference, { log }).catch((e) => log.error(`[${record.reference}] Pipeline-Fehler:`, e));
    } catch (e) {
      log.error('Anfrage konnte nicht gespeichert werden:', e);
      await removeTempFiles(files);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Ihre Anfrage konnte gerade nicht gespeichert werden.' });
      }
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'Nicht gefunden.' }));

  /* ── Statische Website (optional) ── */
  if (config.serveStatic) {
    app.use((req, res, next) => (/^\/(server|node_modules)(\/|$)/i.test(req.path) ? res.sendStatus(404) : next()));
    app.use(express.static(config.siteRoot, { dotfiles: 'deny', extensions: ['html'], maxAge: '1h' }));
  }

  return app;
}
