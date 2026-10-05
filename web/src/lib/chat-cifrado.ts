import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export type TextoCifrado = { cifrado: string; iv: string; tag: string };

function versionActiva(): string {
  const version = process.env.WHATSAPP_CIFRADO_VERSION?.trim() || "v1";
  if (!/^v[1-9]\d*$/.test(version)) throw new Error("WHATSAPP_CIFRADO_VERSION debe tener formato v1, v2, etc.");
  return version;
}

function claveCifrado(version: string): Buffer {
  const variable = `WHATSAPP_CIFRADO_KEY_${version.toUpperCase()}`;
  const valor = process.env[variable]?.trim();
  if (!valor) throw new Error(`Falta ${variable}.`);
  const clave = Buffer.from(valor, "base64");
  if (clave.length !== 32) throw new Error("WHATSAPP_CIFRADO_KEY debe ser una clave base64 de 32 bytes.");
  return clave;
}

function claveIndice(): Buffer {
  const valor = process.env.WHATSAPP_INDICE_KEY?.trim();
  if (!valor) throw new Error("Falta WHATSAPP_INDICE_KEY.");
  const clave = Buffer.from(valor, "base64");
  if (clave.length < 32) throw new Error("WHATSAPP_INDICE_KEY debe contener al menos 32 bytes aleatorios en base64.");
  return clave;
}

/** AES-256-GCM con IV nuevo por valor; el tag detecta cualquier alteración. */
export function cifrarTexto(texto: string): TextoCifrado {
  const version = versionActiva();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", claveCifrado(version), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return {
    cifrado: `${version}:${cifrado.toString("base64")}`,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function descifrarTexto(valor: TextoCifrado): string {
  const separador = valor.cifrado.indexOf(":");
  const version = separador > 0 ? valor.cifrado.slice(0, separador) : "v1";
  if (!/^v[1-9]\d*$/.test(version)) throw new Error("Versión de cifrado desconocida.");
  const contenido = separador > 0 ? valor.cifrado.slice(separador + 1) : valor.cifrado;
  const decipher = createDecipheriv("aes-256-gcm", claveCifrado(version), Buffer.from(valor.iv, "base64"));
  decipher.setAuthTag(Buffer.from(valor.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(contenido, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Índice opaco y determinista para deduplicar/buscar teléfonos sin guardarlos en claro. */
export function claveContacto(canal: "directo" | "grupo", contacto: string): string {
  return createHmac("sha256", claveIndice())
    .update(`${canal}:${contacto.trim()}`)
    .digest("hex");
}
