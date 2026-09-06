Skip to content
YiXun-13468878779
aether2.0
Repository navigation
Code
Issues
Pull requests
1
 (1)
Agents
Actions
Projects
Wiki
aether2.0/app
/

in
refactor/art-dialogue

Edit

Preview
Indent mode

Indent size

Line wrap mode

Editing art-studio.tsx file contents
 12
 13
 14
 15
 16
 17
 18
 19
 20
 21
 22
 23
 24
 25
 26
 27
 28
 29
 30
 31
 32
 33
 34
 35
 36
 37
 38
 39
 40
 41
 42
 43
 44
 45
 46
 47
 48
 49
 50
 51
 52
 53
 54
 55
 56
 57
 58
 59
 60
 61
 62
 63
 64
 65
 66
 67
 68
 69
 70
 71
 72
 73
 74
 75
 76
 77
 78
 79
 80
 81
 82
 83
 84
 85
 86
 87
 88
 89
 90
 91
 92
 93
 94
 95
 96
 97
 98
 99
100
101
102
103
104
105
'use client';
const emptyExhibition: Exhibition = { title: '一些还没有名字的时刻', note: '在这里，留下我愿意再次观看的片刻。', works: [], quotes: [] };
function download(content: string, name: string, type = 'application/json') { const link = document.createElement('a'); const url = content.startsWith('data:') ? content : URL.createObjectURL(new Blob([content], { type })); link.href = url; link.download = name; link.click(); if (!content.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 1000); }
function errorText(error: unknown) { return error instanceof Error ? error.message : '这一步没有完成，请再试一次。'; }
function toggle(list: string[], id: string) { return list.includes(id) ? list.filter(value => value !== id) : [...list, id]; }
function Brand({ onClick }: { onClick: () => void }) { return <button className="art-brand" onClick={onClick} aria-label="Aether 返回主页"><span className="art-brand-symbol">æ</span><span>Aether<small>灵魂对话</small></span></button>; }
export default function ArtStudio() {
  const [view, setView] = useState<View>('home'), [journey, setJourney] = useState<Journey>(emptyJourney), [activeId, setActiveId] = useState('');
  const [tool, setTool] = useState<Tool>('pastel'), [color, setColor] = useState(COLORS[1]), [width, setWidth] = useState(42), [opacity, setOpacity] = useState(.86);
  const [mobilePane, setMobilePane] = useState<'canvas' | 'chat'>('canvas'), [focusCanvas, setFocusCanvas] = useState(false), [selecting, setSelecting] = useState(false), [region, setRegion] = useState<Region>();
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [settings, setSettings] = useState(false), [questionStyle, setQuestionStyle] = useState<'natural' | 'fewer' | 'none'>('natural'), [invitation, setInvitation] = useState<Invitation | null>(null);
  const [exhibition, setExhibition] = useState<Exhibition>(emptyExhibition), [exhibitIndex, setExhibitIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null), bottomRef = useRef<HTMLDivElement>(null), importRef = useRef<HTMLInputElement>(null), uploadRef = useRef<HTMLInputElement>(null), composerRef = useRef<HTMLTextAreaElement>(null);
  const art = journey.artworks.find(item => item.id === activeId);
  const works = journey.artworks.filter(hasMarks);
  const exhibitWorks = exhibition.works.map(id => journey.artworks.find(item => item.id === id)).filter((item): item is Artwork => Boolean(item));
  const exhibitArt = exhibitWorks[Math.min(exhibitIndex, Math.max(0, exhibitWorks.length - 1))];
  const savedQuotes = journey.messages.filter(message => exhibition.quotes.includes(message.id));
  function patchArtwork(id: string, change: (current: Artwork) => Artwork) { setJourney(current => ({ ...current, artworks: current.artworks.map(item => item.id === id ? change(item) : item) })); }
  function stop() { requestRef.current?.abort(); requestRef.current = null; setBusy(false); setStatus(''); setJourney(current => ({ ...current, messages: current.messages.filter(message => message.content) })); }
  function addArtwork(source?: Artwork) { const next = source ? { ...source, id: uid(), title: source.title + ' · 继续', parentId: source.id, origin: source.origin === 'aether' ? 'dialogue' as const : source.origin, redo: [], createdAt: new Date().toISOString() } : newArtwork(art?.paper); setJourney(current => ({ ...current, id: current.id || uid(), artworks: [...current.artworks, ...(source ? [{ ...(current.artworks.find(item => item.id === source.id) || source), id: next.id, title: next.title, parentId: source.id, origin: next.origin, redo: [], createdAt: next.createdAt }] : [next])] })); setActiveId(next.id); setRegion(undefined); setSelecting(false); setView('studio'); setMobilePane('canvas'); setInvitation(null); }
  function enter(drawFirst = false) { if (!journey.artworks.length) addArtwork(); else setView('studio'); setMobilePane(drawFirst ? 'canvas' : 'chat'); setFocusCanvas(false); }
  function selectArtwork(id: string) { setActiveId(id); setRegion(undefined); setSelecting(false); setView('studio'); setMobilePane('canvas'); }
  function changeTool(next: Tool) { setTool(next); setWidth(material[next].width); setOpacity(material[next].opacity); setSelecting(false); }
  function keepMark(mark: Mark) { if (art) patchArtwork(art.id, current => appendMark(current, mark)); }
  function exportJourney() { download(JSON.stringify({ ...journey, exhibition }, null, 2), 'aether-journey.json'); setNotice('旅程已导出，包含可编辑笔触、作品与对话。'); }
  async function readJourney(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 40_000_000) throw new Error('旅程文件过大，请选择 40 MB 以内的文件。');
      const raw: unknown = JSON.parse(await file.text()); const next = importJourney(raw);
      const workIds = new Map(next.artworks.map(item => [item.id, uid()]));
      const messageIds = new Map(next.messages.map(item => [item.id, uid()]));
      const importedWorks = next.artworks.map(item => ({ ...item, id: workIds.get(item.id)!, ...(item.parentId ? { parentId: workIds.get(item.parentId) } : {}) }));
      const importedMessages = next.messages.map(item => ({ ...item, id: messageIds.get(item.id)!, ...(item.artworkId ? { artworkId: workIds.get(item.artworkId) } : {}) }));
      stop(); setJourney(current => ({ version: 2, id: current.id || next.id, artworks: [...current.artworks, ...importedWorks], messages: [...current.messages, ...importedMessages] }));
      if (importedWorks[0]) setActiveId(importedWorks[0].id); setRegion(undefined); setSelecting(false); setSettings(false); setView('gallery');
      const e = (raw as { exhibition?: Partial<Exhibition> }).exhibition;
      if (e && typeof e === 'object') setExhibition(current => ({ title: typeof e.title === 'string' ? e.title.slice(0,100) : current.title, note: typeof e.note === 'string' ? e.note.slice(0,600) : current.note, works: [...current.works, ...(Array.isArray(e.works) ? e.works.map(id => workIds.get(id)).filter((id): id is string => Boolean(id)) : [])], quotes: [...current.quotes, ...(Array.isArray(e.quotes) ? e.quotes.map(id => messageIds.get(id)).filter((id): id is string => Boolean(id)) : [])] }));
      setNotice('旅程已加入作品空间，展览与对话关联也已恢复。');
    } catch (err) { setError(errorText(err)); }
  }
  async function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12_000_000) throw new Error('请选择 12 MB 以内的 PNG、JPEG 或 WebP 图片。'); const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法打开图片。'); const ratio = Math.min(WIDTH / bitmap.width, HEIGHT / bitmap.height); ctx.drawImage(bitmap, (WIDTH - bitmap.width * ratio)/2, (HEIGHT - bitmap.height * ratio)/2, bitmap.width * ratio, bitmap.height * ratio); bitmap.close(); const next = { ...newArtwork(), title: file.name.replace(/\.[^.]+$/, '').slice(0,80), baseImage: canvas.toDataURL('image/png') }; setJourney(current => ({ ...current, id: current.id || uid(), artworks: [...current.artworks, next] })); setActiveId(next.id); setRegion(undefined); setView('studio'); setMobilePane('canvas'); } catch (err) { setError(errorText(err)); }
  }
  async function savePng(current: Artwork) { try { download(await artworkImage(current, 1600), current.title + '.png'); } catch (err) { setError(errorText(err)); } }
  async function sendMessage(text: string, artworkMode = false) {
    const content = text.trim(); if (!content || busy || requestRef.current) return;
    const nextStyle = nextQuestionStyle(content, questionStyle); setQuestionStyle(nextStyle);
    setError(''); setNotice(''); setDraft(''); setInvitation(null); setFocusCanvas(false); setMobilePane('chat');
    const userId = uid(), replyId = uid(), controller = new AbortController(); requestRef.current = controller; setBusy(true); setStatus('Aether 正在认真看…');
    const sourceArt = art, sourceRegion = region, history = [...journey.messages.filter(message => message.content), { id: userId, role: 'user' as const, content, ...(art && hasMarks(art) ? { artworkId: art.id } : {}) }];
    setJourney(current => ({ ...current, id: current.id || uid(), messages: [...current.messages, history[history.length - 1], { id: replyId, role: 'assistant', content: '', ...(sourceArt && hasMarks(sourceArt) ? { artworkId: sourceArt.id } : {}) }] }));
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const contextWorks = [...works.filter(item => item.id !== sourceArt?.id).slice(-1), ...(sourceArt && hasMarks(sourceArt) ? [sourceArt] : [])];
      const images = await Promise.all(contextWorks.map(async item => ({ id: item.id, title: item.title, image: await artworkImage(item, 800), isCurrent: item.id === sourceArt?.id })));
      if (requestRef.current !== controller) return;
      const response = await fetch('/api/aether', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: artworkMode || sourceRegion ? 'artwork' : 'conversation', phase: images.length ? 'reflection' : 'dialogue', messages: history.map(({ role, content }) => ({ role, content })), artworks: images, preferences: { questionStyle: nextStyle }, ...(sourceRegion ? { focus: { x: sourceRegion.x / WIDTH, y: sourceRegion.y / HEIGHT, w: sourceRegion.w / WIDTH, h: sourceRegion.h / HEIGHT } } : {}) }), signal: controller.signal });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message || 'Aether 暂时没有回应，请稍后重试。'); }
      if (!response.body) throw new Error('回应没有连接成功。');
      reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '', answer = '', completed = false;
      while (true) {
        const { value, done } = await reader.read(); if (requestRef.current !== controller) return; buffer += decoder.decode(value, { stream: !done }); const frames = buffer.split(/\r?\n/); buffer = done ? '' : frames.pop() || '';
        for (const line of frames) {
          if (!line.startsWith('data:')) continue; const data = line.slice(5).trim(); if (!data) continue; if (data === '[DONE]') { completed = true; continue; }
          const event = JSON.parse(data);
          if (event.type === 'error') throw new Error(event.message || '回应中断了。');
          if (event.type === 'delta' && typeof event.text === 'string') { answer += event.text; const snapshot = answer; setStatus(''); setJourney(current => ({ ...current, messages: current.messages.map(message => message.id === replyId ? { ...message, content: snapshot } : message) })); }
          if (event.type === 'control' && event.inviteToCreate && event.invitation && typeof event.invitation.title === 'string' && typeof event.invitation.prompt === 'string') setInvitation(event.invitation);
        }
        if (done) break;
      }
      if (!completed || !answer) throw new Error('回应中断了，可以继续告诉 Aether 你的想法。');
    } catch (err) { if (requestRef.current === controller && !controller.signal.aborted) { setError(errorText(err)); setDraft(content); } }
    finally { if (reader) void reader.cancel().catch(() => {}); if (requestRef.current === controller) { requestRef.current = null; setBusy(false); setStatus(''); setJourney(current => ({ ...current, messages: current.messages.filter(message => message.content) })); } }
  }
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [journey.messages, busy]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (journey.messages.length || works.length) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [journey.messages.length, works.length]);
  useEffect(() => () => { requestRef.current?.abort(); }, []);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input:not([hidden]),textarea,[tabindex="0"]') || []);
    focusables()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setSettings(false); } if (event.key === 'Tab') { const items = focusables(), first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, [settings]);
  return <main className={'art-app art-view-' + view}>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={readJourney} aria-label="导入 Aether 旅程" />
    <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadArtwork} aria-label="导入作品图片" />
    {view === 'home' ? <>
      <header className="art-home-nav"><Brand onClick={() => setView('home')} /><nav aria-label="主导航"><button onClick={() => setView('gallery')}>作品空间 <span>{works.length ? String(works.length).padStart(2,'0') : '↗'}</span></button><button onClick={() => setSettings(true)} aria-label="打开偏好设置"><Icon name="settings" /></button></nav></header>
      <section className="art-hero"><div className="art-hero-image" role="img" aria-label="撕纸、蓝色色粉与炭笔交错的原生艺术封面" /><div className="art-hero-content"><span className="art-eyebrow">A SPACE FOR THE UNEXPECTED</span><h1>在语言之外，<br />与自己<span>相遇。</span></h1><p>让一根线、一片颜色，先于答案出现。<br />自由创作，与 Aether 一起认真观看。</p><div className="art-hero-actions"><button className="art-primary" onClick={() => enter(false)}>{journey.messages.length || works.length ? '继续这段相遇' : '开始一段对话'}<Icon name="arrow" /></button><button className="art-text-button" onClick={() => enter(true)}>我想先画 <span>↗</span></button></div></div><div className="art-hero-caption"><span>01 / 无需画得像什么</span><span>痕迹，也有自己的语言。</span></div><div className="art-vertical-label">AETHER — AN OPEN STUDIO</div></section>
      <section className="art-home-bottom"><p>没有标准画法。<br /><em>只有你的下一笔。</em></p><div><span>01 — 留下痕迹</span><p>炭笔、色粉与墨迹，<br />让手带着你走。</p></div><div><span>02 — 认真观看</span><p>从整幅画到一处留白，<br />让交流慢慢深入。</p></div><div><span>03 — 留住片刻</span><p>把作品与想留下的话，<br />编成自己的小展览。</p></div></section>
      <footer className="art-home-footer"><span>Aether / 灵魂对话</span><button onClick={() => setSettings(true)}>关于这个空间</button><span>自由表达，不替你定义。</span></footer>
    </> : <>
      <aside className="art-rail"><button className="art-rail-mark" onClick={() => setView('home')} aria-label="返回主页">æ</button><nav aria-label="空间导航"><button onClick={() => setView('home')} title="返回主页" aria-label="返回主页"><Icon name="home" /></button><button className={view === 'studio' ? 'is-active' : ''} onClick={() => enter(true)} title="创作与对话" aria-label="创作与对话"><Icon name="ink" /></button><button className={view === 'gallery' ? 'is-active' : ''} onClick={() => setView('gallery')} title="作品空间" aria-label="作品空间"><Icon name="grid" /></button></nav><button onClick={() => setSettings(true)} title="偏好与旅程" aria-label="偏好与旅程"><Icon name="settings" /></button></aside>
      {view === 'studio' && art ? <section className={'art-studio ' + (focusCanvas ? 'art-focused ' : '') + 'art-mobile-' + mobilePane}>
        <header className="art-studio-header"><div><span className="art-eyebrow">OPEN STUDIO</span><input className="art-title-input" aria-label="作品标题" value={art.title} maxLength={80} onChange={event => patchArtwork(art.id, current => ({ ...current, title: event.target.value }))} /></div><div className="art-header-actions"><button onClick={() => setView('gallery')}><Icon name="grid" /><span>作品空间</span></button><button onClick={() => setFocusCanvas(value => !value)} aria-label={focusCanvas ? '退出专注画布' : '专注画布'} title={focusCanvas ? '退出专注画布' : '专注画布'}><Icon name="expand" /></button><button onClick={() => void savePng(art)} aria-label="导出当前作品 PNG" title="导出 PNG"><Icon name="download" /></button></div></header>
        <div className="art-mobile-switch" role="group" aria-label="切换工作区域"><button aria-pressed={mobilePane === 'canvas'} onClick={() => setMobilePane('canvas')}>画布</button><button aria-pressed={mobilePane === 'chat'} onClick={() => setMobilePane('chat')}>对话 {busy ? '·' : ''}</button></div>
        <section className="art-creation" aria-label="材料实验室与画布">
          <div className="art-canvas-top"><span>{selecting ? '拖动框选一处，也可以用右侧选项选择位置。' : '不必想好，先留下一笔。'}</span><div><button disabled={!art.marks.length} onClick={() => patchArtwork(art.id, undo)} aria-label="撤销" title="撤销 · ⌘ Z"><Icon name="undo" /></button><button disabled={!art.redo.length} onClick={() => patchArtwork(art.id, redo)} aria-label="重做" title="重做 · ⌘ ⇧ Z"><Icon name="redo" /></button><button onClick={() => addArtwork(art)} aria-label="复制后继续创作" title="复制后继续"><Icon name="copy" /></button><button disabled={!hasMarks(art)} onClick={() => keepMark({ id: uid(), tool: 'clear', points: [], color, width: 1, opacity: 1 })} aria-label="清空画布，可撤销" title="清空 · 可以撤销"><Icon name="trash" /></button></div></div>
          <div className="art-canvas-stage"><DrawingSurface key={art.id} art={art} tool={tool} color={color} width={width} opacity={opacity} selecting={selecting} region={region} onRegion={next => { setRegion(next); setSelecting(false); setFocusCanvas(false); setMobilePane('chat'); composerRef.current?.focus(); }} onMark={keepMark} onUndo={() => patchArtwork(art.id, undo)} onRedo={() => patchArtwork(art.id, redo)} /></div>
          <div className="art-canvas-actions"><button className={selecting || region ? 'art-active-text' : ''} disabled={!hasMarks(art)} onClick={() => { setSelecting(value => !value); setRegion(undefined); }}><Icon name="chat" size={17} />框选画面交流</button><button className="art-dark-button" disabled={!hasMarks(art) || busy} onClick={() => void sendMessage('我想听听你如何观看这幅作品。请结合整体、具体细节和我们此前的交流，自由地谈谈你的感受。',true)}>和 Aether 看看这幅画 <Icon name="arrow" size={17} /></button></div>
          {selecting ? <label className="art-region-options">也可选择位置<select aria-label="选择画面关注位置" defaultValue="" onChange={event => { const boxes: Record<string,Region> = { center:{x:300,y:225,w:600,h:450}, top:{x:0,y:0,w:1200,h:450}, bottom:{x:0,y:450,w:1200,h:450}, left:{x:0,y:0,w:600,h:900}, right:{x:600,y:0,w:600,h:900} }; const next = boxes[event.target.value]; if (next) { setRegion(next); setSelecting(false); setMobilePane('chat'); } }}><option value="" disabled>选择一处…</option><option value="center">画面中央</option><option value="top">上半部</option><option value="bottom">下半部</option><option value="left">左半部</option><option value="right">右半部</option></select><button onClick={() => setSelecting(false)}>取消</button></label> : null}
          <section className="art-materials" aria-label="材料实验室"><div className="art-material-heading"><span>材料实验室</span><small>{material[tool].note}</small></div><div className="art-material-tools" role="group" aria-label="绘画材料">{TOOLS.map(item => <button key={item} aria-pressed={tool === item} className={tool === item ? 'is-active' : ''} onClick={() => changeTool(item)}><Icon name={item} size={23} /><span>{material[item].name}</span></button>)}</div><div className="art-material-controls"><div className="art-pigments" role="group" aria-label="颜料颜色">{COLORS.map(value => <button key={value} aria-label={'颜料 ' + value} aria-pressed={color === value} className={color === value ? 'is-active' : ''} style={{ backgroundColor:value }} onClick={() => setColor(value)} />)}<label className="art-custom-color" title="自定义颜色"><span>＋</span><input type="color" aria-label="自定义颜料颜色" value={color} onChange={event => setColor(event.target.value)} /></label></div><label className="art-slider-label">笔宽 <input type="range" min="2" max="140" value={width} aria-label="画笔粗细" onChange={event => setWidth(Number(event.target.value))} /><output>{width}</output></label><label className="art-slider-label">浓度 <input type="range" min="10" max="100" value={Math.round(opacity*100)} aria-label="颜料浓度" onChange={event => setOpacity(Number(event.target.value)/100)} /><output>{Math.round(opacity*100)}%</output></label></div><div className="art-paper-row"><span>纸色</span>{PAPERS.map(value => <button key={value} style={{ backgroundColor:value }} aria-label={'纸色 ' + value} aria-pressed={art.paper === value} className={art.paper === value ? 'is-active' : ''} onClick={() => patchArtwork(art.id, current => ({ ...current, paper:value }))} />)}<button className="art-import-art" onClick={() => uploadRef.current?.click()}><Icon name="upload" size={15} />带入自己的作品</button></div></section>
          <div className="art-work-strip" aria-label="这段旅程的作品">{journey.artworks.map((item,index) => <button key={item.id} aria-label={'打开作品 ' + (index+1) + ' ' + item.title} aria-pressed={item.id === activeId} onClick={() => selectArtwork(item.id)}><ArtPreview art={item} /><span>{String(index+1).padStart(2,'0')}</span></button>)}<button className="art-add-paper" onClick={() => addArtwork()}><Icon name="plus" /><span>新的一张</span></button></div>
        </section>
        <aside className="art-conversation" aria-label="与 Aether 交流"><header><div><span className="art-ai-orbit" /><strong>Aether</strong><small>与你一起观看</small></div><button onClick={() => setSettings(true)} aria-label="交流偏好"><Icon name="settings" size={18} /></button></header><div className="art-messages">
          {!journey.messages.length ? <div className="art-conversation-welcome"><span className="art-handwritten">Take your time.</span><h2>这里可以<br />慢一点。</h2><p>一句说不清的话、一种颜色，或者今天偶然注意到的东西，都可以成为开始。</p><p>你可以先聊，也可以直接在纸上画。作品会一直在我们身旁。</p></div> : null}
          {journey.messages.map(message => <article className={'art-message art-message-' + message.role} key={message.id}><div className="art-message-label"><span>{message.role === 'user' ? '你' : 'Aether'}</span>{message.artworkId ? <button onClick={() => selectArtwork(message.artworkId!)}>看这幅作品 ↗</button> : null}</div><p>{message.content || status || '正在观看…'}</p>{message.content ? <button className={'art-keep-quote ' + (exhibition.quotes.includes(message.id) ? 'is-kept' : '')} aria-pressed={exhibition.quotes.includes(message.id)} onClick={() => setExhibition(current => ({ ...current, quotes:toggle(current.quotes,message.id) }))}>{exhibition.quotes.includes(message.id) ? '已留在展览中' : '把这句话留在展览中'}</button> : null}</article>)}
          {invitation ? <div className="art-invitation"><span>一个可以试试的方向</span><h3>{invitation.title}</h3><p>{invitation.prompt}</p><div><button onClick={() => { if (invitation.action === 'new_artwork') addArtwork(); else { setMobilePane('canvas'); setInvitation(null); } }}>去画画 <Icon name="arrow" size={16} /></button><button onClick={() => setInvitation(null)}>先继续聊</button></div></div> : null}<div ref={bottomRef} />
Use Control + Shift + m to toggle the tab key moving focus. Alternatively, use esc then tab to move to the next interactive element on the page.
