import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { SCRIPT_TEMA, TEMA_PREDETERMINADO } from "../src/lib/tema";

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

const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");
const bloques = [...css.matchAll(/:root(?:\[data-theme="light"\])?\s*\{([^}]+)\}/g)].map((m) =>
  Object.fromEntries([...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((v) => [v[1], v[2].trim()])),
);
const luminancia = (hex: string) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
for (const [nombre, paleta] of [["oscuro", bloques[0]], ["claro", { ...bloques[0], ...bloques[1] }]] as const) {
  test(`contraste de lectura y controles: ${nombre}`, () => {
    const resolver = (token: string): string => {
      const valor = paleta[token];
      const variable = /^var\((--[\w-]+)\)$/.exec(valor);
      return variable ? resolver(variable[1]) : valor;
    };
    const pares = [
      ["--ink", "--surface"], ["--ink-2", "--surface-2"], ["--muted", "--surface"],
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
