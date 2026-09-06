"use client";
/* eslint-disable @next/next/no-img-element -- local cover and user-created data URLs intentionally bypass image optimization */

import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Show, UserButton } from "@clerk/nextjs";

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
  favorite?: boolean;
  phase: Phase;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  artworks: Artwork[];
  activeArtworkId?: string;
  preferences?: { avoidQuestions?: boolean; questionStyle?: "natural" | "fewer" | "none" };
  completedAt?: string;
};

type ModelStatus = "checking" | "connected" | "missing";

const WIDTH = 1200;
const HEIGHT = 780;
const PAPER = "#f6f1e7";


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
  const restoreGenerationRef = useRef(0);
  const canvasReadyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);
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
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(86);
  const [zoom, setZoom] = useState(1);
  const [savedState, setSavedState] = useState("体验暂存 · 刷新前请导出旅程");
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(false);
  const [openJourneyMenuId, setOpenJourneyMenuId] = useState("");

  const activeJourney = journeys.find((journey) => journey.id === activeJourneyId) ?? journeys[0];
  const activeArtwork = activeJourney?.artworks.find((artwork) => artwork.id === activeJourney.activeArtworkId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const first = makeJourney();
      setJourneys([first]);
      setActiveJourneyId(first.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (screen === "home") return;

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
  }, [screen]);

  useEffect(() => {
    if (screen !== "session" || activeJourney?.phase !== "creating" || !activeArtwork) return;
    canvasReadyRef.current = false;
    const generation = ++restoreGenerationRef.current;
    const ctx = context();
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = activeArtwork.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    historyRef.current = [];
    redoRef.current = [];
    if (activeArtwork.image) restoreCanvas(activeArtwork.image);
    else canvasReadyRef.current = true;
    return () => {
      if (restoreGenerationRef.current >= generation) ++restoreGenerationRef.current;
      canvasReadyRef.current = false;
    };
    // Restore only on navigation, never on the snapshot update it triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeJourneyId, activeJourney?.phase, activeArtwork?.id]);

  useEffect(() => () => { requestRef.current?.abort(); }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!journeys.some((journey) => journey.messages.length > 1 || journey.artworks.length)) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [journeys]);

  const galleryWorks = useMemo(
    () => journeys.flatMap((journey) => journey.artworks.map((artwork) => ({ journey, artwork }))).filter(({ artwork }) => artwork.image),
    [journeys],
  );

  useEffect(() => {
    if (screen !== "session") return;
    conversationEndRef.current?.scrollIntoView({ block: "end" });
  }, [screen, activeJourney?.phase, activeJourney?.messages]);

  useEffect(() => {
    if (!openJourneyMenuId) return;

    function closeJourneyMenu(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-session-menu]")) return;
      setOpenJourneyMenuId("");
    }

    function closeJourneyMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenJourneyMenuId("");
    }

    window.addEventListener("pointerdown", closeJourneyMenu);
    window.addEventListener("keydown", closeJourneyMenuWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeJourneyMenu);
      window.removeEventListener("keydown", closeJourneyMenuWithKeyboard);
    };
  }, [openJourneyMenuId]);

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
    saveCanvasNow();
    stopResponse();
    if (activeJourney?.messages.length === 1 && !activeJourney.artworks.length) {
      setScreen("session");
      return;
    }
    const journey = makeJourney();
    setJourneys((current) => [journey, ...current]);
    setActiveJourneyId(journey.id);
    setScreen("session");
    setRequestError("");
    setSessionSidebarOpen(false);
  }

  function openJourney(journeyId: string, phase?: Phase, artworkId?: string) {
    stopResponse();
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

  function toggleJourneyFavorite(journeyId: string) {
    setJourneys((current) => current.map((journey) => journey.id === journeyId
      ? { ...journey, favorite: !journey.favorite }
      : journey));
    setOpenJourneyMenuId("");
  }

  function deleteJourney(journeyId: string) {
    const journey = journeys.find((item) => item.id === journeyId);
    if (!journey) return;
    setOpenJourneyMenuId("");
    const artworkNote = journey.artworks.length ? `，其中的 ${journey.artworks.length} 幅作品也会一起移除` : "";
    if (!window.confirm(`删除“${journey.title || "未命名对话"}”${artworkNote}？此操作无法撤回。`)) return;

    const remaining = journeys.filter((item) => item.id !== journeyId);
    if (!remaining.length) {
      const replacement = makeJourney();
      setJourneys([replacement]);
      setActiveJourneyId(replacement.id);
    } else {
      setJourneys(remaining);
      if (activeJourneyId === journeyId) setActiveJourneyId(remaining[0].id);
    }
    setRequestError("");
  }

  function nextQuestionStyle(text: string): "natural" | "fewer" | "none" {
    if (/少问|不要总是问|别老是问/.test(text)) return "fewer";
    if (/可以(继续)?问|你可以问|可以提问/.test(text)) return "natural";
    if (/不要(再)?问|别(再)?问|不想(被)?问|不喜欢.*问/.test(text)) return "none";
    return activeJourney?.preferences?.questionStyle ?? (activeJourney?.preferences?.avoidQuestions ? "none" : "natural");
  }

  async function modelImage(dataUrl?: string) {
    if (!dataUrl) return undefined;
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("作品暂时无法读取。");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  async function askAether(text: string, image?: string, phaseOverride?: Phase) {
    if (!activeJourney || requestRef.current) return;
    const journeyId = activeJourney.id;
    const requestController = new AbortController();
    requestRef.current = requestController;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text };
    const nextMessages = [...activeJourney.messages, userMessage];
    const questionStyle = nextQuestionStyle(text);
    const avoidQuestions = questionStyle === "none";
    const shouldNameJourney = activeJourney.title === "一段新的对话"
      && activeJourney.messages.every((message) => message.role !== "user");
    updateJourney(journeyId, {
      messages: nextMessages,
      preferences: { ...activeJourney.preferences, avoidQuestions, questionStyle },
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
      const modelArtworks = await Promise.all(contextArtworks.map(async (artwork) => ({ ...artwork, image: await modelImage(artwork.image) })));
      const response = await fetch("/api/aether", {
        method: "POST",
        signal: requestController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: image ? "artwork" : "conversation",
          phase: phaseOverride ?? activeJourney.phase,
          messages: nextMessages.slice(-24).map(({ role, text: content }) => ({ role, content: content.slice(0, 8000) })),
          artworks: modelArtworks,
          preferences: { avoidQuestions, questionStyle },
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
        if (requestRef.current !== requestController) return;
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
      if (!requestController.signal.aborted && requestRef.current === requestController) {
        setRequestError(error instanceof Error ? error.message : "Aether 暂时没有回应，请稍后再试。");
      }
    } finally {
      if (requestRef.current === requestController) {
        requestRef.current = null;
        setThinking(false);
        setStreamingMessageId("");
      }
    }
  }

  function stopResponse() {
    requestRef.current?.abort();
    requestRef.current = null;
    setThinking(false);
    setStreamingMessageId("");
  }

  function navigateTo(next: Screen) {
    saveCanvasNow();
    stopResponse();
    setScreen(next);
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
    setJourneys((current) => current.map((journey) => journey.id === activeJourney.id
      ? { ...journey, phase: "creating", artworks: [...journey.artworks, artwork], activeArtworkId: artwork.id, updatedAt: now() }
      : journey));
  }

  function addArtwork() {
    startBlankArtwork();
  }

  function duplicateArtwork() {
    if (!activeJourney || !activeArtwork) return;
    const snapshot = saveCanvasNow();
    const copy: Artwork = {
      ...activeArtwork,
      image: snapshot ?? activeArtwork.image,
      id: crypto.randomUUID(),
      title: `${activeArtwork.title} · 续`,
      createdAt: now(),
      updatedAt: now(),
    };
    setJourneys((current) => current.map((journey) => journey.id === activeJourney.id
      ? { ...journey, artworks: [...journey.artworks, copy], activeArtworkId: copy.id, updatedAt: now() }
      : journey));
  }

  function switchArtwork(artworkId: string) {
    if (!activeJourney) return;
    saveCanvasNow();
    updateJourney(activeJourney.id, { activeArtworkId: artworkId });
  }

  function context() {
    return canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;
  }

  function restoreCanvas(dataUrl: string, onRestored?: () => void) {
    const ctx = context();
    if (!ctx) return;
    const generation = ++restoreGenerationRef.current;
    canvasReadyRef.current = false;
    const image = new Image();
    image.onload = () => {
      if (generation !== restoreGenerationRef.current || ctx.canvas !== canvasRef.current) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
      canvasReadyRef.current = true;
      onRestored?.();
    };
    image.onerror = () => {
      if (generation === restoreGenerationRef.current) setRequestError("这幅作品暂时无法读取，请重新导入。");
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
    historyRef.current.push(canvas.toDataURL("image/png"));
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
    if (!ctx || !canvasReadyRef.current || !event.isPrimary) return;
    pushHistory();
    drawingRef.current = true;
    const position = point(event);
    startRef.current = position;
    lastRef.current = position;
    if (["line", "rectangle", "ellipse"].includes(tool)) shapeSnapshotRef.current = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    if (!["line", "rectangle", "ellipse"].includes(tool)) {
      ctx.save();
      strokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.lineTo(position.x + 0.01, position.y + 0.01);
      ctx.stroke();
      ctx.restore();
    }
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
    // Capture now. A delayed callback must never read a different artwork's canvas.
    saveCanvasNow();
  }

  function saveCanvasNow(): string | undefined {
    if (screen !== "session" || activeJourney?.phase !== "creating" || !activeArtwork || !canvasRef.current || !canvasReadyRef.current) return;
    const image = canvasRef.current.toDataURL("image/png");
    patchArtwork(activeJourney.id, activeArtwork.id, { image });
    setSavedState("体验暂存 · 刷新前请导出旅程");
    return image;
  }

  function undo() {
    const canvas = canvasRef.current;
    const previous = historyRef.current.pop();
    if (!canvas || !previous) return;
    redoRef.current.push(canvas.toDataURL("image/png"));
    restoreCanvas(previous, scheduleSave);
  }

  function redo() {
    const canvas = canvasRef.current;
    const next = redoRef.current.pop();
    if (!canvas || !next) return;
    historyRef.current.push(canvas.toDataURL("image/png"));
    restoreCanvas(next, scheduleSave);
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
    event.target.value = "";
    const ctx = context();
    if (!file || !ctx || !canvasReadyRef.current) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000) {
      setRequestError("请使用 10MB 以内的 PNG、JPG 或 WebP 图片。");
      return;
    }
    const generation = ++restoreGenerationRef.current;
    canvasReadyRef.current = false;
    const url = URL.createObjectURL(file);
    const image = new Image();
    const isCurrent = () => generation === restoreGenerationRef.current && ctx.canvas === canvasRef.current;
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!isCurrent()) return;
      canvasReadyRef.current = true;
      if (image.width > 16000 || image.height > 16000) {
        setRequestError("图片尺寸过大，请先缩小后上传。");
        return;
      }
      pushHistory();
      ctx.fillStyle = activeArtwork?.background ?? PAPER;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
      scheduleSave();
      setRequestError("");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      if (isCurrent()) {
        canvasReadyRef.current = true;
        setRequestError("图片无法读取，请换一张再试。");
      }
    };
    image.src = url;
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
    if (!canvasRef.current || !canvasReadyRef.current || !activeArtwork || (!activeArtwork.image && historyRef.current.length === 0)) {
      setRequestError("先在画布上留下些内容，再邀请 Aether 来看。");
      return;
    }
    const image = canvasRef.current.toDataURL("image/png");
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
    saveCanvasNow();
    stopResponse();
    updateJourney(activeJourney.id, { phase: "completed", completedAt: now() });
  }

  function exportJourney() {
    if (!activeJourney) return;
    const image = saveCanvasNow();
    const snapshot = { ...activeJourney, artworks: activeJourney.artworks.map((artwork) => artwork.id === activeArtwork?.id && image ? { ...artwork, image } : artwork) };
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "aether-journey", version: 1, journey: snapshot }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = (activeJourney.title || "Aether") + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJourney(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("旅程文件过大，请分开导入。");
      const raw = JSON.parse(await file.text());
      const item = raw.journey as Journey;
      if (raw.format !== "aether-journey" || raw.version !== 1 || !item || typeof item.title !== "string" || !Array.isArray(item.messages) || !Array.isArray(item.artworks)) throw new Error("请选择 Aether 导出的旅程文件。");
      if (item.messages.length > 500 || item.artworks.length > 40 || !item.messages.every((message) => message && ["assistant", "user"].includes(message.role) && typeof message.text === "string") || !item.artworks.every((artwork) => artwork && typeof artwork.id === "string" && typeof artwork.title === "string" && /^#[0-9a-f]{6}$/i.test(artwork.background) && (!artwork.image || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(artwork.image)))) throw new Error("旅程文件内容不完整或格式不受支持。");
      saveCanvasNow();
      stopResponse();
      const timestamp = now();
      const journey: Journey = { id: crypto.randomUUID(), title: item.title.slice(0, 200), phase: item.artworks.length ? "reflection" : "dialogue", createdAt: timestamp, updatedAt: timestamp, messages: item.messages.map((message) => ({ id: crypto.randomUUID(), role: message.role, text: message.text.slice(0, 16000) })), artworks: item.artworks.map((artwork) => ({ id: artwork.id, title: artwork.title.slice(0, 200), image: artwork.image, background: artwork.background, createdAt: timestamp, updatedAt: timestamp })), activeArtworkId: item.artworks.some((artwork) => artwork.id === item.activeArtworkId) ? item.activeArtworkId : item.artworks[0]?.id };
      setJourneys((current) => [journey, ...current]);
      setActiveJourneyId(journey.id);
      setScreen("session");
      setRequestError("");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "旅程导入失败。");
    }
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
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={modelStatus === "missing" ? "配置 API 后即可开始真实对话" : "写下此刻想到的…"}
            aria-label="与 Aether 对话"
          />
          {thinking ? <button type="button" onClick={stopResponse} aria-label="停止回应">■</button> : <button type="submit" disabled={!input.trim()} aria-label="发送">↗</button>}
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
    const orderedJourneys = [
      ...journeys.filter((journey) => journey.favorite),
      ...journeys.filter((journey) => !journey.favorite),
    ];

    return (
      <aside className={`session-sidebar${sessionSidebarOpen ? " open" : ""}`} aria-label="对话记录">
        <div className="session-sidebar-head"><div><span>JOURNEYS</span><strong>对话记录</strong></div><button className="session-sidebar-close" onClick={() => setSessionSidebarOpen(false)} aria-label="关闭对话记录">×</button></div>
        <button className="new-session-button" onClick={startNewJourney}><span>＋</span><strong>开启新对话</strong></button>
        <div className="session-list">
          {orderedJourneys.map((journey) => {
            const lastUserMessage = [...journey.messages].reverse().find((message) => message.role === "user");
            return (
              <div key={journey.id} className={`session-list-item${journey.id === activeJourney.id ? " active" : ""}${journey.favorite ? " favorite" : ""}`}>
                <button className="session-open" onClick={() => openJourney(journey.id)} aria-label={`打开对话：${journey.title || "未命名对话"}`}>
                  <span className="session-list-orb" />
                  <span className="session-list-copy"><strong>{journey.title || "未命名对话"}</strong><small>{lastUserMessage?.text || "还没有开始交谈"}</small><i>{shortDate(journey.updatedAt)} · {journey.phase === "completed" ? "已结束" : `${journey.artworks.length} 幅作品`}</i></span>
                </button>
                <div className="session-item-menu" data-session-menu>
                  <button
                    className="session-menu-trigger"
                    onClick={() => setOpenJourneyMenuId((current) => current === journey.id ? "" : journey.id)}
                    aria-label={`管理对话：${journey.title || "未命名对话"}`}
                    aria-haspopup="menu"
                    aria-expanded={openJourneyMenuId === journey.id}
                  >…</button>
                  {openJourneyMenuId === journey.id && (
                    <div className="session-menu-popover" role="menu" aria-label={`管理“${journey.title || "未命名对话"}”`}>
                      <button role="menuitem" onClick={() => toggleJourneyFavorite(journey.id)}>
                        <span aria-hidden="true">{journey.favorite ? "★" : "☆"}</span>
                        {journey.favorite ? "取消收藏" : "收藏对话"}
                      </button>
                      <button className="danger" role="menuitem" onClick={() => deleteJourney(journey.id)}>
                        <span aria-hidden="true">×</span>
                        删除对话
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="session-sidebar-foot">
          <button onClick={endJourney} disabled={activeJourney.phase === "completed"}>结束当前对话</button>
          <button onClick={exportJourney}>导出这段旅程</button>
          <button onClick={() => restoreFileRef.current?.click()}>导入旅程</button>
          <input ref={restoreFileRef} type="file" accept=".json,application/json" hidden onChange={importJourney} />
          <small>体验暂存，刷新前请导出。云端保存接入中。</small>
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
          <button className="wordmark" onClick={() => navigateTo("home")}>AETHER</button>
          <div className="home-nav-actions">
            <button className="home-space-link" onClick={() => navigateTo("space")}>作品空间 <span>{galleryWorks.length}</span></button>
            {authEnabled && <><Show when="signed-out"><a className="home-login-link" href="/sign-in">邮箱登录</a></Show><Show when="signed-in"><UserButton /></Show></>}
          </div>
        </header>
        <div className="home-entry">
          <div className="home-intro"><span>AETHER</span><h1>灵魂对话</h1><p>让语言成为线条，让作品继续说话。</p></div>
          <button onClick={startNewJourney}>开始一段对话 <span>→</span></button>
          <small>无需登录，即可开始</small>
          {journeys.some((journey) => journey.messages.length > 1 || journey.artworks.length) && <button className="continue-link" onClick={() => openJourney([...journeys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id)}>继续最近的旅程</button>}
        </div>
        <footer className="home-footer"><span>作品不会替你定义自己</span><span>© 2026 Aether</span></footer>
      </main>
    );
  }

  if (screen === "space") {
    return (
      <main className="space-screen">
        <header className="space-nav"><button className="dark-wordmark" onClick={() => navigateTo("home")}>AETHER</button><div className="space-nav-actions"><button onClick={startNewJourney}>新的对话 ＋</button>{authEnabled && <UserButton appearance={{ elements: { avatarBox: "aether-avatar light" } }} />}</div></header>
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
        <button className="dark-wordmark" onClick={() => navigateTo("home")}>AETHER</button>
        <input value={activeJourney.title} onChange={(event) => updateJourney(activeJourney.id, { title: event.target.value })} aria-label="对话名称" />
        <div className="session-header-actions">
          <button className="session-list-toggle" onClick={() => setSessionSidebarOpen(true)}>会话</button>
          <button onClick={returnToConversation}>对话</button>
          <button onClick={() => navigateTo("space")}>作品 {activeJourney.artworks.length}</button>
          {authEnabled && <UserButton appearance={{ elements: { avatarBox: "aether-avatar" } }} />}
        </div>
      </header>
      {sessionSidebarOpen && <button className="session-sidebar-shade" onClick={() => setSessionSidebarOpen(false)} aria-label="关闭对话记录" />}

      {activeJourney.phase === "dialogue" ? (
        <section className="dialogue-room">
          {renderSessionSidebar()}
          <div className="dialogue-column">
            <div className="dialogue-intro"><span>SOUL DIALOGUE</span><h1>我们先聊一会儿。</h1></div>
            <div className="manual-create"><button onClick={startBlankArtwork}>开始创作 / 上传作品 <span>↗</span></button><small>想画的时候，随时开始。</small></div>
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
              {requestError && <p className="request-error" role="alert">{requestError}</p>}
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
                <div className="stroke-control">
                  <span>笔触</span>
                  <button onClick={() => setSize((current) => Math.max(1, current - 1))} aria-label="减小笔触">−</button>
                  <input type="range" min="1" max="40" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label="笔触粗细" />
                  <output>{size}px</output>
                  <button onClick={() => setSize((current) => Math.min(40, current + 1))} aria-label="增大笔触">＋</button>
                </div>
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
            <div className="completed-copy"><span>JOURNEY PAUSED</span><h1>为这次相遇留一处停顿。</h1><p>这段对话与 {activeJourney.artworks.length} 幅作品暂存在本次体验中。刷新或离开前，请导出旅程。</p><button onClick={exportJourney}>导出完整旅程</button></div>
            <div className="completed-works">
              {activeJourney.artworks.filter((artwork) => artwork.image).map((artwork) => <img key={artwork.id} src={artwork.image} alt={artwork.title} />)}
            </div>
            <div className="completed-actions"><button onClick={startNewJourney}>开启新的对话</button><button onClick={() => navigateTo("space")}>回到作品空间</button><button onClick={() => updateJourney(activeJourney.id, { phase: activeJourney.artworks.length ? "reflection" : "dialogue", completedAt: undefined })}>重新打开这段对话</button></div>
          </div>
        </section>
      )}
    </main>
  );
}
