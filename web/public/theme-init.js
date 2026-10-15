// Apply the saved theme before first paint (no flash of the wrong theme). External file: CSP forbids inline scripts.
try { if (localStorage.getItem('sb-theme') === 'dark') document.documentElement.setAttribute('data-sb-theme', 'dark'); } catch (e) {}
