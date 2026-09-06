import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const app = readFileSync(new URL("../app/aether-app.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/aether/route.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

// Execute the actual component's handlers with queued React state updates.
// The queue is essential: immediate fake setters would miss the stale-array bug.
function canvasHarness() {
  const ast = ts.createSourceFile("aether-app.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["updateJourney", "patchArtwork", "saveCanvasNow", "scheduleSave", "startBlankArtwork", "duplicateArtwork", "switchArtwork", "nextQuestionStyle", "restoreCanvas"]);
  const functions = [];
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) functions.push(node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(functions.length, names.size);
  let pixels = "A-new";
  let sequence = 0;
  const queue = [];
  const images = [];
  const drawn = [];
  let state = [{ id: "journey", phase: "creating", activeArtworkId: "a", artworks: [
    { id: "a", title: "A", image: "A-old", background: "#ffffff" },
    { id: "b", title: "B", image: "B-old", background: "#ffffff" },
  ] }];
  const canvas = { toDataURL: () => pixels };
  const context = {
    activeJourney: state[0], activeArtwork: state[0].artworks[0], screen: "session",
    canvasRef: { current: canvas }, canvasReadyRef: { current: true }, restoreGenerationRef: { current: 0 },
    setJourneys: (update) => queue.push(update), setSavedState: () => {}, setRequestError: () => {},
    now: () => "2026-09-06T00:00:00Z", crypto: { randomUUID: () => "copy-" + ++sequence },
    makeArtwork: (index) => ({ id: "new-" + index, title: "Untitled", background: "#ffffff" }),
    context: () => ({ canvas, clearRect: () => {}, drawImage: (image) => drawn.push(image.src) }),
    WIDTH: 1200, HEIGHT: 900,
    Image: class { constructor() { images.push(this); } },
  };
  vm.runInNewContext(compile(functions.join("\n")), context);
  return {
    context, images, drawn,
    flush() { for (const update of queue.splice(0)) state = update(state); return state[0]; },
    setPixels(value) { pixels = value; },
  };
}

test("new canvas preserves strokes queued immediately before creation", () => {
  const h = canvasHarness();
  h.context.startBlankArtwork();
  const journey = h.flush();
  assert.equal(journey.artworks[0].image, "A-new");
  assert.equal(journey.artworks.length, 3);
  assert.equal(journey.activeArtworkId, "new-2");
});

test("duplicate preserves the current snapshot in both original and continuation", () => {
  const h = canvasHarness();
  h.context.duplicateArtwork();
  const journey = h.flush();
  assert.equal(journey.artworks[0].image, "A-new");
  assert.equal(journey.artworks[2].image, "A-new");
  assert.notEqual(journey.artworks[0].id, journey.artworks[2].id);
});

test("autosave and switching capture the outgoing canvas before its pixels change", () => {
  const h = canvasHarness();
  h.context.scheduleSave();
  h.context.switchArtwork("b");
  h.setPixels("B-loaded");
  const journey = h.flush();
  assert.equal(journey.artworks[0].image, "A-new");
  assert.equal(journey.artworks[1].image, "B-old");
  assert.equal(journey.activeArtworkId, "b");
});

test("an unfinished canvas restore cannot overwrite the saved artwork", () => {
  const h = canvasHarness();
  h.context.canvasReadyRef.current = false;
  h.context.saveCanvasNow();
  assert.equal(h.flush().artworks[0].image, "A-old");
});

test("late image restores cannot repaint a newer canvas", () => {
  const h = canvasHarness();
  h.context.restoreCanvas("A-late");
  h.context.restoreCanvas("B-current");
  h.images[1].onload();
  h.images[0].onload();
  assert.deepEqual(h.drawn, ["B-current"]);
  assert.equal(h.context.canvasReadyRef.current, true);
});

test("fewer questions, no questions, and permission to ask remain distinct", () => {
  const h = canvasHarness();
  assert.equal(h.context.nextQuestionStyle("请少问一些"), "fewer");
  assert.equal(h.context.nextQuestionStyle("不要再问我"), "none");
  assert.equal(h.context.nextQuestionStyle("你可以继续问"), "natural");
  h.context.activeJourney.preferences = { questionStyle: "fewer" };
  assert.equal(h.context.nextQuestionStyle("继续说说你的理解"), "fewer");
});

function routeHarness({ empty = false, controllerFails = false, env = {}, userId = null } = {}) {
  const calls = [];
  const exports = {};
  const context = {
    exports, Request, Response, ReadableStream, TextEncoder, TextDecoder, AbortSignal, URL,
    process: { env: { DASHSCOPE_API_KEY: "test-only", ...env } },
    console: { error() {} },
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (name === "@clerk/nextjs/server") return { auth: async () => ({ userId }) };
      throw new Error("Unexpected dependency " + name);
    },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      calls.push({ url, body, signal: options.signal });
      if (!body.stream) {
        if (controllerFails) return Response.json({ error: { message: "unavailable" } }, { status: 500 });
        return Response.json({ choices: [{ message: { content: JSON.stringify({ response_mode: "conversation", invite_to_create: false, invitation: null, safety_level: "regular", guidance: "Respond to the user's actual words." }) } }] });
      }
      const delta = empty ? "" : "data: " + JSON.stringify({ choices: [{ delta: { content: "A grounded response." } }] }) + "\n\n";
      return new Response(delta + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    },
  };
  vm.runInNewContext(compile(route), context);
  return { api: exports, calls };
}
const input = {
  mode: "conversation", phase: "reflection",
  messages: [{ role: "user", content: "你刚才说的那处留白，再说说？" }],
  artworks: [{ id: "a", title: "A", image: "data:image/png;base64,YQ==", isCurrent: true }],
  preferences: { questionStyle: "fewer" },
};
function request(body = input, headers = {}) {
  return new Request("https://aether.test/api/aether", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://aether.test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

for (const mode of ["conversation", "artwork"]) {
  test(mode + " sends the current image to the actual upstream request", async () => {
    const h = routeHarness();
    const response = await h.api.POST(request({ ...input, mode }));
    assert.equal(response.status, 200);
    const events = await response.text();
    assert.match(events, /A grounded response/);
    assert.match(events, /data: \[DONE\]/);
    const main = h.calls.find((call) => call.body.stream);
    const images = main.body.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((part) => part.type === "image_url");
    assert.equal(images.length, 1);
    assert.equal(images[0].image_url.url, input.artworks[0].image);
    assert.match(main.body.messages[0].content, /用户希望少问/);
    assert.doesNotMatch(main.body.messages[0].content, /这一轮不要提出任何问题/);
  });
}

test("controller failure stops the turn instead of silently treating it as regular", async () => {
  const h = routeHarness({ controllerFails: true });
  const response = await h.api.POST(request());
  assert.equal(response.status, 503);
  assert.equal(h.calls.length, 1);
});

test("empty model output produces an error event, not a fabricated success", async () => {
  const h = routeHarness({ empty: true });
  const response = await h.api.POST(request());
  const events = await response.text();
  assert.match(events, /"type":"error"/);
  assert.doesNotMatch(events, /"type":"delta"|"type":"control"|data: \[DONE\]/);
});

test("malformed and oversized requests fail before any provider call", async () => {
  const h = routeHarness();
  assert.equal((await h.api.POST(request("{"))).status, 400);
  assert.equal((await h.api.POST(request({ messages: [{ role: "user", content: "a".repeat(3_800_000) }] }))).status, 413);
  assert.equal(h.calls.length, 0);
});

test("cross-origin calls fail before any provider call", async () => {
  const h = routeHarness();
  assert.equal((await h.api.POST(request(input, { Origin: "https://other.test" }))).status, 403);
  assert.equal(h.calls.length, 0);
});

test("optional login can be required without pretending a guest is authenticated", async () => {
  const h = routeHarness({ env: { AETHER_REQUIRE_LOGIN: "true" } });
  assert.equal((await h.api.POST(request())).status, 401);
  assert.equal(h.calls.length, 0);
});

test("missing provider configuration is explicit", async () => {
  const h = routeHarness({ env: { DASHSCOPE_API_KEY: "" } });
  const response = await h.api.POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "MODEL_NOT_CONFIGURED");
  assert.equal(h.calls.length, 0);
});

test("public entry preserves Chinese metadata and a semantic title", () => {
  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /Aether — 灵魂对话/);
  assert.match(app, /<h1>灵魂对话<\/h1>/);
  assert.match(app, /开始一段对话/);
  assert.doesNotMatch(layout, /next\/font\/google/);
});
