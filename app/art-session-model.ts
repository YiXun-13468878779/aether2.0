import { importJourney, newArtwork, uid, type Journey } from './art-engine';
export type Phase = 'dialogue' | 'creating' | 'reflection' | 'completed';
export type Exhibition = { title: string; note: string; works: string[]; quotes: string[] };
export type Invitation = { title: string; prompt: string; action: 'new_artwork' | 'continue_artwork' };
export type ArtSession = { id: string; title: string; phase: Phase; createdAt: string; updatedAt: string; journey: Journey; activeId: string; exhibition: Exhibition; questionStyle: 'natural' | 'fewer' | 'none'; invitation: Invitation | null; brief: string; draft: string; favorite: boolean; archived: boolean; deleted: boolean };
export function createSession(): ArtSession { const id = uid(), now = new Date().toISOString(); return { id, title: '一段新的相遇', phase: 'dialogue', createdAt: now, updatedAt: now, journey: { version:2,id,artworks:[],messages:[] }, activeId:'', exhibition:{ title:'一些还没有名字的时刻',note:'在这里，留下我愿意再次观看的片刻。',works:[],quotes:[] }, questionStyle:'natural',invitation:null,brief:'',draft:'',favorite:false,archived:false,deleted:false }; }
function obj(raw: unknown): Record<string,unknown> { return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string,unknown> : {}; }
function str(raw: unknown, fallback = '', max = 8000) { return typeof raw === 'string' ? raw.slice(0,max) : fallback; }
export function restoreSession(raw: unknown, fresh = false): ArtSession {
  const value = obj(raw), base = createSession(), source = obj(value.journey || raw);
  const journey = importJourney(source), workIds = new Map(journey.artworks.map(a => [a.id,fresh ? uid() : a.id])), messageIds = new Map(journey.messages.map(m => [m.id,fresh ? uid() : m.id]));
  const id = fresh ? base.id : str(value.id,journey.id,120);
  const e = obj(value.exhibition || source.exhibition), invitation = obj(value.invitation);
  const links = (raw: unknown, ids: Map<string,string>) => Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === 'string').map(id => ids.get(id)).filter((id): id is string => Boolean(id)))] : [];
  return { ...base,id, title:str(value.title,journey.messages.find(m=>m.role==='user')?.content.slice(0,24)||base.title,100), phase: ['dialogue','creating','reflection','completed'].includes(String(value.phase)) ? value.phase as Phase : journey.artworks.length ? 'reflection' : 'dialogue', createdAt:str(value.createdAt,base.createdAt,40), updatedAt:str(value.updatedAt,base.updatedAt,40), journey:{...journey,id,artworks:journey.artworks.map(a=>({...a,id:workIds.get(a.id)!,parentId:a.parentId ? workIds.get(a.parentId) : undefined})),messages:journey.messages.filter(m=>m.content).map(m=>({...m,id:messageIds.get(m.id)!,artworkId:m.artworkId ? workIds.get(m.artworkId) : undefined}))}, activeId:workIds.get(str(value.activeId))||workIds.values().next().value||'', exhibition:{title:str(e.title,base.exhibition.title,100),note:str(e.note,base.exhibition.note,600),works:links(e.works,workIds),quotes:links(e.quotes,messageIds)}, questionStyle:value.questionStyle === 'fewer' || value.questionStyle === 'none' ? value.questionStyle : 'natural', invitation:typeof invitation.title === 'string' && typeof invitation.prompt === 'string' && (invitation.action === 'new_artwork' || invitation.action === 'continue_artwork') ? {title:invitation.title.slice(0,100),prompt:invitation.prompt.slice(0,2000),action:invitation.action} : null, brief:str(value.brief,'',2000), draft:str(value.draft),favorite:value.favorite===true,archived:value.archived===true,deleted:value.deleted===true };
}
export function importSessions(raw: unknown): ArtSession[] {
  const value = obj(raw);
  if (value.format === 'aether-library' && value.version === 3 && Array.isArray(value.sessions) && value.sessions.length <= 100) return value.sessions.map(s=>restoreSession(s,true));
  if (value.format === 'aether-session' && value.version === 3) return [restoreSession(value.session,true)];
  if (value.format === 'aether-journey' && value.version === 1) {
    const old = obj(value.journey); if (!Array.isArray(old.artworks) || !Array.isArray(old.messages) || old.artworks.length > 100 || old.messages.length > 1000) throw new Error('旧版旅程格式不完整。');
    const base = createSession();
    const works = old.artworks.map(raw=>{ const a=obj(raw); return {...newArtwork(typeof a.background === 'string' ? a.background : undefined),id:str(a.id,uid(),120),title:str(a.title,'未命名作品',100),...(a.image ? {baseImage:a.image} : {})}; });
    const messages = old.messages.map(raw=>{const m=obj(raw);return {id:str(m.id,uid(),120),role:m.role,content:m.text};});
    const prefs=obj(old.preferences);
    return [restoreSession({...base,title:old.title,phase:old.phase,activeId:old.activeArtworkId,questionStyle:prefs.questionStyle || (prefs.avoidQuestions ? 'none' : 'natural'),journey:{version:2,id:base.id,artworks:works,messages}},true)];
  }
  return [restoreSession(raw,true)];
}
export function updateSession(sessions: ArtSession[], next: ArtSession): ArtSession[] { return sessions.map(item => item.id === next.id ? {...next,updatedAt:new Date().toISOString()} : item); }
export function sessionBundle(sessions: ArtSession[]) { return {format:'aether-library',version:3,sessions}; }
let database: Promise<IDBDatabase> | undefined;
function openDatabase() { if (!database) database = new Promise<IDBDatabase>((resolve,reject)=>{ const request=indexedDB.open('aether-art-journeys',1); request.onupgradeneeded=()=>request.result.createObjectStore('sessions'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>{database=undefined;reject(request.error);}; request.onblocked=()=>{database=undefined;reject(new Error('请关闭另一页的旧版 Aether 后重试保存。'));}; }); return database; }
export async function loadSessions(): Promise<ArtSession[]> { const db=await openDatabase(); return new Promise((resolve,reject)=>{const tx=db.transaction('sessions','readonly'),request=tx.objectStore('sessions').get('library'); request.onsuccess=()=>{try{const data=obj(request.result);resolve(Array.isArray(data.sessions)?data.sessions.map(s=>restoreSession(s)):[]);}catch(error){reject(error);}};request.onerror=()=>reject(request.error);}); }
export async function saveSessions(sessions: ArtSession[]): Promise<void> { const db=await openDatabase(); return new Promise((resolve,reject)=>{ const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(sessionBundle(sessions),'library');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('保存未完成。')); }); }
