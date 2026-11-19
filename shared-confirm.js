// In-page replacement for window.confirm().
//
// Browsers (Dia, Chrome, Safari…) offer "don't let this page show more
// dialogs". Once a visitor ticks that, every confirm() silently returns
// false, so delete buttons stop working with no message. This draws the
// confirmation in the page instead, so it can't be blocked.
//
//   if (!(await ccConfirm('Delete "Walk"?', { confirmLabel: 'Delete', danger: true }))) return;
//
// Resolves true for confirm, false for cancel / Escape / backdrop click.
(function () {
  if (window.ccConfirm) return;

  var CSS = ''
    + '.cc-confirm{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;}'
    + '.cc-confirm-backdrop{position:absolute;inset:0;background:rgba(7,31,53,.45);backdrop-filter:blur(2px);animation:ccConfirmFade .15s ease-out;}'
    + '.cc-confirm-box{position:relative;width:100%;max-width:400px;box-sizing:border-box;background:#fff;border-radius:20px;padding:24px 22px 18px;box-shadow:0 24px 60px rgba(7,31,53,.25);font-family:"Muli","Mulish",system-ui,sans-serif;color:#071f35;animation:ccConfirmPop .18s cubic-bezier(.2,.8,.2,1);}'
    + '.cc-confirm-msg{margin:0 0 20px;font-size:16px;font-weight:700;line-height:1.45;white-space:pre-line;overflow-wrap:anywhere;}'
    + '.cc-confirm-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}'
    + '.cc-confirm-btn{all:unset;box-sizing:border-box;cursor:pointer;height:40px;padding:0 18px;border-radius:980px;display:inline-flex;align-items:center;justify-content:center;font-family:"Raleway",system-ui,sans-serif;font-size:14px;font-weight:800;}'
    + '.cc-confirm-cancel{color:rgba(7,31,53,.65);background:rgba(7,31,53,.06);}'
    + '.cc-confirm-cancel:hover{background:rgba(7,31,53,.1);}'
    + '.cc-confirm-ok{color:#fff;background:#071f35;}'
    + '.cc-confirm-ok.is-danger{background:#c01a38;}'
    + '.cc-confirm-ok:hover{filter:brightness(1.1);}'
    + '.cc-confirm-btn:focus-visible{outline:2px solid #0071e3;outline-offset:2px;}'
    + '@keyframes ccConfirmFade{from{opacity:0}to{opacity:1}}'
    + '@keyframes ccConfirmPop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}';

  function ensureStyles() {
    if (document.getElementById('ccConfirmStyles')) return;
    var st = document.createElement('style');
    st.id = 'ccConfirmStyles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  window.ccConfirm = function (message, opts) {
    opts = opts || {};
    ensureStyles();
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var wrap = document.createElement('div');
      wrap.className = 'cc-confirm';
      wrap.setAttribute('role', 'alertdialog');
      wrap.setAttribute('aria-modal', 'true');

      var backdrop = document.createElement('div');
      backdrop.className = 'cc-confirm-backdrop';
      var box = document.createElement('div');
      box.className = 'cc-confirm-box';
      var msg = document.createElement('p');
      msg.className = 'cc-confirm-msg';
      msg.id = 'ccConfirmMsg' + Date.now();
      msg.textContent = message;
      wrap.setAttribute('aria-labelledby', msg.id);

      var actions = document.createElement('div');
      actions.className = 'cc-confirm-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'cc-confirm-btn cc-confirm-cancel';
      cancel.textContent = opts.cancelLabel || 'Cancel';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'cc-confirm-btn cc-confirm-ok' + (opts.danger ? ' is-danger' : '');
      ok.textContent = opts.confirmLabel || 'OK';

      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(msg);
      box.appendChild(actions);
      wrap.appendChild(backdrop);
      wrap.appendChild(box);

      function done(result) {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) {
          try { prevFocus.focus(); } catch (e) {}
        }
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Tab') {
          // keep focus inside the two buttons
          e.preventDefault();
          (document.activeElement === ok ? cancel : ok).focus();
        }
      }

      ok.addEventListener('click', function () { done(true); });
      cancel.addEventListener('click', function () { done(false); });
      backdrop.addEventListener('click', function () { done(false); });
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(wrap);
      ok.focus();
    });
  };
})();
