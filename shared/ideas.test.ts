import { describe, expect, it } from 'vitest';
import { applyLocal } from './local';
import { inverseOps } from './history';
import { convertIdeaOps, linkify, shortUrl, titleAndRest, type ConvertKind } from './ideas';
import { emptyStore, type Store } from './model';
import type { Row } from './schema';
import { countdown, ideaTime, lastEdit } from './time';

const row = (id: string, f: Record<string, unknown>): Row => ({ id, updatedAt: 1, deletedAt: null, ...f });

describe('idea text', () => {
  it('finds links', () => {
    const s = linkify('مرجع إضاءة https://instagram.com/reel/abc?x=1، وwww.vimeo.com/123.');
    expect(s.filter((x) => x.href).map((x) => x.href)).toEqual(['https://instagram.com/reel/abc?x=1', 'https://www.vimeo.com/123']);
    expect(s.map((x) => x.text).join('')).toBe('مرجع إضاءة https://instagram.com/reel/abc?x=1، وwww.vimeo.com/123.');
    expect(shortUrl('https://www.instagram.com/reel/abc')).toBe('instagram.com/reel/…');
  });
  it('first line is the title (≤ 60), the rest the summary', () => {
    expect(titleAndRest('الوصول للبوابة\nالسيارة تقف ببطء')).toEqual({ title: 'الوصول للبوابة', rest: 'السيارة تقف ببطء' });
    expect(titleAndRest('أ'.repeat(80)).title.length).toBe(60);
  });
});

describe('time wording (UPDATE-1 ب1, ب2)', () => {
  const now = new Date(2026, 9, 15, 13, 30); // Thu 15 Oct 2026 13:30
  it('idea times', () => {
    expect(ideaTime(new Date(2026, 9, 15, 13, 5).getTime(), now)).toBe('اليوم 1:05م');
    expect(ideaTime(new Date(2026, 9, 14, 21, 41).getTime(), now)).toBe('أمس 9:41م');
    expect(ideaTime(new Date(2026, 9, 11, 9, 0).getTime(), now)).toBe('الأحد 11 أكتوبر');
  });
  it('last edit', () => {
    expect(lastEdit(now.getTime() - 2 * 3600e3, now)).toBe('قبل ساعتين');
    expect(lastEdit(new Date(2026, 9, 9, 10).getTime(), now)).toBe('9 أكتوبر');
  });
  it('countdown with and without a time', () => {
    expect(countdown('2026-10-18', null, now)).toMatchObject({ big: { n: 3, word: 'أيام' }, phrase: 'بعد 3 أيام' });
    expect(countdown('2026-10-16', null, now).phrase).toBe('بكرة');
    expect(countdown('2026-10-15', null, now).phrase).toBe('اليوم');
    const c = countdown('2026-10-18', '07:52', now);
    expect(c.big).toEqual({ n: 2, word: 'يومان' });
    expect(c.units).toEqual([{ n: 18, word: 'ساعة' }, { n: 22, word: 'دقيقة' }]);
    expect(countdown('2026-10-15', '15:00', now).big).toEqual({ n: 1, word: 'ساعة' });
  });
});

describe('the five conversions, each undone in one step (UPDATE-1 ب2)', () => {
  const base = (): Store => {
    const s = emptyStore();
    s.projects.set('pr-1', row('pr-1', { name: 'p' }));
    s.scenes.set('sc-1', row('sc-1', { projectId: 'pr-1', position: 1, name: 'م' }));
    s.shots.set('sh-1', row('sh-1', { projectId: 'pr-1', sceneId: 'sc-1', position: 1, coverImageId: null }));
    s.ideas.set('idea-1', row('idea-1', { text: 'لقطة الغروب\nمن فوق السطح', imageIds: ['img-1', 'img-2'], projectId: 'pr-1', sceneId: null, isNew: true }));
    return s;
  };
  const ctx = (n = { v: 0 }) => ({
    projectId: 'pr-1', newId: (p: string) => `${p}-n${++n.v}`,
    shot: { sceneId: 'sc-1', position: 2, fields: { size: 'MS' } },
    scene: { position: 2, boardX: 0, boardY: 0, boardZ: 1 },
    refs: { shotId: 'sh-1', sceneId: 'sc-1', nextImagePosition: 1, hasCover: false },
    note: { x: 500, y: 100, z: 3 },
    moodboard: { position: 9 },
  });
  const created = (ops: { op: string; entity?: string }[], e: string) => ops.filter((o) => o.op === 'create' && o.entity === e) as unknown as { id: string; fields: Record<string, unknown> }[];

  for (const kind of ['shot', 'scene', 'refs', 'note', 'moodboard'] as ConvertKind[]) {
    it(kind, () => {
      const store = base();
      const idea = store.ideas.get('idea-1')!;
      const { ops } = convertIdeaOps(idea, kind, ctx());
      expect(ops.at(-1)).toEqual({ op: 'discard', entity: 'ideas', id: 'idea-1' });
      if (kind === 'shot') {
        expect(created(ops, 'shots')[0].fields).toMatchObject({ sceneId: 'sc-1', description: 'لقطة الغروب\nمن فوق السطح', coverImageId: 'img-1', size: 'MS' });
        expect(created(ops, 'itemImages').map((o) => o.fields.imageId)).toEqual(['img-1', 'img-2']);
      }
      if (kind === 'scene') {
        expect(created(ops, 'scenes')[0].fields).toMatchObject({ name: 'لقطة الغروب', summary: 'من فوق السطح', coverImageId: 'img-1' });
        expect(created(ops, 'moodboards')).toHaveLength(1); // 2 photos → a linked moodboard
        expect(created(ops, 'sceneLinks')).toHaveLength(1);
      }
      if (kind === 'refs') {
        expect(created(ops, 'itemImages').every((o) => o.fields.ownerId === 'sh-1')).toBe(true);
        expect(ops).toContainEqual({ op: 'update', entity: 'shots', id: 'sh-1', fields: { coverImageId: 'img-1' } });
        expect(created(ops, 'notes')[0].fields.text).toBe('لقطة الغروب\nمن فوق السطح');
      }
      if (kind === 'note') {
        expect(created(ops, 'boardCards').map((o) => o.fields.kind)).toEqual(['note', 'image', 'image']);
      }
      if (kind === 'moodboard') expect(created(ops, 'moodboards')[0].fields).toMatchObject({ title: 'لقطة الغروب', position: 9 });

      // forward, then the inverse: back to how it was (idea visible, nothing new left)
      const inverse = inverseOps(store, ops);
      const after = applyLocal(store, ops, new Map()).store;
      expect(after.ideas.get('idea-1')!.deletedAt).toBeTruthy();
      const undone = applyLocal(after, inverse, new Map()).store;
      expect(undone.ideas.get('idea-1')!.deletedAt).toBeNull();
      for (const e of ['shots', 'scenes', 'notes', 'moodboards', 'itemImages', 'boardCards', 'sceneLinks'] as const) {
        expect([...undone[e].values()].filter((r) => !r.deletedAt).length, e).toBe([...base()[e].values()].length);
      }
      expect(undone.shots.get('sh-1')!.coverImageId).toBeNull();
    });
  }
});
