import { openProject, showHome } from '../../app/actions';
import { liveIdeas } from '../../app/ideas';
import { engine, getState, setState, toast, useApp } from '../../app/state';
import { Icon } from '../../ds/ds';
import { EditorPanel } from '../Editor';
import { IdeaEditDialog } from '../Ideas';
import { Modals } from '../Modals';
import { PresentationMode } from '../Present';
import { ChoiceDialog } from '../Search';
import { AddSheet } from './AddSheet';
import { ChallengeLayer } from '../Challenge';

import { MHome } from './MHome';
import { IdeaSheet, MIdeas } from './MIdeas';
import { MMore } from './MMore';
import { MProject } from './MProject';

/**
 * The phone (UPDATE-1 ج, mobile.html): full editor for projects, scenes, shots, library and
 * ideas — everything except moving board items. Same engine and data as the laptop.
 */
type Tab = 'home' | 'project' | 'ideas' | 'more';

export function goHome() {
  if (getState().projectId) void showHome();
  else setState({ screen: 'home', editor: null });
}

export async function goTab(t: Tab) {
  const s = getState();
  setState({ editor: null, addSheet: null, ideaSheet: null });
  if (t === 'home') return goHome();
  if (t === 'ideas') return setState({ screen: 'ideas' });
  if (t === 'more') return setState({ screen: 'more' });
  if (s.projectId) return setState({ screen: 'app' });
  if (s.bootOffline) return setState({ screen: 'app' });
  const last = s.settings?.lastProjectId;
  const row = last ? engine.store.projects.get(last) : undefined;
  if (row && !row.deletedAt) return openProject(last!);
  toast('اختر مشروعاً من الرئيسية');
  goHome();
}

export function MobileApp() {
  const screen = useApp((s) => s.screen);
  const offline = useApp((s) => s.offline);
  const editor = useApp((s) => s.editor);
  const addSheet = useApp((s) => s.addSheet);
  const ideaSheet = useApp((s) => s.ideaSheet);
  useApp((s) => s.dataVersion);
  const nNew = liveIdeas().filter((i) => i.isNew).length;
  const nPending = useApp((s) => s.pending.length);
  const tab: Tab = screen === 'home' ? 'home' : screen === 'app' ? 'project' : screen === 'ideas' ? 'ideas' : 'more';
  const badge = nNew + nPending;
  const navBtn = (t: Tab, icon: string, label: string, testid: string, count = 0) => (
    <button key={t} data-testid={testid} aria-current={tab === t ? 'page' : undefined} onClick={() => void goTab(t)}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', background: 'transparent', color: tab === t ? 'var(--color-text)' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 700, position: 'relative' }}>
      <span style={{ position: 'relative', display: 'flex' }}>
        <Icon name={icon} size={23} />
        {count > 0 && <span data-testid={`${testid}-count`} style={{ position: 'absolute', top: -7, insetInlineEnd: -12, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--color-accent)', color: '#141210', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
      </span>
      {label}
    </button>
  );
  return (
    <div data-component="MobileApp" dir="rtl" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      {offline && (
        <div data-component="OfflineBanner" data-testid="offline-banner" style={{ margin: '8px 12px 0', padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger)', color: '#fdfcfa', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Icon name="x-circle" size={16} />لا يوجد اتصال، التغييرات لن تُحفظ — الأفكار تنحفظ على الجوال
        </div>
      )}
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'home' && <MHome />}
        {tab === 'project' && <MProject />}
        {tab === 'ideas' && <MIdeas />}
        {tab === 'more' && <MMore />}
      </main>
      <nav data-component="MobileNav" style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', height: 'calc(72px + env(safe-area-inset-bottom))', padding: '0 6px env(safe-area-inset-bottom)', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', position: 'relative', zIndex: 20 }}>
        {navBtn('home', 'home', 'الرئيسية', 'm-tab-home')}
        {navBtn('project', 'grid', 'المشروع', 'm-tab-project')}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button aria-label="إضافة" data-testid="m-add" onClick={() => setState({ addSheet: 'idea', editor: null })}
            style={{ width: 66, height: 66, marginTop: -22, borderRadius: '50%', border: '4px solid var(--color-bg)', background: 'var(--color-accent)', color: '#141210', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(20,18,16,.25)' }}>
            <Icon name="plus" size={30} />
          </button>
        </div>
        {navBtn('ideas', 'sparkles', 'الأفكار', 'm-tab-ideas', badge)}
        {navBtn('more', 'more', 'المزيد', 'm-tab-more')}
      </nav>
      <ChallengeLayer />
      {editor && <EditorPanel mobile />}
      {addSheet && <AddSheet />}
      {ideaSheet && <IdeaSheet />}
      <Modals />
      <ChoiceDialog />
      <IdeaEditDialog />
      <PresentationMode />
    </div>
  );
}
