const DEFAULT_WEBHOOK_URL = "https://linux.rapitools.com.ar/webhook/firefox-gestiones";
const MENU_ID = "rapiboy-datos-tienda";
const ICON = browser.runtime.getURL("icons/rapiboy.png");

async function crearMenu() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Cargar datos de tienda en Rapiboy",
    contexts: ["selection"],
    icons: { 16: ICON, 32: ICON },
  });
}

browser.runtime.onInstalled.addListener(crearMenu);
browser.runtime.onStartup.addListener(crearMenu);

function avisar(title, message) {
  return browser.notifications.create({ type: "basic", iconUrl: ICON, title, message });
}

async function configuracion() {
  const valores = await browser.storage.local.get(["webhookUrl", "token", "operador"]);
  return {
    webhookUrl: String(valores.webhookUrl || DEFAULT_WEBHOOK_URL).trim(),
    token: String(valores.token || "").trim(),
    operador: String(valores.operador || "Operador Firefox").trim(),
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
