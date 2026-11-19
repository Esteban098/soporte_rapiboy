const DEFAULT_WEBHOOK_URL = "https://linux.rapitools.com.ar/webhook/firefox-gestiones";
const MENU_ID = "rapiboy-datos-tienda";
const ICON_16 = browser.runtime.getURL("icons/rapiboy-16.png");
const ICON_32 = browser.runtime.getURL("icons/rapiboy-32.png");
const ICON = browser.runtime.getURL("icons/rapiboy-96.png");

async function crearMenu() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Cargar datos de tienda en Rapiboy",
    contexts: ["selection"],
    documentUrlPatterns: [
      "https://web.whatsapp.com/*",
      "https://rapiboy.com/*",
      "https://*.rapiboy.com/*",
    ],
    icons: { 16: ICON_16, 32: ICON_32 },
  });
}

browser.runtime.onInstalled.addListener(crearMenu);
browser.runtime.onStartup.addListener(crearMenu);

function avisar(title, message) {
  return browser.notifications.create({ type: "basic", iconUrl: ICON, title, message });
}

async function configuracion() {
  const valores = await browser.storage.local.get([
    "webhookUrl",
    "token",
    "operador",
    "assistantApiUrl",
    "assistantToken",
  ]);
  return {
    webhookUrl: String(valores.webhookUrl || DEFAULT_WEBHOOK_URL).trim(),
    token: String(valores.token || "").trim(),
    operador: String(valores.operador || "Operador Firefox").trim(),
    assistantApiUrl: String(valores.assistantApiUrl || "").trim(),
    assistantToken: String(valores.assistantToken || "").trim(),
  };
}

function mensajeRespuesta(status, body) {
  if (status === 404) return body.message || "El pedido no está en el período operativo.";
  if (status === 422) return body.message || "No se pudo interpretar la selección; revisala manualmente.";
  if (status === 401 || status === 403) return "El token no es válido. Revisá las opciones de la extensión.";
  return body.message || `El servidor respondió HTTP ${status}.`;
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const selectedText = String(info.selectionText || "").trim();
  if (!selectedText) {
    await avisar("Rapiboy", "No hay texto seleccionado.");
    return;
  }

  const config = await configuracion();
  if (!config.token) {
    await avisar("Rapiboy · Falta configuración", "Abrí las opciones y cargá el token de n8n.");
    await browser.runtime.openOptionsPage();
    return;
  }

  const payload = {
    source: "firefox_extension",
    event: "store_information",
    operator: config.operador,
    body: selectedText,
    timestampIso: new Date().toISOString(),
    pageUrl: tab?.url || "",
    pageTitle: tab?.title || "",
  };

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rapiboy-Token": config.token,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      await avisar("Rapiboy · No se guardó", mensajeRespuesta(response.status, body));
      return;
    }

    await avisar("Rapiboy · Datos guardados", body.message || `Pedido ${body.id} actualizado.`);
  } catch (error) {
    await avisar("Rapiboy · Sin conexión", error instanceof Error ? error.message : "No se pudo contactar a n8n.");
  }
});

/* El historial vive solo en RAM: cerrar Firefox lo elimina. */
let assistantMessages = [];
let assistantBusy = false;

function paginaPermitida(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "web.whatsapp.com" || host === "rapiboy.com" || host.endsWith(".rapiboy.com"))
    );
  } catch {
    return false;
  }
}

function apiPermitida(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "soporte-rapiboy.vercel.app" || host === "rapiboy.com" || host.endsWith(".rapiboy.com")) &&
      parsed.pathname === "/api/asistente/extension" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function apiSeguimiento(config) {
  if (apiPermitida(config.assistantApiUrl) === false) return "";
  return new URL("/api/seguimiento/extension", config.assistantApiUrl).href;
}

function apiOperacion(config) {
  if (apiPermitida(config.assistantApiUrl) === false) return "";
  return new URL("/api/operacion/extension", config.assistantApiUrl).href;
}

function estadoAsistente(config) {
  return {
    mensajes: assistantMessages,
    ocupado: assistantBusy,
    configurado: Boolean(apiPermitida(config.assistantApiUrl) && config.assistantToken),
    platformOrigin: apiPermitida(config.assistantApiUrl)
      ? new URL(config.assistantApiUrl).origin
      : "",
    seguimientoConfigurado: Boolean(apiSeguimiento(config) && config.assistantToken),
  };
}

async function manejarAsistente(message, sender) {
  if (
    message == null ||
    typeof message.type !== "string" ||
    (message.type.startsWith("assistant:") === false && message.type.startsWith("followup:") === false)
  ) {
    return undefined;
  }
  if (paginaPermitida(sender.tab && sender.tab.url ? sender.tab.url : "") === false) {
    return { ok: false, error: "Página no autorizada." };
  }

  const config = await configuracion();

  if (message.type === "followup:consult" || message.type === "followup:create") {
    const endpoint = apiSeguimiento(config);
    if (endpoint === "" || config.assistantToken === "") {
      return { ok: false, error: "Falta vincular el Asistente en las opciones de Firefox." };
    }
    const casoId = String(message.casoId || "").trim().slice(0, 12);
    if (/^\d{1,12}$/.test(casoId) === false) return { ok: false, error: "Ingresá un ID de viaje válido." };
    const payload = message.type === "followup:consult"
      ? { accion: "consultar", casoId }
      : {
          accion: "crear",
          casoId,
          comentario: String(message.comentario || "").trim().slice(0, 4001),
          driver: String(message.driver || "").trim().slice(0, 201),
          seller: String(message.seller || "").trim().slice(0, 201),
        };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + config.assistantToken,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok === false || body.ok !== true) {
        return {
          ok: false,
          error: response.status === 401
            ? "La vinculación venció o fue revocada. Generá una nueva desde Mi perfil."
            : String(body.error || "No se pudo guardar el seguimiento."),
        };
      }
      return { ...body, platformOrigin: new URL(config.assistantApiUrl).origin };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "No se pudo contactar la plataforma." };
    }
  }

  if (message.type === "assistant:get-state") {
    return { ok: true, ...estadoAsistente(config) };
  }
  if (message.type === "assistant:open-options") {
    await browser.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.type === "assistant:reset") {
    assistantMessages = [];
    return { ok: true, ...estadoAsistente(config) };
  }
  if (message.type !== "assistant:ask") return undefined;

  const pregunta = String(message.texto || "").trim().slice(0, 2000);
  if (pregunta === "") return { ok: false, error: "Escribí una pregunta." };
  if (assistantBusy) return { ok: false, error: "El Asistente todavía está respondiendo." };
  if (apiPermitida(config.assistantApiUrl) === false || config.assistantToken === "") {
    return { ok: false, error: "Falta vincular el Asistente en las opciones de Firefox." };
  }

  assistantMessages = [...assistantMessages, { rol: "usuario", texto: pregunta }].slice(-12);
  assistantBusy = true;
  try {
    const response = await fetch(config.assistantApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.assistantToken,
      },
      body: JSON.stringify({
        mensajes: assistantMessages.map((item) => ({ rol: item.rol, texto: item.texto })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok === false || body.ok !== true || typeof body.texto !== "string") {
      const error =
        response.status === 401
          ? "La vinculación venció o fue revocada. Generá una nueva desde Mi perfil."
          : String(body.error || "La plataforma no pudo responder.");
      assistantMessages = [...assistantMessages, { rol: "asistente", texto: error, error: true }].slice(-12);
      return { ok: false, error, ...estadoAsistente(config) };
    }

    assistantMessages = [
      ...assistantMessages,
      { rol: "asistente", texto: body.texto.slice(0, 12000) },
    ].slice(-12);
    return { ok: true, ...estadoAsistente(config) };
  } catch (error) {
    const texto = error instanceof Error ? error.message : "No se pudo contactar la plataforma.";
    assistantMessages = [...assistantMessages, { rol: "asistente", texto, error: true }].slice(-12);
    return { ok: false, error: texto, ...estadoAsistente(config) };
  } finally {
    assistantBusy = false;
  }
}

browser.runtime.onMessage.addListener(manejarAsistente);

async function pedirOperacion(config, cuerpo) {
  const endpoint = apiOperacion(config);
  if (endpoint === "" || config.assistantToken === "") {
    return { ok: false, error: "Falta vincular la extensión en las opciones de Firefox." };
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.assistantToken,
      },
      body: JSON.stringify(cuerpo),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      return {
        ok: false,
        error: response.status === 401
          ? "La vinculación venció o fue revocada. Generá una nueva desde Mi perfil."
          : String(body.error || "No se pudo consultar la operación."),
      };
    }
    return { ...body, platformOrigin: new URL(config.assistantApiUrl).origin };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo contactar la plataforma." };
  }
}

async function manejarWorkspace(message, sender) {
  if (message == null || typeof message.type !== "string" || message.type.startsWith("workspace:") === false) {
    return undefined;
  }
  if (paginaPermitida(sender.tab && sender.tab.url ? sender.tab.url : "") === false) {
    return { ok: false, error: "Página no autorizada." };
  }
  const config = await configuracion();
  if (message.type === "workspace:get-settings") {
    const valores = await browser.storage.local.get(["workspaceLabelPrimary", "workspaceLabelSecondary"]);
    return {
      ok: true,
      primary: String(valores.workspaceLabelPrimary || ""),
      secondary: String(valores.workspaceLabelSecondary || ""),
      configurado: Boolean(apiOperacion(config) && config.assistantToken),
    };
  }
  if (message.type === "workspace:save-settings") {
    const primary = String(message.primary || "").trim().slice(0, 100);
    const secondary = String(message.secondary || "").trim().slice(0, 100);
    if (primary && /^[A-Za-z0-9_.:-]+$/.test(primary) === false) return { ok: false, error: "Etiqueta inválida." };
    if (secondary && /^[A-Za-z0-9_.:-]+$/.test(secondary) === false) return { ok: false, error: "Etiqueta inválida." };
    await browser.storage.local.set({ workspaceLabelPrimary: primary, workspaceLabelSecondary: secondary });
    return { ok: true };
  }
  if (message.type === "workspace:labels") return pedirOperacion(config, { accion: "etiquetas" });
  if (message.type === "workspace:chats") {
    return pedirOperacion(config, { accion: "chats", etiquetaId: String(message.etiquetaId || "").slice(0, 100) });
  }
  if (message.type === "workspace:summary") {
    return pedirOperacion(config, { accion: "resumen_tienda", sellerId: Number(message.sellerId) });
  }
  return undefined;
}

browser.runtime.onMessage.addListener(manejarWorkspace);
