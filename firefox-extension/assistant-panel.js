(() => {
  if (document.getElementById("rapiboy-assistant-root")) return;

  const host = document.createElement("div");
  host.id = "rapiboy-assistant-root";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = browser.runtime.getURL("assistant-panel.css");
  shadow.appendChild(styles);

  const shell = document.createElement("div");
  shell.className = "rb-shell";
  shadow.appendChild(shell);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "rb-tab";
  tab.setAttribute("aria-expanded", "false");
  tab.setAttribute("aria-controls", "rb-assistant-panel");
  tab.textContent = "✦ Asistente";
  shell.appendChild(tab);

  const panel = document.createElement("section");
  panel.id = "rb-assistant-panel";
  panel.className = "rb-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Asistente Rapiboy");
  shell.appendChild(panel);

  const header = document.createElement("header");
  header.className = "rb-header";
  panel.appendChild(header);

  const heading = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "rb-eyebrow";
  eyebrow.textContent = "RAPIBOY";
  const title = document.createElement("strong");
  title.textContent = "Asistente operativo";
  heading.append(eyebrow, title);
  header.appendChild(heading);

  const headerActions = document.createElement("div");
  headerActions.className = "rb-header-actions";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "rb-icon-button";
  reset.title = "Nueva conversación";
  reset.setAttribute("aria-label", "Nueva conversación");
  reset.textContent = "↻";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "rb-icon-button";
  close.title = "Cerrar";
  close.setAttribute("aria-label", "Cerrar Asistente");
  close.textContent = "×";
  headerActions.append(reset, close);
  header.appendChild(headerActions);

  const messages = document.createElement("div");
  messages.className = "rb-messages";
  messages.setAttribute("aria-live", "polite");
  panel.appendChild(messages);

  const composer = document.createElement("form");
  composer.className = "rb-composer";
  const textarea = document.createElement("textarea");
  textarea.rows = 1;
  textarea.maxLength = 2000;
  textarea.placeholder = "Consultá un paquete, ruta, seller o seguimiento…";
  textarea.setAttribute("aria-label", "Pregunta al Asistente");
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "rb-send";
  send.textContent = "Enviar";
  composer.append(textarea, send);
  panel.appendChild(composer);

  let state = { mensajes: [], ocupado: false, configurado: false, platformOrigin: "" };

  function urlSegura(value) {
    try {
      const parsed = new URL(value, state.platformOrigin || "https://rapiboy.com");
      const hostName = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:" ||
        (hostName !== "rapiboy.com" && hostName.endsWith(".rapiboy.com") === false)
      ) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function textoConEnlaces(element, text) {
    const pattern = /\[([^\]]{1,100})\]\(([^)\s]+)\)/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      element.append(document.createTextNode(text.slice(offset, match.index)));
      const href = urlSegura(match[2]);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[1];
        element.appendChild(link);
      } else {
        element.append(document.createTextNode(match[0]));
      }
      offset = Number(match.index) + match[0].length;
    }
    element.append(document.createTextNode(text.slice(offset)));
  }

  function render() {
    messages.replaceChildren();

    if (state.configurado === false) {
      const empty = document.createElement("div");
      empty.className = "rb-empty";
      const text = document.createElement("p");
      text.textContent = "Vinculá tu perfil para consultar la operación desde esta página.";
      const configure = document.createElement("button");
      configure.type = "button";
      configure.className = "rb-secondary";
      configure.textContent = "Abrir configuración";
      configure.addEventListener("click", () => browser.runtime.sendMessage({ type: "assistant:open-options" }));
      empty.append(text, configure);
      messages.appendChild(empty);
    } else if (state.mensajes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "rb-empty";
      const text = document.createElement("p");
      text.textContent = "Preguntame por paquetes, casos, colectas, rutas o repartidores.";
      const suggestions = document.createElement("div");
      suggestions.className = "rb-suggestions";
      ["Estado del paquete 30543375", "¿Qué casos siguen abiertos?", "Resumen del live tracker"].forEach((label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
          textarea.value = label;
          textarea.focus();
        });
        suggestions.appendChild(button);
      });
      empty.append(text, suggestions);
      messages.appendChild(empty);
    } else {
      state.mensajes.forEach((item) => {
        const bubble = document.createElement("article");
        bubble.className =
          "rb-message rb-" + (item.rol === "usuario" ? "user" : "assistant") + (item.error ? " rb-error" : "");
        const label = document.createElement("span");
        label.className = "rb-role";
        label.textContent = item.rol === "usuario" ? "Vos" : "Asistente";
        const text = document.createElement("p");
        textoConEnlaces(text, String(item.texto || ""));
        bubble.append(label, text);
        messages.appendChild(bubble);
      });
    }

    if (state.ocupado) {
      const typing = document.createElement("div");
      typing.className = "rb-typing";
      typing.textContent = "Consultando la operación…";
      messages.appendChild(typing);
    }

    send.disabled = state.ocupado || state.configurado === false;
    textarea.disabled = state.ocupado || state.configurado === false;
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }

  async function refresh() {
    const result = await browser.runtime.sendMessage({ type: "assistant:get-state" }).catch(() => null);
    if (result && result.ok) {
      state = result;
      render();
    }
  }

  async function submit(event) {
    event.preventDefault();
    const texto = textarea.value.trim();
    if (texto === "" || state.ocupado) return;
    textarea.value = "";
    state = { ...state, ocupado: true, mensajes: [...state.mensajes, { rol: "usuario", texto }] };
    render();
    const result = await browser.runtime.sendMessage({ type: "assistant:ask", texto }).catch(() => null);
    if (result) state = { ...state, ...result, ocupado: false };
    else state = {
      ...state,
      ocupado: false,
      mensajes: [...state.mensajes, { rol: "asistente", texto: "No se pudo conectar con la extensión.", error: true }],
    };
    render();
  }

  function setOpen(open) {
    panel.hidden = open === false;
    tab.setAttribute("aria-expanded", String(open));
    if (open) {
      refresh();
      window.setTimeout(() => textarea.focus(), 50);
    }
  }

  tab.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  reset.addEventListener("click", async () => {
    const result = await browser.runtime.sendMessage({ type: "assistant:reset" });
    if (result && result.ok) state = result;
    render();
  });
  composer.addEventListener("submit", submit);
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.shiftKey === false) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.hidden === false) setOpen(false);
  });

  refresh();
})();
