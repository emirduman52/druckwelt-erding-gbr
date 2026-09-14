# Druckwelt Erding GbR – Website

OnePage-Website für die Druckwelt Erding GbR, Dorfener Str. 17, 85435 Erding (im Kinocenter Erding),
mit Anfrageformular inklusive Datei-Upload und einem kleinen Backend, das Anfragen ablegt und weiterverteilt.

## Aufbau

```
.
├── index.html            ← OnePage: Hero, Leistungen, Ablauf, Über uns, Anfrage & Upload, Kontakt/Öffnungszeiten
├── impressum.html        ← Entwurf, vom Kunden bestätigen lassen
├── datenschutz.html      ← Entwurf, Hosting-/Mail-Anbieter ergänzen, rechtlich prüfen lassen
├── favicon.svg, robots.txt, sitemap.xml
├── src/
│   ├── fonts/            ← lokal gehostete Schriften (kein Google-Fonts-Aufruf, DSGVO)
│   ├── styles/           ← fonts.css, tokens.css (Design-Tokens), main.css
│   └── scripts/main.js   ← Navigation, Öffnungsstatus, Formular mit Drag-and-drop-Upload
└── server/               ← Anfrage-API (Node.js/Express)
```

Die Website selbst ist statisch (HTML/CSS/Vanilla JS, kein Build). Nur das Formular braucht das Backend.

## Lokal starten

```bash
cd server
npm install
cp .env.example .env      # Standard: Mails werden als .eml in server/storage/outbox abgelegt
npm run dev
```

→ http://localhost:3000 (Website + API in einem Prozess)

Tests: `cd server && npm test`

## Wie eine Anfrage verarbeitet wird

```
Browser (index.html)
  │  POST /api/anfrage  (multipart: Felder + Dateien, mit Upload-Fortschritt)
  ▼
server/src/app.js
  1. Rate-Limit, Honeypot, Validierung, Dateityp- und Größenprüfung
  2. Ablage: storage/inbox/<Vorgangsnummer>/anfrage.json + files/
  3. Antwort an den Kunden: Vorgangsnummer (z. B. DWE-260914-7K3F)
  4. Im Hintergrund: Pipeline (server/src/pipeline.js)
       ├─ email     → interne Benachrichtigung an shop@ (mit Anhängen) + Eingangsbestätigung an den Kunden
       ├─ webhook   → Workflow, z. B. n8n (JSON + Dateien, HMAC-signiert)
       └─ internal  → Übergabe an das interne Auftragsprogramm (vorbereitet, noch nicht angebunden)
```

- Jeder Kanal wird per `.env` ein- und ausgeschaltet (`MAIL_ENABLED`, `WEBHOOK_ENABLED`, `INTERNAL_ENABLED`).
- Der Status pro Kanal steht in `anfrage.json` unter `dispatch`. Fehlgeschlagene Kanäle lassen sich mit
  `npm run redispatch` (optional mit Vorgangsnummer) erneut anstoßen.
- Anfragen werden nach `RETENTION_DAYS` (Standard 90) automatisch gelöscht.
- Ist das Backend nicht erreichbar, bietet das Formular eine vorausgefüllte E-Mail als Ausweichweg an.

### Aktueller Stand: E-Mail

Für den Livebetrieb in `.env` setzen: `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`.

### Später: Workflow / internes Programm

**Variante A: über n8n (empfohlen, flexibel):** `WEBHOOK_ENABLED=true`, `WEBHOOK_URL=<n8n-Webhook-URL>`, `WEBHOOK_SECRET=<geheim>`.
Der Webhook erhält:

| Teil | Inhalt |
|---|---|
| Feld `payload` | JSON der Anfrage (`event`, `reference`, `type`, `service`, `format`, `quantity`, `deadline`, `customer{…}`, `message`, `files[…]`) |
| `file_0`, `file_1`, … | die hochgeladenen Dateien (binär), wenn `WEBHOOK_INCLUDE_FILES=true` |
| Header `X-Druckwelt-Reference` | Vorgangsnummer, für Idempotenz |
| Header `X-Druckwelt-Signature` | `sha256=` + HMAC-SHA256 des `payload`-Strings mit `WEBHOOK_SECRET` |

Ohne Dateien wird reines JSON gesendet (`Content-Type: application/json`).
Im Workflow: Signatur prüfen → Kunde/Auftrag im internen Programm anlegen → Dateien übergeben.

**Variante B: direkt aus dem Backend:** `server/src/dispatchers/internal.js` enthält bereits das Mapping
(`mapToInternalOrder`) und einen HTTP-Aufruf als Platzhalter, der an die echte Schnittstelle angepasst wird.

## Deployment

Die Website braucht einen Node-Prozess (≥ 20.11) mit beschreibbarem Speicher für Uploads, z. B.:

- **VPS / eigener Server:** `cd server && npm ci --omit=dev && npm start` hinter nginx/Caddy (`TRUST_PROXY=1`), per systemd oder pm2
- **Render, Railway, Fly.io:** Root-Verzeichnis `server`, Start `npm start`, persistentes Volume für `STORAGE_DIR`
- **Getrennt:** Website statisch (Netlify o. ä.), API separat. Dann `action` im Formular auf die volle API-URL setzen und `CORS_ORIGINS` pflegen.

Bei nginx `client_max_body_size` mindestens auf `MAX_TOTAL_MB` setzen (z. B. `100m`).

## Vor dem Livegang

- [ ] Impressum und Datenschutzerklärung vom Kunden bestätigen bzw. rechtlich prüfen lassen, Entwurfshinweise entfernen
- [ ] Hosting- und E-Mail-Anbieter in der Datenschutzerklärung eintragen
- [ ] SMTP-Zugang einrichten, Empfängeradresse (`MAIL_TO`) bestätigen
- [ ] Echtes Logo als SVG einsetzen (aktuell CSS-Bildmarke)
- [ ] Optional: echte Fotos von Laden und Team statt der grafischen Platzhalter
