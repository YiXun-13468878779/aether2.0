"use client";

import { ChangeEvent, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "aether" | "user";
  text: string;
};

type Journey = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  artwork?: string;
  favorite: boolean;
  messages: Message[];
};

type Tool = "brush" | "eraser";
type View = "studio" | "space";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 780;
const PAPER = "#f7f4ed";
const STORAGE_KEY = "aether-journeys-v1";

const welcomeMessage: Message = {
  id: "welcome",
  role: "aether",
  text: "不用先把感受说清楚。你可以从一条线、一块颜色，或者一片空白开始。我会在这里，等你想让我看的时候再开口。",
};

function makeJourney(): Journey {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "无题旅程",
    createdAt: now,
    updatedAt: now,
    favorite: false,
    messages: [welcomeMessage],
  };
}

function relativeTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function Icon({ name }: { name: string }) {
  const symbols: Record<string, string> = {
    brush: "╱",
    eraser: "◇",
    undo: "↶",
    redo: "↷",
    upload: "↑",
    clear: "×",
    download: "↓",
    more: "•••",
    canvas: "▧",
    space: "◫",
    plus: "+",
    send: "↗",
    star: "✦",
  };
  return <span aria-hidden="true">{symbols[name]}</span>;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<View>("studio");
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#5c45d9");
  const [size, setSize] = useState(14);
  const [input, setInput] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [savedLabel, setSavedLabel] = useState("仅保存在此设备");
  const [showIntro, setShowIntro] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeJourney = journeys.find((item) => item.id === activeId) ?? journeys[0];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as Journey[]) : [];
      const initial = parsed.length ? parsed : [makeJourney()];
      setJourneys(initial);
      setActiveId(initial[0].id);
      setShowIntro(!stored);
    } catch {
      const initial = makeJourney();
      setJourneys([initial]);
      setActiveId(initial.id);
    }
  }, []);

  useEffect(() => {
    if (!journeys.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
    } catch {
      setSavedLabel("存储空间已满，请先导出作品");
    }
  }, [journeys]);

  useEffect(() => {
    if (!activeJourney || view !== "studio") return;
    const timer = window.setTimeout(() => {
      if (activeJourney.artwork) {
        restoreCanvas(activeJourney.artwork);
      } else {
        resetCanvas();
      }
      historyRef.current = [];
      redoRef.current = [];
    }, 30);
    return () => window.clearTimeout(timer);
  }, [activeId, view]);

  function updateJourney(id: string, patch: Partial<Journey>) {
    setJourneys((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function getContext() {
    return canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;
  }

  function resetCanvas() {
    const ctx = getContext();
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  function restoreCanvas(dataUrl: string) {
    const ctx = getContext();
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    };
    image.src = dataUrl;
  }

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function beginStroke(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    historyRef.current.push(canvas.toDataURL("image/jpeg", 0.86));
    if (historyRef.current.length > 24) historyRef.current.shift();
    redoRef.current = [];
    isDrawingRef.current = true;
    lastPointRef.current = canvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
  }

  function drawStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const point = canvasPoint(event);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size;
    ctx.strokeStyle = tool === "eraser" ? PAPER : color;
    ctx.globalAlpha = tool === "eraser" ? 1 : 0.9;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
    lastPointRef.current = point;
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleSave();
  }

  function scheduleSave() {
    setSavedLabel("正在保存…");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const artwork = canvasRef.current?.toDataURL("image/jpeg", 0.82);
      if (artwork && activeJourney) updateJourney(activeJourney.id, { artwork });
      setSavedLabel("已保存在此设备");
    }, 360);
  }

  function undo() {
    const canvas = canvasRef.current;
    const previous = historyRef.current.pop();
    if (!canvas || !previous) return;
    redoRef.current.push(canvas.toDataURL("image/jpeg", 0.86));
    restoreCanvas(previous);
    window.setTimeout(scheduleSave, 80);
  }

  function redo() {
    const canvas = canvasRef.current;
    const next = redoRef.current.pop();
    if (!canvas || !next) return;
    historyRef.current.push(canvas.toDataURL("image/jpeg", 0.86));
    restoreCanvas(next);
    window.setTimeout(scheduleSave, 80);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas || !window.confirm("清空当前画布？你仍然可以撤销。")) return;
    historyRef.current.push(canvas.toDataURL("image/jpeg", 0.86));
    resetCanvas();
    scheduleSave();
  }

  function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        const ctx = getContext();
        if (!canvas || !ctx) return;
        historyRef.current.push(canvas.toDataURL("image/jpeg", 0.86));
        resetCanvas();
        const scale = Math.min(CANVAS_WIDTH / image.width, CANVAS_HEIGHT / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, (CANVAS_WIDTH - width) / 2, (CANVAS_HEIGHT - height) / 2, width, height);
        scheduleSave();
        appendAether("作品已经放进画布了。我会等你主动说“看看这幅画”，在那之前不会分析它。你也可以继续在上面画。", 300);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function addMessage(message: Message) {
    if (!activeJourney) return;
    updateJourney(activeJourney.id, { messages: [...activeJourney.messages, message] });
  }

  function appendAether(text: string, delay = 620) {
    if (!activeJourney) return;
    const id = activeJourney.id;
    setIsReplying(true);
    window.setTimeout(() => {
      setJourneys((current) =>
        current.map((journey) =>
          journey.id === id
            ? {
                ...journey,
                updatedAt: new Date().toISOString(),
                messages: [...journey.messages, { id: crypto.randomUUID(), role: "aether", text }],
              }
            : journey,
        ),
      );
      setIsReplying(false);
    }, delay);
  }

  function responseFor(text: string) {
    const crisis = /(自杀|不想活|结束生命|伤害自己|活不下去)/;
    if (crisis.test(text)) {
      return "我很在意你刚才说的这些。此刻先不用继续解释作品，也不要独自承受：请尽快联系一个你信任且能来到你身边的人，或拨打当地急救电话。如果你正处在立即危险中，请现在就离开危险物品和地点，前往有人陪伴的安全空间。我可以留在这里，陪你把眼前最需要的一步说清楚。";
    }
    if (/(别问|不想回答|先别提问)/.test(text)) {
      return "好，我不追问。你可以继续画、停一会儿，或者只把这里当作一间安静的房间。下一次我回应时也会先尊重这个节奏。";
    }
    if (/(深入|具体|整体|仔细)/.test(text)) {
      return "明白。接下来我会把整幅作品放在一起看：重心怎样落下、视线如何移动、颜色和留白如何彼此影响，也会把多个具体细节连成一条完整的观看，而不是只抓住一个局部或给你套上象征答案。";
    }
    if (/(太诗意|直接|简短)/.test(text)) {
      return "收到。我会说得更直接、简短，用画面里能够指认的依据来谈，不做过度联想。";
    }
    if (/(不知道|没想法|不会画)/.test(text)) {
      return "那就不必先有想法。试着让手在画布上走三次：一次很轻，一次很重，一次随时停下。它们不需要组成任何东西。";
    }
    return "我听见了。你不需要把这句话解释得更完整；它已经可以和画面并排放在这里。想继续说就继续说，想回到画布也可以。";
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !activeJourney || isReplying) return;
    addMessage({ id: crypto.randomUUID(), role: "user", text });
    setInput("");
    appendAether(responseFor(text));
  }

  function describeArtwork() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx || !activeJourney || isReplying) return;
    const pixels = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    const buckets: Record<string, number> = {
      红色: 0,
      橙色: 0,
      黄色: 0,
      绿色: 0,
      蓝色: 0,
      紫色: 0,
      深色: 0,
    };
    const regions = [0, 0, 0];
    let marks = 0;
    let xTotal = 0;
    let yTotal = 0;

    for (let y = 0; y < CANVAS_HEIGHT; y += 14) {
      for (let x = 0; x < CANVAS_WIDTH; x += 14) {
        const index = (y * CANVAS_WIDTH + x) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const distance = Math.abs(r - 247) + Math.abs(g - 244) + Math.abs(b - 237);
        if (distance < 34 || (r > 240 && g > 240 && b > 235)) continue;
        marks += 1;
        xTotal += x;
        yTotal += y;
        regions[x < 400 ? 0 : x > 800 ? 2 : 1] += 1;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 92) buckets["深色"] += 1;
        else if (max - min < 26) buckets["深色"] += 1;
        else if (r > g * 1.35 && r > b * 1.25) buckets[r > 190 && g > 90 ? "橙色" : "红色"] += 1;
        else if (r > 150 && g > 135 && b < 110) buckets["黄色"] += 1;
        else if (g > r * 1.12 && g > b * 1.1) buckets["绿色"] += 1;
        else if (b > r * 1.12 && b > g * 1.05) buckets[r > 105 ? "紫色" : "蓝色"] += 1;
        else buckets["紫色"] += 1;
      }
    }

    if (marks < 8) {
      appendAether("画布现在还很接近空白。我不急着替这片空白找含义——它也可以只是你尚未决定落笔的空间。要不要先让手随意走几秒，再叫我来看？");
      return;
    }

    const colors = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    const dominant = colors[0][0];
    const secondary = colors[1][1] > marks * 0.08 ? colors[1][0] : "留白";
    const centerX = xTotal / marks;
    const centerY = yTotal / marks;
    const focus = centerX < 460 ? "左侧" : centerX > 740 ? "右侧" : "中央";
    const vertical = centerY < 300 ? "向上抬起" : centerY > 500 ? "向下沉落" : "停在画面中段";
    const spread = Math.max(...regions) / marks;
    const rhythm = spread > 0.64 ? "明显聚拢" : "在不同区域之间来回游走";
    const reply = `远一点看，这幅画先用${dominant}把重心放在${focus}，力量${vertical}；它不是均匀铺满，而是${rhythm}。${secondary === "留白" ? "大片留白没有显得缺失，反而让已经出现的痕迹拥有了停顿和回声。" : `${secondary}没有只是陪衬，它在边缘和间隙里改变了${dominant}的速度，让视线时而被拉住，时而又松开。`}近一点看，颜色相遇的地方有重叠，也有突然断开的边缘，所以整幅画既像正在形成一种秩序，又保留着不肯被说尽的部分。这只是我站在画前形成的一种观看，不是你的答案。如果下一笔由这幅画自己决定，我会好奇它更想靠近现在的重心，还是去触碰那片尚未被占据的空间。`;
    appendAether(reply, 900);
  }

  function createJourney() {
    const journey = makeJourney();
    setJourneys((current) => [journey, ...current]);
    setActiveId(journey.id);
    setView("studio");
    setSidebarOpen(false);
  }

  function openJourney(id: string) {
    setActiveId(id);
    setView("studio");
    setSidebarOpen(false);
  }

  function downloadArtwork(journey = activeJourney) {
    if (!journey?.artwork) return;
    const link = document.createElement("a");
    link.href = journey.artwork;
    link.download = `${journey.title || "Aether作品"}.jpg`;
    link.click();
  }

  function deleteJourney(id: string) {
    if (!window.confirm("删除这段旅程？此操作无法撤回。")) return;
    setJourneys((current) => {
      const next = current.filter((item) => item.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? "");
      return next.length ? next : [makeJourney()];
    });
  }

  if (!activeJourney) return <main className="loading-screen">Aether 正在为你留出空间…</main>;

  return (
    <main className="app-shell">
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="打开菜单">☰</button>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单">×</button>
        <div className="brand-block">
          <div className="brand-mark"><span /></div>
          <div>
            <div className="brand-name">AETHER</div>
            <div className="brand-caption">作品与语言之间</div>
          </div>
        </div>

        <button className="new-journey" onClick={createJourney}>
          <Icon name="plus" />
          <span>新建旅程</span>
        </button>

        <nav className="primary-nav" aria-label="主要导航">
          <button className={view === "studio" ? "active" : ""} onClick={() => setView("studio")}>
            <Icon name="canvas" /><span>当前画布</span>
          </button>
          <button className={view === "space" ? "active" : ""} onClick={() => setView("space")}>
            <Icon name="space" /><span>绘画空间</span><em>{journeys.filter((j) => j.artwork).length}</em>
          </button>
        </nav>

        <div className="journey-list-wrap">
          <div className="section-label">最近的旅程</div>
          <div className="journey-list">
            {journeys.slice(0, 5).map((journey) => (
              <button
                key={journey.id}
                className={journey.id === activeId && view === "studio" ? "journey-item current" : "journey-item"}
                onClick={() => openJourney(journey.id)}
              >
                <span className="journey-thumb">
                  {journey.artwork ? <img src={journey.artwork} alt="" /> : <i />}
                </span>
                <span className="journey-copy">
                  <strong>{journey.title}</strong>
                  <small>{relativeTime(journey.updatedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="privacy-note"><span>◉</span> 作品仅保存在当前设备</div>
      </aside>

      {view === "studio" ? (
        <section className="studio-shell">
          <header className="topbar">
            <div className="journey-title-wrap">
              <input
                value={activeJourney.title}
                aria-label="旅程名称"
                onChange={(event) => updateJourney(activeJourney.id, { title: event.target.value })}
              />
              <span>{savedLabel}</span>
            </div>
            <div className="top-actions">
              <button onClick={() => downloadArtwork()} disabled={!activeJourney.artwork} title="下载作品"><Icon name="download" /></button>
              <button title="更多"><Icon name="more" /></button>
            </div>
          </header>

          <div className="studio-body">
            <section className="canvas-region" aria-label="绘画区域">
              <div className="canvas-toolbar" aria-label="画布工具">
                <button className={tool === "brush" ? "selected" : ""} onClick={() => setTool("brush")} title="画笔"><Icon name="brush" /></button>
                <button className={tool === "eraser" ? "selected" : ""} onClick={() => setTool("eraser")} title="橡皮"><Icon name="eraser" /></button>
                <span className="tool-divider" />
                <button onClick={undo} title="撤销"><Icon name="undo" /></button>
                <button onClick={redo} title="重做"><Icon name="redo" /></button>
                <span className="tool-divider" />
                <button onClick={() => fileRef.current?.click()} title="上传作品"><Icon name="upload" /></button>
                <button onClick={clearCanvas} title="清空"><Icon name="clear" /></button>
                <input ref={fileRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadArtwork} />
              </div>

              <div className="canvas-stage">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onPointerDown={beginStroke}
                  onPointerMove={drawStroke}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  aria-label="Aether 自由画布"
                />
                {!activeJourney.artwork && (
                  <div className="canvas-whisper">让手先行动，不必急着知道它是什么</div>
                )}
              </div>

              <div className="brush-controls">
                <div className="color-row">
                  {["#17151c", "#5c45d9", "#277bd8", "#d55379", "#e88a3c", "#69a98a"].map((swatch) => (
                    <button
                      key={swatch}
                      className={color === swatch ? "color selected" : "color"}
                      style={{ background: swatch }}
                      onClick={() => { setColor(swatch); setTool("brush"); }}
                      aria-label={`选择颜色 ${swatch}`}
                    />
                  ))}
                  <label className="custom-color" title="自定义颜色">
                    <span>+</span><input type="color" value={color} onChange={(event) => { setColor(event.target.value); setTool("brush"); }} />
                  </label>
                </div>
                <label className="size-control">
                  <span>笔触</span>
                  <input type="range" min="3" max="54" value={size} onChange={(event) => setSize(Number(event.target.value))} />
                  <i style={{ width: Math.max(6, size / 2), height: Math.max(6, size / 2) }} />
                </label>
              </div>
            </section>

            <aside className="conversation-panel">
              <div className="conversation-head">
                <div><span className="aether-orb" /> <strong>Aether</strong></div>
                <small>正在陪你观看</small>
              </div>

              <div className="messages" aria-live="polite">
                {activeJourney.messages.map((message) => (
                  <div key={message.id} className={`message ${message.role}`}>
                    {message.role === "aether" && <span className="message-mark">A</span>}
                    <p>{message.text}</p>
                  </div>
                ))}
                {isReplying && (
                  <div className="message aether thinking"><span className="message-mark">A</span><p><i /><i /><i /></p></div>
                )}
              </div>

              <div className="conversation-actions">
                <button className="look-button" onClick={describeArtwork} disabled={isReplying}>
                  <span>✦</span> 请 Aether 看看这幅画
                </button>
                <form onSubmit={submitMessage} className="message-form">
                  <textarea
                    rows={2}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="说说你想到的，或告诉我希望怎样回应…"
                    aria-label="给 Aether 发送消息"
                  />
                  <button type="submit" disabled={!input.trim() || isReplying} aria-label="发送"><Icon name="send" /></button>
                </form>
                <div className="ai-disclosure">AI 的观看是一种视角，不是关于你的结论</div>
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <section className="art-space">
          <header className="space-header">
            <div><span className="eyebrow">YOUR ART SPACE</span><h1>绘画空间</h1><p>保存创作本身，不替它们排列意义。</p></div>
            <button className="space-new" onClick={createJourney}><Icon name="plus" /> 开始新的旅程</button>
          </header>
          <div className="space-filter"><button className="active">全部作品</button><button>已收藏</button><span>{journeys.filter((j) => j.artwork).length} 件作品</span></div>
          <div className="art-grid">
            {journeys.filter((journey) => journey.artwork).map((journey) => (
              <article className="art-card" key={journey.id}>
                <button className="art-preview" onClick={() => openJourney(journey.id)}>
                  <img src={journey.artwork} alt={`${journey.title}作品预览`} />
                  <span>继续这段旅程</span>
                </button>
                <div className="art-card-meta">
                  <div><h2>{journey.title}</h2><p>{relativeTime(journey.updatedAt)} · {journey.messages.length - 1} 次交谈</p></div>
                  <div className="card-actions">
                    <button className={journey.favorite ? "favorite" : ""} onClick={() => updateJourney(journey.id, { favorite: !journey.favorite })} title="收藏"><Icon name="star" /></button>
                    <button onClick={() => downloadArtwork(journey)} title="下载"><Icon name="download" /></button>
                    <button onClick={() => deleteJourney(journey.id)} title="删除">×</button>
                  </div>
                </div>
              </article>
            ))}
            {!journeys.some((journey) => journey.artwork) && (
              <button className="empty-card" onClick={createJourney}><span>＋</span><strong>这里还没有作品</strong><small>从一条线开始</small></button>
            )}
          </div>
        </section>
      )}

      {showIntro && (
        <div className="intro-backdrop" role="dialog" aria-modal="true" aria-label="欢迎来到 Aether">
          <div className="intro-card">
            <div className="intro-star"><span /></div>
            <span className="eyebrow">A SPACE BETWEEN MAKING AND MEANING</span>
            <h1>让作品先出现。</h1>
            <p>Aether 是一个自由创作与作品交流空间。你可以直接画，也可以上传作品；AI 会认真观看并与你交谈，但不会替你定义它。</p>
            <div className="intro-points"><span>不评价画得好不好</span><span>不从作品诊断你</span><span>默认仅保存在本设备</span></div>
            <button onClick={() => setShowIntro(false)}>进入画布 <span>→</span></button>
            <small>Aether 不是心理咨询或医疗服务。你始终拥有作品和解释权。</small>
          </div>
        </div>
      )}
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单" />}
    </main>
  );
}
