import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { absoluteFilePath } from '../storage.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const { transport, smtp } = config.mail;

  if (transport === 'smtp') {
    if (!smtp.host) throw new Error('MAIL_TRANSPORT=smtp, aber SMTP_HOST ist nicht gesetzt.');
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
    });
  } else {
    // Demo/Test: Mails werden als .eml-Datei abgelegt statt verschickt
    transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  return transporter;
}

async function send(message) {
  const info = await getTransporter().sendMail(message);
  if (config.mail.transport !== 'smtp') {
    const outbox = path.join(config.storageDir, 'outbox');
    await fs.mkdir(outbox, { recursive: true });
    const safeTo = String(message.to).replace(/[^a-z0-9@._-]+/gi, '_');
    await fs.writeFile(path.join(outbox, `${Date.now()}-${safeTo}.eml`), info.message);
  }
  return info;
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatBytes = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

const formatDate = (iso) =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(iso));

const formatDeadline = (d) => (d ? d.split('-').reverse().join('.') : '');

function detailRows(record) {
  return [
    ['Vorgang', record.reference],
    ['Eingang', formatDate(record.createdAt)],
    ['Anliegen', record.typeLabel],
    ['Leistung', record.service],
    ['Format', record.format],
    ['Auflage', record.quantity],
    ['Wunschtermin', formatDeadline(record.deadline)],
    ['Name', record.customer.name],
    ['Firma', record.customer.company],
    ['E-Mail', record.customer.email],
    ['Telefon', record.customer.phone]
  ].filter(([, value]) => value);
}

function layout(title, inner) {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#F4F3F0;font-family:Arial,Helvetica,sans-serif;color:#24242A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:#1A3F6F;padding:20px 28px;color:#fff;font-size:18px;font-weight:bold">Druckwelt <span style="color:#F47D20">Erding</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#1A3F6F">${esc(title)}</h1>
${inner}
</td></tr>
<tr><td style="background:#F4F3F0;padding:16px 28px;font-size:12px;color:#62626B">Druckwelt Erding GbR · Dorfener Str. 17 · 85435 Erding · 08122 / 99 95 038</td></tr>
</table></td></tr></table></body></html>`;
}

function internalMail(record) {
  const totalSize = record.files.reduce((sum, f) => sum + f.size, 0);
  const attach = record.files.length > 0 && totalSize <= config.mail.maxAttachmentBytes;

  const rows = detailRows(record)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#62626B;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`)
    .join('');

  const fileItems = record.files.map((f) => `<li>${esc(f.originalName)} <span style="color:#62626B">(${formatBytes(f.size)})</span></li>`).join('');
  const fileNote = record.files.length === 0
    ? '<p style="color:#62626B">Keine Dateien hochgeladen.</p>'
    : `<ul style="padding-left:18px">${fileItems}</ul><p style="font-size:13px;color:#62626B">${attach
        ? 'Die Dateien sind dieser E-Mail angehängt.'
        : `Die Dateien sind zu groß für den Mailanhang (${formatBytes(totalSize)}) und liegen im Ablageordner <b>${esc(record.reference)}</b>.`}</p>`;

  const html = layout(`Neue Website-Anfrage: ${record.typeLabel}`, `
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">${rows}</table>
<h2 style="font-size:15px;color:#1A3F6F;margin:20px 0 8px">Nachricht</h2>
<div style="white-space:pre-wrap;background:#FBFAF7;border-left:3px solid #F47D20;padding:12px 16px;font-size:14px">${esc(record.message)}</div>
<h2 style="font-size:15px;color:#1A3F6F;margin:20px 0 8px">Dateien (${record.files.length})</h2>
${fileNote}
<p style="margin-top:24px"><a href="mailto:${esc(record.customer.email)}?subject=${encodeURIComponent(`Ihre Anfrage ${record.reference}`)}" style="background:#F47D20;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:bold">Kunden antworten</a></p>`);

  const text = [
    `Neue Website-Anfrage: ${record.typeLabel}`,
    '',
    ...detailRows(record).map(([k, v]) => `${k}: ${v}`),
    '',
    'Nachricht:',
    record.message,
    '',
    `Dateien (${record.files.length}):`,
    ...record.files.map((f) => `- ${f.originalName} (${formatBytes(f.size)})`),
    record.files.length && !attach ? `Dateien liegen im Ablageordner ${record.reference}.` : ''
  ].join('\n');

  return {
    from: config.mail.from,
    to: config.mail.to,
    replyTo: `${record.customer.name} <${record.customer.email}>`,
    subject: `[${record.reference}] ${record.typeLabel} – ${record.customer.company || record.customer.name}`,
    html,
    text,
    attachments: attach
      ? record.files.map((f) => ({ filename: f.originalName, path: absoluteFilePath(record, f), contentType: f.mimeType }))
      : []
  };
}

function confirmationMail(record) {
  const firstName = record.customer.name;
  const summary = detailRows(record)
    .filter(([k]) => ['Vorgang', 'Anliegen', 'Leistung', 'Format', 'Auflage', 'Wunschtermin'].includes(k))
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#62626B">${esc(k)}</td><td style="padding:4px 0;font-weight:bold">${esc(v)}</td></tr>`)
    .join('');

  const html = layout('Vielen Dank für Ihre Anfrage', `
<p style="font-size:15px;line-height:1.6">Guten Tag ${esc(firstName)},</p>
<p style="font-size:15px;line-height:1.6">Ihre Anfrage ist bei uns eingegangen. Wir sehen sie uns an und melden uns so schnell wie möglich bei Ihnen, in der Regel am nächsten Werktag.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:20px 0">${summary}</table>
${record.files.length ? `<p style="font-size:14px">Übermittelte Dateien: ${record.files.map((f) => esc(f.originalName)).join(', ')}</p>` : ''}
<p style="font-size:15px;line-height:1.6">Bei Rückfragen erreichen Sie uns unter 08122 / 99 95 038. Bitte geben Sie dabei Ihre Vorgangsnummer <b>${esc(record.reference)}</b> an.</p>
<p style="font-size:15px;line-height:1.6">Viele Grüße<br>Ihr Team der Druckwelt Erding<br>Christine Bielmeier &amp; Kai Metzger</p>`);

  const text = [
    `Guten Tag ${firstName},`,
    '',
    'Ihre Anfrage ist bei uns eingegangen. Wir melden uns so schnell wie möglich bei Ihnen, in der Regel am nächsten Werktag.',
    '',
    `Vorgangsnummer: ${record.reference}`,
    `Anliegen: ${record.typeLabel}`,
    record.files.length ? `Dateien: ${record.files.map((f) => f.originalName).join(', ')}` : '',
    '',
    'Bei Rückfragen: 08122 / 99 95 038',
    '',
    'Viele Grüße',
    'Ihr Team der Druckwelt Erding'
  ].join('\n');

  return {
    from: config.mail.from,
    to: record.customer.email,
    replyTo: config.mail.to[0],
    subject: `Ihre Anfrage bei der Druckwelt Erding (${record.reference})`,
    html,
    text
  };
}

export const emailDispatcher = {
  name: 'email',
  enabled: () => config.mail.enabled,
  async dispatch(record) {
    await send(internalMail(record));
    if (config.mail.confirmation) await send(confirmationMail(record));
    return { recipients: config.mail.to, confirmationSent: config.mail.confirmation };
  }
};
