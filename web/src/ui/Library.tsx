import { createFromTemplate, openEditor, toggleFilter } from '../app/actions';
import { dragEnd, dragStart } from '../app/dnd';
import { setState, useApp, useProject } from '../app/state';
import { coverOf, type PLib, type PProject } from '../data/project';
import { Button, EmptyState, Icon, Tabs } from '../ds/ds';
import { frameBg, pad2, type Img } from '../lib/util';

type Tab = 'characters' | 'locations' | 'moodboards' | 'inbox';

export function avatar(c: PLib) {
  const im = coverOf(c);
  return { init: ((c.name as string) || '؟').replace('م. ', '').slice(0, 1), bg: im ? frameBg(im, '#d2a06a') : 'var(--color-accent)' };
}

const rail: [Tab, string, string][] = [
  ['characters', 'user', 'الشخصيات'], ['locations', 'map-pin', 'المواقع'], ['moodboards', 'image', 'لوحات المزاج'], ['inbox', 'phone', 'الوارد'],
];

export function LibraryPanel() {
  const p = useProject();
  const open = useApp((s) => s.libOpen);
  const tab = useApp((s) => s.libTab);
  const filter = useApp((s) => s.filter);
  const offline = useApp((s) => s.offline);
  if (!p) return null;
  return (
    <aside data-component="LibraryPanel" style={{ width: open ? 300 : 52, flexShrink: 0, borderInlineEnd: '1px solid var(--color-border-subtle)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', minHeight: 0, transition: 'width 200ms var(--ease-standard)', overflow: 'hidden' }}>
      {open ? <Open p={p} tab={tab} filterId={filter?.id ?? null} offline={offline} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0' }}>
          <button title="فتح المكتبة" className="h-strong" onClick={() => setState({ libOpen: true })} style={railBtn('var(--color-text)')}><Icon name="arrow-left" size={17} /></button>
          {rail.map(([t, icon, label]) => (
            <button key={t} title={label} className="h-strong" onClick={() => setState({ libOpen: true, libTab: t })} style={railBtn('var(--color-text-muted)')}><Icon name={icon} size={17} /></button>
          ))}
        </div>
      )}
    </aside>
  );
}

const railBtn = (color: string): React.CSSProperties => ({ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color });

function Open({ p, tab, filterId, offline }: { p: PProject; tab: Tab; filterId: string | null; offline: boolean }) {
  const L = p.library;
  const newCount = L.inbox.filter((i) => i.isNew !== false).length;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'characters', label: 'الشخصيات' }, { value: 'locations', label: 'المواقع' }, { value: 'moodboards', label: 'لوحات المزاج' },
    { value: 'inbox', label: newCount ? `الوارد ${newCount}` : 'الوارد' },
  ];
  const n = (test: (s: PProject['scenes'][number]) => boolean) => p.scenes.filter(test).length;
  type Item = { id: string; avatar?: { init: string; bg: string }; img?: string; title: string; sub: string; meta: string; on: boolean; onClick: () => void; type: 'character' | 'location' | 'moodboard' };
  let items: Item[] = [];
  if (tab === 'characters') items = L.characters.map((c) => ({ id: c.id, type: 'character', avatar: avatar(c), title: c.name as string, sub: [c.role, c.description].filter(Boolean).join(' — '), meta: `${n((s) => s.characterIds.includes(c.id))} مشاهد`, on: filterId === c.id, onClick: () => (toggleFilter('character', c.id), openEditor('character', c.id)) }));
  if (tab === 'locations') items = L.locations.map((l) => ({ id: l.id, type: 'location', img: frameBg(coverOf(l), '#d2a06a'), title: l.name as string, sub: (l.address as string) || (l.mapUrl as string) || '', meta: `${n((s) => s.locationId === l.id)} مشاهد`, on: filterId === l.id, onClick: () => (toggleFilter('location', l.id), openEditor('location', l.id)) }));
  if (tab === 'moodboards') items = L.moodboards.map((m) => { const k = n((s) => s.moodboardIds.includes(m.id)); const sw = (m.swatches as string[]) ?? []; return { id: m.id, type: 'moodboard', img: frameBg(coverOf(m), sw[0] || '#d2a06a'), title: m.title as string, sub: `${m.images.length} صور · ${sw.length} ألوان`, meta: k ? `مرتبطة بـ ${k}` : '', on: false, onClick: () => openEditor('moodboard', m.id) }; });
  const empty = { characters: ['user', 'لا شخصيات بعد', 'أضف شخصية أو اسحب قالب «شخصية» إلى اللوحة.'], locations: ['map-pin', 'لا مواقع بعد', 'أضف موقعاً ليظهر في قائمة مواقع المشاهد.'], moodboards: ['image', 'لا لوحات مزاج', 'اجمع صوراً وألواناً تحدد إحساس المشهد.'], inbox: ['phone', 'الوارد فارغ', 'الصور والملاحظات التي تلتقطها من الجوال تصل هنا.'] }[tab];
  const isEmpty = tab === 'inbox' ? !L.inbox.length : !items.length;
  const add = { characters: '+ شخصية', locations: '+ موقع', moodboards: '+ لوحة مزاج', inbox: '' }[tab];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>المكتبة</h2>
        <button title="طي المكتبة" className="h-strong" onClick={() => setState({ libOpen: false })} style={{ ...railBtn('var(--color-text-muted)'), width: 32, height: 32 }}><Icon name="arrow-right" size={17} /></button>
      </div>
      <div className="lib-tabs" style={{ padding: '0 12px 10px' }}>
        <Tabs items={tabs} value={tab} onChange={(v) => setState({ libTab: v })} style={{ gap: 2 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tab !== 'inbox' && items.map((it) => (
          <div key={it.id} draggable onDragStart={(e) => dragStart(e, { kind: 'lib', type: it.type, id: it.id })} onDragEnd={dragEnd} onClick={it.onClick} className="h-strong" data-testid={`lib-${it.type}`}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 8, cursor: 'pointer', background: it.on ? 'var(--color-accent-soft)' : 'transparent', border: `1px solid ${it.on ? 'var(--color-accent)' : 'transparent'}` }}>
            {it.avatar && <span style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: it.avatar.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 19, color: '#141210' }}>{it.avatar.init}</span>}
            {it.img && <span style={{ width: 58, height: 42, borderRadius: 4, flexShrink: 0, background: it.img }} />}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{it.title}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.sub}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{it.meta}</span>
          </div>
        ))}
        {tab === 'inbox' && L.inbox.length > 0 && (
          <>
            <p style={{ margin: '0 4px 6px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>اسحب صورة إلى لقطة لتصبح مرجعاً، أو إلى اللوحة لتصبح بطاقة.</p>
            {L.inbox.map((it) => {
              const d = new Date(it.createdAt);
              const sc = p.scenes.findIndex((s) => s.id === it.sceneId);
              return (
                <div key={it.id} data-testid="inbox-item" draggable onDragStart={(e) => dragStart(e, { kind: 'inbox', id: it.id })} onDragEnd={dragEnd} style={{ border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', borderRadius: 8, overflow: 'hidden', cursor: 'grab' }}>
                  {it.kind === 'image' && <div style={{ height: 120, background: frameBg(it.image as Img, '#d2a06a') }} />}
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {it.text && <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 15, lineHeight: 1.5 }}>{it.text}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                      <Icon name="phone" size={13} />
                      {`${pad2(d.getHours())}:${pad2(d.getMinutes())}${sc > -1 ? ' · للمشهد ' + pad2(sc + 1) : ''}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {isEmpty && <EmptyState icon={empty[0]} title={empty[1]} description={empty[2]} style={{ padding: '48px 12px' }} />}
      </div>
      {tab !== 'inbox' && (
        <div style={{ padding: '10px 12px 14px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex' }}>
          <Button variant="outline" size="sm" disabled={offline} style={{ width: '100%' }} onClick={() => createFromTemplate(({ characters: 'character', locations: 'location', moodboards: 'moodboard' } as const)[tab], { where: 'library' })}>{add}</Button>
        </div>
      )}
    </>
  );
}
