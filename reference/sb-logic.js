/* لوحة المشاهد — logic bundle (standalone export) */
(function(){
// لوحة المشاهد — data + actions. Mixed into the root DC instance (this = Component).
const C = {
  SIZES: [['EWS','عامة جداً'],['WS','عامة'],['FS','كاملة'],['MS','متوسطة'],['MCU','متوسطة قريبة'],['CU','قريبة'],['ECU','قريبة جداً'],['Insert','تفاصيل'],['OTS','فوق الكتف'],['POV','وجهة نظر']],
  ANGLES: ['مستوى العين','منخفضة','عالية','علوية عمودية (Top-down)','مائلة (Dutch)','جوية'],
  MOVES: ['ثابتة','بان','تلت','تتبّع','دخول','خروج','أوربت','رفع / نزول','ريفيل','تحليق علوي','يدوي','زوم'],
  ORDER: ['planned','shot','approved'],
  STATUS: {
    planned: { label: 'مخططة', tone: 'outline', dot: 'transparent', ring: 'var(--color-text-muted)' },
    shot: { label: 'تصوّرت', tone: 'dark', dot: 'var(--color-inverse-bg)', ring: 'var(--color-inverse-bg)' },
    approved: { label: 'معتمدة', tone: 'accent', dot: 'var(--color-accent)', ring: 'var(--color-accent)' }
  },
  GENERAL: {
    camera: ['كاميرا سينمائية (إيجار)','كاميرا أكشن','كاميرا 360'],
    support: ['دوللي','سلايدر','كرين','ستيدي كام'],
    lighting: ['ضوء طبيعي','ضوء عملي في المكان','إضاءة الشارع'],
    audio: ['صوت الموقع','ميكروفون لافالير','موسيقى فقط'],
    filter: ['بدون فلتر','Black Pro-Mist','بولارايزر']
  },
  TEMPLATES: [
    { id: 'ad', label: 'إعلان', scenes: ['افتتاحية','المشكلة','المنتج','الحل','الدعوة للإجراء'] },
    { id: 'clip', label: 'فيديو كليب', scenes: ['مقدمة','مقطع 1','اللازمة','مقطع 2','اللازمة','الختام'] },
    { id: 'short', label: 'فيلم قصير', scenes: ['البداية','الحدث المحرّك','التصاعد','الذروة','النهاية'] },
    { id: 'doc', label: 'وثائقي', scenes: ['افتتاحية','تعريف','مقابلات','لقطات داعمة','ختام'] },
    { id: 'blank', label: 'فارغ', scenes: [] }
  ],
  ASPECTS: ['16:9','9:16','1:1','2.39:1'],
  AR: { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '2.39:1': 2.39 },
  MOODS: ['gold','amber','sand','clay','night','olive','wine','cool'],
  EQ_ICON: { camera:'camera', bridgecam:'camera', drone:'drone', controller:'drone', phone:'phone', lens:'aperture', lenscap:'aperture', filter:'aperture', ring:'aperture', receiver:'mic', shotgun:'mic', mic:'mic', headphones:'volume', earbuds:'volume', ledpanel:'sun', lightstick:'sun', wand:'sparkles', lightstand:'sun', cob:'sun', bowens:'sun', softbox:'sun', lantern:'sun', reflector:'sun', mirror:'sun', cable:'link', hdmi:'link', hub:'link', adapter:'link', hdd:'folder', ssd:'folder', box:'folder', bag:'folder', vest:'folder', tape:'paperclip', powerbank:'repeat', charger:'repeat', laptop:'file', mouse:'settings', keypad:'settings', fan:'settings', gimbal:'repeat', tripod:'camera', cage:'camera', handle:'paperclip', grip:'paperclip', clamp:'paperclip', rod:'link', arm:'link', selfiestick:'link', phonemount:'phone', ballhead:'link', shoe:'link', suction:'link' },
  CARD: { scene: [280, 330], note: [210, 130], character: [210, 200], location: [230, 220], moodboard: [250, 250] },
  TPL: [
    { type: 'scene', label: 'مشهد', icon: 'film' },
    { type: 'note', label: 'ملاحظة', icon: 'file' },
    { type: 'character', label: 'شخصية', icon: 'user' },
    { type: 'location', label: 'موقع', icon: 'map-pin' },
    { type: 'moodboard', label: 'لوحة مزاج', icon: 'image' }
  ]
};

const util = {
  pad2: n => String(n).padStart(2, '0'),
  mmss: s => { s = Math.max(0, Math.round(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
  uid: p => p + '-' + Math.random().toString(36).slice(2, 8),
  clone: o => JSON.parse(JSON.stringify(o)),
  textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fdfcfa';
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#141210' : '#fdfcfa';
  },
  frameBg(img, hex) {
    if (!img) return '#1c1916';
    if (img.src) return `center / cover no-repeat url("${img.src}")`;
    const f = img.frame || { x: 50, y: 50, v: 0 };
    return `radial-gradient(85% 75% at ${f.x}% ${f.y}%, ${hex}d9 0%, ${hex}40 40%, transparent 72%), radial-gradient(45% 35% at ${100 - f.x}% ${85 - f.y * 0.4}%, rgba(253,252,250,.10), transparent 70%), linear-gradient(${150 + (f.v || 0)}deg, #2b2722 0%, #0e0d0b 100%)`;
  },
  daysLeft(iso) { const d = (Date.now() - new Date(iso).getTime()) / 864e5; return Math.max(0, 30 - Math.floor(d)); },
  fmtDate(iso) { const d = new Date(iso); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; },
  download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  readFiles(files) {
    return Promise.all([...files].filter(f => /^image\//.test(f.type)).map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(f); })));
  }
};

const U = util;

const core = {
  // ---------- lookups ----------
  proj() { const d = this.state.data; if (!d) return null; return d.projects.find(p => p.id === this.state.projectId) || d.projects[0]; },
  eqIndex() {
    const eq = this.state.eq; if (!eq) return {};
    if (this._eqSrc !== eq) { this._eqSrc = eq; this._eqIdx = {}; eq.items.forEach(i => { this._eqIdx[i.id] = i; }); (eq.virtualSupports || []).forEach(i => { this._eqIdx[i.id] = { ...i, role: 'support', virtual: true }; }); }
    return this._eqIdx;
  },
  eqName(id) { if (!id) return ''; const e = this.eqIndex()[id]; return e ? (e.short || e.model || e.name) : id; },
  moodHex(m) { const d = this.state.data; return (d && d.moods[m] && d.moods[m].hex) || (/^#/.test(m || '') ? m : '#7c8288'); },
  moodName(m) { const d = this.state.data; return (d && d.moods[m] && d.moods[m].name) || 'مخصص'; },
  findShot(p, id) { for (let si = 0; si < p.scenes.length; si++) { const sc = p.scenes[si]; const hi = sc.shots.findIndex(s => s.id === id); if (hi > -1) return { sc, sh: sc.shots[hi], si, hi }; } return null; },
  ent(p, type, id) {
    if (type === 'scene') return p.scenes.find(s => s.id === id);
    if (type === 'shot') { const f = this.findShot(p, id); return f && f.sh; }
    if (type === 'character') return p.library.characters.find(x => x.id === id);
    if (type === 'location') return p.library.locations.find(x => x.id === id);
    if (type === 'moodboard') return p.library.moodboards.find(x => x.id === id);
    if (type === 'note') return p.notes.find(x => x.id === id);
    return null;
  },
  coverOf(e) { if (!e || !e.images || !e.images.length) return null; return e.images.find(i => i.id === e.coverImageId) || e.images[0]; },
  sceneCover(sc) {
    if (sc.coverImageId) { for (const sh of sc.shots) { const i = sh.images.find(x => x.id === sc.coverImageId); if (i) return i; } }
    const first = sc.shots.find(s => s.images.length); return first ? this.coverOf(first) : null;
  },
  sceneDur(sc) { return sc.shots.reduce((a, s) => a + (Number(s.duration) || 0), 0); },
  allShots(p) { p = p || this.proj(); const out = []; p.scenes.forEach((sc, si) => sc.shots.forEach((sh, hi) => out.push({ sc, sh, si, hi, num: `${si + 1}.${hi + 1}` }))); return out; },
  camLine(sh) {
    const I = this.eqIndex(), cam = I[sh.cameraId], name = this.eqName(sh.cameraId);
    if (!name) return '';
    if (cam && cam.lensIds) return `${name} · ${this.eqName(sh.lens) || ''}${sh.focal ? ' عند ' + sh.focal + 'mm' : ''}`;
    if (cam && cam.builtinLenses) return `${name} · ${(sh.lens || '').split(' ')[0]}`;
    if (cam && cam.zoomOnly) return `${name} · ${sh.focal || ''}mm`;
    return name;
  },
  moveLine(sh) { if (sh.supportId === 'sup-drone') return sh.movement || ''; return [sh.movement, this.eqName(sh.supportId)].filter(Boolean).join(' · '); },
  matches(sc) { const f = this.state.filter; if (!f) return true; if (f.kind === 'character') return sc.characterIds.includes(f.id); if (f.kind === 'location') return sc.locationId === f.id; return true; },

  // ---------- persistence / history ----------
  mutate(fn, o = {}) {
    if (this.state.offline) { this.toast('لا يوجد اتصال، التغييرات لن تُحفظ', { tone: 'danger' }); return false; }
    const data = U.clone(this.state.data);
    const p = data.projects.find(x => x.id === this.state.projectId) || data.projects[0];
    if (o.history !== false) {
      const now = Date.now();
      if (!(o.key && o.key === this._lastKey && now - this._lastT < 1500)) { this.hist.push(this.state.data); if (this.hist.length > 80) this.hist.shift(); }
      this._lastKey = o.key; this._lastT = now; this.fut = [];
    }
    fn(p, data);
    p.updatedAt = new Date().toISOString();
    if (o.flip && this.state.mode === 'storyboard') this.pendingFlip = { layer: 'storyboard', rects: this.capture('storyboard') };
    this.setState({ data });
    if (o.save !== false) this.scheduleSave(data);
    return true;
  },
  undo() { if (!this.hist.length) return; this.fut.push(this.state.data); const d = this.hist.pop(); this._lastKey = null; this.setState({ data: d }); this.scheduleSave(d); },
  redo() { if (!this.fut.length) return; this.hist.push(this.state.data); const d = this.fut.pop(); this._lastKey = null; this.setState({ data: d }); this.scheduleSave(d); },
  scheduleSave(data) {
    this.setState({ save: 'saving' }); clearTimeout(this._saveT);
    this._saveT = setTimeout(() => {
      if (this.state.sim.saveError) { this.setState({ save: 'error' }); return; }
      try { const out = U.clone(data || this.state.data); out.projects = out.projects.filter(x => x.id !== 'pr-empty'); out.projects.forEach(x => { x.scenes = x.scenes.filter(sc => sc.id !== 'sc-empty'); }); localStorage.setItem('sb-data-v3', JSON.stringify(out)); this.setState({ save: 'saved' }); }
      catch (e) { this.setState({ save: 'error' }); }
    }, 700);
  },
  retrySave() { this.setState({ sim: { ...this.state.sim, saveError: false } }, () => this.scheduleSave()); },
  saveEq(eq) { this.setState({ eq }); try { localStorage.setItem('sb-eq', JSON.stringify(eq)); } catch (e) {} },
  toast(msg, o = {}) {
    const id = U.uid('t'); this.setState(s => ({ toasts: [...s.toasts, { id, msg, undo: !!o.undo, tone: o.tone || 'info' }] }));
    setTimeout(() => this.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), o.ms || 5000);
  },
  dismissToast(id) { this.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })); },

  // ---------- FLIP ----------
  capture(layer) {
    const el = document.querySelector(`[data-layer="${layer}"]`); const m = {}; if (!el) return m;
    el.querySelectorAll('[data-flip]').forEach(n => { m[n.getAttribute('data-flip')] = n.getBoundingClientRect(); }); return m;
  },
  playFlip({ layer, rects }) {
    const el = document.querySelector(`[data-layer="${layer}"]`); if (!el) return;
    el.querySelectorAll('[data-flip]').forEach(n => {
      const f = rects[n.getAttribute('data-flip')]; const r = n.getBoundingClientRect();
      if (!f || !r.width || !f.width) return;
      const dx = f.left - r.left, dy = f.top - r.top, sx = f.width / r.width, sy = f.height / r.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return;
      n.style.transition = 'none'; n.style.transformOrigin = '0 0';
      n.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`; n.style.zIndex = '30';
      n.getBoundingClientRect();
      n.style.transition = 'transform 600ms var(--ease-standard)'; n.style.transform = '';
      setTimeout(() => { n.style.transition = ''; n.style.zIndex = ''; n.style.transformOrigin = ''; }, 650);
    });
  },
  setMode(m) {
    if (m === this.state.mode) return;
    this.pendingFlip = { layer: m, rects: this.capture(this.state.mode) };
    this.setState({ mode: m, flipping: true, selection: [], pick: null });
    clearTimeout(this._flipT); this._flipT = setTimeout(() => this.setState({ flipping: false }), 650);
  },

  // ---------- board geometry ----------
  toWorld(cx, cy) { const el = this.boardEl; if (!el) return { x: 0, y: 0 }; const r = el.getBoundingClientRect(), v = this.state.view; return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; },
  centerWorld() { const el = this.boardEl; if (!el) return { x: 400, y: 200 }; const r = el.getBoundingClientRect(); const w = this.toWorld(r.left + r.width / 2, r.top + r.height / 2); return { x: Math.round(w.x - 120), y: Math.round(w.y - 100) }; },
  itemBoxes(p) {
    const out = [];
    p.scenes.forEach(sc => out.push({ id: sc.id, x: sc.board.x, y: sc.board.y, w: C.CARD.scene[0], h: C.CARD.scene[1] }));
    p.board.cards.forEach(c => { const s = C.CARD[c.kind] || [220, 160]; out.push({ id: c.id, x: c.x, y: c.y, w: s[0], h: s[1] }); });
    return out;
  },
  itemsIn(r) { return this.itemBoxes(this.proj()).filter(b => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y).map(b => b.id); },
  itemPos(p, id) { if (id.startsWith('bc-')) { const c = p.board.cards.find(x => x.id === id); return c && { x: c.x, y: c.y }; } const sc = p.scenes.find(s => s.id === id); return sc && { ...sc.board }; },
  setItemPos(p, id, pos) { if (id.startsWith('bc-')) { const c = p.board.cards.find(x => x.id === id); if (c) { c.x = pos.x; c.y = pos.y; } } else { const sc = p.scenes.find(s => s.id === id); if (sc) sc.board = pos; } },
  fitAll() {
    const el = this.boardEl, p = this.proj(); if (!el || !p) return;
    const r = el.getBoundingClientRect(); const bx = this.itemBoxes(p);
    if (!bx.length) { this.setState({ view: { x: r.width / 2 - 200, y: 80, z: 1 } }); return; }
    const minX = Math.min(...bx.map(b => b.x)), minY = Math.min(...bx.map(b => b.y)), maxX = Math.max(...bx.map(b => b.x + b.w)), maxY = Math.max(...bx.map(b => b.y + b.h));
    const z = Math.max(0.3, Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 150) / (maxY - minY)));
    this.setState({ view: { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: Math.max(24, (r.height - 110 - (maxY - minY) * z) / 2) - minY * z } });
  },
  zoomBy(f) {
    const el = this.boardEl; if (!el) return; const r = el.getBoundingClientRect(), v = this.state.view;
    const nz = Math.min(2, Math.max(0.25, v.z * f)), cx = r.width / 2, cy = r.height / 2;
    const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z; this.setState({ view: { z: nz, x: cx - wx * nz, y: cy - wy * nz } });
  },

  // ---------- board pointer ----------
  onBoardDown(e) {
    if (this.state.mode !== 'board' || e.target.closest('[data-item]')) return;
    if (this.state.space || e.button === 1) { e.preventDefault(); this.ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.state.view.x, vy: this.state.view.y }; }
    else if (e.button === 0) { const w = this.toWorld(e.clientX, e.clientY); const base = e.shiftKey ? this.state.selection : []; this.ptr = { type: 'marq', wx: w.x, wy: w.y, base }; this.setState({ marquee: { x: w.x, y: w.y, w: 0, h: 0 }, selection: base }); }
    else return;
    this.listen();
  },
  onItemDown(e, id) {
    if (e.button === 1 || this.state.space) { this.ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.state.view.x, vy: this.state.view.y }; e.preventDefault(); e.stopPropagation(); this.listen(); return; }
    if (e.button !== 0) return; e.stopPropagation();
    let sel = this.state.selection;
    if (e.shiftKey) sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; else if (!sel.includes(id)) sel = [id];
    const p = this.proj(), orig = {}; sel.forEach(k => { const pos = this.itemPos(p, k); if (pos) orig[k] = pos; });
    this.ptr = { type: 'move', sx: e.clientX, sy: e.clientY, orig, moved: false, id, shift: e.shiftKey };
    this.setState({ selection: sel }); this.listen();
  },
  listen() { window.addEventListener('pointermove', this.onMove); window.addEventListener('pointerup', this.onUp, { once: true }); },
  onMove(e) {
    const P = this.ptr; if (!P) return; const z = this.state.view.z;
    if (P.type === 'pan') this.setState({ view: { ...this.state.view, x: P.vx + e.clientX - P.sx, y: P.vy + e.clientY - P.sy } });
    else if (P.type === 'marq') { const w = this.toWorld(e.clientX, e.clientY); const r = { x: Math.min(P.wx, w.x), y: Math.min(P.wy, w.y), w: Math.abs(w.x - P.wx), h: Math.abs(w.y - P.wy) }; this.setState({ marquee: r, selection: [...new Set([...P.base, ...this.itemsIn(r)])] }); }
    else if (P.type === 'move') {
      const dx = (e.clientX - P.sx) / z, dy = (e.clientY - P.sy) / z;
      if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) < 4) return;
      const first = !P.moved; P.moved = true;
      this.mutate(p => { Object.keys(P.orig).forEach(k => this.setItemPos(p, k, { x: Math.round(P.orig[k].x + dx), y: Math.round(P.orig[k].y + dy) })); }, { history: first, save: false });
    }
  },
  onUp() {
    window.removeEventListener('pointermove', this.onMove); const P = this.ptr; this.ptr = null; if (!P) return;
    if (P.type === 'marq') this.setState({ marquee: null });
    if (P.type === 'move') { if (P.moved) this.scheduleSave(); else if (!P.shift) this.openItem(P.id); }
  },
  onWheel(e) {
    if (this.state.mode !== 'board' || this.state.screen !== 'app') return; e.preventDefault();
    const v = this.state.view;
    if (e.ctrlKey || e.metaKey) {
      const r = this.boardEl.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
      const nz = Math.min(2, Math.max(0.25, v.z * Math.exp(-e.deltaY * 0.0025))); const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
      this.setState({ view: { x: cx - wx * nz, y: cy - wy * nz, z: nz } });
    } else this.setState({ view: { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } });
  },
  openItem(id) {
    const p = this.proj();
    if (id.startsWith('bc-')) { const c = p.board.cards.find(x => x.id === id); if (c) this.openEditor(c.kind, c.refId); }
    else this.openEditor('scene', id);
  },

  // ---------- editor ----------
  openEditor(type, id) { this.setState({ editor: { type, id }, pick: null, custom: null }); },
  closeEditor() { this.setState({ editor: null, pick: null }); },
  editorNav(dir) {
    const ed = this.state.editor, p = this.proj(); if (!ed) return;
    if (ed.type === 'shot') { const list = this.allShots(p); const i = list.findIndex(x => x.sh.id === ed.id); const n = list[i + dir]; if (n) this.openEditor('shot', n.sh.id); }
    if (ed.type === 'scene') { const i = p.scenes.findIndex(s => s.id === ed.id); const n = p.scenes[i + dir]; if (n) this.openEditor('scene', n.id); }
  },
  upd(type, id, patch, key) { this.mutate(p => { const e = this.ent(p, type, id); if (e) Object.assign(e, typeof patch === 'function' ? patch(e) : patch); }, { key: key ? type + id + key : null }); },

  // ---------- shots / scenes ----------
  newShot(prev) {
    const b = prev || { cameraId: 'cam-zve10', lens: 'lens-sigma1850', focal: 35, supportId: 'sup-benro', movement: 'ثابتة' };
    return { id: U.uid('sh'), desc: '', cameraId: b.cameraId, lens: b.lens, focal: b.focal, size: 'MS', angle: 'مستوى العين', movement: b.movement, supportId: b.supportId, lightingIds: [], lightingMood: '', audioIds: [], audioNotes: '', dialogue: '', duration: 3, status: 'planned', filterId: null, images: [], coverImageId: null };
  },
  addShot(sceneId) {
    let nid = null;
    this.mutate(p => { const sc = p.scenes.find(s => s.id === sceneId); const sh = this.newShot(sc.shots[sc.shots.length - 1]); nid = sh.id; sc.shots.push(sh); }, { flip: true });
    if (nid) this.openEditor('shot', nid);
  },
  duplicateShot(id) {
    this.mutate(p => { const f = this.findShot(p, id); const c = U.clone(f.sh); c.id = U.uid('sh'); const map = {}; c.images.forEach(i => { const n = U.uid('img'); map[i.id] = n; i.id = n; }); c.coverImageId = map[c.coverImageId] || null; f.sc.shots.splice(f.hi + 1, 0, c); }, { flip: true });
    this.toast('تكرّرت اللقطة');
  },
  deleteShot(id) {
    const p0 = this.proj(); const f0 = this.findShot(p0, id); if (!f0) return; const num = `${f0.si + 1}.${f0.hi + 1}`;
    this.mutate((p, d) => { const f = this.findShot(p, id); d.trash.unshift({ id: U.uid('tr'), type: 'shot', projectId: p.id, label: `لقطة ${num}: ${f.sh.desc || 'بدون وصف'}`, deletedAt: new Date().toISOString(), payload: { shot: f.sh, sceneId: f.sc.id, index: f.hi } }); f.sc.shots.splice(f.hi, 1); }, { flip: true });
    if (this.state.editor && this.state.editor.id === id) this.closeEditor();
    this.setState({ hoverShot: null }); this.toast(`حُذفت اللقطة ${num}`, { undo: true });
  },
  addScene({ index, pos, name, open = true } = {}) {
    let nid = null;
    this.mutate(p => {
      const last = p.scenes[p.scenes.length - 1];
      const sc = { id: U.uid('sc'), name: name || 'مشهد جديد', intExt: 'ext', dayNight: 'day', locationId: null, characterIds: [], summary: '', goal: '', mood: 'sand', coverImageId: null, noteIds: [], moodboardIds: [], board: pos || (last ? { x: last.board.x - 320, y: last.board.y } : this.centerWorld()), shots: [] };
      nid = sc.id; if (index == null) p.scenes.push(sc); else p.scenes.splice(index, 0, sc);
    }, { flip: true });
    if (open && nid) this.openEditor('scene', nid);
    return nid;
  },
  deleteScene(id) {
    const p0 = this.proj(); const i0 = p0.scenes.findIndex(s => s.id === id); if (i0 < 0) return; const num = U.pad2(i0 + 1);
    this.mutate((p, d) => { const i = p.scenes.findIndex(s => s.id === id); const sc = p.scenes[i]; d.trash.unshift({ id: U.uid('tr'), type: 'scene', projectId: p.id, label: `مشهد ${num}: ${sc.name}`, deletedAt: new Date().toISOString(), payload: { scene: sc, index: i } }); p.scenes.splice(i, 1); }, { flip: true });
    if (this.state.editor && this.state.editor.id === id) this.closeEditor();
    this.toast(`حُذف المشهد ${num}`, { undo: true });
  },
  deleteSelection() {
    const sel = this.state.selection; if (!sel.length) return; const p0 = this.proj();
    const nums = sel.filter(id => !id.startsWith('bc-')).map(id => U.pad2(p0.scenes.findIndex(s => s.id === id) + 1));
    this.mutate((p, d) => {
      sel.forEach(id => {
        if (id.startsWith('bc-')) {
          const ci = p.board.cards.findIndex(c => c.id === id); if (ci < 0) return; const c = p.board.cards[ci];
          if (c.kind === 'note') { const note = p.notes.find(n => n.id === c.refId); d.trash.unshift({ id: U.uid('tr'), type: 'note', projectId: p.id, label: `ملاحظة: «${(note && note.text || '').slice(0, 40)}»`, deletedAt: new Date().toISOString(), payload: { note, card: c } }); p.notes = p.notes.filter(n => n.id !== c.refId); p.scenes.forEach(s => { s.noteIds = s.noteIds.filter(x => x !== c.refId); }); }
          p.board.cards.splice(ci, 1);
        } else {
          const i = p.scenes.findIndex(s => s.id === id); if (i < 0) return; const sc = p.scenes[i];
          d.trash.unshift({ id: U.uid('tr'), type: 'scene', projectId: p.id, label: `مشهد ${U.pad2(i + 1)}: ${sc.name}`, deletedAt: new Date().toISOString(), payload: { scene: sc, index: i } }); p.scenes.splice(i, 1);
        }
      });
    });
    this.setState({ selection: [], editor: null });
    this.toast(nums.length === 1 && sel.length === 1 ? `حُذف المشهد ${nums[0]}` : `حُذف ${sel.length} عناصر`, { undo: true });
  },
  moveShot(shotId, toSceneId, toIndex) {
    this.mutate(p => {
      const f = this.findShot(p, shotId); if (!f) return; const to = p.scenes.find(s => s.id === toSceneId); if (!to) return;
      f.sc.shots.splice(f.hi, 1); let idx = toIndex == null ? to.shots.length : toIndex; if (f.sc === to && f.hi < idx) idx--; to.shots.splice(Math.max(0, idx), 0, f.sh);
    }, { flip: true });
  },
  moveScene(sceneId, toIndex) {
    this.mutate(p => { const i = p.scenes.findIndex(s => s.id === sceneId); const [sc] = p.scenes.splice(i, 1); let idx = toIndex; if (i < idx) idx--; p.scenes.splice(idx, 0, sc); }, { flip: true });
  },

  // ---------- creation from templates / library ----------
  createEntity(p, type) {
    if (type === 'note') { const n = { id: U.uid('note'), text: '' }; p.notes.push(n); return n.id; }
    if (type === 'character') { const c = { id: U.uid('ch'), name: 'شخصية جديدة', role: '', desc: '', wardrobe: '', notes: '', images: [], coverImageId: null }; p.library.characters.push(c); return c.id; }
    if (type === 'location') { const l = { id: U.uid('loc'), name: 'موقع جديد', address: '', mapUrl: '', notes: '', images: [], coverImageId: null }; p.library.locations.push(l); return l.id; }
    if (type === 'moodboard') { const m = { id: U.uid('mb'), title: 'لوحة مزاج جديدة', swatches: ['#d2a06a', '#3a342c', '#eee5d3'], images: [] }; p.library.moodboards.push(m); return m.id; }
  },
  createFromTemplate(type, ctx) {
    if (type === 'scene') {
      if (ctx.where === 'board' || ctx.where === 'center') return this.addScene({ pos: ctx.pos || this.centerWorld() });
      if (ctx.where === 'gap') return this.addScene({ index: ctx.index });
      return this.addScene({});
    }
    let rid = null; const label = { note: 'الملاحظة', character: 'الشخصية', location: 'الموقع', moodboard: 'لوحة المزاج' }[type];
    if (ctx.where === 'row' && type === 'location') {
      const sc = this.proj().scenes.find(s => s.id === ctx.sceneId);
      if (sc && sc.locationId) { this.askConfirm({ title: 'استبدال الموقع؟', msg: `للمشهد موقع مسبقاً. هل تريد استبداله بموقع جديد؟`, ok: 'استبدال', onOk: () => this.createFromTemplate(type, { ...ctx, force: true }) }); if (!ctx.force) return; }
    }
    const place = ctx.where === 'board' || ctx.where === 'center' || (ctx.where === 'library' && type === 'note');
    this.mutate(p => {
      rid = this.createEntity(p, type);
      if (place) { const pos = ctx.pos || this.centerWorld(); p.board.cards.push({ id: U.uid('bc'), kind: type, refId: rid, x: pos.x, y: pos.y }); }
      if (ctx.where === 'row') this.linkInto(p, ctx.sceneId, type, rid);
    });
    if (ctx.where === 'row') { const n = U.pad2(this.proj().scenes.findIndex(s => s.id === ctx.sceneId) + 1); this.toast(`رُبطت ${label} الجديدة بالمشهد ${n}`); }
    if (ctx.where === 'library') this.toast(type === 'note' ? 'أُضيفت الملاحظة إلى لوحة الأفكار' : `أُضيفت ${label} إلى المكتبة فقط`);
    if (rid) this.openEditor(type, rid);
  },
  linkInto(p, sceneId, type, id) {
    const sc = p.scenes.find(s => s.id === sceneId); if (!sc) return;
    if (type === 'character' && !sc.characterIds.includes(id)) sc.characterIds.push(id);
    if (type === 'location') sc.locationId = id;
    if (type === 'note' && !sc.noteIds.includes(id)) sc.noteIds.push(id);
    if (type === 'moodboard' && !sc.moodboardIds.includes(id)) sc.moodboardIds.push(id);
  },
  linkLib(sceneId, type, id) {
    const p = this.proj(); const sc = p.scenes.find(s => s.id === sceneId); const n = U.pad2(p.scenes.indexOf(sc) + 1);
    const go = () => { this.mutate(pp => this.linkInto(pp, sceneId, type, id)); this.toast(`رُبط العنصر بالمشهد ${n}`); };
    if (type === 'location' && sc.locationId && sc.locationId !== id) { const old = this.ent(p, 'location', sc.locationId); this.askConfirm({ title: 'استبدال الموقع؟', msg: `موقع المشهد ${n} حالياً «${old ? old.name : ''}». هل تستبدله؟`, ok: 'استبدال', onOk: go }); }
    else go();
  },
  unlink(sceneId, type, id) { this.mutate(p => { const sc = p.scenes.find(s => s.id === sceneId); if (type === 'character') sc.characterIds = sc.characterIds.filter(x => x !== id); if (type === 'note') sc.noteIds = sc.noteIds.filter(x => x !== id); if (type === 'moodboard') sc.moodboardIds = sc.moodboardIds.filter(x => x !== id); if (type === 'location') sc.locationId = null; }); },
  askConfirm(c) { this.setState({ confirm: c }); },

  // ---------- drag & drop ----------
  dragStart(e, payload) { this.drag = payload; try { e.dataTransfer.setData('text/plain', payload.id || payload.type || 'x'); e.dataTransfer.effectAllowed = 'copyMove'; } catch (_) {} },
  dragEnd() { this.drag = null; if (this.state.dragOver) this.setState({ dragOver: null }); },
  setOver(o) { const c = this.state.dragOver; if (!c || c.kind !== (o && o.kind) || c.id !== (o && o.id)) this.setState({ dragOver: o }); },
  dropOnBoard(e) {
    e.preventDefault(); const d = this.drag; this.drag = null; this.setState({ dragOver: null });
    const w = this.toWorld(e.clientX, e.clientY); const pos = { x: Math.round(w.x - 100), y: Math.round(w.y - 50) };
    if (!d) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) this.filesToMoodboard(e.dataTransfer.files, pos); return; }
    if (d.kind === 'tpl') this.createFromTemplate(d.type, { where: 'board', pos });
    if (d.kind === 'lib') this.mutate(p => p.board.cards.push({ id: U.uid('bc'), kind: d.type, refId: d.id, x: pos.x, y: pos.y }));
    if (d.kind === 'inbox') this.inboxTo({ board: pos }, d.id);
  },
  dropOnSbEmpty(e) {
    e.preventDefault(); const d = this.drag; this.drag = null; this.setState({ dragOver: null }); if (!d) return;
    if (d.kind === 'tpl') { if (d.type === 'scene') this.addScene({}); else this.createFromTemplate(d.type, { where: 'library' }); }
    if (d.kind === 'lib') this.toast('العنصر موجود في المكتبة — أفلته فوق صف مشهد لربطه');
  },
  dropOnRow(e, sceneId) {
    e.preventDefault(); e.stopPropagation(); const d = this.drag; this.drag = null; this.setState({ dragOver: null }); if (!d) return;
    if (d.kind === 'tpl') { if (d.type === 'scene') { const i = this.proj().scenes.findIndex(s => s.id === sceneId); this.addScene({ index: i + 1 }); } else this.createFromTemplate(d.type, { where: 'row', sceneId }); }
    if (d.kind === 'lib') this.linkLib(sceneId, d.type, d.id);
    if (d.kind === 'shot') this.moveShot(d.id, sceneId, null);
    if (d.kind === 'inbox') { const it = this.proj().library.inbox.find(x => x.id === d.id); if (it && it.type === 'note') this.inboxTo({ sceneId }, d.id); else this.toast('أفلت الصورة فوق لقطة لتصبح صورة مرجعية'); }
    if (d.kind === 'scene') { const i = this.proj().scenes.findIndex(s => s.id === sceneId); this.moveScene(d.id, i); }
  },
  dropOnGap(e, index) {
    e.preventDefault(); e.stopPropagation(); const d = this.drag; this.drag = null; this.setState({ dragOver: null }); if (!d) return;
    if (d.kind === 'tpl' && d.type === 'scene') this.addScene({ index });
    else if (d.kind === 'scene') this.moveScene(d.id, index);
  },
  dropOnShot(e, shotId) {
    e.preventDefault(); e.stopPropagation(); const d = this.drag; this.drag = null; this.setState({ dragOver: null });
    if (!d) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) this.addFiles({ type: 'shot', id: shotId }, e.dataTransfer.files); return; }
    if (d.kind === 'shot' && d.id !== shotId) { const f = this.findShot(this.proj(), shotId); this.moveShot(d.id, f.sc.id, f.hi); }
    if (d.kind === 'inbox') this.inboxTo({ shotId }, d.id);
    if (d.kind === 'tpl' || d.kind === 'lib') { const f = this.findShot(this.proj(), shotId); this.dragOverRowFallback(d, f.sc.id); }
  },
  dragOverRowFallback(d, sceneId) { this.drag = d; this.dropOnRow({ preventDefault() {}, stopPropagation() {} }, sceneId); },
  inboxTo(target, inboxId) {
    const it = this.proj().library.inbox.find(x => x.id === inboxId); if (!it) return;
    this.mutate(p => {
      p.library.inbox = p.library.inbox.filter(x => x.id !== inboxId);
      if (target.shotId) { const f = this.findShot(p, target.shotId); if (it.type === 'image') { const img = { id: U.uid('img'), src: it.src, frame: it.frame }; f.sh.images.push(img); if (!f.sh.coverImageId) f.sh.coverImageId = img.id; } else { f.sh.audioNotes = f.sh.audioNotes; const n = { id: U.uid('note'), text: it.text }; p.notes.push(n); f.sc.noteIds.push(n.id); } }
      if (target.sceneId) { const n = { id: U.uid('note'), text: it.text }; p.notes.push(n); p.scenes.find(s => s.id === target.sceneId).noteIds.push(n.id); }
      if (target.board) {
        if (it.type === 'image') { const m = { id: U.uid('mb'), title: it.text || 'من الجوال', swatches: [], images: [{ id: U.uid('mi'), src: it.src, frame: it.frame }] }; p.library.moodboards.push(m); p.board.cards.push({ id: U.uid('bc'), kind: 'moodboard', refId: m.id, x: target.board.x, y: target.board.y }); }
        else { const n = { id: U.uid('note'), text: it.text }; p.notes.push(n); p.board.cards.push({ id: U.uid('bc'), kind: 'note', refId: n.id, x: target.board.x, y: target.board.y }); }
      }
    });
    this.toast(target.shotId ? 'أصبحت الصورة مرجعاً للّقطة' : 'نُقل العنصر من الوارد');
  },

  // ---------- images ----------
  imgOwner(p, t) { return this.ent(p, t.type, t.id); },
  addFiles(target, files) {
    U.readFiles(files).then(srcs => {
      srcs = srcs.filter(Boolean); if (!srcs.length) return;
      const fail = this.state.sim.uploadError;
      this.mutate(p => { const o = this.imgOwner(p, target); if (!o) return; o.images = o.images || []; srcs.forEach((src, i) => { const img = { id: U.uid('img'), src }; if (fail && i === 0) img.error = true; o.images.push(img); if (!o.coverImageId && !img.error) o.coverImageId = img.id; }); });
      if (fail) this.toast('فشل رفع صورة — أعد المحاولة', { tone: 'danger' });
    });
  },
  retryUpload(target, imgId) { this.setState({ sim: { ...this.state.sim, uploadError: false } }); this.mutate(p => { const o = this.imgOwner(p, target); const im = o.images.find(i => i.id === imgId); if (im) delete im.error; if (!o.coverImageId) o.coverImageId = imgId; }); },
  setCover(target, imgId) { this.mutate(p => { this.imgOwner(p, target).coverImageId = imgId; }); },
  removeImage(target, imgId) { this.mutate(p => { const o = this.imgOwner(p, target); o.images = o.images.filter(i => i.id !== imgId); if (o.coverImageId === imgId) o.coverImageId = o.images[0] ? o.images[0].id : null; }); },
  moveImage(target, from, to) { this.mutate(p => { const o = this.imgOwner(p, target); const [im] = o.images.splice(from, 1); o.images.splice(to, 0, im); }); },
  filesToMoodboard(files, pos) { U.readFiles(files).then(srcs => { srcs = srcs.filter(Boolean); if (!srcs.length) return; this.mutate(p => { const m = { id: U.uid('mb'), title: 'لوحة مزاج', swatches: [], images: srcs.map(src => ({ id: U.uid('mi'), src })) }; p.library.moodboards.push(m); p.board.cards.push({ id: U.uid('bc'), kind: 'moodboard', refId: m.id, x: pos.x, y: pos.y }); }); }); },

  // ---------- filter ----------
  toggleFilter(kind, id) { const f = this.state.filter; this.setState({ filter: f && f.id === id ? null : { kind, id } }); },

  // ---------- projects ----------
  switchProject(id) {
    this.hist = []; this.fut = [];
    this.setState({ projectId: id, editor: null, filter: null, selection: [], modal: null }, () => { this.mutate((p, d) => { d.settings.lastProjectId = id; }, { history: false }); setTimeout(() => this.fitAll(), 30); });
  },
  createProject() {
    const np = this.state.np; const tpl = C.TEMPLATES.find(t => t.id === np.template);
    const id = U.uid('pr');
    const pr = { id, name: np.name.trim() || 'مشروع جديد', template: np.template, aspect: np.aspect, updatedAt: new Date().toISOString(),
      scenes: tpl.scenes.map((n, i) => ({ id: U.uid('sc'), name: n, intExt: 'ext', dayNight: 'day', locationId: null, characterIds: [], summary: '', goal: '', mood: C.MOODS[i % 8], coverImageId: null, noteIds: [], moodboardIds: [], board: { x: 1100 - (i % 4) * 320, y: 60 + Math.floor(i / 4) * 380 }, shots: [] })),
      library: { characters: [], locations: [], moodboards: [], inbox: [] }, notes: [], board: { cards: [] } };
    this.mutate((p, d) => { d.projects.unshift(pr); }, { history: false });
    this.setState({ np: { name: '', aspect: '16:9', template: 'ad' } }); setTimeout(() => this.switchProject(id), 0);
  },

  // ---------- trash ----------
  restore(trId) {
    const d0 = this.state.data; const t = d0.trash.find(x => x.id === trId); if (!t) return;
    this.mutate((p0, d) => {
      const p = d.projects.find(x => x.id === t.projectId) || p0; d.trash = d.trash.filter(x => x.id !== trId);
      if (t.type === 'scene') p.scenes.splice(Math.min(t.payload.index ?? p.scenes.length, p.scenes.length), 0, t.payload.scene || t.payload);
      if (t.type === 'shot') { const sc = p.scenes.find(s => s.id === t.payload.sceneId) || p.scenes[0]; if (sc) sc.shots.splice(Math.min(t.payload.index, sc.shots.length), 0, t.payload.shot); }
      if (t.type === 'note') { p.notes.push(t.payload.note); p.board.cards.push(t.payload.card); }
    });
    this.toast('استُعيد العنصر');
  },
  purge(trId) { this.askConfirm({ title: 'حذف نهائي؟', msg: 'لا يمكن التراجع عن الحذف النهائي.', ok: 'حذف نهائي', danger: true, onOk: () => { this.mutate((p, d) => { d.trash = d.trash.filter(x => x.id !== trId); }, { history: false }); this.toast('حُذف نهائياً'); } }); },

  // ---------- export / import ----------
  exportCSV() {
    const rows = this.shotTableRows(); const cols = this.shotTableCols();
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '\ufeff' + [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(r[c.key])).join(','))].join('\n');
    U.download(`${this.proj().name} — قائمة اللقطات.csv`, csv, 'text/csv;charset=utf-8'); this.toast('صُدّرت قائمة اللقطات');
  },
  exportProject() { const p = this.proj(); U.download(`${p.name}.sbproj.json`, JSON.stringify({ format: 'scene-board/1', exportedAt: new Date().toISOString(), project: p, equipment: this.state.eq }, null, 2)); this.toast('حُفظت نسخة المشروع على جهازك'); },
  importProject(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const j = JSON.parse(r.result); const pr = j.project || j; if (!pr.scenes) throw 0; pr.id = U.uid('pr'); pr.name = pr.name + ' (مستورد)'; this.mutate((p, d) => d.projects.unshift(pr), { history: false }); this.toast('استُورد المشروع'); setTimeout(() => this.switchProject(pr.id), 0); } catch (_) { this.toast('الملف غير صالح', { tone: 'danger' }); } };
    r.readAsText(f); e.target.value = '';
  },
  print() { setTimeout(() => window.print(), 50); },

  // ---------- presentation ----------
  openPresent(i) { this.setState({ present: { open: true, i: i || 0, playing: false, tech: false, fill: 0 }, modal: null, menu: false }); },
  closePresent() { clearTimeout(this._presT); this.setState({ present: { ...this.state.present, open: false, playing: false } }); },
  presGo(i) { const n = this.allShots().length; i = Math.max(0, Math.min(n - 1, i)); this.setState({ present: { ...this.state.present, i, fill: 0 } }, () => this.presSchedule()); },
  presToggle() { this.setState({ present: { ...this.state.present, playing: !this.state.present.playing } }, () => this.presSchedule()); },
  presSchedule() {
    clearTimeout(this._presT); const pr = this.state.present; if (!pr.open || !pr.playing) return;
    const list = this.allShots(); const it = list[pr.i]; if (!it) return;
    this.setState({ present: { ...pr, fill: 0 } }, () => requestAnimationFrame(() => requestAnimationFrame(() => this.setState(s => ({ present: { ...s.present, fill: 1 } })))));
    this._presT = setTimeout(() => { const s = this.state.present; if (s.i < list.length - 1) this.setState({ present: { ...s, i: s.i + 1 } }, () => this.presSchedule()); else this.setState({ present: { ...s, playing: false, fill: 0 } }); }, (Number(it.sh.duration) || 3) * 1000);
  },

  // ---------- keyboard / paste ----------
  onKey(e) {
    const st = this.state, t = e.target; const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (st.present.open) {
      if (e.key === 'Escape') this.closePresent();
      else if (e.key === 'ArrowLeft') this.presGo(st.present.i + 1);
      else if (e.key === 'ArrowRight') this.presGo(st.present.i - 1);
      else if (e.code === 'Space') { e.preventDefault(); this.presToggle(); }
      return;
    }
    if (e.key === 'Escape') { if (st.pick || st.custom) this.setState({ pick: null, custom: null }); else if (st.confirm) this.setState({ confirm: null }); else if (st.eqEdit || st.eqImport) this.setState({ eqEdit: null, eqImport: null }); else if (st.modal) this.setState({ modal: null }); else if (st.menu) this.setState({ menu: false }); else if (st.editor) this.closeEditor(); else if (st.selection.length) this.setState({ selection: [] }); return; }
    if (typing) return;
    if (e.code === 'Space') { e.preventDefault(); if (!st.space) this.setState({ space: true }); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (st.mode === 'board' && st.selection.length) this.deleteSelection(); else if (st.hoverShot) this.deleteShot(st.hoverShot); }
  },
  onKeyUp(e) { if (e.code === 'Space' && this.state.space) this.setState({ space: false }); },
  onPaste(e) {
    const items = e.clipboardData ? [...e.clipboardData.items] : []; const files = items.filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile());
    if (!files.length) return; const ed = this.state.editor;
    const target = ed && ['shot', 'location', 'moodboard', 'character'].includes(ed.type) ? ed : (this.state.hoverShot ? { type: 'shot', id: this.state.hoverShot } : null);
    if (!target) { this.toast('حدّد لقطة أولاً ثم الصق الصورة'); return; }
    e.preventDefault(); this.addFiles(target, files); this.toast('أُلصقت الصورة');
  },
  onWinDown(e) {
    if (this.state.pick && !e.target.closest('[data-picker]')) this.setState({ pick: null, custom: null });
    if (this.state.menu && !e.target.closest('[data-menu]')) this.setState({ menu: false });
  },

  // ---------- hash routing (index links) ----------
  parseHash() { const h = {}; (location.hash || '').replace(/^#/, '').split('&').forEach(kv => { const [k, v] = kv.split('='); if (k) h[decodeURIComponent(k)] = decodeURIComponent(v || '1'); }); return h; },
  applyHash(h) {
    const s = { screen: 'app', modal: null, editor: null, filter: null, present: { ...this.state.present, open: false } };
    const sim = { saveError: false, uploadError: false };
    if (h.theme) s.theme = h.theme;
    const sc = h.screen || 'board';
    if (sc === 'board' || sc === 'storyboard') s.mode = sc;
    if (['equipment', 'trash', 'settings', 'login'].includes(sc)) s.screen = sc;
    if (['export', 'projects', 'newProject'].includes(sc)) s.modal = sc;
    if (h.mode) s.mode = h.mode;
    const st = h.state;
    // demo-only fixtures: strip them whenever we leave their state so they never persist
    const clean = U.clone(this.state.data);
    clean.projects = clean.projects.filter(x => x.id !== 'pr-empty');
    clean.projects.forEach(x => { x.scenes = x.scenes.filter(sc => sc.id !== 'sc-empty'); });
    s.data = clean;
    if (st === 'editorShot') s.editor = { type: 'shot', id: h.id || 'sh-3-2' };
    if (st === 'editorScene') s.editor = { type: 'scene', id: h.id || 'sc-3' };
    if (st === 'editorCharacter') s.editor = { type: 'character', id: 'ch-sara' };
    if (st === 'filter') s.filter = { kind: 'location', id: 'loc-apt' };
    if (st === 'emptyFilter') s.filter = { kind: 'character', id: '__none', label: 'شخصية بلا مشاهد' };
    if (st === 'saveError') { sim.saveError = true; s.save = 'error'; }
    if (st === 'offline') s.offline = true; else s.offline = !navigator.onLine;
    if (st === 'uploadError') { sim.uploadError = true; s.editor = { type: 'shot', id: 'sh-4-4' }; }
    if (st === 'loading') s.loaded = false; else s.loaded = true;
    if (st === 'libraryEmpty' || st === 'inboxEmpty' || st === 'empty') {
      const data = s.data; let e = data.projects.find(x => x.id === 'pr-empty');
      if (!e) { e = { id: 'pr-empty', name: 'مشروع جديد', template: 'blank', aspect: '16:9', updatedAt: new Date().toISOString(), scenes: [], library: { characters: [], locations: [], moodboards: [], inbox: [] }, notes: [], board: { cards: [] } }; data.projects.push(e); }
      s.projectId = 'pr-empty'; if (st === 'inboxEmpty') { s.libTab = 'inbox'; s.libOpen = true; } if (st === 'libraryEmpty') { s.libTab = 'characters'; s.libOpen = true; }
    } else if (this.state.projectId === 'pr-empty') s.projectId = 'pr-yasmin';
    if (st === 'sceneNoShots') {
      const data = s.data; const pr = data.projects.find(x => x.id === 'pr-yasmin');
      if (!pr.scenes.find(x => x.id === 'sc-empty')) pr.scenes.push({ id: 'sc-empty', name: 'مشهد جديد', intExt: 'ext', dayNight: 'day', locationId: null, characterIds: [], summary: '', goal: '', mood: 'olive', coverImageId: null, noteIds: [], moodboardIds: [], board: { x: 280, y: 560 }, shots: [] });
      s.editor = { type: 'scene', id: 'sc-empty' }; s.mode = h.mode || 'storyboard';
    }
    if (sc === 'present') { s.present = { open: true, i: Number(h.i || 6), playing: false, tech: h.tech === '1', fill: 0 }; }
    s.sim = sim;
    this.setState(s, () => { setTimeout(() => this.fitAll(), 30); });
  }
};

(function(){
const U = util;
// لوحة المشاهد — view-model builders. Mixed into the root DC instance.


const view = {
  chip(on) { return on ? 'var(--color-inverse-bg)' : 'transparent'; },
  chipFg(on) { return on ? 'var(--color-inverse-text)' : 'var(--color-text)'; },

  vmShot(sc, sh, si, hi, ar) {
    const st = this.state, cov = this.coverOf(sh), hex = this.moodHex(sc.mood), S = C.STATUS[sh.status] || C.STATUS.planned;
    const cardW = ar >= 1 ? 236 : 168, coverH = Math.round(Math.min(300, cardW / ar));
    const over = st.dragOver, isOver = over && over.kind === 'shot' && over.id === sh.id;
    const sel = st.editor && st.editor.type === 'shot' && st.editor.id === sh.id;
    const hov = st.hoverShot === sh.id; const stop = fn => e => { e.stopPropagation(); fn(e); };
    return {
      id: sh.id, num: `${si + 1}.${hi + 1}`, flip: 'shot-' + sh.id, desc: sh.desc || 'بدون وصف', descColor: sh.desc ? 'var(--color-text)' : 'var(--color-text-muted)',
      bg: U.frameBg(cov, hex), hasImg: !!cov, noImg: !cov, camLine: this.camLine(sh) || '—', moveLine: this.moveLine(sh) || '—', dur: U.mmss(sh.duration),
      dot: S.dot, ring: S.ring, statusLabel: S.label, cardW, coverH, actOp: hov ? 1 : 0,
      outline: isOver ? '0 0 0 2px var(--color-accent)' : sel ? '0 0 0 2px var(--color-accent)' : 'var(--shadow-card)',
      lift: isOver ? 'translateX(-6px)' : 'none',
      onEnter: () => this.state.hoverShot !== sh.id && this.setState({ hoverShot: sh.id }),
      onLeave: () => this.state.hoverShot === sh.id && this.setState({ hoverShot: null }),
      onOpen: () => this.openEditor('shot', sh.id),
      onOpenBtn: stop(() => this.openEditor('shot', sh.id)), onDup: stop(() => this.duplicateShot(sh.id)), onDel: stop(() => this.deleteShot(sh.id)),
      onDragStart: e => { e.stopPropagation(); this.dragStart(e, { kind: 'shot', id: sh.id }); },
      onDragEnd: () => this.dragEnd(),
      onDragOver: e => { const d = this.drag; if (!d && !(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'))) return; e.preventDefault(); e.stopPropagation(); if (!d || d.kind === 'shot' || d.kind === 'inbox') this.setOver({ kind: 'shot', id: sh.id }); else this.setOver({ kind: 'row', id: sc.id }); },
      onDrop: e => this.dropOnShot(e, sh.id),
      onFiles: e => { this.addFiles({ type: 'shot', id: sh.id }, e.target.files); e.target.value = ''; },
      stopClick: e => e.stopPropagation()
    };
  },

  vmScenes(p) {
    const st = this.state, ar = C.AR[p.aspect] || 16 / 9, I = p.library;
    const over = st.dragOver;
    return p.scenes.map((sc, si) => {
      const hex = this.moodHex(sc.mood), cov = this.sceneCover(sc), loc = I.locations.find(l => l.id === sc.locationId);
      const match = this.matches(sc), sel = st.selection.includes(sc.id);
      const rowOver = over && over.kind === 'row' && over.id === sc.id;
      const gapOver = over && over.kind === 'gap' && over.id === si;
      const shots = sc.shots.map((sh, hi) => this.vmShot(sc, sh, si, hi, ar));
      const edSel = st.editor && st.editor.type === 'scene' && st.editor.id === sc.id;
      return {
        id: sc.id, num: U.pad2(si + 1), name: sc.name, flip: 'scene-' + sc.id,
        badge: `${sc.intExt === 'int' ? 'داخلي' : 'خارجي'} · ${sc.dayNight === 'night' ? 'ليل' : 'نهار'}`,
        loc: loc ? loc.name : 'بلا موقع', locColor: loc ? 'var(--color-text)' : 'var(--color-text-muted)',
        dur: U.mmss(this.sceneDur(sc)), shotCount: sc.shots.length, shotsLabel: sc.shots.length === 1 ? 'لقطة' : 'لقطات',
        mood: hex, moodText: U.textOn(hex), cover: U.frameBg(cov, hex),
        chars: sc.characterIds.map(id => I.characters.find(c => c.id === id)).filter(Boolean).map(c => this.vmAvatar(c)),
        hasChars: sc.characterIds.length > 0,
        x: sc.board.x, y: sc.board.y, op: match ? 1 : 0.22,
        selOutline: sel || edSel ? '0 0 0 2px var(--color-accent), var(--shadow-lift)' : 'var(--shadow-card)',
        onDown: e => this.onItemDown(e, sc.id),
        thumbs: sc.shots.map((sh, hi) => ({ id: sh.id, flip: 'shot-' + sh.id, bg: U.frameBg(this.coverOf(sh), hex), w: ar >= 1 ? 46 : 22, h: ar >= 1 ? Math.round(46 / ar) : 38,
          onDown: e => e.stopPropagation(), onClick: e => { e.stopPropagation(); this.openEditor('shot', sh.id); },
          onDragOver: e => { if (this.drag && this.drag.kind === 'inbox') { e.preventDefault(); e.stopPropagation(); } }, onDrop: e => this.dropOnShot(e, sh.id) })),
        shots, hasShots: shots.length > 0, noShots: shots.length === 0,
        noteCount: sc.noteIds.length, mbCount: sc.moodboardIds.length, hasNotes: sc.noteIds.length > 0, hasMbs: sc.moodboardIds.length > 0,
        onOpen: () => this.openEditor('scene', sc.id), onAddShot: () => this.addShot(sc.id),
        rowBorder: rowOver ? 'var(--color-accent)' : edSel ? 'var(--color-accent)' : 'var(--color-border-subtle)',
        rowBg: rowOver ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        rowOverflow: st.flipping ? 'visible' : 'auto',
        gapH: gapOver ? 6 : 0, gapOp: gapOver ? 1 : 0,
        onHeadDragStart: e => this.dragStart(e, { kind: 'scene', id: sc.id }), onDragEnd: () => this.dragEnd(),
        onRowOver: e => { if (!this.drag) return; e.preventDefault(); e.stopPropagation(); const d = this.drag; if (d.kind === 'scene' || (d.kind === 'tpl' && d.type === 'scene')) this.setOver({ kind: 'gap', id: si }); else this.setOver({ kind: 'row', id: sc.id }); },
        onRowDrop: e => { const d = this.drag; if (d && (d.kind === 'scene' || (d.kind === 'tpl' && d.type === 'scene'))) this.dropOnGap(e, si); else this.dropOnRow(e, sc.id); },
        onGapOver: e => { const d = this.drag; if (!d || !(d.kind === 'scene' || (d.kind === 'tpl' && d.type === 'scene'))) return; e.preventDefault(); e.stopPropagation(); this.setOver({ kind: 'gap', id: si }); },
        onGapDrop: e => this.dropOnGap(e, si),
        rhythmGrow: Math.max(1, this.sceneDur(sc)), onRhythm: () => this.scrollToRow(sc.id), rhythmOp: match ? 1 : 0.3
      };
    });
  },
  scrollToRow(id) { const box = this.sbEl, row = box && box.querySelector(`[data-row="${id}"]`); if (row) box.scrollTo({ top: row.offsetTop - 90, behavior: 'smooth' }); },
  vmAvatar(c) { const im = this.coverOf(c); return { id: c.id, init: (c.name || '؟').replace('م. ', '').slice(0, 1), bg: im ? U.frameBg(im, '#d2a06a') : 'var(--color-accent)', hasPhoto: !!im }; },

  vmCards(p) {
    const st = this.state, L = p.library;
    return p.board.cards.map(c => {
      const sel = st.selection.includes(c.id); const base = { id: c.id, x: c.x, y: c.y, selOutline: sel ? '0 0 0 2px var(--color-accent), var(--shadow-lift)' : 'var(--shadow-card)', onDown: e => this.onItemDown(e, c.id), isNote: false, isChar: false, isLoc: false, isMb: false, op: st.filter ? 0.3 : 1 };
      const scenesOf = test => p.scenes.filter(test).length;
      if (c.kind === 'note') { const n = p.notes.find(x => x.id === c.refId) || { text: '' }; const sc = p.scenes.findIndex(s => s.noteIds.includes(n.id)); return { ...base, isNote: true, text: n.text || 'ملاحظة فارغة', textColor: n.text ? 'var(--color-text)' : 'var(--color-text-muted)', linked: sc > -1 ? `مرتبطة بالمشهد ${U.pad2(sc + 1)}` : '', hasLink: sc > -1 }; }
      if (c.kind === 'character') { const ch = L.characters.find(x => x.id === c.refId); if (!ch) return null; const n = scenesOf(s => s.characterIds.includes(ch.id)); return { ...base, isChar: true, av: this.vmAvatar(ch), title: ch.name, sub: ch.role, text: ch.desc, meta: `${n} مشاهد` }; }
      if (c.kind === 'location') { const l = L.locations.find(x => x.id === c.refId); if (!l) return null; const n = scenesOf(s => s.locationId === l.id); return { ...base, isLoc: true, bg: U.frameBg(this.coverOf(l), '#d2a06a'), title: l.name, sub: l.address || 'بلا عنوان', meta: `${n} مشاهد` }; }
      if (c.kind === 'moodboard') { const m = L.moodboards.find(x => x.id === c.refId); if (!m) return null; const imgs = m.images.slice(0, 4); while (imgs.length < 4) imgs.push(null); return { ...base, isMb: true, title: m.title, imgs: imgs.map((im, i) => ({ k: i, bg: im ? U.frameBg(im, m.swatches[i % Math.max(1, m.swatches.length)] || '#d2a06a') : 'var(--color-surface-strong)' })), swatches: m.swatches.map((s, i) => ({ k: i, c: s })) }; }
      return null;
    }).filter(Boolean);
  },

  vmLibrary(p) {
    const st = this.state, L = p.library, tab = st.libTab, f = st.filter;
    const newCount = L.inbox.filter(i => i.isNew !== false).length;
    const tabs = [{ value: 'characters', label: 'الشخصيات' }, { value: 'locations', label: 'المواقع' }, { value: 'moodboards', label: 'المزاج' }, { value: 'inbox', label: newCount ? `الوارد ${newCount}` : 'الوارد' }];
    let items = [];
    const drag = (type, id) => e => this.dragStart(e, { kind: 'lib', type, id });
    if (tab === 'characters') items = L.characters.map(c => { const n = p.scenes.filter(s => s.characterIds.includes(c.id)).length; const on = f && f.id === c.id; return { id: c.id, isAvatar: true, isImg: false, av: this.vmAvatar(c), title: c.name, sub: [c.role, c.desc].filter(Boolean).join(' — '), meta: `${n} مشاهد`, bg: on ? 'var(--color-accent-soft)' : 'transparent', border: on ? 'var(--color-accent)' : 'transparent', onClick: () => { this.toggleFilter('character', c.id); this.openEditor('character', c.id); }, onDragStart: drag('character', c.id) }; });
    if (tab === 'locations') items = L.locations.map(l => { const n = p.scenes.filter(s => s.locationId === l.id).length; const on = f && f.id === l.id; return { id: l.id, isAvatar: false, isImg: true, img: U.frameBg(this.coverOf(l), '#d2a06a'), title: l.name, sub: l.address || l.mapUrl || '', meta: `${n} مشاهد`, bg: on ? 'var(--color-accent-soft)' : 'transparent', border: on ? 'var(--color-accent)' : 'transparent', onClick: () => { this.toggleFilter('location', l.id); this.openEditor('location', l.id); }, onDragStart: drag('location', l.id) }; });
    if (tab === 'moodboards') items = L.moodboards.map(m => { const n = p.scenes.filter(s => s.moodboardIds.includes(m.id)).length; return { id: m.id, isAvatar: false, isImg: true, img: U.frameBg(this.coverOf(m), m.swatches[0] || '#d2a06a'), title: m.title, sub: `${m.images.length} صور · ${m.swatches.length} ألوان`, meta: n ? `مرتبطة بـ ${n}` : '', bg: 'transparent', border: 'transparent', onClick: () => this.openEditor('moodboard', m.id), onDragStart: drag('moodboard', m.id) }; });
    const inbox = L.inbox.map(it => { const sc = p.scenes.findIndex(s => s.id === it.sceneId); const d = new Date(it.createdAt); return { id: it.id, isImage: it.type === 'image', isNote: it.type === 'note', img: U.frameBg(it, '#d2a06a'), text: it.text, meta: `${U.pad2(d.getHours())}:${U.pad2(d.getMinutes())}${sc > -1 ? ' · للمشهد ' + U.pad2(sc + 1) : ''}`, onDragStart: e => this.dragStart(e, { kind: 'inbox', id: it.id }), onDragEnd: () => this.dragEnd() }; });
    const empty = { characters: ['user', 'لا شخصيات بعد', 'أضف شخصية أو اسحب قالب «شخصية» إلى اللوحة.'], locations: ['map-pin', 'لا مواقع بعد', 'أضف موقعاً ليظهر في قائمة مواقع المشاهد.'], moodboards: ['image', 'لا لوحات مزاج', 'اجمع صوراً وألواناً تحدد إحساس المشهد.'], inbox: ['phone', 'الوارد فارغ', 'الصور والملاحظات التي تلتقطها من الجوال تصل هنا.'] }[tab];
    return { tabs, tab, items, inbox, isInbox: tab === 'inbox', notInbox: tab !== 'inbox', isEmpty: tab === 'inbox' ? !inbox.length : !items.length, emptyIcon: empty[0], emptyTitle: empty[1], emptyDesc: empty[2],
      hasItems: tab !== 'inbox' && items.length > 0, hasInbox: tab === 'inbox' && inbox.length > 0,
      addLabel: { characters: '+ شخصية', locations: '+ موقع', moodboards: '+ لوحة مزاج', inbox: '' }[tab],
      onAdd: () => this.createFromTemplate({ characters: 'character', locations: 'location', moodboards: 'moodboard' }[tab], { where: 'library' }),
      onTab: v => this.setState({ libTab: v }) };
  },

  // ---------- pickers (EquipmentPicker) ----------
  picker(key, label, display, groups, onSet, o = {}) {
    const st = this.state, open = st.pick === key, customOpen = st.custom === key;
    return {
      key, label, display: display || 'اختر…', displayColor: display ? 'var(--color-text)' : 'var(--color-text-muted)', open, customOpen, customClosed: !customOpen,
      isPick: !o.multi, isMulti: !!o.multi, isText: false, isTextarea: false, isNumber: false, isStatus: false, hint: o.hint || '', hasHint: !!o.hint,
      chips: o.chips || [], hasChips: !!(o.chips && o.chips.length),
      groups: groups.filter(g => g.options.length).map(g => ({ label: g.label, options: g.options.map(op => ({ label: op.label, sub: op.sub || '', mark: op.active ? '✓' : '', bg: op.active ? 'var(--color-accent-soft)' : 'transparent', onPick: () => { onSet(op.value); if (!o.multi) this.setState({ pick: null }); } })) })),
      onToggle: () => this.setState({ pick: open ? null : key, custom: null, customVal: '' }),
      onCustomOpen: () => this.setState({ custom: key, customVal: '' }),
      customVal: st.customVal || '', onCustomChange: e => this.setState({ customVal: e.target.value }),
      onCustomKey: e => { if (e.key === 'Enter' && e.target.value.trim()) { onSet(e.target.value.trim()); this.setState({ pick: null, custom: null, customVal: '' }); } }
    };
  },
  field(key, label, kind, value, onChange, o = {}) {
    return { key, label, isPick: false, isMulti: false, isText: kind === 'text', isTextarea: kind === 'textarea', isNumber: kind === 'number', isStatus: kind === 'status', value: value ?? '', onChange, hint: o.hint || '', hasHint: !!o.hint, placeholder: o.placeholder || '', statuses: o.statuses || [], suffix: o.suffix || '', rows: o.rows || 3, groups: [], chips: [], hasChips: false };
  },
  eqOpts(role, current, multi) {
    const items = this.state.eq.items.filter(i => i.role === role);
    const has = v => multi ? (current || []).includes(v) : current === v;
    return [{ label: 'معداتي', options: items.map(i => ({ value: i.id, label: i.short || i.name, sub: i.short ? '' : [i.brand, i.model].filter(Boolean).join(' '), active: has(i.id) })) },
      { label: 'القائمة العامة', options: (C.GENERAL[role] || []).map(g => ({ value: g, label: g, active: has(g) })) }];
  },

  vmShotEditor(p, f) {
    const sh = f.sh, sc = f.sc, I = this.eqIndex(), cam = I[sh.cameraId], id = sh.id, secs = this.state.sections;
    const set = (patch, k) => this.upd('shot', id, patch, k);
    const fields = { basics: [], comp: [], cam: [], move: [], light: [], audio: [] };
    fields.basics.push(this.field('desc', 'الوصف (سطر واحد)', 'text', sh.desc, e => set({ desc: e.target.value }, 'desc'), { placeholder: 'ماذا يحدث في اللقطة؟' }));
    fields.basics.push(this.field('dur', 'المدة بالثواني', 'number', sh.duration, e => set({ duration: Math.max(0, Number(e.target.value) || 0) }, 'dur'), { suffix: U.mmss(sh.duration) }));
    fields.basics.push(this.field('status', 'الحالة', 'status', '', null, { statuses: C.ORDER.map(k => ({ k, label: C.STATUS[k].label, dot: C.STATUS[k].dot, ring: C.STATUS[k].ring, bg: this.chip(sh.status === k), fg: this.chipFg(sh.status === k), onClick: () => set({ status: k }) })) }));
    const sizeLbl = (C.SIZES.find(s => s[0] === sh.size) || [sh.size, sh.size]);
    fields.comp.push(this.picker('size', 'حجم اللقطة', sh.size ? `${sizeLbl[1]} (${sizeLbl[0]})` : '', [{ label: 'الأحجام', options: C.SIZES.map(s => ({ value: s[0], label: s[1], sub: s[0], active: sh.size === s[0] })) }], v => set({ size: v })));
    fields.comp.push(this.picker('angle', 'الزاوية', sh.angle, [{ label: 'الزوايا', options: C.ANGLES.map(a => ({ value: a, label: a, active: sh.angle === a })) }], v => set({ angle: v })));
    fields.cam.push(this.picker('camera', 'الكاميرا', this.eqName(sh.cameraId), this.eqOpts('camera', sh.cameraId), v => {
      const e = I[v]; const patch = { cameraId: v };
      if (e && e.lensIds) { patch.lens = e.defaultLensId; patch.focal = sh.focal && sh.focal >= 16 && sh.focal <= 50 ? sh.focal : 35; if (sh.supportId === 'sup-drone') patch.supportId = 'sup-benro'; }
      else if (e && e.builtinLenses) { patch.lens = e.builtinLenses[1]; patch.focal = 24; if (sh.supportId === 'sup-drone') patch.supportId = 'sup-osmo8'; }
      else if (v === 'cam-mini4') { patch.lens = null; patch.focal = 24; patch.supportId = 'sup-drone'; if (!I['sup-drone'].motions.includes(sh.movement)) patch.movement = 'ريفيل'; }
      else patch.lens = null;
      set(patch);
    }));
    if (cam && cam.lensIds) fields.cam.push(this.picker('lens', `العدسة (عدسات ${cam.short})`, this.eqName(sh.lens), [{ label: `عدسات ${cam.short}`, options: cam.lensIds.map(l => ({ value: l, label: this.eqName(l), sub: l === cam.defaultLensId ? 'الأساسية' : '', active: sh.lens === l })) }], v => set({ lens: v })));
    if (cam && cam.builtinLenses) fields.cam.push(this.picker('lens', 'العدسة المدمجة', sh.lens, [{ label: `عدسات ${cam.short}`, options: cam.builtinLenses.map(l => ({ value: l, label: l, active: sh.lens === l })) }], v => { const m = /\((\d+)mm\)/.exec(v); set({ lens: v, focal: m ? Number(m[1]) : sh.focal }); }));
    if (!(cam && (cam.fixedLens && !cam.zoomOnly))) fields.cam.push(this.field('focal', 'البعد البؤري', 'number', sh.focal, e => set({ focal: Number(e.target.value) || null }, 'focal'), { suffix: 'mm', hint: cam && cam.zoomOnly ? 'زوم مدمج — يكفي البعد البؤري' : cam && cam.builtinLenses ? 'يُحدَّد من العدسة المختارة' : '' }));
    if (cam && cam.fixedLens && !cam.zoomOnly) fields.cam.push(this.field('fixed', 'العدسة', 'text', 'عدسة ثابتة 24mm', () => {}, { hint: 'الدرون بعدسة ثابتة — لا حاجة لحقل عدسة' }));
    fields.cam.push(this.picker('filter', 'الفلتر', sh.filterId ? this.eqName(sh.filterId) : '', this.eqOpts('filter', sh.filterId), v => set({ filterId: v })));
    // movement — suggestions follow the selected support
    const sup = I[sh.supportId]; const sugg = (sup && sup.motions) || [];
    const moveGroups = [{ label: sup ? `مناسبة لـ ${sup.short || sup.name}` : 'مقترحة', options: sugg.map(m => ({ value: m, label: m, active: sh.movement === m })) }, { label: 'كل الحركات', options: C.MOVES.filter(m => !sugg.includes(m)).map(m => ({ value: m, label: m, active: sh.movement === m })) }];
    fields.move.push(this.picker('movement', 'نوع الحركة', sh.movement, moveGroups, v => set({ movement: v })));
    const supItems = this.state.eq.items.filter(i => i.role === 'support' && i.motions);
    const virt = this.state.eq.virtualSupports || [];
    fields.move.push(this.picker('support', 'معدّة الحركة', this.eqName(sh.supportId), [
      { label: 'معداتي', options: [...virt.filter(v => v.id !== 'sup-handheld'), ...supItems].map(i => ({ value: i.id, label: i.short || i.name, sub: (i.motions || []).slice(0, 3).join('، '), active: sh.supportId === i.id })) },
      { label: 'بدون معدّة', options: virt.filter(v => v.id === 'sup-handheld').map(i => ({ value: i.id, label: i.name, active: sh.supportId === i.id })) },
      { label: 'القائمة العامة', options: C.GENERAL.support.map(g => ({ value: g, label: g, active: sh.supportId === g })) }], v => set({ supportId: v })));
    const multi = (key, label, role, list) => this.picker(key, label, '', this.eqOpts(role, list, true), v => set(e => ({ [key]: e[key].includes(v) ? e[key].filter(x => x !== v) : [...e[key], v] })), { multi: true, chips: list.map(x => ({ label: this.eqName(x), onRemove: () => set(e => ({ [key]: e[key].filter(y => y !== x) })) })) });
    fields.light.push(multi('lightingIds', 'معدات الإضاءة', 'lighting', sh.lightingIds));
    fields.light.push(this.field('lightingMood', 'وصف المزاج', 'textarea', sh.lightingMood, e => set({ lightingMood: e.target.value }, 'lm'), { placeholder: 'مثلاً: ضوء دافئ ناعم من النافذة', rows: 2 }));
    fields.audio.push(multi('audioIds', 'معدات الصوت', 'audio', sh.audioIds));
    fields.audio.push(this.field('dialogue', 'الحوار', 'textarea', sh.dialogue, e => set({ dialogue: e.target.value }, 'dl'), { rows: 4, placeholder: 'نص الحوار إن وُجد' }));
    fields.audio.push(this.field('audioNotes', 'ملاحظات الصوت', 'textarea', sh.audioNotes, e => set({ audioNotes: e.target.value }, 'an'), { rows: 2 }));
    const titles = { basics: 'الأساسيات', comp: 'التكوين', cam: 'الكاميرا والعدسة', move: 'الحركة', light: 'الإضاءة والمزاج', audio: 'الصوت والحوار' };
    const icons = { basics: 'edit', comp: 'aperture', cam: 'camera', move: 'repeat', light: 'sun', audio: 'mic' };
    const sections = Object.keys(titles).map(k => ({ k, title: titles[k], icon: icons[k], open: !!secs[k], chev: secs[k] ? 'chevron-up' : 'chevron-down', fields: fields[k], onToggle: () => this.setState({ sections: { ...secs, [k]: !secs[k] } }) }));
    return { sections, refsOpen: !!secs.refs, refsChev: secs.refs ? 'chevron-up' : 'chevron-down', onRefsToggle: () => this.setState({ sections: { ...secs, refs: !secs.refs } }) };
  },

  vmGallery(owner, target, hex) {
    const over = this.state.dragOver; const isOver = over && over.kind === 'gallery';
    const imgs = owner.images || [];
    return {
      tiles: imgs.map((im, i) => ({ id: im.id, bg: U.frameBg(im, hex), isCover: (owner.coverImageId || (imgs[0] && imgs[0].id)) === im.id, star: (owner.coverImageId || (imgs[0] && imgs[0].id)) === im.id ? 'var(--color-accent)' : 'rgba(20,18,16,.55)', starFg: (owner.coverImageId || (imgs[0] && imgs[0].id)) === im.id ? '#141210' : '#fdfcfa', error: !!im.error, ok: !im.error,
        onCover: () => this.setCover(target, im.id), onRemove: () => this.removeImage(target, im.id), onRetry: () => this.retryUpload(target, im.id),
        onDragStart: e => this.dragStart(e, { kind: 'gimg', id: im.id, from: i }), onDragEnd: () => this.dragEnd(),
        onDragOver: e => { if (this.drag && this.drag.kind === 'gimg') { e.preventDefault(); e.stopPropagation(); } },
        onDrop: e => { e.preventDefault(); e.stopPropagation(); const d = this.drag; this.drag = null; if (d && d.kind === 'gimg' && d.from !== i) this.moveImage(target, d.from, i); } })),
      count: imgs.length, hasTiles: imgs.length > 0,
      dropBorder: isOver ? 'var(--color-accent)' : 'var(--color-border)', dropBg: isOver ? 'var(--color-accent-soft)' : 'transparent', dropText: isOver ? 'أفلت الصورة هنا' : 'اسحب صوراً أو الصق بـ Ctrl+V',
      onOver: e => { const d = this.drag; const files = e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'); if (!files && !(d && d.kind === 'inbox')) return; e.preventDefault(); this.setOver({ kind: 'gallery', id: target.id }); },
      onLeave: () => this.state.dragOver && this.state.dragOver.kind === 'gallery' && this.setState({ dragOver: null }),
      onDrop: e => { e.preventDefault(); const d = this.drag; this.drag = null; this.setState({ dragOver: null }); if (d && d.kind === 'inbox' && target.type === 'shot') this.inboxTo({ shotId: target.id }, d.id); else if (e.dataTransfer.files.length) this.addFiles(target, e.dataTransfer.files); },
      onFiles: e => { this.addFiles(target, e.target.files); e.target.value = ''; }
    };
  },

  vmEditor(p) {
    const ed = this.state.editor; if (!ed) return null;
    const e = this.ent(p, ed.type, ed.id); if (!e) return null;
    const base = { isShot: false, isScene: false, isChar: false, isLoc: false, isMb: false, isNote: false, hasNav: false, showGallery: false, close: () => this.closeEditor(), prev: () => this.editorNav(-1), next: () => this.editorNav(1) };
    const set = (patch, k) => this.upd(ed.type, ed.id, patch, k);
    const tf = (key, label, val, kind, o) => this.field(key, label, kind || 'text', val, ev => set({ [key]: ev.target.value }, key), o);
    const sceneLinks = test => p.scenes.map((s, i) => ({ s, i })).filter(x => test(x.s)).map(x => ({ id: x.s.id, label: `${U.pad2(x.i + 1)} · ${x.s.name}`, mood: this.moodHex(x.s.mood), onClick: () => this.openEditor('scene', x.s.id) }));
    if (ed.type === 'shot') {
      const f = this.findShot(p, ed.id); const list = this.allShots(p); const i = list.findIndex(x => x.sh.id === ed.id);
      const S = this.vmShotEditor(p, f);
      return { ...base, ...S, isShot: true, hasNav: true, kicker: `المشهد ${U.pad2(f.si + 1)} · ${f.sc.name}`, title: `اللقطة ${f.si + 1}.${f.hi + 1}`, pos: `${i + 1} / ${list.length}`, prevOp: i > 0 ? 1 : 0.35, nextOp: i < list.length - 1 ? 1 : 0.35,
        showGallery: S.refsOpen, gallery: this.vmGallery(e, { type: 'shot', id: e.id }, this.moodHex(f.sc.mood)), onDelete: () => this.deleteShot(e.id) };
    }
    if (ed.type === 'scene') {
      const si = p.scenes.indexOf(e); const L = p.library;
      return { ...base, isScene: true, hasNav: true, kicker: 'مشهد', title: `المشهد ${U.pad2(si + 1)}`, pos: `${si + 1} / ${p.scenes.length}`, prevOp: si > 0 ? 1 : 0.35, nextOp: si < p.scenes.length - 1 ? 1 : 0.35,
        name: e.name, onName: ev => set({ name: ev.target.value }, 'name'),
        summary: e.summary, onSummary: ev => set({ summary: ev.target.value }, 'sum'), goal: e.goal, onGoal: ev => set({ goal: ev.target.value }, 'goal'),
        ie: [['int', 'داخلي'], ['ext', 'خارجي']].map(([v, l]) => ({ label: l, bg: this.chip(e.intExt === v), fg: this.chipFg(e.intExt === v), onClick: () => set({ intExt: v }) })),
        dn: [['day', 'نهار'], ['night', 'ليل']].map(([v, l]) => ({ label: l, bg: this.chip(e.dayNight === v), fg: this.chipFg(e.dayNight === v), onClick: () => set({ dayNight: v }) })),
        locs: L.locations.map(l => ({ id: l.id, label: l.name, bg: this.chip(e.locationId === l.id), fg: this.chipFg(e.locationId === l.id), onClick: () => set({ locationId: e.locationId === l.id ? null : l.id }) })),
        onNewLoc: () => { let nid; this.mutate(pp => { nid = this.createEntity(pp, 'location'); this.ent(pp, 'scene', e.id).locationId = nid; }); },
        chars: L.characters.map(c => { const on = e.characterIds.includes(c.id); return { id: c.id, av: this.vmAvatar(c), name: c.name, ring: on ? 'var(--color-accent)' : 'transparent', op: on ? 1 : 0.45, onClick: () => set(x => ({ characterIds: on ? x.characterIds.filter(y => y !== c.id) : [...x.characterIds, c.id] })) }; }),
        onNewChar: () => { this.mutate(pp => { const nid = this.createEntity(pp, 'character'); this.ent(pp, 'scene', e.id).characterIds.push(nid); }); },
        moods: C.MOODS.map(m => ({ k: m, hex: this.moodHex(m), name: this.moodName(m), ring: e.mood === m ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-text)' : 'none', onClick: () => set({ mood: m }) })),
        moodLabel: this.moodName(e.mood), customMood: /^#/.test(e.mood) ? e.mood : '#8a7a66', onCustomMood: ev => set({ mood: ev.target.value }, 'mood'),
        shotThumbs: e.shots.map((sh, hi) => ({ id: sh.id, num: `${si + 1}.${hi + 1}`, desc: sh.desc || 'بدون وصف', dur: U.mmss(sh.duration), bg: U.frameBg(this.coverOf(sh), this.moodHex(e.mood)), onClick: () => this.openEditor('shot', sh.id),
          onDragStart: ev => this.dragStart(ev, { kind: 'eshot', id: sh.id }), onDragEnd: () => this.dragEnd(), onDragOver: ev => { if (this.drag && this.drag.kind === 'eshot') ev.preventDefault(); },
          onDrop: ev => { ev.preventDefault(); const d = this.drag; this.drag = null; if (d && d.kind === 'eshot' && d.id !== sh.id) this.moveShot(d.id, e.id, hi); } })),
        hasShots: e.shots.length > 0, noShots: !e.shots.length, onAddShot: () => this.addShot(e.id), dur: U.mmss(this.sceneDur(e)),
        attached: [...e.noteIds.map(id => { const n = p.notes.find(x => x.id === id); return n && { id, icon: 'file', label: n.text || 'ملاحظة فارغة', onOpen: () => this.openEditor('note', id), onRemove: () => this.unlink(e.id, 'note', id) }; }), ...e.moodboardIds.map(id => { const m = L.moodboards.find(x => x.id === id); return m && { id, icon: 'image', label: m.title, onOpen: () => this.openEditor('moodboard', id), onRemove: () => this.unlink(e.id, 'moodboard', id) }; })].filter(Boolean),
        hasAttached: e.noteIds.length + e.moodboardIds.length > 0, noAttached: e.noteIds.length + e.moodboardIds.length === 0,
        onDelete: () => this.deleteScene(e.id) };
    }
    if (ed.type === 'character') return { ...base, isChar: true, kicker: 'شخصية', title: e.name || 'شخصية', showGallery: true, gallery: this.vmGallery(e, { type: 'character', id: e.id }, '#d2a06a'), galleryLabel: 'الصور',
      fields: [tf('name', 'الاسم', e.name), tf('role', 'الدور', e.role), tf('desc', 'وصف قصير', e.desc, 'textarea', { rows: 2 }), tf('wardrobe', 'اللبس', e.wardrobe, 'textarea', { rows: 2 }), tf('notes', 'ملاحظات', e.notes, 'textarea', { rows: 3 })],
      scenes: sceneLinks(s => s.characterIds.includes(e.id)), scenesTitle: 'مشاهدها', onFilter: () => this.toggleFilter('character', e.id) };
    if (ed.type === 'location') return { ...base, isLoc: true, kicker: 'موقع', title: e.name || 'موقع', showGallery: true, gallery: this.vmGallery(e, { type: 'location', id: e.id }, '#d2a06a'), galleryLabel: 'الصور',
      fields: [tf('name', 'الاسم', e.name), tf('address', 'العنوان', e.address), tf('mapUrl', 'رابط الخريطة', e.mapUrl, 'text', { placeholder: 'https://maps…' }), tf('notes', 'ملاحظات', e.notes, 'textarea', { rows: 3 })],
      scenes: sceneLinks(s => s.locationId === e.id), scenesTitle: 'مشاهده' };
    if (ed.type === 'moodboard') return { ...base, isMb: true, kicker: 'لوحة مزاج', title: e.title, showGallery: true, gallery: this.vmGallery(e, { type: 'moodboard', id: e.id }, e.swatches[0] || '#d2a06a'), galleryLabel: 'الصور',
      fields: [tf('title', 'العنوان', e.title)],
      swatches: e.swatches.map((c, i) => ({ k: i, c, onChange: ev => set(x => { const s = [...x.swatches]; s[i] = ev.target.value; return { swatches: s }; }, 'sw' + i), onRemove: () => set(x => ({ swatches: x.swatches.filter((_, j) => j !== i) })) })),
      onAddSwatch: () => set(x => ({ swatches: [...x.swatches, '#a97c49'] })) };
    if (ed.type === 'note') { const si = p.scenes.findIndex(s => s.noteIds.includes(e.id)); return { ...base, isNote: true, kicker: 'ملاحظة', title: si > -1 ? `ملاحظة · المشهد ${U.pad2(si + 1)}` : 'ملاحظة', text: e.text, onText: ev => set({ text: ev.target.value }, 'text') }; }
    return null;
  },

  // ---------- export ----------
  shotTableCols() { return [{ key: 'num', label: 'الرقم' }, { key: 'scene', label: 'المشهد' }, { key: 'desc', label: 'الوصف', align: 'right' }, { key: 'size', label: 'الحجم' }, { key: 'angle', label: 'الزاوية' }, { key: 'cam', label: 'الكاميرا والعدسة' }, { key: 'move', label: 'الحركة' }, { key: 'light', label: 'الإضاءة' }, { key: 'audio', label: 'الصوت' }, { key: 'dur', label: 'المدة' }, { key: 'status', label: 'الحالة' }]; },
  shotTableRows() { return this.allShots().map(x => ({ num: x.num, scene: `${U.pad2(x.si + 1)} ${x.sc.name}`, desc: x.sh.desc, size: x.sh.size, angle: x.sh.angle, cam: this.camLine(x.sh), move: this.moveLine(x.sh), light: x.sh.lightingIds.map(i => this.eqName(i)).join('، '), audio: x.sh.audioIds.map(i => this.eqName(i)).join('، '), dur: U.mmss(x.sh.duration), status: (C.STATUS[x.sh.status] || {}).label })); },
  vmExport(p) {
    const st = this.state, tab = st.exportTab, sel = st.exportSel;
    const scenes = p.scenes.map((s, i) => ({ id: s.id, label: `${U.pad2(i + 1)} · ${s.name}`, checked: st.exportScope === 'all' || sel.includes(s.id), onChange: v => this.setState({ exportScope: 'some', exportSel: v ? [...new Set([...(st.exportScope === 'all' ? p.scenes.map(x => x.id) : sel), s.id])] : (st.exportScope === 'all' ? p.scenes.map(x => x.id) : sel).filter(x => x !== s.id) }) }));
    const shots = this.allShots(p).filter(x => st.exportScope === 'all' || sel.includes(x.sc.id));
    const per = 4, pages = [];
    for (let i = 0; i < shots.length; i += per) pages.push(shots.slice(i, i + per));
    const nScenes = new Set(shots.map(x => x.sc.id)).size;
    const vPages = pages.map((pg, pi) => ({ k: pi, pageNo: `${pi + 1} / ${pages.length}`, items: pg.map(x => ({ id: x.sh.id, num: x.num, scene: `المشهد ${U.pad2(x.si + 1)} · ${x.sc.name}`, desc: x.sh.desc || 'بدون وصف', bg: U.frameBg(this.coverOf(x.sh), this.moodHex(x.sc.mood)), cam: this.camLine(x.sh) || '—', move: this.moveLine(x.sh) || '—', light: x.sh.lightingMood || x.sh.lightingIds.map(i => this.eqName(i)).join('، ') || 'ضوء متاح', dur: U.mmss(x.sh.duration) })) }));
    const opts = [['pdf', 'ستوري بورد PDF', 'A4 أفقي بأسلوب لوحة القصة المرئية', 'film'], ['table', 'قائمة اللقطات', 'جدول — PDF أو Excel', 'file'], ['project', 'نسخة المشروع كاملة', 'ملف واحد بكل البيانات والصور', 'folder']].map(([v, t, d, ic]) => ({ v, title: t, desc: d, icon: ic, border: tab === v ? 'var(--color-accent)' : 'var(--color-border)', bg: tab === v ? 'var(--color-accent-soft)' : 'var(--color-bg)', onClick: () => this.setState({ exportTab: v }) }));
    const imgCount = p.scenes.reduce((a, s) => a + s.shots.reduce((b, h) => b + h.images.length, 0), 0) + p.library.locations.reduce((a, l) => a + l.images.length, 0) + p.library.moodboards.reduce((a, m) => a + m.images.length, 0);
    return { opts, isPdf: tab === 'pdf', isTable: tab === 'table', isProject: tab === 'project', pages: vPages, nScenes: U.pad2(nScenes), nPages: pages.length, scenes,
      scopeAll: st.exportScope === 'all', scopeSome: st.exportScope !== 'all', onScopeAll: () => this.setState({ exportScope: 'all' }), onScopeSome: () => this.setState({ exportScope: 'some', exportSel: st.exportSel.length ? st.exportSel : p.scenes.map(s => s.id) }),
      cols: this.shotTableCols(), rows: this.shotTableRows(),
      summary: [['المشاهد', p.scenes.length], ['اللقطات', this.allShots(p).length], ['الصور', imgCount], ['عناصر المكتبة', p.library.characters.length + p.library.locations.length + p.library.moodboards.length], ['المدة', U.mmss(p.scenes.reduce((a, s) => a + this.sceneDur(s), 0))]].map(([k, v]) => ({ k, v: String(v) })),
      fileName: `${p.name}.sbproj.json` };
  },

  // ---------- presentation ----------
  vmPresent(p) {
    const pr = this.state.present; const list = this.allShots(p); if (!list.length) return { has: false, none: true };
    const i = Math.min(pr.i, list.length - 1); const x = list[i]; const ar = C.AR[p.aspect] || 16 / 9; const hex = this.moodHex(x.sc.mood);
    const total = list.reduce((a, y) => a + (Number(y.sh.duration) || 0), 0);
    return { has: true, none: false, num: x.num, sceneNum: U.pad2(x.si + 1), sceneName: x.sc.name, desc: x.sh.desc || 'بدون وصف', bg: U.frameBg(this.coverOf(x.sh), hex), noImg: !this.coverOf(x.sh), ar: `${ar}`,
      counter: `لقطة ${i + 1} من ${list.length}`, dur: U.mmss(x.sh.duration), total: U.mmss(total),
      tech: pr.tech, techLabel: pr.tech ? 'إخفاء التفاصيل' : 'التفاصيل التقنية',
      techRows: [['camera', 'الكاميرا', this.camLine(x.sh)], ['repeat', 'الحركة', this.moveLine(x.sh)], ['aperture', 'الحجم والزاوية', `${x.sh.size} · ${x.sh.angle}`], ['sun', 'الإضاءة', x.sh.lightingMood || x.sh.lightingIds.map(id => this.eqName(id)).join('، ') || '—'], ['mic', 'الصوت', x.sh.audioIds.map(id => this.eqName(id)).join('، ') || '—']].map(([icon, k, v]) => ({ icon, k, v: v || '—' })),
      hasDialogue: !!x.sh.dialogue, dialogue: x.sh.dialogue,
      playIcon: pr.playing ? 'pause' : 'play', playLabel: pr.playing ? 'إيقاف' : 'تشغيل تلقائي',
      segs: list.map((y, j) => ({ k: y.sh.id, grow: Math.max(1, Number(y.sh.duration) || 1), c: this.moodHex(y.sc.mood), op: j < i ? 1 : j === i ? 1 : 0.28, fillW: j < i ? '100%' : j === i ? (pr.playing ? (pr.fill ? '100%' : '0%') : '100%') : '0%', fillT: j === i && pr.playing && pr.fill ? `width ${(Number(y.sh.duration) || 3) * 1000}ms linear` : 'none', onClick: () => this.presGo(j) })),
      prev: () => this.presGo(i - 1), next: () => this.presGo(i + 1), toggle: () => this.presToggle(), toggleTech: () => this.setState({ present: { ...pr, tech: !pr.tech } }), close: () => this.closePresent() };
  },

  // ---------- equipment page ----------
  vmEquipment() {
    const st = this.state, eq = st.eq, q = (st.eqSearch || '').trim();
    const hit = i => !q || [i.name, i.brand, i.model, i.use].filter(Boolean).join(' ').includes(q);
    const groups = eq.categories.map(cat => {
      const items = eq.items.filter(i => i.category === cat && hit(i));
      return { cat, count: items.reduce((a, i) => a + (i.qty || 1), 0), items: items.map(i => ({ id: i.id, icon: C.EQ_ICON[i.icon] || C.ROLE_ICON || 'camera', name: i.name, sub: [i.brand, i.model].filter(Boolean).join(' · ') || '—', use: i.use || '', qty: `×${i.qty || 1}`, role: eq.roles[i.role] || i.role, isDefault: !!i.default, onEdit: () => this.setState({ eqEdit: { ...i } }), onDelete: () => this.askConfirm({ title: 'حذف القطعة؟', msg: `ستُحذف «${i.name}» من معداتي ولن تظهر في قوائم اللقطات.`, ok: 'حذف', danger: true, onOk: () => this.saveEq({ ...this.state.eq, items: this.state.eq.items.filter(x => x.id !== i.id) }) }) })) };
    }).filter(g => g.items.length);
    const total = eq.items.reduce((a, i) => a + (i.qty || 1), 0);
    const d = st.eqEdit;
    return { groups, total: `${total} قطعة`, empty: !groups.length, search: st.eqSearch || '', onSearch: e => this.setState({ eqSearch: e.target.value }),
      onAdd: () => this.setState({ eqEdit: { id: null, name: '', brand: '', model: '', use: '', qty: 1, role: 'other', category: eq.categories[0], icon: 'box' } }),
      editing: !!d, edit: d ? { title: d.id ? 'تعديل قطعة' : 'قطعة جديدة', name: d.name, brand: d.brand || '', model: d.model || '', use: d.use || '', qty: d.qty || 1, role: d.role, category: d.category,
        roleOpts: Object.keys(eq.roles).map(k => ({ value: k, label: eq.roles[k] })), catOpts: eq.categories.map(c => ({ value: c, label: c })),
        on: k => e => this.setState({ eqEdit: { ...this.state.eqEdit, [k]: k === 'qty' ? Number(e.target.value) || 1 : e.target.value } }),
        save: () => { const x = this.state.eqEdit; if (!x.name.trim()) return; const items = [...eq.items]; if (x.id) items[items.findIndex(i => i.id === x.id)] = x; else items.push({ ...x, id: U.uid('eq') }); this.saveEq({ ...eq, items }); this.setState({ eqEdit: null }); this.toast(x.id ? 'حُفظت التعديلات' : 'أُضيفت القطعة'); },
        cancel: () => this.setState({ eqEdit: null }) } : null,
      onImportFile: e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(r.result); const list = j.items || (j.groups || []).flatMap(g => g.items.map(i => ({ ...i, category: g.category }))); if (!list.length) throw 0; const key = i => (i.name + '|' + (i.model || '')); const have = new Set(eq.items.map(key)); this.setState({ eqImport: list.map(i => ({ ...i, isNew: !have.has(key(i)) })) }); } catch (_) { this.toast('تعذّرت قراءة الملف', { tone: 'danger' }); } }; r.readAsText(f); e.target.value = ''; },
      importing: !!st.eqImport, imp: st.eqImport ? { rows: st.eqImport.map((i, k) => ({ k, name: i.name, sub: [i.brand, i.model].filter(Boolean).join(' · '), tag: i.isNew ? 'جديدة' : 'موجودة', tone: i.isNew ? 'accent' : 'outline' })), newCount: st.eqImport.filter(i => i.isNew).length, total: st.eqImport.length,
        confirm: () => { const add = this.state.eqImport.filter(i => i.isNew).map(i => ({ ...i, id: i.id && !this.eqIndex()[i.id] ? i.id : U.uid('eq'), category: eq.categories.includes(i.category) ? i.category : eq.categories[eq.categories.length - 1], role: i.role || 'other' })); this.saveEq({ ...eq, items: [...eq.items, ...add] }); this.setState({ eqImport: null }); this.toast(`استُوردت ${add.length} قطعة`); },
        cancel: () => this.setState({ eqImport: null }) } : null };
  },

  vmTrash() {
    const d = this.state.data; const T = { scene: 'مشهد', shot: 'لقطة', note: 'ملاحظة' };
    const items = d.trash.map(t => { const left = U.daysLeft(t.deletedAt); const pr = d.projects.find(x => x.id === t.projectId); const extra = t.type === 'scene' ? ((t.payload.scene || t.payload).shots || []).length : 0; return { id: t.id, type: T[t.type] || t.type, label: t.label, project: pr ? pr.name : '', date: U.fmtDate(t.deletedAt), left: `باقي ${left} يوماً`, leftColor: left <= 5 ? 'var(--color-danger)' : 'var(--color-text-muted)', extra: extra ? `يُستعاد مع ${extra} لقطات` : '', hasExtra: !!extra, onRestore: () => this.restore(t.id), onPurge: () => this.purge(t.id) }; });
    return { items, empty: !items.length, has: items.length > 0 };
  }
};

window.SB = { C, util, core, view };
})();
})();
