(function () {
  'use strict';

  /* ── Mobile Navigation ── */
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Navigation schließen' : 'Navigation öffnen');
    });

    /* Close nav when a link inside is clicked */
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Navigation öffnen');
      });
    });

    /* Close nav on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Navigation öffnen');
        toggle.focus();
      }
    });
  }

  /* ── Current Year in Footer ── */
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ── Contact Form – Client-side validation ── */
  const form = document.getElementById('contactForm');
  const successMsg = document.getElementById('formSuccess');

  if (form && successMsg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      let isValid = true;

      form.querySelectorAll('[required]').forEach(function (field) {
        const errorEl = field.parentElement.querySelector('.form-field__error');
        const value = field.value.trim();
        let errorText = '';

        if (!value) {
          errorText = 'Dieses Feld ist erforderlich.';
        } else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errorText = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
        }

        if (errorText) {
          field.setAttribute('aria-invalid', 'true');
          if (errorEl) errorEl.textContent = errorText;
          isValid = false;
        } else {
          field.removeAttribute('aria-invalid');
          if (errorEl) errorEl.textContent = '';
        }
      });

      if (!isValid) return;

      /* Build mailto fallback – no backend available in static deployment */
      const name    = form.querySelector('#fieldName').value.trim();
      const email   = form.querySelector('#fieldEmail').value.trim();
      const message = form.querySelector('#fieldMessage').value.trim();

      const mailtoBody = encodeURIComponent(
        'Name: ' + name + '\n' +
        'E-Mail: ' + email + '\n\n' +
        message
      );

      window.location.href =
        'mailto:info@druckwelt-erding.de' +
        '?subject=' + encodeURIComponent('Kontaktanfrage von ' + name) +
        '&body=' + mailtoBody;

      successMsg.hidden = false;
      form.reset();
    });

    /* Clear validation state on input */
    form.querySelectorAll('input, textarea').forEach(function (field) {
      field.addEventListener('input', function () {
        field.removeAttribute('aria-invalid');
        const errorEl = field.parentElement.querySelector('.form-field__error');
        if (errorEl) errorEl.textContent = '';
        if (successMsg && !successMsg.hidden) successMsg.hidden = true;
      });
    });
  }

})();
