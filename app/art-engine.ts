export const WIDTH = 1200;
export const HEIGHT = 900;
export const PAPERS = ['#eee9df', '#f7f3e9', '#242129', '#bbc8cd', '#d9b8a6'];
export const TOOLS = ['ink', 'pastel', 'charcoal', 'wash', 'thread', 'eraser'] as const;
export type Tool = typeof TOOLS[number];
export type Point = { x: number; y: number; p: number };
export type Mark = { id: string; tool: Tool | 'clear'; color: string; width: number; opacity: number; points: Point[]; closed?: boolean; fill?: string };
export type Artwork = { id: string; title: string; paper: string; marks: Mark[]; redo: Mark[]; origin: 'human' | 'aether' | 'dialogue'; parentId?: string; caption?: string; baseImage?: string; createdAt: string };
export type Message = { id: string; role: 'user' | 'assistant'; content: string; artworkId?: string };
export type Journey = { version: 2; id: string; artworks: Artwork[]; messages: Message[] };
export const uid = () => crypto.randomUUID();
export function newArtwork(paper = PAPERS[0]): Artwork { return { id: uid(), title: '未命名的片刻', paper, marks: [], redo: [], origin: 'human', createdAt: new Date().toISOString() }; }
export function appendMark(art: Artwork, mark: Mark): Artwork { return { ...art, marks: [...art.marks, mark], redo: [] }; }
export function undo(art: Artwork): Artwork { const mark = art.marks.at(-1); return mark ? { ...art, marks: art.marks.slice(0, -1), redo: [...art.redo, mark] } : art; }
export function redo(art: Artwork): Artwork { const mark = art.redo.at(-1); return mark ? { ...art, marks: [...art.marks, mark], redo: art.redo.slice(0, -1) } : art; }
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function normalizeDrawing(raw: unknown): { title: string; caption: string; paper: string; marks: Mark[] } {
  const plan = record(raw);
  if (!Array.isArray(plan.strokes) || plan.strokes.length > 96) throw new Error('回画的笔触格式不完整，请重新尝试。');
  const marks: Mark[] = plan.strokes.map((value, index) => {
    const stroke = record(value);
    if (!TOOLS.includes(stroke.tool as Tool) || stroke.tool === 'eraser' || !hex(stroke.color) || !Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 240) throw new Error('回画包含无法绘制的笔触，请重新尝试。');
    const points = stroke.points.map((value: unknown) => {
      if (!Array.isArray(value) || value.length < 2 || !value.slice(0, 2).every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('回画坐标无效。');
      return { x: clamp(value[0] as number, -120, WIDTH + 120), y: clamp(value[1] as number, -90, HEIGHT + 90), p: typeof value[2] === 'number' && Number.isFinite(value[2]) ? clamp(value[2], .1, 1) : .6 };
    });
    if (typeof stroke.width !== 'number' || !Number.isFinite(stroke.width)) throw new Error('回画笔宽无效。');
    return { id: 'ai-' + index, tool: stroke.tool as Tool, color: stroke.color, width: clamp(stroke.width, 1, 150), opacity: typeof stroke.opacity === 'number' && Number.isFinite(stroke.opacity) ? clamp(stroke.opacity, .05, 1) : .8, points, closed: stroke.closed === true, ...(hex(stroke.fill) ? { fill: stroke.fill } : {}) };
  });
  if (!marks.length) throw new Error('Aether 还没有画下笔触，请再试一次。');
  return { title: typeof plan.title === 'string' ? plan.title.slice(0, 60) : '一幅回画', caption: typeof plan.caption === 'string' ? plan.caption.slice(0, 600) : '', paper: hex(plan.paper) ? plan.paper : PAPERS[0], marks };
}
function seedRandom(text: string) { let seed = 2166136261; for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; }; }
function trace(ctx: CanvasRenderingContext2D, points: Point[], offset = 0) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0].x + offset, points[0].y - offset);
  for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; ctx.quadraticCurveTo(a.x + offset, a.y - offset, (a.x + b.x) / 2 + offset, (a.y + b.y) / 2 - offset); }
  const end = points[points.length - 1]; ctx.lineTo(end.x + offset, end.y - offset);
}
export function paintMark(ctx: CanvasRenderingContext2D, mark: Mark) {
  if (mark.tool === 'clear') { ctx.clearRect(0, 0, WIDTH, HEIGHT); return; }
  if (!mark.points.length) return;
  ctx.save(); ctx.globalAlpha = mark.opacity; ctx.strokeStyle = mark.color; ctx.fillStyle = mark.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mark.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
  if (mark.fill && mark.closed) { trace(ctx, mark.points); ctx.closePath(); ctx.fillStyle = mark.fill; ctx.fill(); ctx.fillStyle = mark.color; }
  if (mark.tool === 'thread' || mark.tool === 'wash') {
    const passes = mark.tool === 'thread' ? 3 : 4;
    ctx.globalAlpha = mark.opacity / (mark.tool === 'wash' ? 7 : 2);
    for (let n = 0; n < passes; n++) { trace(ctx, mark.points, (n - 1) * (mark.tool === 'thread' ? 1.4 : 1.8)); if (mark.closed) ctx.closePath(); ctx.lineWidth = mark.tool === 'thread' ? Math.max(.6, mark.width / 12) : mark.width * (1 - n * .15); ctx.stroke(); }
  } else {
    const random = seedRandom(mark.id);
    const points = mark.points.length === 1 ? [mark.points[0], { ...mark.points[0], x: mark.points[0].x + .1 }] : mark.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], distance = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1.8, mark.width / 8)));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, radius = Math.max(.6, mark.width * (.4 + (a.p + (b.p - a.p) * t) * .8) / 2);
        if (mark.tool === 'charcoal' || mark.tool === 'pastel') {
          const count = mark.tool === 'charcoal' ? 14 : 21;
          ctx.globalAlpha = mark.opacity * (mark.tool === 'charcoal' ? .35 : .64);
          for (let grain = 0; grain < count; grain++) { const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * radius; ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * r, y + Math.sin(angle) * r, Math.max(.5, radius * (.05 + random() * .21)), Math.max(.4, radius * (.03 + random() * .12)), random() * 3, 0, Math.PI * 2); ctx.fill(); }
        } else { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }
  ctx.restore();
}
export function paintMarks(ctx: CanvasRenderingContext2D, marks: Mark[]) { for (const mark of marks) paintMark(ctx, mark); }
export async function paintArtwork(canvas: HTMLCanvasElement, art: Artwork, paper = true): Promise<void> {
  canvas.width = WIDTH; canvas.height = HEIGHT; const ctx = canvas.getContext('2d'); if (!ctx) return;
  if (art.baseImage) { const image = new Image(); image.src = art.baseImage; await image.decode(); ctx.drawImage(image, 0, 0, WIDTH, HEIGHT); }
  paintMarks(ctx, art.marks);
  if (paper) { ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = art.paper; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore(); }
}
export async function artworkImage(art: Artwork, size = 1000): Promise<string> { const canvas = document.createElement('canvas'); await paintArtwork(canvas, art); const scaled = document.createElement('canvas'); scaled.width = size; scaled.height = size * HEIGHT / WIDTH; scaled.getContext('2d')?.drawImage(canvas, 0, 0, scaled.width, scaled.height); return scaled.toDataURL('image/png'); }
export function hasMarks(art: Artwork) { const lastClear = art.marks.findLastIndex(mark => mark.tool === 'clear'); return art.marks.slice(lastClear + 1).some(mark => mark.tool !== 'eraser') || Boolean(art.baseImage && lastClear < 0); }
export function importJourney(raw: unknown): Journey {
  const value = record(raw);
  if (value.version !== 2 || !Array.isArray(value.artworks) || !Array.isArray(value.messages) || value.artworks.length > 100 || value.messages.length > 1000) throw new Error('请选择从新版 Aether 导出的 .json 旅程文件。');
  const ids = new Set<string>();
  const artworks = value.artworks.map(item => {
    const art = record(item);
    if (typeof art.id !== 'string' || ids.has(art.id) || !hex(art.paper) || !Array.isArray(art.marks) || art.marks.length > 12000) throw new Error('作品数据不完整或过大。');
    ids.add(art.id);
    for (const rawMark of art.marks) {
      const m = record(rawMark);
      if (typeof m.id !== 'string' || !m.id || !(TOOLS as readonly string[]).concat('clear').includes(String(m.tool)) || !hex(m.color) || typeof m.width !== 'number' || !Number.isFinite(m.width) || m.width < 0 || m.width > 160 || typeof m.opacity !== 'number' || m.opacity < 0 || m.opacity > 1 || !Number.isFinite(m.opacity) || !Array.isArray(m.points) || m.points.length > 6000 || (m.fill !== undefined && !hex(m.fill))) throw new Error('笔触数据不完整。');
      for (const point of m.points) { const p = record(point); if (![p.x, p.y, p.p].every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(p.x as number) > 10000 || Math.abs(p.y as number) > 10000 || (p.p as number) < 0 || (p.p as number) > 1) throw new Error('笔触坐标无效。'); }
    }
    if (art.baseImage && (typeof art.baseImage !== 'string' || art.baseImage.length > 8_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(art.baseImage))) throw new Error('作品图片格式无效。');
    return { id: art.id, title: typeof art.title === 'string' ? art.title.slice(0, 100) : '未命名的片刻', paper: art.paper, marks: art.marks as Mark[], redo: [], origin: ['human', 'aether', 'dialogue'].includes(String(art.origin)) ? art.origin as Artwork['origin'] : 'human', ...(typeof art.parentId === 'string' ? { parentId: art.parentId } : {}), ...(typeof art.caption === 'string' ? { caption: art.caption.slice(0, 1000) } : {}), ...(typeof art.baseImage === 'string' ? { baseImage: art.baseImage } : {}), createdAt: typeof art.createdAt === 'string' ? art.createdAt : new Date().toISOString() };
  });
  const messageIds = new Set<string>();
  const messages = value.messages.map(item => { const m = record(item); if (typeof m.id !== 'string' || !m.id || messageIds.has(m.id) || !['user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || m.content.length > 30000) throw new Error('对话数据格式无效。'); messageIds.add(m.id); return { id: m.id, role: m.role as Message['role'], content: m.content, ...(typeof m.artworkId === 'string' && ids.has(m.artworkId) ? { artworkId: m.artworkId } : {}) }; });
  return { version: 2, id: uid(), artworks, messages };
}
export function nextQuestionStyle(text: string, current: 'natural' | 'fewer' | 'none') {
  if (/不要.{0,5}(提问|问我|再问)|不.{0,3}提问|别.{0,3}问/.test(text)) return 'none';
  if (/少.{0,3}问|减少.{0,3}提问/.test(text)) return 'fewer';
  if (/可以.{0,4}问|继续.{0,3}问|允许.{0,3}提问/.test(text)) return 'natural';
  return current;
}

export async function artworkRegionImage(art: Artwork, region: { x: number; y: number; w: number; h: number }): Promise<string> {
  const canvas = document.createElement('canvas'); await paintArtwork(canvas, art);
  const x = clamp(region.x, 0, WIDTH - 1), y = clamp(region.y, 0, HEIGHT - 1), w = clamp(region.w, 1, WIDTH - x), h = clamp(region.h, 1, HEIGHT - y);
  const crop = document.createElement('canvas'), scale = Math.min(2, 640 / Math.max(w, h));
  crop.width = Math.max(1, Math.round(w * scale)); crop.height = Math.max(1, Math.round(h * scale));
  crop.getContext('2d')?.drawImage(canvas, x, y, w, h, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/png');
}
