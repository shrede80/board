import { useState } from 'react';
import { ideaTime } from '../../../../shared/time';
import { convertIdea, deleteIdea, liveIdeas } from '../../app/ideas';
import { deletePending, retryPending } from '../../app/queue';
import { askConfirm, engine, setState, useApp, type PendingIdea } from '../../app/state';
import { Icon } from '../../ds/ds';
import type { ConvertKind } from '../../../../shared/ideas';
import { IdeaCard, IdeaText, moveMenu } from '../Ideas';
import { Chips, Sheet, SheetRow } from './kit';

/** Phone ideas (UPDATE-1 ج6, mobile.html screen 4). */
type Filter = 'all' | 'project' | 'none' | 'pending';

export function MIdeas() {
  useApp((s) => s.dataVersion);
  const pid = useApp((s) => s.projectId);
  const pending = useApp((s) => s.pending);
  const bootOffline = useApp((s) => s.bootOffline);
  const [f, setF] = useState<Filter>('all');
  const ideas = liveIdeas();
  const nNew = ideas.filter((i) => i.isNew).length;
  const shown = f === 'pending' ? [] : ideas.filter((i) => (f === 'all' ? true : f === 'none' ? !i.projectId : i.projectId === pid));
  const pend = f === 'pending' || f === 'all' ? pending : f === 'none' ? pending.filter((x) => !x.projectId) : pending.filter((x) => x.projectId === pid);
  return (
    <div data-component="MobileIdeas" data-testid="m-ideas" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36 }}>الأفكار</h1>
        {nNew > 0 && <span data-testid="ideas-new-count" style={{ height: 30, padding: '0 14px', borderRadius: 999, background: 'var(--color-accent)', color: '#141210', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{`${nNew} جديدة`}</span>}
      </header>
      <Chips testid="m-ideas-filter" value={f} onChange={setF} items={[
        ['all', 'الكل'], ...(pid ? [['project', 'هذا المشروع'] as [Filter, string]] : []), ['none', 'بدون مشروع'], ['pending', pending.length ? `بانتظار الإرسال ${pending.length}` : 'بانتظار الإرسال'],
      ]} />
      {pend.map((x) => <PendingCard key={x.id} x={x} />)}
      {shown.map((i) => <IdeaCard key={i.id} idea={i} mobile />)}
      {!shown.length && !pend.length && (
        <span style={{ padding: '24px 4px', fontSize: 14, lineHeight: 1.8, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          {f === 'pending' ? 'كل أفكارك وصلت.' : bootOffline ? 'تظهر مع الاتصال.' : 'ما فيه أفكار بعد. اضغط ＋.'}
        </span>
      )}
    </div>
  );
}

/** An idea still on this phone: «بانتظار الاتصال», or failed with retry / delete. */
function PendingCard({ x }: { x: PendingIdea }) {
  return (
    <div data-testid="idea-pending" data-idea-id={x.id} style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-surface)' }}>
      {x.thumbs.length > 0 && <div style={{ display: 'flex', gap: 6 }}>{x.thumbs.slice(0, 4).map((u) => <i key={u} style={{ display: 'block', width: 96, height: 64, borderRadius: 4, background: `center / cover no-repeat url("${u}")` }} />)}</div>}
      {x.text && <IdeaText text={x.text} />}
      {x.failed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--color-danger)' }}>{`ما انرسلت: ${x.failed}`}</span>
          <button data-testid="pending-retry" onClick={() => void retryPending(x.id)} style={{ height: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#141210', fontWeight: 700 }}>إعادة المحاولة</button>
          <button data-testid="pending-delete" onClick={() => askConfirm({ title: 'حذف الفكرة؟', msg: 'ما وصلت بعد، وحذفها نهائي.', ok: 'حذف', danger: true, onOk: () => void deletePending(x.id) })} style={{ height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-danger)', fontWeight: 700 }}>حذف</button>
        </div>
      ) : (
        <span data-testid="pending-status" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <Icon name="clock" size={14} />{`بانتظار الاتصال · ${ideaTime(x.createdAt)}`}
        </span>
      )}
    </div>
  );
}

const ICON: Record<ConvertKind, string> = { shot: 'grid', scene: 'plus', refs: 'image', note: 'file', moodboard: 'sparkles' };
const SUB: Partial<Record<ConvertKind, string>> = { shot: 'اختر المشهد ›', refs: '›' };
const LABEL: Record<ConvertKind, string> = { shot: 'لقطة جديدة', scene: 'مشهد جديد', refs: 'صور مرجعية للقطة موجودة', note: 'ملاحظة على اللوحة', moodboard: 'لوحة مزاج' };

/** «حوّل الفكرة إلى» (same five conversions as the laptop) + edit · move · delete. */
export function IdeaSheet() {
  const id = useApp((s) => s.ideaSheet);
  useApp((s) => s.dataVersion);
  const idea = id ? engine.store.ideas.get(id) : undefined;
  const close = () => setState({ ideaSheet: null });
  if (!id || !idea || idea.deletedAt) return null;
  const run = (f: () => void) => () => (close(), f());
  const b: React.CSSProperties = { flex: 1, height: 50, borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
  return (
    <Sheet onClose={close} testid="idea-sheet" title="حوّل الفكرة إلى">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {(['shot', 'scene', 'refs', 'note', 'moodboard'] as ConvertKind[]).map((k) => (
          <SheetRow key={k} icon={ICON[k]} label={LABEL[k]} sub={SUB[k]} testid={`convert-${k}`} onClick={run(() => void convertIdea(id, k).then((ok) => ok && setState({ screen: 'app' })))} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button data-testid="idea-edit" onClick={run(() => setState({ ideaEdit: id }))} style={b}><Icon name="edit" size={16} />تعديل</button>
        <button data-testid="idea-move" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); close(); void moveMenu(id, r.right, r.top - 8); }} style={b}><Icon name="folder" size={16} />نقل لمشروع</button>
        <button data-testid="idea-delete" onClick={run(() => deleteIdea(id))} style={{ ...b, color: 'var(--color-danger)' }}><Icon name="trash" size={16} />حذف</button>
      </div>
    </Sheet>
  );
}
