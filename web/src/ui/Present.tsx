import { closePresent, presGo, presToggle, toggleTech } from '../app/present';
import { useApp, useEquipment, useProject } from '../app/state';
import { allShots, camLine, coverOf, eqName, moodHex, moveLine } from '../data/project';
import { Icon } from '../ds/ds';
import { AR } from '../lib/constants';
import { frameBg, mmss, pad2 } from '../lib/util';

export function PresentationMode() {
  const p = useProject();
  const eq = useEquipment();
  const pr = useApp((s) => s.present);
  if (!pr.open || !p) return null;
  const list = allShots(p);
  const roundBtn: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 52, height: 52, borderRadius: '50%', border: '1px solid #3a342c', background: 'rgba(20,18,16,.6)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  if (!list.length) {
    return (
      <div data-component="PresentationMode" data-sb-theme="dark" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0e0d0b', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 22 }}>لا توجد لقطات للعرض بعد</span>
        <button onClick={closePresent} style={{ border: '1px solid #3a342c', background: 'transparent', color: '#fdfcfa', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>Esc</button>
      </div>
    );
  }
  const i = Math.min(pr.i, list.length - 1);
  const x = list[i];
  const ar = AR[p.aspect] || 16 / 9;
  const hex = moodHex(x.sc.mood);
  const cov = coverOf(x.sh);
  const total = list.reduce((a, y) => a + (Number(y.sh.durationS) || 0), 0);
  const techRows: [string, string, string][] = [
    ['camera', 'الكاميرا', camLine(eq, x.sh)], ['repeat', 'الحركة', moveLine(eq, x.sh)], ['aperture', 'الحجم والزاوية', `${x.sh.size ?? ''} · ${x.sh.angle ?? ''}`],
    ['sun', 'الإضاءة', (x.sh.lightingMood as string) || (x.sh.lightingIds ?? []).map((id) => eqName(eq, id)).join('، ') || '—'],
    ['mic', 'الصوت', (x.sh.audioIds ?? []).map((id) => eqName(eq, id)).join('، ') || '—'],
  ];
  const arCss = p.aspect === '2.39:1' ? '2.39 / 1' : p.aspect.replace(':', ' / ');
  return (
    <div data-component="PresentationMode" data-sb-theme="dark" data-testid="present" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0e0d0b', color: '#fdfcfa', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '22px 32px 0', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 56, lineHeight: 1 }}>{x.num}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 13, color: '#b9b9c2', fontWeight: 600 }}>{`المشهد ${pad2(x.si + 1)}`}</span><span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 22 }}>{x.sc.name}</span></div>
        </div>
        <button title="خروج (Esc)" onClick={closePresent} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #3a342c', background: 'transparent', color: '#fdfcfa', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><Icon name="x" size={15} />Esc</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 96px', position: 'relative' }}>
        <button title="السابق" onClick={() => presGo(i - 1)} style={{ ...roundBtn, insetInlineStart: 28 }}><Icon name="arrow-right" size={22} /></button>
        <div style={{ width: `min(100%, calc((100vh - 270px) * ${ar}))`, aspectRatio: arCss, background: frameBg(cov, hex, true), borderRadius: 8, boxShadow: '0 30px 80px rgba(0,0,0,.6)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!cov && <span style={{ color: '#6b6255', fontSize: 15 }}>بدون صورة مرجعية</span>}
          {pr.tech && (
            <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16, width: 300, background: 'rgba(14,13,11,.86)', border: '1px solid #3a342c', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {techRows.map(([icon, k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#26221d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#e3d5b8' }}><Icon name={icon} size={13} /></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontSize: 11, color: '#b9b9c2' }}>{k}</span><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{v || '—'}</span></div>
                </div>
              ))}
              {!!x.sh.dialogue && <div style={{ borderTop: '1px solid #3a342c', paddingTop: 10, fontFamily: 'var(--font-serif-text)', fontSize: 14, lineHeight: 1.7 }}>{x.sh.dialogue as string}</div>}
            </div>
          )}
        </div>
        <button title="التالي" onClick={() => presGo(i + 1)} style={{ ...roundBtn, insetInlineEnd: 28 }}><Icon name="arrow-left" size={22} /></button>
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-serif-text)', fontSize: 22, padding: '0 120px 14px', lineHeight: 1.5 }}>{x.sh.description || 'بدون وصف'}</div>
      <div style={{ padding: '0 32px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Progress split into the scenes' mood colours, like the rhythm bar (SPEC §7.5). */}
        <div data-testid="present-progress" style={{ display: 'flex', gap: 3, height: 6 }}>
          {list.map((y, j) => {
            const fillW = j < i ? '100%' : j === i ? (pr.playing ? (pr.fill ? '100%' : '0%') : '100%') : '0%';
            const c = moodHex(y.sc.mood);
            return (
              <button key={y.sh.id} onClick={() => presGo(j)} style={{ flexGrow: Math.max(1, Number(y.sh.durationS) || 1), flexBasis: 0, height: 6, border: 'none', padding: 0, borderRadius: 3, background: `color-mix(in srgb, ${c} 28%, #26221d)`, cursor: 'pointer', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: fillW, background: c, transition: j === i && pr.playing && pr.fill ? `width ${(Number(y.sh.durationS) || 3) * 1000}ms linear` : 'none' }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{`لقطة ${i + 1} من ${list.length} · ${mmss(x.sh.durationS)}`}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={presToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: '#d2a06a', color: '#141210', borderRadius: 4, padding: '9px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}><Icon name={pr.playing ? 'pause' : 'play'} size={15} />{pr.playing ? 'إيقاف' : 'تشغيل تلقائي'}</button>
            <button onClick={toggleTech} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #3a342c', background: 'transparent', color: '#fdfcfa', borderRadius: 4, padding: '9px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}><Icon name="camera" size={15} />{pr.tech ? 'إخفاء التفاصيل' : 'التفاصيل التقنية'}</button>
          </div>
          <span style={{ fontSize: 13, color: '#b9b9c2' }}>{`المدة الكلية ${mmss(total)}`}</span>
        </div>
      </div>
    </div>
  );
}
