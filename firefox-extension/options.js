const DEFAULT_WEBHOOK_URL = "https://linux.rapitools.com.ar/webhook/firefox-gestiones";

const form = document.querySelector("#form");
const estado = document.querySelector("#estado");

function validarAsistente(url, token) {
  if (url === "" && token === "") return null;
  if (url === "" || token === "") return "Completá la URL y el token del Asistente.";
  if (/^rbx_[A-Za-z0-9_-]{40,}$/.test(token) === false) {
    return "El token personal no tiene el formato esperado.";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      (host !== "soporte-rapiboy.vercel.app" && host !== "rapiboy.com" && host.endsWith(".rapiboy.com") === false) ||
      parsed.pathname !== "/api/asistente/extension" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      return "Usá el endpoint HTTPS oficial de la plataforma.";
    }
  } catch {
    return "La URL del Asistente no es válida.";
  }
  return null;
}

async function cargar() {
  const config = await browser.storage.local.get([
    "webhookUrl",
    "token",
    "operador",
    "assistantApiUrl",
    "assistantToken",
  ]);
  form.elements.webhookUrl.value = config.webhookUrl || DEFAULT_WEBHOOK_URL;
  form.elements.token.value = config.token || "";
  form.elements.operador.value = config.operador || "";
  form.elements.assistantApiUrl.value = config.assistantApiUrl || "";
  form.elements.assistantToken.value = config.assistantToken || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const assistantApiUrl = form.elements.assistantApiUrl.value.trim();
  const assistantToken = form.elements.assistantToken.value.trim();
  const error = validarAsistente(assistantApiUrl, assistantToken);
  if (error) {
    estado.textContent = error;
    estado.dataset.error = "true";
    return;
  }

  await browser.storage.local.set({
    webhookUrl: form.elements.webhookUrl.value.trim(),
    token: form.elements.token.value.trim(),
    operador: form.elements.operador.value.trim(),
    assistantApiUrl,
    assistantToken,
  });
  estado.dataset.error = "false";
  estado.textContent = "Configuración guardada.";
  window.setTimeout(() => { estado.textContent = ""; }, 2500);
});

cargar();
