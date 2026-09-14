import { config } from '../config.js';

/**
 * Anbindung an das interne Auftrags-/Warenwirtschaftsprogramm der Druckwelt Erding.
 *
 * NOCH NICHT ANGEBUNDEN. Sobald bekannt ist, wie das Programm Aufträge annimmt
 * (REST-API, Import-Ordner, E-Mail-Import, Datenbank …), wird hier die Übergabe
 * umgesetzt. Alternativ übernimmt der n8n-Workflow (Kanal "webhook") diesen Schritt,
 * dann bleibt dieser Kanal deaktiviert.
 *
 * Vertrag: dispatch(record) wirft bei Fehlern und liefert sonst ein kleines
 * Ergebnisobjekt (z. B. die Auftragsnummer im Zielsystem) zurück. Das Ergebnis wird
 * in anfrage.json unter dispatch.internal gespeichert; fehlgeschlagene Übergaben
 * lassen sich mit `npm run redispatch` erneut anstoßen.
 */
export function mapToInternalOrder(record) {
  return {
    externalReference: record.reference,
    receivedAt: record.createdAt,
    kind: record.type,
    customer: {
      name: record.customer.name,
      company: record.customer.company || null,
      email: record.customer.email,
      phone: record.customer.phone || null
    },
    job: {
      service: record.service || null,
      format: record.format || null,
      quantity: record.quantity || null,
      dueDate: record.deadline || null,
      notes: record.message
    },
    attachments: record.files.map((f) => ({ name: f.originalName, size: f.size, mimeType: f.mimeType, path: f.path }))
  };
}

export const internalDispatcher = {
  name: 'internal',
  enabled: () => config.internal.enabled,
  async dispatch(record) {
    const { url, apiKey } = config.internal;
    if (!url) throw new Error('INTERNAL_ENABLED=true, aber INTERNAL_API_URL ist nicht gesetzt.');

    // TODO: an die tatsächliche Schnittstelle des Programms anpassen.
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(mapToInternalOrder(record)),
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) throw new Error(`Internes System antwortete mit HTTP ${res.status}`);
    return { status: res.status };
  }
};
