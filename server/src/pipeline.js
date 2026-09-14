import { emailDispatcher } from './dispatchers/email.js';
import { webhookDispatcher } from './dispatchers/webhook.js';
import { internalDispatcher } from './dispatchers/internal.js';
import { readRecord, writeRecord } from './storage.js';

/**
 * Reihenfolge der Kanäle. Neue Ziele (z. B. Slack, Kalender, CRM) als weiteres
 * Objekt mit { name, enabled(), dispatch(record) } ergänzen.
 */
export const dispatchers = [emailDispatcher, webhookDispatcher, internalDispatcher];

/**
 * Verteilt eine bereits abgelegte Anfrage an alle aktiven Kanäle.
 * Ein fehlschlagender Kanal blockiert die anderen nicht; der Status wird
 * in anfrage.json festgehalten.
 *
 * @param {string} reference
 * @param {{ onlyFailed?: boolean, log?: Pick<Console, 'info'|'error'> }} options
 */
export async function runPipeline(reference, { onlyFailed = false, log = console } = {}) {
  const record = await readRecord(reference);

  for (const dispatcher of dispatchers) {
    if (!dispatcher.enabled()) continue;
    const previous = record.dispatch[dispatcher.name];
    if (onlyFailed && previous?.status === 'done') continue;

    const attempts = (previous?.attempts || 0) + 1;
    try {
      const result = await dispatcher.dispatch(record);
      record.dispatch[dispatcher.name] = { status: 'done', attempts, at: new Date().toISOString(), result };
      log.info(`[${reference}] ${dispatcher.name}: ok`);
    } catch (err) {
      record.dispatch[dispatcher.name] = { status: 'failed', attempts, at: new Date().toISOString(), error: err.message };
      log.error(`[${reference}] ${dispatcher.name}: ${err.message}`);
    }
    await writeRecord(record);
  }

  return record;
}
