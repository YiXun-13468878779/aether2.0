import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Aether metadata and boot shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Aether — 灵魂对话<\/title>/i);
  assert.match(html, /自由创作与作品交流空间/);
  assert.match(html, /AETHER/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("source keeps the conversation-first, multi-work and real-model contract", async () => {
  const [page, api, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/aether/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /phase:\s*"dialogue"/);
  assert.match(page, /inviteToCreate/);
  assert.match(page, /artworks:\s*Artwork\[\]/);
  assert.match(page, /function addArtwork\(/);
  assert.match(page, /function duplicateArtwork\(/);
  assert.match(page, /<canvas/);
  assert.match(page, /src="\/og\.png"/);

  assert.match(api, /dashscope\.aliyuncs\.com\/compatible-mode\/v1/);
  assert.match(api, /image_url/);
  assert.match(api, /json_object/);
  assert.match(api, /enable_thinking:\s*false/);
  assert.match(api, /MODEL_NOT_CONFIGURED/);
  assert.doesNotMatch(api, /mock|fake response/i);

  assert.match(readme, /对话先于画布/);
  assert.match(readme, /多作品 Session/);
});
