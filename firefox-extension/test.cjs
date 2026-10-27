const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const source = (name) => fs.readFileSync(new URL(name, "file://" + __dirname + "/"), "utf8");
const manifest = JSON.parse(source("manifest.json"));
const background = source("background.js");
const panel = source("assistant-panel.js");
const options = source("options.js");

test("el panel solo se inyecta en WhatsApp Web y Rapiboy", () => {
  const matches = manifest.content_scripts.flatMap((entry) => entry.matches).sort();
  assert.deepEqual(matches, [
    "https://*.rapiboy.com/*",
    "https://rapiboy.com/*",
    "https://web.whatsapp.com/*",
  ]);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.match(background, /documentUrlPatterns/);
});

test("token e historial solo salen al endpoint HTTPS de Rapiboy", () => {
  assert.match(background, /function apiPermitida/);
  assert.match(background, /parsed\.protocol === "https:"/);
  assert.match(background, /parsed\.pathname === "\/api\/asistente\/extension"/);
  assert.match(background, /Authorization: "Bearer " \+ config\.assistantToken/);
  assert.match(options, /host !== "rapiboy\.com"/);
  assert.match(options, /parsed\.pathname !== "\/api\/asistente\/extension"/);
});

test("la conversación queda en memoria y el panel no inyecta HTML", () => {
  assert.match(background, /let assistantMessages = \[\]/);
  assert.equal(/storage\.local\.set\([^)]*assistantMessages/s.test(background), false);
  assert.equal(panel.includes("innerHTML"), false);
  assert.equal(panel.includes("eval("), false);
  assert.match(panel, /attachShadow/);
});

test("el proceso de fondo rechaza mensajes desde otras páginas", () => {
  assert.match(background, /function paginaPermitida/);
  assert.match(background, /parsed\.protocol === "https:"/);
  assert.match(background, /host === "web\.whatsapp\.com"/);
  assert.match(background, /host\.endsWith\("\.rapiboy\.com"\)/);
});
