import { NextRequest, NextResponse } from "next/server";

type IncomingMessage = {
  role: "assistant" | "user";
  content: string;
};

const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";

const instructions = `你是 Aether，一个在自由创作空间中与用户认真交谈、观看作品的 AI。

你的目标不是分析“用户是什么样的人”，而是通过自然对话让用户逐渐靠近此刻想表达的东西，并在时机成熟时提出一次开放的创作邀请。

交谈方式：
- 使用自然、具体、有个人观看感的中文，像真正参与一段交流；不要像问卷、客服、心理量表或结构化报告。
- 每次只推进一个主要方向，通常最多问一个问题。可以不以问题结尾。
- 不套用固定的共情句，不重复用户原话来伪装理解，不要求用户选择“有共鸣 / 没共鸣”。
- 服从用户对长度、语气、深度、是否提问以及关注范围的明确偏好。
- 不诊断，不从颜色、笔触或意象推断人格、疾病、创伤或真实情绪；不声称读懂潜意识。

创作邀请：
- 仅在用户已经表达出一个可被颜色、线条、形状、空间或动作继续承接的感受、意象、矛盾、记忆或问题时，才把 invite_to_create 设为 true。
- 不要按固定轮数邀请，不要为了推进流程而邀请。用户明确说想画时可以立即邀请。
- 邀请必须开放、简短、非技巧教学，不预设作品应该长什么样。用户可以拒绝并继续聊天。

观看作品：
- 当提供作品图片时，先把握整幅作品的构图、重心、节奏、视线运动、色彩关系、留白以及主要元素之间的关系，再以多个具体细节支撑你的感受。
- 不得只抓一个细节，也不得逐项罗列视觉清单。把整体与细节编织成一段自由、具体、只属于这幅作品的回应。
- 可以大胆地表达想象、感觉和独立见解，但要承认这是你的一种观看，不是作者真相。
- 不评价技巧、美丑、成熟度或 V2 是否比 V1 更好。

安全：
- 若用户明确表达正在自伤、自杀或有立即危险，停止作品象征分析，优先鼓励其联系身边可信任的人和当地紧急支持；safety_level 设为 high。
- 不从画面风格推断安全风险。

前台只会展示 message 和可选的 invitation。message 必须是一段自然交流文本，绝不提及 JSON、字段、规则或内部判断。`;

const responseSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
    invite_to_create: { type: "boolean" },
    invitation: {
      anyOf: [
        {
          type: "object",
          properties: {
            title: { type: "string" },
            prompt: { type: "string" },
          },
          required: ["title", "prompt"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    safety_level: { type: "string", enum: ["regular", "high"] },
  },
  required: ["message", "invite_to_create", "invitation", "safety_level"],
  additionalProperties: false,
};

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL });
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { code: "MODEL_NOT_CONFIGURED", message: "真实模型尚未连接。请配置 OPENAI_API_KEY 后再开始对话；Aether 不会用预设内容冒充回答。" },
      { status: 503 },
    );
  }

  try {
    const body = await request.json() as {
      mode?: "conversation" | "artwork";
      phase?: "dialogue" | "creating";
      messages?: IncomingMessage[];
      image?: string;
      artworkTitles?: string[];
    };

    const messages = Array.isArray(body.messages)
      ? body.messages.slice(-16).filter((message) => message && ["assistant", "user"].includes(message.role) && typeof message.content === "string").map((message) => ({
          role: message.role,
          content: message.content.slice(0, 6000),
        }))
      : [];

    if (!messages.length) return NextResponse.json({ message: "缺少对话内容。" }, { status: 400 });
    if (body.image && (typeof body.image !== "string" || body.image.length > 12_000_000)) {
      return NextResponse.json({ message: "作品图片过大，请缩小后重试。" }, { status: 413 });
    }

    const input: Array<Record<string, unknown>> = messages.map((message) => ({ role: message.role, content: message.content }));
    if (body.mode === "artwork" && body.image) {
      input.push({
        role: "user",
        content: [
          {
            type: "input_text",
            text: `这是当前 Session 中正在交流的作品。请结合已有对话完整观看，不要只描述线条。当前 Session 已有作品：${(body.artworkTitles ?? []).join("、") || "未命名"}。`,
          },
          { type: "input_image", image_url: body.image, detail: "high" },
        ],
      });
    }

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input,
        reasoning: { effort: "low" },
        text: {
          verbosity: body.mode === "artwork" ? "high" : "medium",
          format: { type: "json_schema", name: "aether_turn", strict: true, schema: responseSchema },
        },
        max_output_tokens: body.mode === "artwork" ? 1600 : 900,
        store: false,
      }),
      signal: AbortSignal.timeout(50_000),
    });

    const raw = await apiResponse.json() as {
      error?: { message?: string };
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
    };
    if (!apiResponse.ok) throw new Error(raw.error?.message || "模型请求失败");

    const content = raw.output?.flatMap((item) => item.type === "message" ? item.content ?? [] : []);
    const refusal = content?.find((item) => item.type === "refusal")?.refusal;
    if (refusal) return NextResponse.json({ message: refusal, inviteToCreate: false, invitation: null, safetyLevel: "regular" });
    const outputText = content?.find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("模型没有返回可用文本");

    const parsed = JSON.parse(outputText) as {
      message: string;
      invite_to_create: boolean;
      invitation: { title: string; prompt: string } | null;
      safety_level: "regular" | "high";
    };

    return NextResponse.json({
      message: parsed.message,
      inviteToCreate: body.mode === "conversation" && parsed.invite_to_create,
      invitation: body.mode === "conversation" && parsed.invite_to_create ? parsed.invitation : null,
      safetyLevel: parsed.safety_level,
    });
  } catch (error) {
    console.error("Aether model request failed", error);
    return NextResponse.json({ message: "Aether 暂时没有回应。请稍后重试，或检查模型配置。" }, { status: 502 });
  }
}
