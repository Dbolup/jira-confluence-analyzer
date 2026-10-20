// Shared modal replacing native window.alert()/window.confirm() across every page, so the app
// never shows a browser-chrome dialog. Plain (non-module) script — its top-level function
// declarations attach to the global scope automatically, so any page just adds
// <script src="/js/modal.js"></script> and calls showAlert(...)/showConfirm(...) directly,
// including from onclick="..." attributes, with no import/bootstrap needed (unlike
// public/js/report.js, which is a module for testability reasons this file doesn't have).
//
// showAlert(message) returns a Promise that resolves when dismissed.
// showConfirm(message) returns a Promise<boolean> — true for OK, false for Cancel/dismiss.
(function () {
  let overlay, modalBox, messageEl, actionsEl;

  function ensureModal() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:9999; font-family:Inter,-apple-system,sans-serif;';

    modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:#fff; color:#000; border:1px solid #000; max-width:420px; width:90%; padding:1.75rem; box-shadow:8px 8px 0 #000;';

    messageEl = document.createElement('div');
    messageEl.style.cssText = 'font-size:0.9rem; line-height:1.5; margin-bottom:1.5rem; white-space:pre-wrap;';

    actionsEl = document.createElement('div');
    actionsEl.style.cssText = 'display:flex; justify-content:flex-end; gap:0.75rem;';

    modalBox.appendChild(messageEl);
    modalBox.appendChild(actionsEl);
    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    // Dismiss via the "safe" action (OK for an alert, Cancel for a confirm — always the first
    // button, since that ordering is fixed below) on outside-click or Escape.
    const dismissViaFirstButton = () => { const b = actionsEl.querySelector('button'); if (b) b.click(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismissViaFirstButton(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display === 'flex') dismissViaFirstButton(); });
  }

  function makeButton(label, primary) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:0.6rem 1.2rem; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; border:1px solid #000;'
      + (primary ? 'background:#000; color:#fff;' : 'background:#fff; color:#000;');
    return b;
  }

  function open() { overlay.style.display = 'flex'; }
  function close() { overlay.style.display = 'none'; actionsEl.innerHTML = ''; }

  window.showAlert = function (message) {
    ensureModal();
    messageEl.textContent = message;
    actionsEl.innerHTML = '';
    const ok = makeButton('OK', true);
    return new Promise((resolve) => {
      ok.onclick = () => { close(); resolve(); };
      actionsEl.appendChild(ok);
      open();
      ok.focus();
    });
  };

  window.showConfirm = function (message) {
    ensureModal();
    messageEl.textContent = message;
    actionsEl.innerHTML = '';
    const cancel = makeButton('Cancel', false);
    const ok = makeButton('OK', true);
    return new Promise((resolve) => {
      cancel.onclick = () => { close(); resolve(false); };
      ok.onclick = () => { close(); resolve(true); };
      actionsEl.appendChild(cancel); // first, so Escape/outside-click cancels rather than confirms
      actionsEl.appendChild(ok);
      open();
      ok.focus();
    });
  };
})();
