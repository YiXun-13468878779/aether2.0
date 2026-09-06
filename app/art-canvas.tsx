'use client';
import { useEffect, useRef, type PointerEvent } from 'react';
import { WIDTH, HEIGHT, paintArtwork, paintMark, uid, type Artwork, type Mark, type Tool, type Point } from './art-engine';
export type Region = { x: number; y: number; w: number; h: number };
const paths: Record<string, string> = {
  home: 'M3 11 12 3l9 8M6 9v12h12V9M10 21v-7h4v7',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  arrow: 'M4 12h16M14 6l6 6-6 6', back: 'M20 12H4M10 6l-6 6 6 6',
  plus: 'M12 4v16M4 12h16', close: 'm5 5 14 14M19 5 5 19',
  undo: 'M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7', redo: 'm15 5 6 6-6 6M21 11H11a7 7 0 0 0-7 7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', upload: 'M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4',
  chat: 'M4 4h16v13H9l-5 4z', expand: 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5',
  settings: 'M4 7h16M4 17h16M9 4v6m6 4v6', copy: 'M8 8h13v13H8zM16 4V2H2v14h2',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  ink: 'm4 20 4-10L18 2l4 4-9 10-9 4zm4-10 5 6', pastel: 'm4 17 9-14 7 5-9 14-7-5zm2-3 7 5',
  charcoal: 'm3 17 11-14 7 5-11 14-7-5zm3-4 7 5m0-10 4 3', wash: 'M12 2C8 8 4 11 4 15a8 8 0 0 0 16 0c0-4-4-7-8-13zM8 14c-1 3 1 5 3 5',
  thread: 'M3 18C6 2 14 1 12 12S20 25 21 5', eraser: 'm4 14 9-11 9 7-10 12H9l-5-5zM9 8l9 7M12 22h10', trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.spark} /></svg>; }
export function ArtPreview({ art, className = '' }: { art: Artwork; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { let current = true; const canvas = document.createElement('canvas'); void paintArtwork(canvas, art).then(() => { const target = ref.current; if (!current || !target) return; target.width = WIDTH; target.height = HEIGHT; target.getContext('2d')?.drawImage(canvas, 0, 0); }).catch(() => {}); return () => { current = false; }; }, [art]);
  return <canvas ref={ref} width={WIDTH} height={HEIGHT} className={'art-preview ' + className} role="img" aria-label={art.title} style={{ backgroundColor: art.paper }} />;
}
export function DrawingSurface({ art, tool, color, width, opacity, onMark, onUndo, onRedo, selecting = false, region, onRegion }: { selecting?: boolean; region?: Region; onRegion?: (region: Region) => void; art: Artwork; tool: Tool; color: string; width: number; opacity: number; onMark: (mark: Mark) => void; onUndo: () => void; onRedo: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), cursorRef = useRef<HTMLDivElement>(null);
  const regionStart = useRef<Point | null>(null), regionBox = useRef<HTMLDivElement>(null);
  const pending = useRef<Mark | null>(null), baseline = useRef<HTMLCanvasElement | null>(null), ready = useRef(false), pointer = useRef<number | null>(null);
  useEffect(() => {
    let active = true; ready.current = false;
    const buffer = document.createElement('canvas');
    void paintArtwork(buffer, art, false).then(() => {
      const target = canvasRef.current; if (!active || !target) return; const ctx = target.getContext('2d'); ctx?.clearRect(0, 0, WIDTH, HEIGHT); ctx?.drawImage(buffer, 0, 0); baseline.current = buffer; ready.current = true;
    }).catch(() => { ready.current = false; });
    return () => { active = false; };
  }, [art]);
  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) / rect.width * WIDTH));
    const y = Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) / rect.height * HEIGHT));
    const previous = pending.current?.points.at(-1);
    const speed = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
    return { x, y, p: event.pointerType === 'pen' ? Math.max(.1, event.pressure) : Math.max(.45, .8 - speed / 300) };
  }
  function preview() { const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !baseline.current || !pending.current) return; ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(baseline.current, 0, 0); paintMark(ctx, pending.current); }
  function box(a: Point, b: Point): Region { return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.max(20,Math.abs(a.x-b.x)), h: Math.max(20,Math.abs(a.y-b.y)) }; }
  function showBox(r: Region) { const el = regionBox.current; if (el) { el.style.display = 'block'; el.style.left = r.x / WIDTH * 100 + '%'; el.style.top = r.y / HEIGHT * 100 + '%'; el.style.width = Math.min(r.w, WIDTH-r.x) / WIDTH * 100 + '%'; el.style.height = Math.min(r.h,HEIGHT-r.y) / HEIGHT * 100 + '%'; } }
  function finish(event: PointerEvent<HTMLCanvasElement>) { if (regionStart.current) { onRegion?.(box(regionStart.current, point(event))); regionStart.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return; } if (pointer.current !== event.pointerId || !pending.current) return; const mark = pending.current; pending.current = null; pointer.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onMark(mark); }
  return <div className="art-paper" style={{ backgroundColor: art.paper }}>
    <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} tabIndex={0} aria-roledescription="绘画画布" aria-label="自由创作画布，按 Command 或 Control 加 Z 撤销，加 Shift 重做" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) onRedo(); else onUndo(); } }}
      onPointerDown={event => { if (!event.isPrimary || event.button !== 0 || !ready.current || pointer.current !== null) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId; if (selecting) { regionStart.current = point(event); pointer.current = null; showBox(box(regionStart.current, regionStart.current)); return; } pending.current = { id: uid(), tool, color, width, opacity, points: [point(event)] }; preview(); }}
      onPointerMove={event => { if (regionStart.current) { showBox(box(regionStart.current, point(event))); return; } const rect = event.currentTarget.getBoundingClientRect(); if (cursorRef.current) { cursorRef.current.style.left = event.clientX - rect.left + 'px'; cursorRef.current.style.top = event.clientY - rect.top + 'px'; cursorRef.current.style.width = Math.max(5, width * rect.width / WIDTH) + 'px'; cursorRef.current.style.height = Math.max(5, width * rect.width / WIDTH) + 'px'; cursorRef.current.style.opacity = '1'; } if (pointer.current !== event.pointerId || !pending.current) return; const next = point(event), last = pending.current.points.at(-1); if (!last || Math.hypot(next.x - last.x, next.y - last.y) > .8) { if (pending.current.points.length < 6000) pending.current.points.push(next); preview(); } }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={event => { if (pending.current && pointer.current === event.pointerId) finish(event); }} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.opacity = '0'; }} />
    <div ref={cursorRef} className="art-brush-cursor" style={{ visibility: selecting ? "hidden" : "visible" }} />
    <div ref={regionBox} className="art-region-box" style={region ? { display: "block", left: region.x / WIDTH * 100 + "%", top: region.y / HEIGHT * 100 + "%", width: Math.min(region.w, WIDTH-region.x) / WIDTH * 100 + "%", height: Math.min(region.h, HEIGHT-region.y) / HEIGHT * 100 + "%" } : { display: "none" }}><span>正在谈这一处</span></div>
  </div>;
}
