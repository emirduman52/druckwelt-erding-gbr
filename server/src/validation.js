import path from 'node:path';

export const REQUEST_TYPES = {
  druckauftrag: 'Druckauftrag',
  angebot: 'Angebotsanfrage',
  frage: 'Allgemeine Frage'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Steuerzeichen außer Tab und Zeilenumbrüchen
const CONTROL_CHARS_RE = /[^\P{Cc}\t\n\r]/gu;
const COMBINING_MARKS_RE = /\p{M}/gu;

const clean = (value, max) =>
  (typeof value === 'string' ? value : '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, max);

/**
 * Prüft die Formularfelder. Gibt { data, errors } zurück;
 * errors ist leer, wenn alles in Ordnung ist.
 */
export function validateFields(body) {
  const errors = {};

  const type = REQUEST_TYPES[body.type] ? body.type : 'frage';
  const data = {
    type,
    typeLabel: REQUEST_TYPES[type],
    service: clean(body.service, 120),
    format: clean(body.format, 120),
    quantity: clean(body.quantity, 60),
    deadline: clean(body.deadline, 10),
    customer: {
      name: clean(body.name, 120),
      company: clean(body.company, 160),
      email: clean(body.email, 200).toLowerCase(),
      phone: clean(body.phone, 40)
    },
    message: clean(body.message, 5000)
  };

  if (!data.customer.name) errors.name = 'Bitte geben Sie Ihren Namen an.';
  if (!data.customer.email) errors.email = 'Bitte geben Sie Ihre E-Mail-Adresse an.';
  else if (!EMAIL_RE.test(data.customer.email)) errors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
  if (!data.message) errors.message = 'Bitte beschreiben Sie Ihr Anliegen.';
  if (body.consent !== 'yes') errors.consent = 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.';
  if (data.deadline && !DATE_RE.test(data.deadline)) data.deadline = '';

  return { data, errors };
}

/** Honeypot-Feld "website" ist für Menschen unsichtbar – ist es befüllt, war es ein Bot. */
export const isBot = (body) => typeof body.website === 'string' && body.website.trim() !== '';

/** multer liefert Dateinamen als latin1 – in UTF-8 zurückwandeln, damit Umlaute stimmen. */
const decodeName = (originalName) => Buffer.from(originalName, 'latin1').toString('utf8');

/** Macht Dateinamen dateisystem- und mailtauglich, behält aber die Lesbarkeit. */
export function safeFileName(originalName) {
  const utf8 = decodeName(originalName);
  const ext = path.extname(utf8).toLowerCase();
  const base = path.basename(utf8, path.extname(utf8))
    .replace(/ß/g, 'ss')
    .normalize('NFKD').replace(COMBINING_MARKS_RE, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80) || 'datei';
  return { displayName: utf8.slice(0, 200), storedName: base + ext };
}

export function hasAllowedExtension(originalName, allowed) {
  return allowed.includes(path.extname(decodeName(originalName)).toLowerCase());
}
