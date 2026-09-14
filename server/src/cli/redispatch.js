/**
 * Stößt fehlgeschlagene Kanäle erneut an.
 *
 *   npm run redispatch                 → alle Anfragen mit fehlgeschlagenen/fehlenden Kanälen
 *   npm run redispatch -- DWE-260914-7K3F   → nur diese Anfrage
 */
import { listReferences } from '../storage.js';
import { runPipeline } from '../pipeline.js';

const references = process.argv.slice(2);
const targets = references.length ? references : await listReferences();

for (const reference of targets) {
  try {
    await runPipeline(reference, { onlyFailed: true });
  } catch (err) {
    console.error(`[${reference}] konnte nicht verarbeitet werden: ${err.message}`);
    process.exitCode = 1;
  }
}
