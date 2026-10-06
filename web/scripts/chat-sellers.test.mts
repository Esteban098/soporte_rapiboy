import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("cada reapertura conserva un ciclo histórico independiente", () => {
  const sql = fuente("../supabase/migracion-35-chat-ciclos.sql");
  assert.match(sql, /create table if not exists public\.seller_chat_ciclos/);
  assert.match(sql, /seller_chat_ciclos_activo_idx[\s\S]*cerrado_en is null and eliminado_en is null/);
  assert.match(sql, /seller_chat_reactivar_contacto[\s\S]*insert into public\.seller_chat_ciclos/);
  assert.match(sql, /seller_chat_tomar[\s\S]*update public\.seller_chat_ciclos[\s\S]*tomado_por/);
  assert.match(sql, /seller_chat_cerrar[\s\S]*update public\.seller_chat_ciclos[\s\S]*cerrado_por/);
});

test("los reportes salen de ciclos y separan contactos de chats", () => {
  const sql = fuente("../supabase/migracion-35-chat-ciclos.sql");
  const reporte = sql.slice(sql.indexOf("create or replace function public.seller_chat_reporte"));
  assert.match(reporte, /from public\.seller_chat_ciclos c/);
  assert.match(reporte, /select conv\.id as conversacion_id, conv\.created_at/);
  assert.match(reporte, /'contactos', contactos/);
  assert.doesNotMatch(reporte, /'contactos', creados/);
  assert.match(sql, /new\.estado_envio = 'enviado'/);
});

test("cerrar no depende de la ventana de respuesta", () => {
  const componente = fuente("../src/components/ChatSellers.tsx");
  assert.match(componente, /const esPropio = chat\.estado === "asignado"/);
  assert.match(componente, /const puedeResponder = esPropio && chat\.ventanaAbierta/);
  assert.match(componente, /\{esPropio[\s\S]{0,220}>Cerrar<\/button>/);
});

test("tomar mantiene el chat visible y habilita la respuesta del operador", () => {
  const componente = fuente("../src/components/ChatSellers.tsx");
  const servidor = fuente("../src/lib/chat-sellers.ts");
  assert.match(componente, /onTomado=\{\(\) => \{ setAlcance\("mios"\); setFiltro\("asignado"\); \}\}/);
  assert.match(componente, /if \(accion === "tomar"\) onTomado\(\)/);
  assert.match(componente, /const puedeResponder = esPropio && chat\.ventanaAbierta/);
  assert.match(servidor, /export async function responderComoOperador/);
  assert.match(servidor, /graph\.facebook\.com/);
  assert.match(servidor, /codigo === 190 \|\| subcodigo === 463/);
  assert.match(servidor, /META_WHATSAPP_ACCESS_TOKEN en Vercel/);
});

test("solo el dueño o un administrador elimina un chat asignado", () => {
  const sql = fuente("../supabase/migracion-35-chat-ciclos.sql");
  const ruta = fuente("../src/app/api/whatsapp/chats/[id]/estado/route.ts");
  assert.match(sql, /estado <> 'humano' or asignado_a = correo or p_es_admin is true/);
  assert.match(ruta, /operador\.rol === "admin"/);
  assert.match(fuente("../src/components/ChatSellers.tsx"), /const puedeEliminar = esAdmin \|\| chat\.estado !== "asignado" \|\| esPropio/);
});

test("la bandeja pagina y el detalle no vuelve a pedir toda la lista", () => {
  const componente = fuente("../src/components/ChatSellers.tsx");
  const detalle = componente.slice(componente.indexOf("export function ChatSellerDetalle"));
  assert.match(componente, /Cargar más conversaciones/);
  assert.match(componente, /Cargar mensajes anteriores/);
  assert.match(componente, /api\/whatsapp\/chats\?limit=/);
  assert.doesNotMatch(detalle, /cargarChats\(/);
  assert.match(fuente("../src/lib/chat-sellers.ts"), /order: "creado_en\.desc,id\.desc"/);
});

test("los mensajes rápidos se administran y se insertan con barra", () => {
  const migracion = fuente("../supabase/migracion-36-chat-respuestas-rapidas.sql");
  const componente = fuente("../src/components/ChatSellers.tsx");
  const navegacion = fuente("../src/lib/navegacion.ts");
  assert.match(migracion, /create table if not exists public\.seller_chat_respuestas_rapidas/);
  assert.match(migracion, /unique index[\s\S]*lower\(atajo\)/);
  assert.match(migracion, /enable row level security/);
  assert.match(componente, /texto\.match\(\/\^\\\/\(\[\^\\s\]\*\)\$\//);
  assert.match(componente, /evento\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(componente, /evento\.shiftKey/);
  assert.match(componente, /Mensajes rápidos/);
  assert.match(navegacion, /\/chats-sellers\/respuestas-rapidas/);
});
