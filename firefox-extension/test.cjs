const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const source = (name) => fs.readFileSync(new URL(name, "file://" + __dirname + "/"), "utf8");
const manifest = JSON.parse(source("manifest.json"));
const background = source("background.js");
const panel = source("assistant-panel.js");
const options = source("options.js");
const panelCss = source("assistant-panel.css");
const workspace = source("whatsapp-workspace.js");
const workspaceCss = source("whatsapp-workspace.css");
const layoutCss = source("whatsapp-workspace-layout.css");

test("el panel solo se inyecta en WhatsApp Web y Rapiboy", () => {
  const matches = manifest.content_scripts.flatMap((entry) => entry.matches).sort();
  assert.deepEqual(matches, [
    "https://*.rapiboy.com/*",
    "https://rapiboy.com/*",
    "https://web.whatsapp.com/*",
  ]);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.ok(manifest.permissions.includes("https://soporte-rapiboy.vercel.app/*"));
  assert.ok(manifest.content_scripts[0].css.includes("whatsapp-workspace-layout.css"));
  assert.ok(manifest.content_scripts[0].js.includes("whatsapp-workspace.js"));
  assert.ok(manifest.web_accessible_resources.includes("whatsapp-workspace.css"));
  assert.match(background, /documentUrlPatterns/);
});
test("tokens e historial solo salen a endpoints HTTPS oficiales", () => {
  assert.match(background, /function apiPermitida/);
  assert.match(background, /parsed\.protocol === "https:"/);
  assert.match(background, /host === "soporte-rapiboy\.vercel\.app"/);
  assert.match(background, /parsed\.pathname === "\/api\/asistente\/extension"/);
  assert.match(background, /\/api\/seguimiento\/extension/);
  assert.match(background, /\/api\/operacion\/extension/);
  assert.match(background, /message\.type === "followup:create"/);
  assert.match(background, /Authorization: "Bearer " \+ config\.assistantToken/);
  assert.match(options, /host !== "soporte-rapiboy\.vercel\.app"/);
  assert.match(options, /host !== "rapiboy\.com"/);
  assert.match(options, /parsed\.pathname !== "\/api\/asistente\/extension"/);
});

test("la conversación queda en memoria y las interfaces no inyectan HTML", () => {
  assert.match(background, /let assistantMessages = \[\]/);
  assert.equal(/storage\.local\.set\([^)]*assistantMessages/s.test(background), false);
  assert.equal(panel.includes("innerHTML"), false);
  assert.equal(workspace.includes("innerHTML"), false);
  assert.equal(panel.includes("eval("), false);
  assert.equal(workspace.includes("eval("), false);
  assert.match(panel, /attachShadow/);
  assert.match(workspace, /attachShadow/);
});

test("el proceso de fondo rechaza mensajes desde otras páginas", () => {
  assert.match(background, /function paginaPermitida/);
  assert.match(background, /parsed\.protocol === "https:"/);
  assert.match(background, /host === "web\.whatsapp\.com"/);
  assert.match(background, /host\.endsWith\("\.rapiboy\.com"\)/);
});

test("se conserva el agente 3.0 y se abre desde el espacio operativo", () => {
  assert.match(panel, /parsed\.origin === state\.platformOrigin/);
  assert.match(panel, /document\.createElement\("strong"\)/);
  assert.match(panel, /event\.composedPath\(\)\.includes\(host\)/);
  assert.match(panel, /rapiboy:open-assistant/);
  assert.match(workspace, /rapiboy:open-assistant/);
  assert.match(panelCss, /writing-mode: vertical-rl/);
  assert.match(panelCss, /border-radius: 24px 0 0 24px/);
});

test("Seguimiento detecta viajes en WhatsApp y crea el caso por el servidor", () => {
  assert.match(workspace, /function detectTripId/);
  assert.match(workspace, /#main span\.selectable-text/);
  assert.match(workspace, /type: "followup:create"/);
  assert.match(background, /message\.type === "followup:create"/);
});

test("el espacio operativo usa etiquetas configurables y no expone WAHA", () => {
  assert.match(workspace, /workspace:labels/);
  assert.match(workspace, /workspace:chats/);
  assert.match(workspace, /workspace:summary/);
  assert.match(background, /workspaceLabelPrimary/);
  assert.match(background, /workspaceLabelSecondary/);
  assert.equal(workspace.includes("X-Api-Key"), false);
  assert.equal(workspace.includes("WAHA_API_KEY"), false);
});

test("la interfaz hereda tema y tipografía de WhatsApp y puede replegarse", () => {
  assert.match(workspaceCss, /var\(--panel-background/);
  assert.match(workspaceCss, /var\(--button-primary/);
  assert.match(workspaceCss, /"Segoe UI", Helvetica Neue/);
  assert.match(layoutCss, /data-rb-left="closed"/);
  assert.match(layoutCss, /data-rb-right="closed"/);
  assert.match(workspace, /setLeft\(false\)/);
  assert.match(workspace, /setRight\(false\)/);
});
