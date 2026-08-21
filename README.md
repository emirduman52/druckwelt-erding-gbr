# Druckwelt Erding GbR – OnePage Website

Statische Firmenwebsite für die Druckwelt Erding GbR, Dorfener Str. 17, 85435 Erding.

## Was es ist

Eine einzige HTML-Seite mit allen relevanten Inhalten: Hero, Leistungsübersicht, Über-uns-Bereich, Online-Auftragsupload-Hinweis, Kontaktformular und Footer. Keine Build-Abhängigkeiten, kein Framework, kein Backend.

## Stack-Entscheidung

**Statisches HTML + CSS + Vanilla JS.** Die Seite ist eine klassische Broschüren-OnePage ohne Client-State, dynamische Daten oder mehrstufige Interaktionen. Ein Framework wäre unnötiger Overhead.

## Lokal starten

Einen beliebigen statischen Dateiserver verwenden, z. B.:

```bash
# mit Python
python3 -m http.server 8080

# mit Node (npx)
npx serve .
```

Dann im Browser `http://localhost:8080` öffnen.

## Deployment

Die Seite kann auf jedem statischen Hosting deployed werden:

- **Netlify / Vercel:** Repository verbinden, kein Build-Command nötig, Publish-Directory: `.` (Root)
- **GitHub Pages:** Repository unter Settings → Pages auf `main / root` setzen
- **Eigener Webserver / cPanel:** Alle Dateien per FTP/SFTP hochladen

## Dateistruktur

```
.
├── index.html
├── README.md
├── .gitignore
├── robots.txt
└── src/
    ├── styles/
    │   ├── tokens.css   ← Design-Tokens (Custom Properties)
    │   └── main.css     ← Alle Stile, mobile-first
    └── scripts/
        └── main.js      ← Navigation, Formularvalidierung, Footer-Jahr
```

## Design-Entscheidungen

### Farbpalette
Die Farben kommen direkt aus dem Brand-Input:

| Rolle          | Wert      | Verwendung                          |
|----------------|-----------|-------------------------------------|
| Navy (primär)  | `#1A3F6F` | Header, Hero-BG, Headings, Footer   |
| Orange (Akzent)| `#F47D20` | CTAs, Nummern, Unterstriche, Strip  |
| Charcoal       | `#4A4A4A` | Labels, sekundärer Text             |
| Smoke          | `#F5F5F5` | About-BG, Form-Inputs               |

### Typografie
- **Fließtext / UI:** Inter (400, 500, 600, 700) – klar, neutral, gut lesbar in kleinen Graden
- **Display / Headings:** Source Serif 4 (300, Italic) – gibt den großen Überschriften Charakter und Ruhe, ohne dekorativ zu wirken
- Fluid Typografie über `clamp()` in `tokens.css`, keine Breakpoint-Sprünge

### Layout-Richtung
Bewusst asymmetrisch: Services als nummerierte Listenraster (nicht Karten), Hero mit einem CSS-komponierten visuellen Element statt Stockfoto-Placeholder, About-Section mit einem grid-Layout das Text und dekorativem Block gegenüberstellt. Kein Lila-Gradient, keine Glassmorphism-Karten, keine identischen drei-Karten-Zeilen.

### Kontaktformular
Da kein Backend vorhanden ist, öffnet das Formular bei valider Eingabe einen `mailto:`-Link mit vorausgefüllten Feldern. Eine echte Server-seitige Lösung (Formspree, eigener Endpoint) kann durch Ersetzen der Submit-Logik in `main.js` nachgerüstet werden.
