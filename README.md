# Aether 2.0

> 灵魂对话——在语言与创作之间，留出一层可以自由抵达的空间。

Aether 是一个受原生艺术精神启发的 AI 创作与作品交流空间。它不把画作当成测试题，也不替创作者定义作品：用户先和 Aether 自然交谈，AI 在对话中判断合适的创作时机并发出开放邀请；用户接受后才进入画布。完成一幅或多幅作品后，多模态模型会结合完整对话，提出具体、整体、保留想象力的观看与回应。

## MVP 体验

- 对话先于画布：不按固定轮数推进，也不强迫用户作画
- 动态创作邀请：模型根据语境判断时机，用户可接受或继续聊天
- 多作品 Session：一次旅程可新建、切换、续作、重命名、删除和下载多幅作品
- 完整画布：铅笔、画笔、马克笔、橡皮、直线、矩形、椭圆、颜色、透明度、纸张、缩放、撤销、重做、清空与图片上传
- 多模态阅画：模型先把握整体构图与关系，再用多个具体细节支撑自己的感受和想象
- 多 Session 与作品空间：旅程、对话和作品保存在当前设备，可随时回到其中继续
- 邮箱验证登录：公开首页可浏览，登录后才能进入会话并调用 AI，账号由 Clerk 管理
- 明确的模型状态：未配置真实 API 时会直接说明，不提供预设回复或假分析
- 安全边界：不做心理诊断，不从画面推断人格或疾病；明确危机表达优先转向安全支持

## 效果截图
<img width="2102" height="1234" alt="image" src="https://github.com/user-attachments/assets/5639919a-c118-4d29-a7a9-9f3f6c28c4df" />
<img width="2108" height="1243" alt="image" src="https://github.com/user-attachments/assets/26a06637-0424-41ee-b5fb-6a97475d7fc2" />
<img width="2090" height="1224" alt="image" src="https://github.com/user-attachments/assets/b43c9838-027b-47e9-99eb-30bfc8d3f584" />
<img width="2087" height="1234" alt="image" src="https://github.com/user-attachments/assets/ddf57d1a-ccdc-4fda-90c5-13d27b48c694" />


## 本地运行

```bash
npm install
cp .env.example .env.local
# 在 .env.local 中填写阿里云百炼与 Clerk 环境变量
npm run dev
```

打开 `http://localhost:3000`。

## 模型配置

```env
DASHSCOPE_API_KEY=your_api_key_here
QWEN_MODEL=qwen3.7-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

服务端通过阿里云百炼的 OpenAI 兼容 Chat Completions API 调用 `qwen3.7-plus`，把对话历史和当前画作一起交给原生多模态模型。JSON 输出控制“自然回复 / 是否邀请创作 / 安全等级”，前台只展示自然语言和真正需要出现的创作邀请。API Key 只存在服务端环境变量中。

Clerk 提供邮箱验证、会话和账户菜单。`/api/aether` 同时由 Next.js Proxy 与 Route Handler 校验登录状态，匿名请求不会触发模型调用。Vercel Marketplace 安装 Clerk 后会自动注入认证环境变量。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- Clerk（邮箱验证与服务端会话鉴权）
- 原生 Canvas API
- 阿里云百炼 OpenAI 兼容 Chat Completions API（Qwen 多轮对话、图像理解、JSON 输出）
- localStorage（MVP 设备本地持久化）

## 产品原则

1. 用户是创作者，不是被检测的对象。
2. 作品是作品，不是症状或人格证据。
3. AI 的观看可以大胆，但必须具体、有依据且保持可争辩。
4. AI 不模仿理解，而是带着自己的观看参与交流。
5. 不解释、停下、继续谈或再创作一幅，都是完整的选择。

## 重要声明

Aether 是自由创作与作品交流工具，不是心理咨询、心理治疗或医疗服务。
