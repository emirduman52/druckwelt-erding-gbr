(function () {
  'use strict';

  /* ── Mobile Navigation ── */
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');

  if (toggle && nav) {
    const closeNav = function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Navigation öffnen');
    };

    toggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Navigation schließen' : 'Navigation öffnen');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav();
        toggle.focus();
      }
    });
  }

  /* ── Current Year in Footer ── */
  const yearEl = document.getElementById('currentYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ── Opening hours: "jetzt geöffnet" + highlight today ──
     Zeiten in Minuten ab Mitternacht, Zeitzone Europe/Berlin. */
  const OPENING_HOURS = {
    1: [[540, 780], [810, 1020]],
    2: [[540, 780], [810, 1020]],
    3: [[540, 780], [810, 1020]],
    4: [[540, 780], [810, 1020]],
    5: [[540, 780], [810, 960]]
  };
  const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  function berlinNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day: day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  }

  function formatTime(min) {
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }

  function openingStatus(now) {
    const today = OPENING_HOURS[now.day] || [];
    for (let i = 0; i < today.length; i++) {
      const slot = today[i];
      if (now.minutes >= slot[0] && now.minutes < slot[1]) {
        return { open: true, text: 'Jetzt geöffnet bis ' + formatTime(slot[1]) + ' Uhr' };
      }
      if (now.minutes < slot[0]) {
        return { open: false, text: 'Geschlossen, wir öffnen heute um ' + formatTime(slot[0]) + ' Uhr' };
      }
    }
    for (let offset = 1; offset <= 7; offset++) {
      const d = (now.day + offset) % 7;
      if (OPENING_HOURS[d]) {
        const label = offset === 1 ? 'morgen' : 'am ' + DAY_NAMES[d];
        return { open: false, text: 'Geschlossen, wir öffnen ' + label + ' um ' + formatTime(OPENING_HOURS[d][0][0]) + ' Uhr' };
      }
    }
    return null;
  }

  try {
    const now = berlinNow();
    const status = openingStatus(now);
    const statusEl = document.getElementById('openStatus');
    const statusText = document.getElementById('openStatusText');
    if (status && statusEl && statusText) {
      statusText.textContent = status.text;
      statusEl.classList.toggle('is-open', status.open);
      statusEl.hidden = false;
    }
    document.querySelectorAll('.hours__table tr[data-days]').forEach(function (row) {
      if (row.dataset.days.split(',').map(Number).indexOf(now.day) !== -1) row.classList.add('is-today');
    });
  } catch (err) {
    /* Intl nicht verfügbar: Hinweis einfach ausblenden */
  }

  /* ============================================================
     ANFRAGEFORMULAR mit Datei-Upload
     ------------------------------------------------------------
     Sendet multipart/form-data an form.action (Standard: /api/anfrage,
     siehe server/). Ist kein Backend erreichbar, wird eine vorausgefüllte
     E-Mail als Ausweichweg angeboten.
     ============================================================ */
  const form = document.getElementById('requestForm');
  if (!form) return;

  const MAX_FILES = Number(form.dataset.maxFiles) || 10;
  const MAX_FILE_BYTES = (Number(form.dataset.maxFileMb) || 25) * 1024 * 1024;
  const MAX_TOTAL_BYTES = (Number(form.dataset.maxTotalMb) || 80) * 1024 * 1024;
  const FALLBACK_EMAIL = form.dataset.fallbackEmail || 'shop@druckwelt-erding.de';
  const ALLOWED_EXT = (form.querySelector('#fieldFiles').getAttribute('accept') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

  const fileInput = document.getElementById('fieldFiles');
  const dropzone = document.getElementById('dropzone');
  const fileListEl = document.getElementById('fileList');
  const filesError = document.getElementById('filesError');
  const orderDetails = document.getElementById('orderDetails');
  const submitBtn = document.getElementById('submitBtn');
  const statusBox = document.getElementById('formStatus');
  const progress = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressLabel = document.getElementById('uploadProgressLabel');

  let selectedFiles = [];

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
  }

  /* ── Anliegen: Details für "Allgemeine Frage" ausblenden ── */
  const detailsGrid = orderDetails.querySelector('.form-grid');
  const detailsLegend = orderDetails.querySelector('legend');
  const detailsLegendHTML = detailsLegend.innerHTML;

  function syncType() {
    const type = form.querySelector('input[name="type"]:checked').value;
    const isQuestion = type === 'frage';
    detailsGrid.hidden = isQuestion;
    detailsLegend.innerHTML = isQuestion
      ? '<span>2</span> Dateien (optional)'
      : detailsLegendHTML;
  }
  form.querySelectorAll('input[name="type"]').forEach(function (r) {
    r.addEventListener('change', syncType);
  });
  syncType();

  /* ── Dateiauswahl & Drag and Drop ── */
  function renderFiles() {
    fileListEl.innerHTML = '';
    selectedFiles.forEach(function (file, index) {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'file-list__name';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'file-list__size';
      size.textContent = formatBytes(file.size);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'file-list__remove';
      remove.setAttribute('aria-label', file.name + ' entfernen');
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        selectedFiles.splice(index, 1);
        renderFiles();
      });

      li.append(name, size, remove);
      fileListEl.appendChild(li);
    });
  }

  function addFiles(fileList) {
    const problems = [];
    Array.prototype.forEach.call(fileList, function (file) {
      const total = selectedFiles.reduce(function (sum, f) { return sum + f.size; }, 0);
      const duplicate = selectedFiles.some(function (f) { return f.name === file.name && f.size === file.size; });

      if (duplicate) return;
      if (selectedFiles.length >= MAX_FILES) {
        problems.push('Maximal ' + MAX_FILES + ' Dateien möglich.');
      } else if (ALLOWED_EXT.length && ALLOWED_EXT.indexOf(extOf(file.name)) === -1) {
        problems.push('„' + file.name + '“ hat ein nicht unterstütztes Format.');
      } else if (file.size > MAX_FILE_BYTES) {
        problems.push('„' + file.name + '“ ist größer als ' + formatBytes(MAX_FILE_BYTES) + '.');
      } else if (total + file.size > MAX_TOTAL_BYTES) {
        problems.push('Alle Dateien zusammen dürfen höchstens ' + formatBytes(MAX_TOTAL_BYTES) + ' groß sein.');
      } else {
        selectedFiles.push(file);
      }
    });

    filesError.textContent = problems.filter(function (p, i, a) { return a.indexOf(p) === i; }).join(' ');
    renderFiles();
  }

  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ── Validierung ── */
  function setFieldError(field, message) {
    const wrapper = field.closest('.form-field');
    const errorEl = wrapper && wrapper.querySelector('.form-field__error');
    if (message) {
      field.setAttribute('aria-invalid', 'true');
    } else {
      field.removeAttribute('aria-invalid');
    }
    if (errorEl) errorEl.textContent = message || '';
  }

  function validate() {
    let firstInvalid = null;

    form.querySelectorAll('[required]').forEach(function (field) {
      let message = '';
      if (field.type === 'checkbox') {
        if (!field.checked) message = 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.';
      } else {
        const value = field.value.trim();
        if (!value) {
          message = 'Dieses Feld ist erforderlich.';
        } else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          message = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
        }
      }
      setFieldError(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  form.querySelectorAll('input, textarea, select').forEach(function (field) {
    const evt = field.type === 'checkbox' ? 'change' : 'input';
    field.addEventListener(evt, function () { setFieldError(field, ''); });
  });

  /* ── Status-Anzeige ── */
  function showStatus(kind, title, html) {
    statusBox.className = 'form-status form-status--' + kind;
    statusBox.innerHTML = '<strong></strong><span></span>';
    statusBox.querySelector('strong').textContent = title;
    statusBox.querySelector('span').innerHTML = html;
    statusBox.hidden = false;
    statusBox.focus({ preventScroll: true });
    statusBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildMailto() {
    const data = new FormData(form);
    const typeLabel = { druckauftrag: 'Druckauftrag', angebot: 'Angebotsanfrage', frage: 'Anfrage' }[data.get('type')] || 'Anfrage';
    const lines = [
      'Anliegen: ' + typeLabel,
      data.get('service') ? 'Leistung: ' + data.get('service') : '',
      data.get('format') ? 'Format: ' + data.get('format') : '',
      data.get('quantity') ? 'Auflage: ' + data.get('quantity') : '',
      data.get('deadline') ? 'Wunschtermin: ' + data.get('deadline') : '',
      '',
      'Name: ' + data.get('name'),
      data.get('company') ? 'Firma: ' + data.get('company') : '',
      'E-Mail: ' + data.get('email'),
      data.get('phone') ? 'Telefon: ' + data.get('phone') : '',
      '',
      data.get('message'),
      '',
      selectedFiles.length ? '(Bitte die Dateien an diese E-Mail anhängen: ' + selectedFiles.map(function (f) { return f.name; }).join(', ') + ')' : ''
    ].filter(function (l, i, arr) { return l !== '' || (arr[i - 1] !== '' && i > 0); });

    return 'mailto:' + FALLBACK_EMAIL +
      '?subject=' + encodeURIComponent(typeLabel + ' von ' + data.get('name')) +
      '&body=' + encodeURIComponent(lines.join('\n'));
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Wird gesendet …' : 'Anfrage senden';
    progress.hidden = !busy || selectedFiles.length === 0;
    if (!busy) progressBar.style.width = '0';
  }

  function resetForm() {
    form.reset();
    selectedFiles = [];
    renderFiles();
    syncType();
  }

  /* ── Absenden ── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusBox.hidden = true;
    if (!validate()) return;

    const data = new FormData(form);
    data.delete('files');
    selectedFiles.forEach(function (file) { data.append('files', file, file.name); });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.getAttribute('action'));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.addEventListener('progress', function (evt) {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      progressBar.style.width = pct + '%';
      progressLabel.textContent = pct < 100 ? 'Dateien werden übertragen … ' + pct + ' %' : 'Wird verarbeitet …';
    });

    function fail(message) {
      setBusy(false);
      showStatus('error', 'Das hat leider nicht geklappt.',
        escapeHTML(message) + ' Sie können uns Ihre Anfrage auch <a href="' + escapeHTML(buildMailto()) + '">per E-Mail senden</a>' +
        ' oder unter <a href="tel:+4981229995038">08122 / 99 95 038</a> anrufen.');
    }

    xhr.addEventListener('load', function () {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch (err) { /* keine JSON-Antwort */ }

      if (xhr.status >= 200 && xhr.status < 300 && body && body.ok) {
        setBusy(false);
        resetForm();
        showStatus('success', 'Vielen Dank, Ihre Anfrage ist bei uns angekommen.',
          'Ihre Vorgangsnummer lautet <b>' + escapeHTML(body.reference) + '</b>. ' +
          'Eine Bestätigung ist an Ihre E-Mail-Adresse unterwegs. Wir melden uns so schnell wie möglich.');
        return;
      }

      if (body && body.errors) {
        setBusy(false);
        Object.keys(body.errors).forEach(function (name) {
          const field = form.querySelector('[name="' + name + '"]');
          if (field && name !== 'files') setFieldError(field, body.errors[name]);
          if (name === 'files') filesError.textContent = body.errors[name];
        });
        showStatus('error', 'Bitte prüfen Sie Ihre Angaben.', escapeHTML(body.message || 'Einige Felder sind nicht korrekt ausgefüllt.'));
        return;
      }

      fail((body && body.message) || 'Der Server ist gerade nicht erreichbar.');
    });

    xhr.addEventListener('error', function () { fail('Die Verbindung ist fehlgeschlagen.'); });
    xhr.addEventListener('timeout', function () { fail('Die Übertragung hat zu lange gedauert.'); });

    setBusy(true);
    xhr.send(data);
  });
})();
