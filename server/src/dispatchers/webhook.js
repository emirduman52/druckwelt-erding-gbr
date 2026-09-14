import crypto from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { config } from '../config.js';
import { absoluteFilePath } from '../storage.js';

/**
 * Übergibt die Anfrage an einen Workflow (z. B. n8n "Webhook"-Node).
 *
 * Payload:
 *   - Feld "payload": JSON der Anfrage (ohne interne Dispatch-Stati)
 *   - Felder "file_0", "file_1", …: die Dateien (nur bei WEBHOOK_INCLUDE_FILES=true)
 *   ohne Dateien wird reines JSON gesendet.
 *
 * Header:
 *   X-Druckwelt-Reference:  Vorgangsnummer (für Idempotenz im Workflow)
 *   X-Druckwelt-Signature:  sha256=<HMAC des payload-JSON mit WEBHOOK_SECRET>
 */
export function buildPayload(record) {
  const { dispatch, meta, ...rest } = record;
  return {
    event: 'anfrage.created',
    source: 'druckwelt-erding.de',
    ...rest
  };
}

export function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export const webhookDispatcher = {
  name: 'webhook',
  enabled: () => config.webhook.enabled,
  async dispatch(record) {
    const { url, secret, includeFiles } = config.webhook;
    if (!url) throw new Error('WEBHOOK_ENABLED=true, aber WEBHOOK_URL ist nicht gesetzt.');

    const json = JSON.stringify(buildPayload(record));
    const headers = { 'X-Druckwelt-Reference': record.reference };
    if (secret) headers['X-Druckwelt-Signature'] = sign(json, secret);

    let body;
    if (includeFiles && record.files.length) {
      body = new FormData();
      body.append('payload', json);
      for (const [i, file] of record.files.entries()) {
        const blob = await openAsBlob(absoluteFilePath(record, file), { type: file.mimeType });
        body.append(`file_${i}`, blob, file.originalName);
      }
    } else {
      body = json;
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Webhook antwortete mit HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return { status: res.status };
  }
};
