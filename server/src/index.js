import { config } from './config.js';
import { createApp } from './app.js';
import { ensureStorage, purgeExpired } from './storage.js';
import { dispatchers } from './pipeline.js';

await ensureStorage();

const app = createApp();

app.listen(config.port, () => {
  const active = dispatchers.filter((d) => d.enabled()).map((d) => d.name);
  console.info(`Druckwelt Anfrage-API läuft auf http://localhost:${config.port}`);
  console.info(`Aktive Kanäle: ${active.join(', ') || 'keine (Anfragen werden nur abgelegt)'}`);
  if (config.mail.enabled && config.mail.transport !== 'smtp') {
    console.info(`E-Mails werden NICHT verschickt, sondern in ${config.storageDir}/outbox abgelegt (MAIL_TRANSPORT=${config.mail.transport}).`);
  }
});

// Aufbewahrungsfrist: beim Start und danach täglich
const purge = () => purgeExpired()
  .then((n) => n && console.info(`${n} abgelaufene Anfrage(n) gelöscht.`))
  .catch((e) => console.error('Aufräumen fehlgeschlagen:', e));
purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();
