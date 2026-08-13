// Мелон — глобальний тост-фідбек при додаванні в кошик.
(function () {
  function ensureRoot() {
    var root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.className = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('role', 'status');
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(name) {
    var root = ensureRoot();
    var el = document.createElement('div');
    el.className = 'toast';
    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';
    var text = document.createElement('span');
    text.className = 'toast-text';
    text.innerHTML = '<b>' + name.replace(/</g, '&lt;') + '</b> додано в кошик';
    el.appendChild(icon);
    el.appendChild(text);
    root.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add('show');
    });

    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, 2600);
  }

  function bumpBadges() {
    document.querySelectorAll('.cart-count').forEach(function (b) {
      b.classList.remove('bump');
      // форсуємо reflow, щоб анімація перезапустилась при повторному кліку
      void b.offsetWidth;
      b.classList.add('bump');
    });
  }

  document.addEventListener('cart:added', function (e) {
    var name = (e.detail && e.detail.item && e.detail.item.name) || 'Товар';
    showToast(name);
    bumpBadges();
  });
})();
