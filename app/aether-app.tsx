"use client";
/* eslint-disable @next/next/no-img-element -- local cover and user-created data URLs intentionally bypass image optimization */

import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

type Role = "assistant" | "user";
type Tool = "pencil" | "brush" | "marker" | "eraser" | "line" | "rectangle" | "ellipse";
type Screen = "home" | "session" | "space";
type Phase = "dialogue" | "creating" | "reflection" | "completed";
type InvitationAction = "new_artwork" | "continue_artwork";

type Invitation = {
  title: string;
  prompt: string;
  action: InvitationAction;
};

type Message = {
  id: string;
  role: Role;
  text: string;
  invitation?: Invitation | null;
};

type Artwork = {
  id: string;
  title: string;
  image?: string;
  background: string;
  createdAt: string;
  updatedAt: string;
};

type Journey = {
  id: string;
  title: string;
  phase: Phase;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  artworks: Artwork[];
  activeArtworkId?: string;
  preferences?: { avoidQuestions?: boolean };
  completedAt?: string;
};

type ModelStatus = "checking" | "connected" | "missing";

const WIDTH = 1200;
const HEIGHT = 780;
const PAPER = "#f6f1e7";
const STORAGE_KEY = "aether-journeys-v2";

const openingMessage: Message = {
  id: "opening",
  role: "assistant",
  text: "此刻你想从哪里开始？不必准确，也不必完整。",
};

const toolLabels: Array<{ tool: Tool; label: string; mark: string }> = [
  { tool: "pencil", label: "铅笔", mark: "⌁" },
  { tool: "brush", label: "画笔", mark: "╱" },
  { tool: "marker", label: "马克笔", mark: "▰" },
  { tool: "eraser", label: "橡皮", mark: "◇" },
  { tool: "line", label: "直线", mark: "／" },
  { tool: "rectangle", label: "矩形", mark: "□" },
  { tool: "ellipse", label: "椭圆", mark: "○" },
];

function now() {
  return new Date().toISOString();
}

function makeArtwork(index: number): Artwork {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    title: `作品 ${index + 1}`,
    background: PAPER,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeJourney(): Journey {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    title: "一段新的对话",
    phase: "dialogue",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [openingMessage],
    artworks: [],
  };
}

function shortDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function AetherApp({ authEnabled }: { authEnabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const shapeSnapshotRef = useRef<ImageData | null>(null);
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [activeJourneyId, setActiveJourneyId] = useState("");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("checking");
  const [modelName, setModelName] = useState("");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [thinkingStage, setThinkingStage] = useState<"thinking" | "writing">("thinking");
  const [requestError, setRequestError] = useState("");
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#5945bd");
  const [size, setSize] = useState(15);
  const [opacity, setOpacity] = useState(86);
  const [zoom, setZoom] = useState(1);
  const [savedState, setSavedState] = useState("已保存在此设备");
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(false);

  const activeJourney = journeys.find((journey) => journey.id === activeJourneyId) ?? journeys[0];
  const activeArtwork = activeJourney?.artworks.find((artwork) => artwork.id === activeJourney.activeArtworkId);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? (JSON.parse(saved) as Journey[]) : [];
        const initial = parsed.length ? parsed : [makeJourney()];
        setJourneys(initial);
        setActiveJourneyId(initial[0].id);
      } catch {
        const first = makeJourney();
        setJourneys([first]);
        setActiveJourneyId(first.id);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!authEnabled || screen === "home") return;

    fetch("/api/aether")
      .then((response) => {
        if (!response.ok) throw new Error(`Model status failed: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setModelStatus(data.configured ? "connected" : "missing");
        setModelName(data.model ?? "");
      })
      .catch(() => setModelStatus("missing"));
  }, [authEnabled, screen]);

  useEffect(() => {
    if (!journeys.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
    } catch {
      window.setTimeout(() => setSavedState("设备存储空间不足，请导出作品"), 0);
    }
  }, [journeys]);

  useEffect(() => {
    if (screen !== "session" || activeJourney?.phase !== "creating" || !activeArtwork) return;
    const timer = window.setTimeout(() => {
      const ctx = context();
      if (!ctx) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = activeArtwork.background;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (activeArtwork.image) restoreCanvas(activeArtwork.image);
      historyRef.current = [];
      redoRef.current = [];
    }, 40);
    return () => window.clearTimeout(timer);
    // Canvas restoration is intentionally keyed to artwork switches, not every autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeJourneyId, activeJourney?.phase, activeArtwork?.id]);

  const galleryWorks = useMemo(
    () => journeys.flatMap((journey) => journey.artworks.map((artwork) => ({ journey, artwork }))).filter(({ artwork }) => artwork.image),
    [journeys],
  );

  useEffect(() => {
    if (screen !== "session") return;
    conversationEndRef.current?.scrollIntoView({ block: "end" });
  }, [screen, activeJourney?.phase, activeJourney?.messages]);

  function updateJourney(id: string, update: Partial<Journey>) {
    setJourneys((current) => current.map((journey) => journey.id === id ? { ...journey, ...update, updatedAt: now() } : journey));
  }

  function patchArtwork(journeyId: string, artworkId: string, update: Partial<Artwork>) {
    setJourneys((current) => current.map((journey) => journey.id === journeyId
      ? {
          ...journey,
          updatedAt: now(),
          artworks: journey.artworks.map((artwork) => artwork.id === artworkId ? { ...artwork, ...update, updatedAt: now() } : artwork),
        }
      : journey));
  }

  function startNewJourney() {
    const journey = makeJourney();
    setJourneys((current) => [journey, ...current]);
    setActiveJourneyId(journey.id);
    setScreen("session");
    setRequestError("");
    setSessionSidebarOpen(false);
  }

  function openJourney(journeyId: string, phase?: Phase, artworkId?: string) {
    if (activeJourney?.phase === "creating") saveCanvasNow();
    setActiveJourneyId(journeyId);
    if (phase || artworkId) {
      setJourneys((current) => current.map((journey) => journey.id === journeyId
        ? { ...journey, phase: phase ?? journey.phase, activeArtworkId: artworkId ?? journey.activeArtworkId }
        : journey));
    }
    setScreen("session");
    setRequestError("");
    setSessionSidebarOpen(false);
  }

  function nextQuestionPreference(text: string) {
    if (/可以(继续)?问|你可以问|可以提问/.test(text)) return false;
    if (/不要(再)?问|别(再)?问|不想(被)?问|少问|别老是问|不喜欢.*问/.test(text)) return true;
    return activeJourney?.preferences?.avoidQuestions === true;
  }

  async function askAether(text: string, image?: string, phaseOverride?: Phase) {
    if (!activeJourney || thinking) return;
    const journeyId = activeJourney.id;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text };
    const nextMessages = [...activeJourney.messages, userMessage];
    const avoidQuestions = nextQuestionPreference(text);
    const shouldNameJourney = activeJourney.title === "一段新的对话"
      && activeJourney.messages.every((message) => message.role !== "user");
    updateJourney(journeyId, {
      messages: nextMessages,
      preferences: { ...activeJourney.preferences, avoidQuestions },
      ...(shouldNameJourney ? { title: text.replace(/\s+/g, " ").slice(0, 18) } : {}),
    });
    setInput("");
    setRequestError("");
    setThinking(true);
    setThinkingStage("thinking");

    const currentArtwork = activeJourney.artworks.find((artwork) => artwork.id === activeJourney.activeArtworkId);
    const contextArtworks = [
      ...activeJourney.artworks.filter((artwork) => artwork.id !== currentArtwork?.id).slice(-2),
      ...(currentArtwork ? [{ ...currentArtwork, image: image ?? currentArtwork.image }] : []),
    ].map((artwork) => ({
      id: artwork.id,
      title: artwork.title,
      image: artwork.image,
      isCurrent: artwork.id === currentArtwork?.id,
    }));

    try {
      const response = await fetch("/api/aether", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: image ? "artwork" : "conversation",
          phase: phaseOverride ?? activeJourney.phase,
          messages: nextMessages.map(({ role, text: content }) => ({ role, content })),
          artworks: contextArtworks,
          preferences: { avoidQuestions },
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.code === "MODEL_NOT_CONFIGURED") setModelStatus("missing");
        throw new Error(data.message || "Aether 暂时没有回应，请稍后再试。");
      }
      if (!response.body) throw new Error("Aether 没有返回可读取的回应。");

      setModelStatus("connected");
      const assistantId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
      };
      setJourneys((current) => current.map((journey) => journey.id === journeyId
        ? { ...journey, updatedAt: now(), messages: [...journey.messages, assistantMessage] }
        : journey));
      setStreamingMessageId(assistantId);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let streamError = "";

      const handleEvent = (block: string) => {
        const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        const payload = dataLine.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        const event = JSON.parse(payload) as {
          type?: "status" | "delta" | "control" | "error";
          stage?: "thinking" | "writing";
          text?: string;
          message?: string;
          inviteToCreate?: boolean;
          invitation?: Invitation | null;
        };
        if (event.type === "status" && event.stage) setThinkingStage(event.stage);
        if (event.type === "delta" && event.text) {
          fullText += event.text;
          setJourneys((current) => current.map((journey) => journey.id === journeyId
            ? {
                ...journey,
                updatedAt: now(),
                messages: journey.messages.map((message) => message.id === assistantId ? { ...message, text: fullText } : message),
              }
            : journey));
        }
        if (event.type === "control") {
          setJourneys((current) => current.map((journey) => journey.id === journeyId
            ? {
                ...journey,
                updatedAt: now(),
                messages: journey.messages.map((message) => message.id === assistantId
                  ? { ...message, invitation: event.inviteToCreate ? event.invitation : null }
                  : message),
              }
            : journey));
        }
        if (event.type === "error") streamError = event.message || "Aether 的回应中断了。";
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = done ? "" : blocks.pop() ?? "";
        for (const block of blocks) handleEvent(block);
        if (done) break;
      }
      if (buffer.trim()) handleEvent(buffer);
      if (streamError) throw new Error(streamError);
      if (!fullText.trim()) throw new Error("Aether 没有留下完整回应，请再试一次。");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Aether 暂时没有回应，请稍后再试。");
    } finally {
      setThinking(false);
      setStreamingMessageId("");
    }
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (text) void askAether(text);
  }

  function acceptInvitation(invitation: Invitation, messageId?: string) {
    if (!activeJourney) return;
    if (messageId) {
      updateJourney(activeJourney.id, {
        messages: activeJourney.messages.map((message) => message.id === messageId ? { ...message, invitation: null } : message),
      });
    }
    if (invitation.action === "continue_artwork" && activeJourney.artworks.length) {
      updateJourney(activeJourney.id, {
        phase: "creating",
        activeArtworkId: activeJourney.activeArtworkId ?? activeJourney.artworks[0].id,
      });
      return;
    }
    startBlankArtwork();
  }

  function startBlankArtwork() {
    if (!activeJourney) return;
    saveCanvasNow();
    const artwork = makeArtwork(activeJourney.artworks.length);
    updateJourney(activeJourney.id, {
      phase: "creating",
      artworks: [...activeJourney.artworks, artwork],
      activeArtworkId: artwork.id,
    });
  }

  function addArtwork() {
    startBlankArtwork();
  }

  function duplicateArtwork() {
    if (!activeJourney || !activeArtwork) return;
    saveCanvasNow();
    const copy: Artwork = {
      ...activeArtwork,
      id: crypto.randomUUID(),
      title: `${activeArtwork.title} · 续`,
      createdAt: now(),
      updatedAt: now(),
    };
    updateJourney(activeJourney.id, { artworks: [...activeJourney.artworks, copy], activeArtworkId: copy.id });
  }

  function switchArtwork(artworkId: string) {
    if (!activeJourney) return;
    saveCanvasNow();
    updateJourney(activeJourney.id, { activeArtworkId: artworkId });
  }

  function context() {
    return canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;
  }

  function restoreCanvas(dataUrl: string) {
    const ctx = context();
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
    };
    image.src = dataUrl;
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL("image/jpeg", 0.88));
    if (historyRef.current.length > 30) historyRef.current.shift();
    redoRef.current = [];
  }

  function strokeStyle(ctx: CanvasRenderingContext2D) {
    const isEraser = tool === "eraser";
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = tool === "marker" ? "square" : "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = isEraser ? (activeArtwork?.background ?? PAPER) : color;
    ctx.globalAlpha = isEraser ? 1 : tool === "marker" ? Math.min(opacity / 100, 0.28) : opacity / 100;
    ctx.lineWidth = tool === "pencil" ? Math.max(1.5, size * 0.35) : tool === "marker" ? size * 2.4 : size;
  }

  function beginDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const ctx = context();
    if (!ctx) return;
    pushHistory();
    drawingRef.current = true;
    const position = point(event);
    startRef.current = position;
    lastRef.current = position;
    if (["line", "rectangle", "ellipse"].includes(tool)) shapeSnapshotRef.current = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drawShape(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    strokeStyle(ctx);
    ctx.beginPath();
    if (tool === "line") {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    if (tool === "rectangle") ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y);
    if (tool === "ellipse") {
      const centerX = (from.x + to.x) / 2;
      const centerY = (from.y + to.y) / 2;
      ctx.ellipse(centerX, centerY, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function moveDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = context();
    if (!ctx) return;
    const position = point(event);
    ctx.save();
    if (["line", "rectangle", "ellipse"].includes(tool)) {
      if (shapeSnapshotRef.current) ctx.putImageData(shapeSnapshotRef.current, 0, 0);
      drawShape(ctx, startRef.current, position);
    } else {
      strokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(position.x, position.y);
      ctx.stroke();
      ctx.restore();
      lastRef.current = position;
    }
  }

  function endDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    shapeSnapshotRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleSave();
  }

  function scheduleSave() {
    setSavedState("正在保存…");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveCanvasNow();
      setSavedState("已保存在此设备");
    }, 420);
  }

  function saveCanvasNow() {
    if (!activeJourney || !activeArtwork || !canvasRef.current) return;
    patchArtwork(activeJourney.id, activeArtwork.id, { image: canvasRef.current.toDataURL("image/jpeg", 0.84) });
  }

  function undo() {
    const canvas = canvasRef.current;
    const previous = historyRef.current.pop();
    if (!canvas || !previous) return;
    redoRef.current.push(canvas.toDataURL("image/jpeg", 0.88));
    restoreCanvas(previous);
    window.setTimeout(scheduleSave, 100);
  }

  function redo() {
    const canvas = canvasRef.current;
    const next = redoRef.current.pop();
    if (!canvas || !next) return;
    historyRef.current.push(canvas.toDataURL("image/jpeg", 0.88));
    restoreCanvas(next);
    window.setTimeout(scheduleSave, 100);
  }

  function clearCanvas() {
    const ctx = context();
    if (!ctx || !activeArtwork || !window.confirm("清空这幅作品？仍可立即撤销。")) return;
    pushHistory();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = activeArtwork.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    scheduleSave();
  }

  function changeBackground(next: string) {
    const ctx = context();
    if (!ctx || !activeArtwork || !activeJourney) return;
    pushHistory();
    const data = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const source = hexToRgb(activeArtwork.background);
    const target = hexToRgb(next);
    for (let i = 0; i < data.data.length; i += 4) {
      if (Math.abs(data.data[i] - source.r) + Math.abs(data.data[i + 1] - source.g) + Math.abs(data.data[i + 2] - source.b) < 42) {
        data.data[i] = target.r;
        data.data[i + 1] = target.g;
        data.data[i + 2] = target.b;
      }
    }
    ctx.putImageData(data, 0, 0);
    patchArtwork(activeJourney.id, activeArtwork.id, { background: next });
    scheduleSave();
  }

  function hexToRgb(hex: string) {
    const value = hex.replace("#", "");
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
  }

  function uploadArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const ctx = context();
    if (!file || !ctx) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        pushHistory();
        const background = activeArtwork?.background ?? PAPER;
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
        scheduleSave();
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function downloadArtwork(artwork = activeArtwork) {
    if (!artwork) return;
    const image = activeJourney?.phase === "creating" && canvasRef.current && artwork.id === activeArtwork?.id
      ? canvasRef.current.toDataURL("image/jpeg", 0.94)
      : artwork.image;
    if (!image) return;
    const link = document.createElement("a");
    link.download = `${artwork.title}.jpg`;
    link.href = image;
    link.click();
  }

  function analyzeArtwork() {
    if (!canvasRef.current || !activeArtwork || (!activeArtwork.image && historyRef.current.length === 0)) {
      setRequestError("先在画布上留下些内容，再邀请 Aether 来看。");
      return;
    }
    const image = canvasRef.current.toDataURL("image/jpeg", 0.88);
    patchArtwork(activeJourney.id, activeArtwork.id, { image });
    updateJourney(activeJourney.id, { phase: "reflection" });
    void askAether(`我完成了《${activeArtwork.title}》。请把它和我们之前聊过的内容放在一起，认真看看，然后告诉我你的真实感受和见解。`, image, "reflection");
  }

  function returnToConversation() {
    if (!activeJourney) return;
    saveCanvasNow();
    updateJourney(activeJourney.id, { phase: activeJourney.artworks.length ? "reflection" : "dialogue" });
  }

  function endJourney() {
    if (!activeJourney) return;
    updateJourney(activeJourney.id, { phase: "completed", completedAt: now() });
  }

  function renameArtwork(value: string) {
    if (activeJourney && activeArtwork) patchArtwork(activeJourney.id, activeArtwork.id, { title: value });
  }

  function deleteArtwork(artworkId: string) {
    if (!activeJourney || !window.confirm("删除这幅作品？此操作无法撤回。")) return;
    const remaining = activeJourney.artworks.filter((artwork) => artwork.id !== artworkId);
    updateJourney(activeJourney.id, { artworks: remaining, activeArtworkId: remaining[0]?.id, phase: remaining.length ? activeJourney.phase : "dialogue" });
  }

  function renderComposer(compact = false) {
    return (
      <div className={compact ? "composer compact" : "composer"}>
        {requestError && <div className="request-error"><span>!</span><p>{requestError}</p></div>}
        <form onSubmit={submitMessage}>
          <textarea
            rows={compact ? 2 : 3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={modelStatus === "missing" ? "配置 API 后即可开始真实对话" : "写下此刻想到的…"}
            aria-label="与 Aether 对话"
          />
          <button type="submit" disabled={!input.trim() || thinking} aria-label="发送">↗</button>
        </form>
        <div className="model-line">
          <span className={`status-dot ${modelStatus}`} />
          {modelStatus === "checking" && "正在连接模型"}
          {modelStatus === "connected" && `真实模型 · ${modelName || "已连接"}`}
          {modelStatus === "missing" && "模型尚未配置，不会使用预设回复"}
        </div>
      </div>
    );
  }

  function renderMessages(compact = false) {
    return (
      <div className={compact ? "conversation-stream compact" : "conversation-stream"} aria-live="polite">
        {activeJourney?.messages.map((message) => (
          <div className={`turn ${message.role}${message.id === streamingMessageId ? " streaming" : ""}`} key={message.id}>
            {message.role === "assistant" && <span className="speaker">A</span>}
            <div className="turn-content">
              {message.text
                ? <p>{message.text}</p>
                : message.id === streamingMessageId && <p className="thinking-label"><i /><i /><i /><span>{thinkingStage === "thinking" ? "正在认真想" : "正在回应"}</span></p>}
              {message.invitation && activeJourney.messages[activeJourney.messages.length - 1]?.id === message.id && (
                <div className="creation-invitation">
                  <span>一份创作邀请</span>
                  <h3>{message.invitation.title}</h3>
                  <p>{message.invitation.prompt}</p>
                  <button onClick={() => acceptInvitation(message.invitation as Invitation, message.id)}>{message.invitation.action === "continue_artwork" ? "继续这幅作品" : "开始新的作品"} <b>→</b></button>
                  <small>也可以留在这里继续聊</small>
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && !streamingMessageId && <div className="turn assistant thinking"><span className="speaker">A</span><div className="turn-content"><p><i /><i /><i /></p></div></div>}
        <div ref={conversationEndRef} />
      </div>
    );
  }

  function renderSessionSidebar() {
    return (
      <aside className={`session-sidebar${sessionSidebarOpen ? " open" : ""}`} aria-label="对话记录">
        <div className="session-sidebar-head"><div><span>JOURNEYS</span><strong>对话记录</strong></div><button className="session-sidebar-close" onClick={() => setSessionSidebarOpen(false)} aria-label="关闭对话记录">×</button></div>
        <button className="new-session-button" onClick={startNewJourney}><span>＋</span><strong>开启新对话</strong></button>
        <div className="session-list">
          {journeys.map((journey) => {
            const lastUserMessage = [...journey.messages].reverse().find((message) => message.role === "user");
            return (
              <button key={journey.id} className={journey.id === activeJourney.id ? "active" : ""} onClick={() => openJourney(journey.id)}>
                <span className="session-list-orb" />
                <span className="session-list-copy"><strong>{journey.title || "未命名对话"}</strong><small>{lastUserMessage?.text || "还没有开始交谈"}</small><i>{shortDate(journey.updatedAt)} · {journey.phase === "completed" ? "已结束" : `${journey.artworks.length} 幅作品`}</i></span>
              </button>
            );
          })}
        </div>
        <div className="session-sidebar-foot">
          <button onClick={endJourney} disabled={activeJourney.phase === "completed"}>结束当前对话</button>
          <small>结束后仍会保留全部对话与作品</small>
        </div>
      </aside>
    );
  }

  if (!activeJourney) return <main className="boot">AETHER</main>;

  if (screen === "home") {
    return (
      <main className="home-screen">
        <img className="home-cover" src="/og.jpg" alt="Aether 灵魂对话，一张漂浮在深色宇宙中的抽象作品" />
        <div className="home-shade" />
        <header className="home-nav">
          <button className="wordmark" onClick={() => setScreen("home")}>AETHER</button>
          <div className="home-nav-actions">
            {authEnabled ? (
              <>
                <Show when="signed-out"><SignInButton mode="redirect"><button className="home-login-link">邮箱登录</button></SignInButton></Show>
                <Show when="signed-in">
                  <button className="home-space-link" onClick={() => setScreen("space")}>作品空间 <span>{galleryWorks.length}</span></button>
                  <UserButton appearance={{ elements: { avatarBox: "aether-avatar" } }} />
                </Show>
              </>
            ) : <span className="auth-unavailable">登录服务尚未连接</span>}
          </div>
        </header>
        <div className="home-entry">
          {authEnabled ? (
            <>
              <Show when="signed-out"><SignInButton mode="redirect"><button>邮箱登录，开始对话 <span>→</span></button></SignInButton></Show>
              <Show when="signed-in">
                <button onClick={startNewJourney}>开始一段对话 <span>→</span></button>
                {journeys.some((journey) => journey.messages.length > 1 || journey.artworks.length) && (
                  <button className="continue-link" onClick={() => openJourney(journeys[0].id)}>继续上一次</button>
                )}
              </Show>
            </>
          ) : <button disabled>登录服务连接中</button>}
        </div>
        <footer className="home-footer"><span>作品不会替你定义自己</span><span>© 2026 Aether</span></footer>
      </main>
    );
  }

  if (screen === "space") {
    return (
      <main className="space-screen">
        <header className="space-nav"><button className="dark-wordmark" onClick={() => setScreen("home")}>AETHER</button><div className="space-nav-actions"><button onClick={startNewJourney}>新的对话 ＋</button>{authEnabled && <UserButton appearance={{ elements: { avatarBox: "aether-avatar light" } }} />}</div></header>
        <section className="space-heading"><span>ART SPACE</span><h1>作品空间</h1></section>
        <section className="work-grid">
          {galleryWorks.map(({ journey, artwork }) => (
            <article className="work-card" key={artwork.id}>
              <button className="work-image" onClick={() => openJourney(journey.id, "reflection", artwork.id)}><img src={artwork.image} alt={artwork.title} /><span>回到对话</span></button>
              <div><h2>{artwork.title}</h2><p>{journey.title} · {shortDate(artwork.updatedAt)}</p></div>
            </article>
          ))}
          {!galleryWorks.length && <button className="empty-work" onClick={startNewJourney}><span>＋</span><strong>从一段对话开始</strong></button>}
        </section>
      </main>
    );
  }

  return (
    <main className={`session-screen phase-${activeJourney.phase}`}>
      <header className="session-header">
        <button className="dark-wordmark" onClick={() => setScreen("home")}>AETHER</button>
        <input value={activeJourney.title} onChange={(event) => updateJourney(activeJourney.id, { title: event.target.value })} aria-label="对话名称" />
        <div className="session-header-actions">
          <button className="session-list-toggle" onClick={() => setSessionSidebarOpen(true)}>会话</button>
          <button onClick={returnToConversation}>对话</button>
          <button onClick={() => setScreen("space")}>作品 {activeJourney.artworks.length}</button>
          {authEnabled && <UserButton appearance={{ elements: { avatarBox: "aether-avatar" } }} />}
        </div>
      </header>
      {sessionSidebarOpen && <button className="session-sidebar-shade" onClick={() => setSessionSidebarOpen(false)} aria-label="关闭对话记录" />}

      {activeJourney.phase === "dialogue" ? (
        <section className="dialogue-room">
          {renderSessionSidebar()}
          <div className="dialogue-column">
            <div className="dialogue-intro"><span>SOUL DIALOGUE</span><h1>我们先聊一会儿。</h1></div>
            {renderMessages()}
            {renderComposer()}
          </div>
        </section>
      ) : activeJourney.phase === "creating" ? (
        <section className="creation-room">
          {renderSessionSidebar()}
          <aside className="artwork-rail">
            <div className="rail-label">本次旅程</div>
            {activeJourney.artworks.map((artwork, index) => (
              <button className={artwork.id === activeArtwork?.id ? "art-tab active" : "art-tab"} key={artwork.id} onClick={() => switchArtwork(artwork.id)}>
                <span>{artwork.image ? <img src={artwork.image} alt="" /> : <i>{String(index + 1).padStart(2, "0")}</i>}</span>
                <small>{artwork.title}</small>
              </button>
            ))}
            <button className="add-art" onClick={addArtwork}><span>＋</span><small>新作品</small></button>
          </aside>

          <section className="canvas-workspace">
            <div className="canvas-topbar">
              <div className="art-name"><input value={activeArtwork?.title ?? ""} onChange={(event) => renameArtwork(event.target.value)} aria-label="作品名称" /><span>{savedState}</span></div>
              <div className="canvas-actions"><button onClick={duplicateArtwork}>创建续作</button><button onClick={() => downloadArtwork()}>下载</button><button className="danger" onClick={() => activeArtwork && deleteArtwork(activeArtwork.id)}>删除</button><button className="finish-art" onClick={analyzeArtwork} disabled={thinking}>完成创作，回到对话</button></div>
            </div>

            <div className="canvas-main">
              <div className="tool-dock">
                {toolLabels.map((item) => <button key={item.tool} className={tool === item.tool ? "active" : ""} onClick={() => setTool(item.tool)} title={item.label}><span>{item.mark}</span><small>{item.label}</small></button>)}
                <i />
                <button onClick={undo} title="撤销"><span>↶</span><small>撤销</small></button>
                <button onClick={redo} title="重做"><span>↷</span><small>重做</small></button>
                <button onClick={() => uploadRef.current?.click()} title="上传"><span>↑</span><small>上传</small></button>
                <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadArtwork} hidden />
              </div>

              <div className="canvas-scroll">
                <div className="canvas-paper" style={{ width: `${zoom * 100}%`, background: activeArtwork?.background }}>
                  <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onPointerDown={beginDrawing} onPointerMove={moveDrawing} onPointerUp={endDrawing} onPointerCancel={endDrawing} aria-label="Aether 创作画布" />
                  {!activeArtwork?.image && <span className="blank-note">从邀请留给你的感觉开始</span>}
                </div>
              </div>

              <div className="material-bar">
                <div className="palette">
                  {["#19171d", "#5945bd", "#2e67c7", "#b74471", "#d77a35", "#5d967c", "#d7bc55"].map((swatch) => <button key={swatch} className={color === swatch ? "selected" : ""} style={{ background: swatch }} onClick={() => { setColor(swatch); if (tool === "eraser") setTool("brush"); }} aria-label={`颜色 ${swatch}`} />)}
                  <label className="color-picker">＋<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
                </div>
                <label>笔触 <input type="range" min="2" max="56" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
                <label>透明度 <input type="range" min="12" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
                <label className="background-picker">纸张 <input type="color" value={activeArtwork?.background ?? PAPER} onChange={(event) => changeBackground(event.target.value)} /></label>
                <div className="zoom-control"><button onClick={() => setZoom(Math.max(.65, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(1.35, zoom + .1))}>＋</button></div>
                <button className="clear-art" onClick={clearCanvas}>清空</button>
              </div>
            </div>
          </section>

        </section>
      ) : activeJourney.phase === "reflection" ? (
        <section className="reflection-room">
          {renderSessionSidebar()}
          <aside className="reflection-artwork">
            <div className="reflection-artwork-head"><span>本次旅程</span><strong>{activeJourney.artworks.length} 幅作品</strong></div>
            {activeArtwork?.image ? (
              <button className="featured-artwork" onClick={() => updateJourney(activeJourney.id, { phase: "creating" })}>
                <img src={activeArtwork.image} alt={activeArtwork.title} />
                <span><strong>{activeArtwork.title}</strong><small>点击继续修改</small></span>
              </button>
            ) : (
              <button className="featured-artwork empty" onClick={() => updateJourney(activeJourney.id, { phase: "creating" })}><span><strong>{activeArtwork?.title ?? "未命名作品"}</strong><small>回到画布继续创作</small></span></button>
            )}
            <div className="reflection-thumbnails">
              {activeJourney.artworks.map((artwork) => (
                <button key={artwork.id} className={artwork.id === activeArtwork?.id ? "active" : ""} onClick={() => switchArtwork(artwork.id)} title={artwork.title}>
                  {artwork.image ? <img src={artwork.image} alt={artwork.title} /> : <span>空白</span>}
                </button>
              ))}
            </div>
            <div className="reflection-art-actions">
              <button onClick={() => updateJourney(activeJourney.id, { phase: "creating" })}>继续修改</button>
              <button onClick={startBlankArtwork}>再画一幅</button>
              <button onClick={() => activeArtwork && downloadArtwork(activeArtwork)}>下载当前作品</button>
            </div>
          </aside>
          <section className="reflection-dialogue">
            <div className="reflection-heading"><div><span className="orb" /><small>WITH AETHER</small></div><h1>让作品留在我们之间。</h1></div>
            {renderMessages()}
            <div className="reflection-footer">
              <button className="end-journey" onClick={endJourney}>结束这次相遇</button>
              {renderComposer()}
            </div>
          </section>
        </section>
      ) : (
        <section className="completed-layout">
          {renderSessionSidebar()}
          <div className="completed-room">
            <div className="completed-copy"><span>JOURNEY SAVED</span><h1>这次相遇已经保存。</h1><p>对话与 {activeJourney.artworks.length} 幅作品仍在你的作品空间里。结束不是删除，你随时可以回来。</p></div>
            <div className="completed-works">
              {activeJourney.artworks.filter((artwork) => artwork.image).map((artwork) => <img key={artwork.id} src={artwork.image} alt={artwork.title} />)}
            </div>
            <div className="completed-actions"><button onClick={startNewJourney}>开启新的对话</button><button onClick={() => setScreen("space")}>回到作品空间</button><button onClick={() => updateJourney(activeJourney.id, { phase: activeJourney.artworks.length ? "reflection" : "dialogue", completedAt: undefined })}>重新打开这段对话</button></div>
          </div>
        </section>
      )}
    </main>
  );
}
