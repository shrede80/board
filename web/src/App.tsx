import { useEffect, useState } from 'react';

type Health = { ok: boolean; db: boolean; r2: boolean } | null;

/** Phase 1 shell: proves the stack (fonts, tokens, theme, API) end to end. */
export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false, db: false, r2: false }));
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-sb-theme', theme);
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <main style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 'var(--space-5)' }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 'var(--space-4)', justifyItems: 'center' }}>
        <img src={dark ? '/img/logo-white.png' : '/img/logo-black.png'} alt="إبراهيم الشريدي" width={140} height={140} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h1)', margin: 0 }}>لوحة المشاهد</h1>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }} data-testid="health">
          {health === null ? 'يتحقق من الخادم…' : health.ok && health.db && health.r2 ? 'الخادم وقاعدة البيانات وتخزين الصور تعمل' : 'تعذّر الاتصال بالخادم'}
        </p>
        <button
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          style={{ padding: 'var(--button-pad-sm)', borderRadius: 'var(--radius-pill)', border: 'var(--border-hairline)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          {dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
        </button>
      </div>
    </main>
  );
}
