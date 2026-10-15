// Shared helpers for the update mockups: icons from the app's design system, gradient frames like the app.
(function () {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get('theme')) document.documentElement.setAttribute('data-sb-theme', q.get('theme'));
  if (q.get('clean')) document.documentElement.classList.add('clean');
  document.querySelectorAll('[data-i]').forEach((el) => {
    const p = window.ICONS[el.dataset.i];
    el.classList.add('ic');
    el.innerHTML = p ? `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>` : '';
  });
  // data-f="hex,x,y,v" → the app's placeholder frame gradient (frameBg in web/src/lib/util.ts)
  document.querySelectorAll('[data-f]').forEach((el) => {
    const [hex, x, y, v] = el.dataset.f.split(',');
    const X = +x, Y = +y, V = +(v || 0);
    el.style.background = `radial-gradient(85% 75% at ${X}% ${Y}%, ${hex}d9 0%, ${hex}40 40%, transparent 72%), radial-gradient(45% 35% at ${100 - X}% ${85 - Y * 0.4}%, rgba(253,252,250,.10), transparent 70%), linear-gradient(${150 + V}deg, #2b2722 0%, #0e0d0b 100%)`;
  });
  const dark = document.documentElement.getAttribute('data-sb-theme') === 'dark';
  document.querySelectorAll('img[data-logo]').forEach((el) => (el.src = dark ? 'img/logo-white.png' : 'img/logo-black.png'));
})();
