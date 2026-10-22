import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { SCRIPT_TEMA, TEMA_PREDETERMINADO } from "../src/lib/tema";
import { MENU_CORTO, SCRIPT_MENU } from "../src/lib/menu";

test("primer pintado sigue al sistema salvo elección explícita", () => {
  assert.equal(TEMA_PREDETERMINADO, "system");
  for (const [guardado, sistemaOscuro, esperado] of [
    [null, false, "light"], [null, true, "dark"],
    ["light", true, "light"], ["dark", false, "dark"],
    ["system", false, "light"], ["system", true, "dark"],
    ["inválido", false, "light"], ["inválido", true, "dark"],
  ] as const) {
    let tema = "";
    runInNewContext(SCRIPT_TEMA, {
      localStorage: { getItem: () => guardado },
      matchMedia: () => ({ matches: sistemaOscuro }),
      document: { documentElement: { setAttribute: (_: string, valor: string) => { tema = valor; } } },
    });
    assert.equal(tema, esperado);
  }
});

test("sin acceso a almacenamiento también se sigue el sistema", () => {
  for (const [sistemaOscuro, esperado] of [[false, "light"], [true, "dark"]] as const) {
    let tema = "";
    runInNewContext(SCRIPT_TEMA, {
      localStorage: { getItem: () => { throw new Error("bloqueado"); } },
      matchMedia: () => ({ matches: sistemaOscuro }),
      document: { documentElement: { setAttribute: (_: string, valor: string) => { tema = valor; } } },
    });
    assert.equal(tema, esperado);
  }
});

test("sin matchMedia el fallback de sistema es claro", () => {
  let tema = "";
  runInNewContext(SCRIPT_TEMA, {
    localStorage: { getItem: () => null },
    document: { documentElement: { setAttribute: (_: string, valor: string) => { tema = valor; } } },
  });
  assert.equal(tema, "light");
});

test("la barra lateral comienza oculta y recuerda si se abre", () => {
  for (const [guardado, esperado] of [[null, MENU_CORTO], ["corto", MENU_CORTO], ["abierto", null]] as const) {
    let menu: string | null = null;
    runInNewContext(SCRIPT_MENU, {
      localStorage: { getItem: () => guardado },
      document: { documentElement: { setAttribute: (_: string, valor: string) => { menu = valor; } } },
    });
    assert.equal(menu, esperado);
  }
});

const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");
test("Avilock reemplaza la fuente LCD en títulos y métricas", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.ok(existsSync(new URL("../src/app/fonts/Avilock-Bold.ttf", import.meta.url)));
  assert.match(layout, /Avilock-Bold\.ttf/);
  assert.match(layout, /--fuente-avilock/);
  assert.match(css, /--heading:\s*var\(--fuente-avilock\)/);
  assert.match(css, /--metric-font:\s*var\(--fuente-avilock\)/);
  assert.doesNotMatch(layout + css, /The-Led-Display-St|Good-Times-Regular|--fuente-led|--fuente-good-times/);
});
test("los títulos h2 comparten un espaciado amplio en toda la plataforma", () => {
  const globales = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--h2-letter-spacing:\s*\.05em/);
  assert.match(css, /--type-title-lg:\s*clamp\(1\.05rem,[^;]+1\.25rem\)/);
  assert.match(globales, /h2\s*\{[\s\S]*?letter-spacing:\s*var\(--h2-letter-spacing\)/);
  assert.match(globales, /h2\s*\{[\s\S]*?font-size:\s*var\(--type-title-lg\)/);
});
const bloques = [...css.matchAll(/:root(?:\[data-theme="light"\])?\s*\{([^}]+)\}/g)].map((m) =>
  Object.fromEntries([...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((v) => [v[1], v[2].trim()])),
);
const luminancia = (hex: string) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
test("el tema claro separa el fondo general de las tarjetas", () => {
  const claro = { ...bloques[0], ...bloques[1] };
  const fondo = luminancia(claro["--plane"]);
  const tarjeta = luminancia(claro["--surface"]);
  assert.ok(tarjeta > fondo);
  assert.ok((tarjeta + .05) / (fondo + .05) >= 1.2);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(claro["--plane"].slice(i, i + 2), 16));
  assert.ok(r > g && g > b, "el fondo claro debe ser marfil cálido, no gris ni verde");
});
test("la barra lateral es translúcida y responde al tema", () => {
  const componentes = readFileSync(new URL("../src/components/ui.module.css", import.meta.url), "utf8");
  const claro = { ...bloques[0], ...bloques[1] };
  assert.match(css, /--rail-background:\s*linear-gradient/g);
  assert.notEqual(claro["--rail-background"], bloques[0]["--rail-background"]);
  assert.match(componentes, /background:\s*var\(--rail-fondo\)/);
  assert.match(componentes, /backdrop-filter:\s*var\(--rail-filter\)/);
  assert.doesNotMatch(componentes, /\.railFijo\s*\{[\s\S]*?color-scheme:\s*dark/);
});
test("ambos temas conservan una base neutral y el mismo acento de navegación", () => {
  const oscuro = bloques[0];
  const claro = { ...bloques[0], ...bloques[1] };
  const canales = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ro, go, bo] = canales(oscuro["--surface"]);
  const [rc, gc, bc] = canales(claro["--ink"]);
  assert.ok(bo >= go && go >= ro, "el tema oscuro debe ser grafito azulado, no verde");
  assert.ok(bc >= gc && gc >= rc, "el tema claro debe usar tinta neutral, no violeta");
  assert.ok(canales(oscuro["--rail-active"])[1] > canales(oscuro["--rail-active"])[2]);
  assert.ok(canales(claro["--rail-active"])[1] > canales(claro["--rail-active"])[2]);
});
test("Esteban y Candelaria conservan colores personales distinguibles", () => {
  const oscuro = bloques[0];
  const claro = { ...bloques[0], ...bloques[1] };
  assert.notEqual(oscuro["--persona-esteban"], oscuro["--persona-candelaria"]);
  assert.notEqual(claro["--persona-esteban"], claro["--persona-candelaria"]);
  assert.equal(oscuro["--responsable-tinte-tarjeta"], "11%");
  assert.equal(claro["--responsable-tinte-tarjeta"], "6%");
});
test("los textos secundarios del tema claro mantienen contraste alto", () => {
  const claro = { ...bloques[0], ...bloques[1] };
  const tarjeta = luminancia(claro["--surface"]);
  for (const token of ["--ink-2", "--muted"]) {
    const texto = luminancia(claro[token]);
    assert.ok((tarjeta + .05) / (texto + .05) >= 7, `${token} debe tener contraste alto`);
  }
});
for (const [nombre, paleta] of [["oscuro", bloques[0]], ["claro", { ...bloques[0], ...bloques[1] }]] as const) {
  test(`contraste de lectura y controles: ${nombre}`, () => {
    const resolver = (token: string): string => {
      const valor = paleta[token];
      const variable = /^var\((--[\w-]+)\)$/.exec(valor);
      return variable ? resolver(variable[1]) : valor;
    };
    const pares = [
      ["--ink", "--surface"], ["--display-ink", "--surface"], ["--ink-2", "--surface-2"], ["--muted", "--surface"],
      ["--on-primary", "--primary"], ["--accent-ink", "--primary-container"],
      ["--warning", "--warning-soft"], ["--critical", "--critical-soft"], ["--good", "--good-soft"],
      ["--on-critical", "--critical"], ["--rail-active", "--rail-active-soft"],
      ["--fuchsia", "--surface"], ["--on-fuchsia", "--fuchsia"],
      ["--metric-primary", "--surface"], ["--metric-good", "--good-soft"],
      ["--metric-critical", "--critical-soft"], ["--metric-warning", "--warning-soft"],
    ];
    for (const [texto, fondo] of pares) {
      const a = luminancia(resolver(texto)); const b = luminancia(resolver(fondo));
      const contraste = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      assert.ok(contraste >= 4.5, `${texto} sobre ${fondo}: ${contraste.toFixed(2)}`);
    }
  });
}
