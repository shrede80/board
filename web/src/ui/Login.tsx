import { useState } from 'react';
import { afterLogin } from '../app/actions';
import { api, ApiError } from '../data/api';
import { Button, Field, Input } from '../ds/ds';

const wrap: React.CSSProperties = {
  position: 'absolute', inset: 0, background: '#0e0d0b url("/img/login-bg.jpg") center/cover no-repeat', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: '#fdfcfa', padding: 16,
};
const form: React.CSSProperties = {
  width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16, padding: '36px 32px',
  background: 'rgba(20,18,16,.72)', border: '1px solid #3a342c', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.5)',
};

function Header() {
  return (
    <>
      <img src="/img/logo-white.png" alt="إبراهيم الشريدي" style={{ width: 150, height: 96, objectFit: 'cover', alignSelf: 'center' }} />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34 }}>لوحة المشاهد</h1>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 15, color: '#b9b9c2' }}>ابنِ مشاهدك ولقطاتك قبل التصوير</span>
      </div>
    </>
  );
}

const lockMsg = (ms: number) => `محاولات كثيرة. حاول بعد ${Math.max(1, Math.ceil(ms / 60000))} دقيقة.`;

export function LoginScreen() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    try {
      await api('/api/auth/login', { method: 'POST', json: { password: pw } });
      setPw('');
      await afterLogin();
    } catch (x) {
      const st = x instanceof ApiError ? x.status : 0;
      setErr(st === 429 ? lockMsg(Number((x as ApiError).body.lockedMs) || 0) : st === 0 ? 'لا يوجد اتصال' : 'كلمة السر غير صحيحة');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-component="LoginScreen" data-sb-theme="dark" style={wrap}>
      <form onSubmit={submit} style={form}>
        <Header />
        <Field label="كلمة السر">
          <Input type="password" autoFocus value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} invalid={!!err} data-testid="login-password" autoComplete="current-password" />
        </Field>
        {err && <span style={{ fontSize: 13, color: '#e8a294', fontWeight: 600 }}>{err}</span>}
        <Button variant="primary" onClick={() => void submit()} loading={busy} style={{ width: '100%' }} type="submit">
          دخول
        </Button>
        <span style={{ fontSize: 12, color: '#b9b9c2', textAlign: 'center' }}>الجهاز يتذكّرك بعدها</span>
      </form>
    </div>
  );
}

/** One-time password setup (SPEC §10, chosen by the user instead of a terminal script). */
export function SetupScreen() {
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [pw, setPw] = useState('');
  const [conf, setConf] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (pw.length < 8) return setErr('كلمة السر 8 أحرف على الأقل');
    if (pw !== conf) return setErr('التأكيد لا يطابق كلمة السر');
    setBusy(true);
    try {
      await api('/api/setup', { method: 'POST', json: { token: token.trim(), password: pw } });
      await afterLogin();
    } catch (x) {
      const st = x instanceof ApiError ? x.status : 0;
      setErr(st === 401 ? 'رمز الإعداد غير صحيح' : st === 409 ? 'كلمة السر موجودة، سجّل الدخول' : st === 429 ? lockMsg(Number((x as ApiError).body.lockedMs) || 0) : 'تعذّر الحفظ، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-component="SetupScreen" data-sb-theme="dark" style={wrap}>
      <form onSubmit={submit} style={form}>
        <Header />
        <span style={{ fontSize: 14, color: '#e3d5b8', lineHeight: 1.7, textAlign: 'center' }}>اختر كلمة سر البرنامج.</span>
        <Field label="رمز الإعداد">
          <Input value={token} onChange={(e) => (setToken(e.target.value), setErr(''))} autoComplete="off" data-testid="setup-token" />
        </Field>
        <Field label="كلمة السر الجديدة" hint="8 أحرف على الأقل">
          <Input type="password" value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} autoComplete="new-password" data-testid="setup-password" />
        </Field>
        <Field label="تأكيد كلمة السر">
          <Input type="password" value={conf} onChange={(e) => (setConf(e.target.value), setErr(''))} autoComplete="new-password" data-testid="setup-confirm" />
        </Field>
        {err && <span style={{ fontSize: 13, color: '#e8a294', fontWeight: 600 }}>{err}</span>}
        <Button variant="primary" onClick={() => void submit()} loading={busy} style={{ width: '100%' }} type="submit">
          حفظ والدخول
        </Button>
      </form>
    </div>
  );
}
