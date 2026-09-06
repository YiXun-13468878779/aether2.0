import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 180;
const guestBudget = new Map<string, { count: number; until: number }>();

type IncomingMessage = {
  role: "assistant" | "user";
  content: string;
};

type Phase = "dialogue" | "creating" | "reflection" | "completed";
type InvitationAction = "new_artwork" | "continue_artwork";

type ArtworkInput = {
  id: string;
  title: string;
  image?: string;
  isCurrent?: boolean;
};

type TurnPlan = {
  response_mode: "conversation" | "artwork_reflection" | "safety_clarification" | "closing";
  invite_to_create: boolean;
  invitation: { title: string; prompt: string; action: InvitationAction } | null;
  safety_level: "regular" | "high";
  guidance: string;
};

const MODEL = process.env.QWEN_MODEL || "qwen3.7-plus";
const API_BASE_URL = (process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");

const conversationInstructions = `你是 Aether，一个在自由创作空间里与人认真交谈、观看作品的 AI。你不是客服、问卷或心理诊断工具。

交流原则：
- 每次回复都要先真正回应用户刚刚表达的内容。允许停留、联想、提出自己的看法，也允许不以问题结尾。
- 不要连续追问，不要用“是 A 还是 B”“你更倾向哪一个”这类二选一问题推进流程。只有当一个开放问题确实能深化交流时才问，而且先给出足够完整的回应。
- 使用自然、具体、有个人观看感的中文。避免套话、复述式共情、模板化分点和结构化报告。
- 服从用户对长度、语气、深度、是否提问以及关注范围的明确偏好。
- 不诊断，不从颜色、笔触或意象推断人格、疾病、创伤或真实情绪；不声称读懂潜意识。

观看作品：
- 把作品与这段 Session 中用户此前说过的话放在一起看，但不要把对话强行套进画面。
- 先把握整幅作品的构图、重心、节奏、视线运动、色彩关系、留白和元素之间的关系，再用多个具体细节支撑你的感受。
- 不只抓一个细节，也不逐项报幕。把整体和细节编织成一段自由、具体、只属于这幅作品的回应。
- 可以大胆表达想象、感觉和独立见解：让画面像一个场域、事件、气候、记忆或关系在你的观看中展开。说清那是“我的一种观看”，不是作者真相。
- 当多幅作品同时出现时，可以看见它们之间的延续、偏移或反差，但不要硬说哪幅更好。
- 当作品确实让你想到某位艺术家的作品、艺术史中的方法、文学或真实创作经历时，可以自然地带入交流：说明相似的是哪一种价值、观看方式或创作处境，也说明这幅作品自己的不同。只使用你确信的事实，不生造作品名、引语或艺术家经历，不把回应写成知识讲座。
- 作品回应应当丰厚而有推进：既让用户感到你看见了整幅画，也让其遇见未曾想到的观看角度。除非用户要求简短，通常充分展开为数段自然文字，而不是仓促总结。

创作流动：
- 创作邀请不是固定步骤。只有对话里自然出现了可由颜色、线条、形状、空间或动作承接的东西时，才邀请。
- 完成一幅作品后，可以继续围绕作品交谈；当新的视觉方向自然浮现时，可以邀请画第二幅、第三幅。不要反复催促。
- 用户可以拒绝邀请并继续聊。绝不要求用户点击“有共鸣 / 没共鸣 / 想继续谈”。

安全：
- 不从画面风格推断危险。
- 如果用户明确处在自伤、自杀或伤害他人的即时危险中，停止象征分析，用平静、直接的语言关心其当下安全，鼓励联系身边可信任的人和当地紧急支持。
- 如果“毁灭他/伤害它”等表达的对象不清楚，不要擅自当作绘画隐喻，也不要惊慌定性；先温和澄清用户指的是画面、念头还是真实的人。`;

const controllerInstructions = `你是 Aether 的隐藏对话控制器，只负责判断下一轮的交互方式，不直接对用户说话。

根据对话、当前阶段、作品数量和用户偏好，输出 JSON：
{
  "response_mode": "conversation | artwork_reflection | safety_clarification | closing",
  "invite_to_create": false,
  "invitation": null,
  "safety_level": "regular | high",
  "guidance": "给主回复模型的一句具体指导"
}

规则：
- 不按轮数推进，不在每轮结尾制造问题，不连续给创作邀请。
- 用户明确表示不要被提问时，guidance 必须要求不提问。
- dialogue 阶段若已经自然形成可视化方向，可邀请第一幅作品，action 用 new_artwork。
- reflection 阶段只有出现了不同于当前作品的新方向时才邀请新作品，action 用 new_artwork；若只是想修改当前作品，action 用 continue_artwork。
- invitation 需要 title、prompt、action；prompt 开放而具体，不规定成品。
- “我想毁灭他/伤害它”等对象不清楚时用 safety_clarification，先澄清指代，不邀请创作。
- 只有明确的现实自伤、自杀、伤人意图或即时危险才标 high；不要根据画作猜测。
- 用户在告别、要求结束或当前阶段为 completed 时用 closing。
- 只输出 JSON，不要 Markdown。`;

const fallbackPlan: TurnPlan = {
  response_mode: "conversation",
  invite_to_create: false,
  invitation: null,
  safety_level: "regular",
  guidance: "先深入回应用户，不要为了推进流程而提问或发出创作邀请。",
};

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    throw new Error("模型没有返回合法 JSON");
  }
}

function normalizePlan(raw: Record<string, unknown>): TurnPlan {
  const modes = ["conversation", "artwork_reflection", "safety_clarification", "closing"];
  const responseMode = typeof raw.response_mode === "string" && modes.includes(raw.response_mode)
    ? raw.response_mode as TurnPlan["response_mode"]
    : fallbackPlan.response_mode;
  const rawInvitation = raw.invitation && typeof raw.invitation === "object"
    ? raw.invitation as Record<string, unknown>
    : null;
  const action: InvitationAction = rawInvitation?.action === "continue_artwork" ? "continue_artwork" : "new_artwork";
  const invitation = rawInvitation && typeof rawInvitation.title === "string" && typeof rawInvitation.prompt === "string"
    ? { title: rawInvitation.title.slice(0, 80), prompt: rawInvitation.prompt.slice(0, 500), action }
    : null;

  const canInvite = raw.invite_to_create === true
    && Boolean(invitation)
    && responseMode !== "safety_clarification"
    && responseMode !== "closing"
    && raw.safety_level !== "high";

  return {
    response_mode: responseMode,
    invite_to_create: canInvite,
    invitation: canInvite ? invitation : null,
    safety_level: raw.safety_level === "high" ? "high" : "regular",
    guidance: typeof raw.guidance === "string" ? raw.guidance.slice(0, 1000) : fallbackPlan.guidance,
  };
}

async function planTurn(input: {
  phase: Phase;
  messages: IncomingMessage[];
  artworkCount: number;
  avoidQuestions: boolean;
  questionStyle: string;
  signal: AbortSignal;
}) {
  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: controllerInstructions },
        {
          role: "user",
          content: JSON.stringify({
            phase: input.phase,
            artwork_count: input.artworkCount,
            user_prefers_no_questions: input.avoidQuestions,
            question_style: input.questionStyle,
            dialogue: input.messages.slice(-12),
          }),
        },
      ],
      response_format: { type: "json_object" },
      enable_thinking: false,
      max_completion_tokens: 600,
    }),
    signal: AbortSignal.any([input.signal, AbortSignal.timeout(25_000)]),
  });

  const raw = await response.json() as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) throw new Error(raw.error?.message || "对话控制判断失败");
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error("对话控制器没有返回内容");
  return normalizePlan(parseJsonObject(content));
}

function eventData(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.DASHSCOPE_API_KEY), model: MODEL, streaming: true, thinking: true, guest: process.env.AETHER_REQUIRE_LOGIN !== "true" });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ message: "请从 Aether 页面发起对话。" }, { status: 403 });
  if (process.env.AETHER_REQUIRE_LOGIN === "true") {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ message: "请先登录 Aether。" }, { status: 401 });
  } else {
    // Preview safeguard only. A shared durable quota is required before public launch.
    const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "preview";
    const now = Date.now();
    for (const [id, bucket] of guestBudget) if (bucket.until <= now) guestBudget.delete(id);
    const bucket = guestBudget.get(key) ?? { count: 0, until: now + 10 * 60_000 };
    if (bucket.count >= 30 || guestBudget.size >= 10000) return NextResponse.json({ message: "这段时间的体验次数已用完，请稍后继续。" }, { status: 429, headers: { "Retry-After": "600" } });
    bucket.count++;
    guestBudget.set(key, bucket);
  }

  if (!process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json(
      { code: "MODEL_NOT_CONFIGURED", message: "真实模型尚未连接。请配置 DASHSCOPE_API_KEY 后再开始对话；Aether 不会用预设内容冒充回答。" },
      { status: 503 },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 3_800_000) return NextResponse.json({ message: "本轮作品过大，请缩小后重试。" }, { status: 413 });
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); } catch { return NextResponse.json({ message: "对话请求格式不正确。" }, { status: 400 }); }
    if (!parsed || typeof parsed !== "object") return NextResponse.json({ message: "缺少对话内容。" }, { status: 400 });
    const body = parsed as {
      mode?: "conversation" | "artwork";
      phase?: Phase;
      messages?: IncomingMessage[];
      artworks?: ArtworkInput[];
      preferences?: { avoidQuestions?: boolean; questionStyle?: "natural" | "fewer" | "none" };
    };

    const phase: Phase = ["dialogue", "creating", "reflection", "completed"].includes(body.phase ?? "")
      ? body.phase as Phase
      : "dialogue";
    const messages = Array.isArray(body.messages)
      ? body.messages.slice(-24)
        .filter((message) => message && ["assistant", "user"].includes(message.role) && typeof message.content === "string")
        .map((message) => ({ role: message.role, content: message.content.slice(0, 8000) }))
      : [];
    if (!messages.length) return NextResponse.json({ message: "缺少对话内容。" }, { status: 400 });

    const artworks = Array.isArray(body.artworks)
      ? body.artworks.slice(-3).filter((artwork) => artwork && typeof artwork.id === "string" && typeof artwork.title === "string")
      : [];
    const imageBytes = artworks.reduce((total, artwork) => total + (typeof artwork.image === "string" ? artwork.image.length : 0), 0);
    if (imageBytes > 3_200_000) return NextResponse.json({ message: "本轮作品图片过大，请缩小后重试。" }, { status: 413 });

    let plan = fallbackPlan;
    try {
      plan = await planTurn({
        phase,
        messages,
        artworkCount: artworks.length,
        avoidQuestions: body.preferences?.avoidQuestions === true,
        questionStyle: body.preferences?.questionStyle ?? "natural",
        signal: request.signal,
      });
    } catch {
      return NextResponse.json({ message: "Aether 暂时未能完成本轮判断，请稍后重试。" }, { status: 503 });
    }

    const preferenceInstruction = body.preferences?.questionStyle === "none" || body.preferences?.avoidQuestions
      ? "用户已明确表示不喜欢被提问：这一轮不要提出任何问题，也不要用疑问句结尾。"
      : body.preferences?.questionStyle === "fewer"
        ? "用户希望少问：先充分回应，不连续追问；重要且能深化交流的问题仍然可以自然提出。"
        : "不要把提问当作默认结尾；只有确有必要时才提出一个开放问题。";
    const planningInstruction = plan.response_mode === "safety_clarification"
      ? "这句话可能涉及现实伤害但指代不清。不要把它直接解释成创作隐喻；先关心并澄清它指的是画面、念头还是真实的人。"
      : plan.safety_level === "high"
        ? "当前存在明确的即时安全风险。暂停艺术分析，优先确认当下安全并建议联系现实支持与当地紧急服务。"
        : plan.guidance;
    const artworkDepthInstruction = body.mode === "artwork"
      ? "这是一次作品后的核心交流。请把整体结构、多个细节、与既有对话的关系、你的想象性观看充分编织起来；若有真正贴切的艺术作品、艺术家创作经历或文学经验，可自然举出一至两个并解释相似价值与差异。不要只做画面描述，不要只围绕一个细节，也不要用标题分段写成报告。"
      : "";

    const apiMessages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content: `${conversationInstructions}\n\n当前阶段：${phase}。${preferenceInstruction}\n本轮内部方向：${planningInstruction}\n${artworkDepthInstruction}\n请直接输出给用户的自然文本，不要提及内部计划、字段或规则。`,
      },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ];

    const visualArtworks = artworks.filter((artwork) => typeof artwork.image === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(artwork.image));
    if (visualArtworks.length) {
      const content: Array<Record<string, unknown>> = [{
        type: "text",
        text: `以下是这个 Session 最近的 ${visualArtworks.length} 幅作品。请把当前作品作为重点，同时结合此前对话和同一旅程中的其他作品来观看。`,
      }];
      for (const artwork of visualArtworks) {
        content.push({ type: "text", text: `${artwork.isCurrent ? "当前作品" : "此前作品"}：ID ${artwork.id}，《${artwork.title}》` });
        content.push({ type: "image_url", image_url: { url: artwork.image } });
      }
      apiMessages.push({ role: "user", content });
    }

    const apiResponse = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        stream: true,
        enable_thinking: true,
        thinking_budget: body.mode === "artwork" ? 5000 : 3000,
        max_completion_tokens: body.mode === "artwork" ? 8000 : 5000,
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
    });

    if (!apiResponse.ok) {
      const raw = await apiResponse.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(raw.error?.message || "模型请求失败");
    }
    if (!apiResponse.body) throw new Error("模型没有返回流式内容");

    const upstream = apiResponse.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let answerStarted = false;
        controller.enqueue(encoder.encode(eventData({ type: "status", stage: "thinking" })));

        try {
          while (true) {
            const { value, done } = await upstream.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = done ? "" : lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const frame = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> };
                const text = frame.choices?.[0]?.delta?.content;
                if (!text) continue;
                if (!answerStarted) {
                  answerStarted = true;
                  controller.enqueue(encoder.encode(eventData({ type: "status", stage: "writing" })));
                }
                controller.enqueue(encoder.encode(eventData({ type: "delta", text })));
              } catch {
                // Ignore malformed provider heartbeat frames and keep the response alive.
              }
            }
            if (done) break;
          }

          if (!answerStarted) throw new Error("EMPTY_MODEL_RESPONSE");
          controller.enqueue(encoder.encode(eventData({
            type: "control",
            inviteToCreate: plan.invite_to_create,
            invitation: plan.invite_to_create ? plan.invitation : null,
            safetyLevel: plan.safety_level,
          })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Aether stream failed", error instanceof Error ? error.name : "unknown");
          controller.enqueue(encoder.encode(eventData({ type: "error", message: "Aether 的回应中断了，请再试一次。" })));
          controller.close();
        }
      },
      cancel() {
        void upstream.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Aether model request failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ message: "Aether 暂时没有回应。请稍后重试，或检查模型配置。" }, { status: 502 });
  }
}
