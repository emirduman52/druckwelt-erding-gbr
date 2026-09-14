import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const str = (key, fallback = '') => (env[key] ?? fallback).toString().trim();
const num = (key, fallback) => {
  const value = Number(env[key]);
  return Number.isFinite(value) && env[key] !== '' ? value : fallback;
};
const bool = (key, fallback) => {
  if (env[key] === undefined || env[key] === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(env[key].toLowerCase());
};
const list = (key, fallback = '') =>
  str(key, fallback).split(',').map((s) => s.trim()).filter(Boolean);

const MB = 1024 * 1024;

export const config = {
  port: num('PORT', 3000),
  trustProxy: num('TRUST_PROXY', 0),
  serveStatic: bool('SERVE_STATIC', true),
  siteRoot: path.resolve(serverRoot, '..'),
  corsOrigins: list('CORS_ORIGINS'),

  storageDir: path.resolve(serverRoot, str('STORAGE_DIR', './storage')),
  retentionDays: num('RETENTION_DAYS', 90),

  uploads: {
    maxFiles: num('MAX_FILES', 10),
    maxFileBytes: num('MAX_FILE_MB', 25) * MB,
    maxTotalBytes: num('MAX_TOTAL_MB', 80) * MB,
    allowedExtensions: [
      '.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg', '.eps', '.ai', '.psd',
      '.indd', '.idml', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt',
      '.dwg', '.dxf', '.zip'
    ]
  },

  rateLimit: {
    max: num('RATE_LIMIT_MAX', 5),
    windowMs: num('RATE_LIMIT_WINDOW_MIN', 10) * 60 * 1000
  },

  mail: {
    enabled: bool('MAIL_ENABLED', true),
    transport: str('MAIL_TRANSPORT', 'file'),
    smtp: {
      host: str('SMTP_HOST'),
      port: num('SMTP_PORT', 587),
      secure: bool('SMTP_SECURE', false),
      user: str('SMTP_USER'),
      pass: str('SMTP_PASS')
    },
    from: str('MAIL_FROM', 'Druckwelt Erding Website <website@druckwelt-erding.de>'),
    to: list('MAIL_TO', 'shop@druckwelt-erding.de'),
    confirmation: bool('MAIL_CONFIRMATION', true),
    maxAttachmentBytes: num('MAIL_MAX_ATTACHMENT_MB', 20) * MB
  },

  webhook: {
    enabled: bool('WEBHOOK_ENABLED', false),
    url: str('WEBHOOK_URL'),
    secret: str('WEBHOOK_SECRET'),
    includeFiles: bool('WEBHOOK_INCLUDE_FILES', true)
  },

  internal: {
    enabled: bool('INTERNAL_ENABLED', false),
    url: str('INTERNAL_API_URL'),
    apiKey: str('INTERNAL_API_KEY')
  }
};
