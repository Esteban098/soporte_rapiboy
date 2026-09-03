const DEFAULT_WEBHOOK_URL = "https://linux.rapitools.com.ar/webhook/firefox-gestiones";

const form = document.querySelector("#form");
const estado = document.querySelector("#estado");

async function cargar() {
  const config = await browser.storage.local.get(["webhookUrl", "token", "operador"]);
  form.elements.webhookUrl.value = config.webhookUrl || DEFAULT_WEBHOOK_URL;
  form.elements.token.value = config.token || "";
  form.elements.operador.value = config.operador || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await browser.storage.local.set({
    webhookUrl: form.elements.webhookUrl.value.trim(),
    token: form.elements.token.value.trim(),
    operador: form.elements.operador.value.trim(),
  });
  estado.textContent = "Configuración guardada.";
  window.setTimeout(() => { estado.textContent = ""; }, 2500);
});

cargar();
