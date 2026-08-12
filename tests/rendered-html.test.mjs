import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server-renders Aether metadata and boot shell", async () => {
  const [layout, page, app] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aether-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="zh-CN"/i);
  assert.match(layout, /Aether — 灵魂对话/i);
  assert.match(layout, /自由创作与作品交流空间/);
  assert.match(page, /AetherApp/);
  assert.match(app, /AETHER/);
  assert.doesNotMatch(page, /Your site is taking shape|Building your site/);
});

test("source keeps the conversation-first, multi-work and real-model contract", async () => {
  const [page, api, readme] = await Promise.all([
    readFile(new URL("../app/aether-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/aether/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /phase:\s*"dialogue"/);
  assert.match(page, /inviteToCreate/);
  assert.match(page, /artworks:\s*Artwork\[\]/);
  assert.match(page, /function addArtwork\(/);
  assert.match(page, /function duplicateArtwork\(/);
  assert.match(page, /phase:\s*"reflection"/);
  assert.match(page, /完成创作，回到对话/);
  assert.match(page, /结束这次相遇/);
  assert.match(page, /对话记录/);
  assert.match(page, /开启新对话/);
  assert.match(page, /结束当前对话/);
  assert.match(page, /toggleJourneyFavorite/);
  assert.match(page, /deleteJourney/);
  assert.match(page, /收藏并置顶/);
  assert.match(page, /min="1" max="40"/);
  assert.match(page, /减小笔触/);
  assert.match(page, /preferences:\s*\{ avoidQuestions \}/);
  assert.match(page, /<canvas/);
  assert.match(page, /src="\/og\.jpg"/);

  assert.match(api, /dashscope\.aliyuncs\.com\/compatible-mode\/v1/);
  assert.match(api, /image_url/);
  assert.match(api, /json_object/);
  assert.match(api, /enable_thinking:\s*false/);
  assert.match(api, /enable_thinking:\s*true/);
  assert.match(api, /thinking_budget/);
  assert.match(api, /艺术家的作品、艺术史中的方法/);
  assert.match(api, /艺术家创作经历或文学经验/);
  assert.match(api, /stream:\s*true/);
  assert.match(api, /safety_clarification/);
  assert.match(api, /text\/event-stream/);
  assert.match(api, /MODEL_NOT_CONFIGURED/);
  assert.doesNotMatch(api, /mock|fake response/i);

  assert.match(readme, /对话先于画布/);
  assert.match(readme, /多作品 Session/);
});

test("Clerk email login protects model access without hiding the public landing page", async () => {
  const [layout, page, app, api, proxy, signIn] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aether-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/aether/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /ClerkProvider/);
  assert.match(page, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(app, /邮箱登录，开始对话/);
  assert.match(app, /Show when="signed-out"/);
  assert.match(app, /UserButton/);
  assert.match(api, /await auth\(\)/);
  assert.match(api, /status:\s*401/);
  assert.match(proxy, /createRouteMatcher\(\["\/api\/aether/);
  assert.match(signIn, /AuthScreen mode="sign-in"/);
});
