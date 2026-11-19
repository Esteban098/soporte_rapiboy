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
  tab.textContent = "✦ Rapiboy";
  shell.appendChild(tab);

  const panel = document.createElement("section");
  panel.id = "rb-assistant-panel";
  panel.className = "rb-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Herramientas Rapiboy");
  shell.appendChild(panel);

  const header = document.createElement("header");
  header.className = "rb-header";
  panel.appendChild(header);

  const heading = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "rb-eyebrow";
  eyebrow.textContent = "RAPIBOY";
  const title = document.createElement("strong");
  title.textContent = "Herramientas operativas";
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

  const modeNav = document.createElement("nav");
  modeNav.className = "rb-mode-nav";
  modeNav.setAttribute("aria-label", "Herramienta");
  const assistantMode = document.createElement("button");
  assistantMode.type = "button";
  assistantMode.textContent = "Asistente";
  assistantMode.className = "rb-mode-active";
  const followupMode = document.createElement("button");
  followupMode.type = "button";
  followupMode.textContent = "Seguimiento";
  modeNav.append(assistantMode, followupMode);
  panel.appendChild(modeNav);

  const assistantView = document.createElement("div");
  assistantView.className = "rb-view rb-assistant-view";
  panel.appendChild(assistantView);

  const messages = document.createElement("div");
  messages.className = "rb-messages";
  messages.setAttribute("aria-live", "polite");
  assistantView.appendChild(messages);

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
  assistantView.appendChild(composer);

  const followupView = document.createElement("div");
  followupView.className = "rb-view rb-followup-view";
  followupView.hidden = true;
  const followupIntro = document.createElement("p");
  followupIntro.className = "rb-followup-intro";
  followupIntro.textContent = "Creá un caso en Seguimiento. Driver y seller se completan desde RapiboyData si los dejás vacíos.";
  const followupForm = document.createElement("form");
  followupForm.className = "rb-followup-form";
  function campoSeguimiento(nombre, etiqueta, opciones = {}) {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = etiqueta;
    if (opciones.opcional) {
      const small = document.createElement("small");
      small.textContent = " opcional";
      caption.appendChild(small);
    }
    const control = document.createElement(opciones.area ? "textarea" : "input");
    control.name = nombre;
    control.maxLength = opciones.maxLength;
    control.required = Boolean(opciones.required);
    control.placeholder = opciones.placeholder || "";
    if (opciones.area) control.rows = opciones.rows || 4;
    if (opciones.inputMode) control.inputMode = opciones.inputMode;
    label.append(caption, control);
    return { label, control };
  }
  const casoCampo = campoSeguimiento("casoId", "ID del viaje", { maxLength: 12, required: true, placeholder: "30543375", inputMode: "numeric" });
  const followupExisting = document.createElement("div");
  followupExisting.className = "rb-followup-existing";
  followupExisting.setAttribute("role", "status");
  followupExisting.hidden = true;
  const comentarioCampo = campoSeguimiento("comentario", "Comentario", { maxLength: 4000, required: true, area: true, rows: 6, placeholder: "Qué pasó y qué hace falta hacer." });
  const followupGrid = document.createElement("div");
  followupGrid.className = "rb-followup-grid";
  const driverCampo = campoSeguimiento("driver", "Driver", { maxLength: 200, opcional: true });
  const sellerCampo = campoSeguimiento("seller", "Seller", { maxLength: 200, opcional: true });
  followupGrid.append(driverCampo.label, sellerCampo.label);
  const followupStatus = document.createElement("p");
  followupStatus.className = "rb-followup-status";
  followupStatus.setAttribute("role", "status");
  followupStatus.setAttribute("aria-live", "polite");
  const followupSubmit = document.createElement("button");
  followupSubmit.className = "rb-followup-submit";
  followupSubmit.type = "submit";
  followupSubmit.textContent = "Crear seguimiento";
  followupForm.append(casoCampo.label, followupExisting, comentarioCampo.label, followupGrid, followupStatus, followupSubmit);
  followupView.append(followupIntro, followupForm);
  panel.appendChild(followupView);

  const followupCase = casoCampo.control;
  const followupComment = comentarioCampo.control;

  let state = { mensajes: [], ocupado: false, configurado: false, platformOrigin: "", seguimientoConfigurado: false };
  let mode = "assistant";

  function urlSegura(value) {
    try {
      const parsed = new URL(value, state.platformOrigin || "https://rapiboy.com");
      const hostName = parsed.hostname.toLowerCase();
      const mismoOrigenPlataforma = state.platformOrigin !== "" && parsed.origin === state.platformOrigin;
      if (
        parsed.protocol !== "https:" ||
        (mismoOrigenPlataforma === false && hostName !== "rapiboy.com" && hostName.endsWith(".rapiboy.com") === false)
      ) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function textoConFormato(element, text) {
    const pattern = /\[([^\]]{1,100})\]\(([^)\s]+)\)|\*\*([^*\n]{1,300})\*\*/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      element.append(document.createTextNode(text.slice(offset, match.index)));
      if (match[1]) {
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
      } else {
        const strong = document.createElement("strong");
        strong.textContent = match[3];
        element.appendChild(strong);
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
        textoConFormato(text, String(item.texto || ""));
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

  function setMode(nextMode) {
    mode = nextMode === "followup" ? "followup" : "assistant";
    assistantView.hidden = mode !== "assistant";
    followupView.hidden = mode !== "followup";
    assistantMode.classList.toggle("rb-mode-active", mode === "assistant");
    followupMode.classList.toggle("rb-mode-active", mode === "followup");
    reset.hidden = mode !== "assistant";
    if (mode === "followup") window.setTimeout(() => followupCase.focus(), 50);
  }

  async function consultarSeguimiento() {
    const casoId = followupCase.value.trim();
    followupExisting.hidden = true;
    followupExisting.textContent = "";
    if (!/^\d{1,12}$/.test(casoId)) return;
    const result = await browser.runtime.sendMessage({ type: "followup:consult", casoId }).catch(() => null);
    if (!result || result.ok !== true || !result.previo || result.previo.total === 0) return;
    const previo = result.previo;
    const ultimo = previo.ultimo;
    followupExisting.textContent = previo.total === 1
      ? "Este viaje ya tiene un seguimiento."
      : `Este viaje ya tiene ${previo.total} seguimientos.`;
    if (ultimo && ultimo.texto) {
      followupExisting.textContent += ` Último: ${String(ultimo.texto).slice(0, 180)}`;
    }
    followupExisting.hidden = false;
  }

  let botonDeMensaje = null;

  function abrirSeguimiento({ casoId = "", comentario = "", boton = null } = {}) {
    setOpen(true);
    setMode("followup");
    followupStatus.textContent = "";
    followupStatus.className = "rb-followup-status";
    followupCase.value = casoId;
    followupComment.value = comentario;
    botonDeMensaje = boton;
    consultarSeguimiento();
  }

  followupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (followupSubmit.disabled) return;
    followupStatus.textContent = "Guardando…";
    followupStatus.className = "rb-followup-status";
    followupSubmit.disabled = true;
    const result = await browser.runtime.sendMessage({
      type: "followup:create",
      casoId: followupCase.value,
      comentario: followupComment.value,
      driver: driverCampo.control.value,
      seller: sellerCampo.control.value,
    }).catch(() => null);
    followupSubmit.disabled = false;
    if (!result || result.ok !== true) {
      followupStatus.textContent = result && result.error ? result.error : "No se pudo conectar con la extensión.";
      followupStatus.className = "rb-followup-status rb-followup-error";
      return;
    }
    followupStatus.replaceChildren();
    const ok = document.createTextNode("Seguimiento creado. ");
    const link = document.createElement("a");
    const origen = String(result.platformOrigin || state.platformOrigin || "");
    link.href = origen ? new URL(result.enlace || "/seguimiento", origen).href : "https://rapiboy.com";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir en la plataforma";
    followupStatus.append(ok, link);
    followupStatus.className = "rb-followup-status rb-followup-ok";
    if (botonDeMensaje) {
      botonDeMensaje.textContent = "✓ seguimiento";
      botonDeMensaje.classList.add("rb-followup-added");
    }
  });

  followupCase.addEventListener("blur", consultarSeguimiento);
  assistantMode.addEventListener("click", () => setMode("assistant"));
  followupMode.addEventListener("click", () => setMode("followup"));

  // Los IDs internos que usa Seguimiento tienen hoy entre 7 y 9 dígitos. Se
  // excluyen teléfonos y números de envío largos para no ofrecer falsos casos.
  const ID_VIAJE = /(?:^|\D)(\d{7,9})(?!\d)/;

  function datosMensaje(row) {
    const textos = [...row.querySelectorAll("span.selectable-text")]
      .map((item) => item.textContent || "")
      .filter(Boolean);
    const contenido = textos.join("\n").trim();
    const meta = row.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text")?.trim() || "";
    const imagen = row.querySelector('img[src^="blob:"]');
    return { contenido, meta, imagen, casoId: ID_VIAJE.exec(contenido)?.[1] || "" };
  }

  function idAnterior(row) {
    const rows = [...document.querySelectorAll('#main [role="row"]')];
    const indice = rows.indexOf(row);
    for (let i = indice - 1, revisados = 0; i >= 0 && revisados < 25; i -= 1, revisados += 1) {
      const id = datosMensaje(rows[i]).casoId;
      if (id) return id;
    }
    return "";
  }

  function prepararMensaje(row) {
    if (row.dataset.rapiboySeguimiento === "1") return;
    const datos = datosMensaje(row);
    if (!datos.casoId && !datos.imagen) return;
    row.dataset.rapiboySeguimiento = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rb-whatsapp-followup" + (datos.casoId ? "" : " rb-whatsapp-followup-muted");
    button.textContent = "+ seguimiento";
    button.title = "Crear seguimiento en Rapiboy";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const casoId = datos.casoId || idAnterior(row) || window.prompt("ID del viaje")?.trim() || "";
      const encabezado = datos.meta ? `💬 WhatsApp Web · ${datos.meta}` : "💬 WhatsApp Web";
      const comentario = [encabezado, datos.contenido].filter(Boolean).join("\n").slice(0, 4000);
      abrirSeguimiento({ casoId, comentario, boton: button });
    });
    row.appendChild(button);
  }

  let repasoPendiente = null;
  function repasarWhatsApp() {
    if (location.hostname !== "web.whatsapp.com") return;
    document.querySelectorAll('#main [role="row"]').forEach(prepararMensaje);
  }

  if (location.hostname === "web.whatsapp.com") {
    const observer = new MutationObserver(() => {
      window.clearTimeout(repasoPendiente);
      repasoPendiente = window.setTimeout(repasarWhatsApp, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(repasarWhatsApp, 3000);
    repasarWhatsApp();
  }

  function setOpen(open) {
    panel.hidden = open === false;
    tab.setAttribute("aria-expanded", String(open));
    if (open) {
      refresh();
      window.setTimeout(() => (mode === "assistant" ? textarea : followupCase).focus(), 50);
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
  document.addEventListener("pointerdown", (event) => {
    if (panel.hidden === false && event.composedPath().includes(host) === false) {
      setOpen(false);
    }
  }, true);

  refresh();
})();
