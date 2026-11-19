(() => {
  if (location.hostname !== "web.whatsapp.com" || document.getElementById("rapiboy-workspace-root")) return;

  const host = document.createElement("div");
  host.id = "rapiboy-workspace-root";
  document.documentElement.appendChild(host);
  document.documentElement.dataset.rbWorkspace = "true";
  document.documentElement.dataset.rbLeft = "open";
  document.documentElement.dataset.rbRight = "open";

  const shadow = host.attachShadow({ mode: "open" });
  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = browser.runtime.getURL("whatsapp-workspace.css");
  shadow.appendChild(styles);

  const themeVariables = [
    "--background-default", "--panel-background", "--panel-background-deeper",
    "--background-default-hover", "--background-default-active", "--primary",
    "--secondary", "--border-stronger", "--button-primary",
    "--unread-marker-background", "--compose-input-background",
  ];
  function syncTheme() {
    const targets = [document.documentElement, document.body, document.querySelector("#app")].filter(Boolean);
    for (const variable of themeVariables) {
      const value = targets.map((node) => getComputedStyle(node).getPropertyValue(variable).trim()).find(Boolean);
      if (value) host.style.setProperty(variable, value);
    }
  }
  syncTheme();

  const workspace = document.createElement("div");
  workspace.className = "rbw-workspace";
  shadow.appendChild(workspace);

  function elemento(nombre, clase, texto) {
    const nodo = document.createElement(nombre);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function botonIcono(texto, titulo) {
    const boton = elemento("button", "rbw-icon", texto);
    boton.type = "button";
    boton.title = titulo;
    boton.setAttribute("aria-label", titulo);
    return boton;
  }

  const left = elemento("aside", "rbw-left");
  const leftHeader = elemento("header", "rbw-toolbar");
  const brand = elemento("div", "rbw-brand");
  brand.append(elemento("span", "rbw-brand-mark", "R"), elemento("strong", "", "Rapiboy"));
  const leftActions = elemento("div", "rbw-toolbar-actions");
  const refreshButton = botonIcono("↻", "Actualizar bandejas");
  const settingsButton = botonIcono("⚙", "Configurar etiquetas");
  const collapseLeft = botonIcono("‹", "Ocultar bandejas");
  leftActions.append(refreshButton, settingsButton, collapseLeft);
  leftHeader.append(brand, leftActions);

  const searchWrap = elemento("div", "rbw-search");
  searchWrap.append(elemento("span", "", "⌕"));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Buscar chats";
  search.setAttribute("aria-label", "Buscar chats de las dos etiquetas");
  searchWrap.appendChild(search);

  const columns = elemento("div", "rbw-columns");
  function crearColumna() {
    const section = elemento("section", "rbw-column");
    const header = elemento("header", "rbw-column-header");
    const title = elemento("strong", "", "Etiqueta");
    const count = elemento("span", "rbw-count", "0");
    header.append(title, count);
    const list = elemento("div", "rbw-chat-list");
    list.setAttribute("role", "list");
    section.append(header, list);
    return { section, title, count, list };
  }
  const primaryColumn = crearColumna();
  const secondaryColumn = crearColumna();
  columns.append(primaryColumn.section, secondaryColumn.section);
  const leftStatus = elemento("p", "rbw-status");
  left.append(leftHeader, searchWrap, columns, leftStatus);

  const right = elemento("aside", "rbw-right");
  const rightHeader = elemento("header", "rbw-toolbar rbw-right-header");
  const rightHeading = elemento("div", "rbw-right-heading");
  rightHeading.append(elemento("strong", "", "Resumen de la tienda"), elemento("span", "", "Chat seleccionado"));
  const collapseRight = botonIcono("›", "Ocultar resumen");
  rightHeader.append(rightHeading, collapseRight);
  const summary = elemento("div", "rbw-summary");
  const actionBar = elemento("div", "rbw-actions");
  const assistantButton = elemento("button", "rbw-action", "Asistente");
  assistantButton.type = "button";
  const followupButton = elemento("button", "rbw-action rbw-action-primary", "Cargar seguimiento");
  followupButton.type = "button";
  actionBar.append(assistantButton, followupButton);
  right.append(rightHeader, summary, actionBar);

  const openLeft = elemento("button", "rbw-reopen rbw-reopen-left", "›");
  openLeft.type = "button";
  openLeft.title = "Mostrar bandejas";
  const openRight = elemento("button", "rbw-reopen rbw-reopen-right", "‹");
  openRight.type = "button";
  openRight.title = "Mostrar resumen";
  workspace.append(left, right, openLeft, openRight);

  const scrim = elemento("div", "rbw-scrim");
  scrim.hidden = true;
  const dialog = elemento("section", "rbw-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const dialogHeader = elemento("header", "rbw-dialog-header");
  const dialogTitle = elemento("strong", "", "Configurar bandejas");
  const closeDialog = botonIcono("×", "Cerrar");
  dialogHeader.append(dialogTitle, closeDialog);
  const dialogBody = elemento("div", "rbw-dialog-body");
  dialog.append(dialogHeader, dialogBody);
  scrim.appendChild(dialog);
  shadow.appendChild(scrim);

  let labels = [];
  let settings = { primary: "", secondary: "" };
  let chats = { primary: [], secondary: [] };
  let platformOrigin = "";
  let busy = false;
  const summaries = new Map();

  function normalizar(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  }

  function etiquetaPorId(id) {
    return labels.find((label) => String(label.id) === String(id)) || null;
  }

  function elegirEtiqueta(nombre, except = "") {
    const buscada = normalizar(nombre);
    return labels.find((label) => String(label.id) !== except && normalizar(label.nombre).includes(buscada))
      || labels.find((label) => String(label.id) !== except)
      || null;
  }

  function fechaRelativa(valor) {
    if (!valor) return "";
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return "";
    const hoy = new Date();
    if (fecha.toDateString() === hoy.toDateString()) {
      return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(fecha);
    }
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" }).format(fecha);
  }

  function iniciales(nombre) {
    const partes = String(nombre || "?").split(/\s+/).filter(Boolean);
    return (partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0]?.slice(0, 2) || "?").toUpperCase();
  }

  function setStatus(texto, error = false) {
    leftStatus.textContent = texto;
    leftStatus.classList.toggle("rbw-error", error);
  }

  function emptySummary(texto = "Seleccioná un chat para ver la información operativa de la tienda.") {
    summary.replaceChildren();
    const empty = elemento("div", "rbw-summary-empty");
    empty.append(elemento("span", "rbw-summary-icon", "⌂"), elemento("p", "", texto));
    summary.appendChild(empty);
  }

  function enlaceSeguro(path) {
    try {
      const url = new URL(path, platformOrigin);
      return platformOrigin && url.origin === platformOrigin ? url.href : "";
    } catch {
      return "";
    }
  }

  function renderSummary(tienda) {
    summary.replaceChildren();
    const hero = elemento("section", "rbw-store-hero");
    const avatar = elemento("span", "rbw-store-avatar", iniciales(tienda.nombre));
    const identity = elemento("div", "rbw-store-identity");
    identity.append(elemento("strong", "", tienda.nombre), elemento("span", "", `ID ${tienda.id} · ${tienda.estadoSistema}`));
    hero.append(avatar, identity);

    const details = elemento("dl", "rbw-details");
    [["Responsable", tienda.soporte || "Sin asignar"], ["Grupo", tienda.grupo || "Sin vincular"], ["Domicilio", tienda.direccion || "Sin domicilio"]].forEach(([key, value]) => {
      const row = elemento("div", "");
      row.append(elemento("dt", "", key), elemento("dd", "", value));
      details.appendChild(row);
    });

    const metrics = elemento("section", "rbw-metrics");
    const items = [
      ["Casos abiertos", tienda.metricas.casosAbiertos, tienda.enlaces.seguimiento],
      ["Seguimientos", tienda.metricas.seguimientosAbiertos, tienda.enlaces.seguimiento],
      ["Demorados", tienda.metricas.demorados, tienda.enlaces.demorados],
      ["No entregados", tienda.metricas.noEntregados, tienda.enlaces.seguimiento],
      ["Siniestros", tienda.metricas.siniestros, tienda.enlaces.siniestros],
    ];
    for (const [label, value, path] of items) {
      const href = enlaceSeguro(path);
      const item = document.createElement(href ? "a" : "div");
      item.className = "rbw-metric";
      if (href) { item.href = href; item.target = "_blank"; item.rel = "noopener noreferrer"; }
      item.append(elemento("span", "", label), elemento("strong", Number(value) > 99 ? "rbw-value-small" : "", String(value)));
      metrics.appendChild(item);
    }
    summary.append(hero, details, metrics);
  }

  async function loadSummary(sellerId) {
    const id = Number(sellerId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      emptySummary("No se encontró un ID de tienda en este chat.");
      return;
    }
    if (summaries.has(id)) {
      renderSummary(summaries.get(id));
      return;
    }
    summary.replaceChildren(elemento("p", "rbw-loading", "Cargando información…"));
    const result = await browser.runtime.sendMessage({ type: "workspace:summary", sellerId: id }).catch(() => null);
    if (!result || result.ok !== true) {
      emptySummary(result?.error || "No se pudo cargar el resumen de la tienda.");
      return;
    }
    platformOrigin = result.platformOrigin || platformOrigin;
    summaries.set(id, result.tienda);
    renderSummary(result.tienda);
  }

  function extraerSellerId(nombre) {
    const explicito = /(?:^|\D)(?:id|tienda|seller)\s*[:#-]?\s*(\d{1,7})(?!\d)/i.exec(String(nombre || ""));
    if (explicito) return Number(explicito[1]);
    const inicial = /^\s*#?(\d{1,7})(?:\D|$)/.exec(String(nombre || ""));
    return inicial ? Number(inicial[1]) : null;
  }

  function abrirChat(chat) {
    loadSummary(chat.sellerId || extraerSellerId(chat.nombre));
    if (chat.id.endsWith("@c.us")) {
      const phone = chat.id.replace(/\D/g, "");
      if (phone) location.assign(`/send?phone=${encodeURIComponent(phone)}`);
      return;
    }
    const titulo = [...document.querySelectorAll("#pane-side [title]")]
      .find((node) => node.getAttribute("title") === chat.nombre);
    if (titulo) {
      (titulo.closest('[role="row"]') || titulo).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return;
    }
    const input = [...document.querySelectorAll('div[contenteditable="true"]')].find((node) => !node.closest("#main"));
    if (!input) { setStatus("No se pudo abrir el chat automáticamente.", true); return; }
    input.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, chat.nombre);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: chat.nombre }));
    window.setTimeout(() => {
      const resultado = [...document.querySelectorAll("#pane-side [title]")]
        .find((node) => node.getAttribute("title") === chat.nombre);
      if (resultado) (resultado.closest('[role="row"]') || resultado).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      else setStatus("Usá la búsqueda de WhatsApp para abrir este grupo.", true);
    }, 700);
  }

  function renderColumn(column, list, labelId) {
    const label = etiquetaPorId(labelId);
    column.title.textContent = label?.nombre || "Sin etiqueta";
    const query = normalizar(search.value);
    const visible = list.filter((chat) => !query || normalizar(`${chat.nombre} ${chat.extracto}`).includes(query));
    column.count.textContent = String(visible.length);
    column.list.replaceChildren();
    if (visible.length === 0) {
      column.list.appendChild(elemento("p", "rbw-empty", query ? "Sin coincidencias" : "No hay chats"));
      return;
    }
    for (const chat of visible) {
      const button = elemento("button", "rbw-chat");
      button.type = "button";
      button.setAttribute("role", "listitem");
      const avatar = elemento("span", `rbw-avatar rbw-avatar-${chat.tipo}`, iniciales(chat.nombre));
      if (chat.foto) {
        const image = document.createElement("img");
        image.src = chat.foto;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove());
        avatar.appendChild(image);
      }
      const body = elemento("span", "rbw-chat-body");
      const top = elemento("span", "rbw-chat-top");
      top.append(elemento("strong", "", chat.nombre), elemento("time", "", fechaRelativa(chat.ultimoMensajeEn)));
      const bottom = elemento("span", "rbw-chat-bottom");
      bottom.append(elemento("span", "rbw-excerpt", chat.extracto || (chat.tipo === "driver" ? "Grupo de driver" : "Grupo de tienda")));
      if (chat.noLeidos > 0) bottom.append(elemento("b", "rbw-unread", chat.noLeidos > 99 ? "99+" : String(chat.noLeidos)));
      body.append(top, bottom);
      button.append(avatar, body);
      button.addEventListener("click", () => abrirChat(chat));
      column.list.appendChild(button);
    }
  }

  function renderChats() {
    renderColumn(primaryColumn, chats.primary, settings.primary);
    renderColumn(secondaryColumn, chats.secondary, settings.secondary);
  }

  async function loadChats() {
    if (busy || !settings.primary || !settings.secondary) return;
    busy = true;
    refreshButton.disabled = true;
    setStatus("Actualizando chats…");
    const [primary, secondary] = await Promise.all([
      browser.runtime.sendMessage({ type: "workspace:chats", etiquetaId: settings.primary }).catch(() => null),
      browser.runtime.sendMessage({ type: "workspace:chats", etiquetaId: settings.secondary }).catch(() => null),
    ]);
    busy = false;
    refreshButton.disabled = false;
    if (!primary?.ok || !secondary?.ok) {
      setStatus(primary?.error || secondary?.error || "No se pudieron cargar las bandejas.", true);
      return;
    }
    platformOrigin = primary.platformOrigin || secondary.platformOrigin || platformOrigin;
    chats = { primary: primary.chats || [], secondary: secondary.chats || [] };
    renderChats();
    const fallback = primary.fuente !== "waha" || secondary.fuente !== "waha";
    setStatus(fallback ? "Datos del último directorio sincronizado" : "Actualizado desde WhatsApp");
  }

  async function initialize() {
    emptySummary();
    const saved = await browser.runtime.sendMessage({ type: "workspace:get-settings" }).catch(() => null);
    if (!saved?.ok || saved.configurado === false) {
      setStatus("Vinculá la extensión desde Mi perfil.", true);
      return;
    }
    settings = { primary: saved.primary || "", secondary: saved.secondary || "" };
    const result = await browser.runtime.sendMessage({ type: "workspace:labels" }).catch(() => null);
    if (!result?.ok) { setStatus(result?.error || "No se pudieron cargar las etiquetas.", true); return; }
    labels = result.etiquetas || [];
    platformOrigin = result.platformOrigin || "";
    if (!settings.primary || !etiquetaPorId(settings.primary)) settings.primary = elegirEtiqueta("Esteban")?.id || "";
    if (!settings.secondary || !etiquetaPorId(settings.secondary)) settings.secondary = elegirEtiqueta("Drivers", settings.primary)?.id || "";
    await browser.runtime.sendMessage({ type: "workspace:save-settings", ...settings }).catch(() => null);
    await loadChats();
  }

  function showSettings() {
    dialogTitle.textContent = "Configurar bandejas";
    dialogBody.replaceChildren();
    const intro = elemento("p", "rbw-dialog-help", "Elegí qué etiqueta aparece en cada columna.");
    function selector(labelText, value) {
      const label = elemento("label", "rbw-field");
      label.appendChild(elemento("span", "", labelText));
      const select = document.createElement("select");
      for (const item of labels) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.nombre;
        option.selected = String(item.id) === String(value);
        select.appendChild(option);
      }
      label.appendChild(select);
      return { label, select };
    }
    const first = selector("Primera columna", settings.primary);
    const second = selector("Segunda columna", settings.secondary);
    const save = elemento("button", "rbw-dialog-save", "Guardar y actualizar");
    save.type = "button";
    save.addEventListener("click", async () => {
      settings = { primary: first.select.value, secondary: second.select.value };
      await browser.runtime.sendMessage({ type: "workspace:save-settings", ...settings });
      closeModal();
      await loadChats();
    });
    dialogBody.append(intro, first.label, second.label, save);
    scrim.hidden = false;
    first.select.focus();
  }

  function detectTripId() {
    const texts = [...document.querySelectorAll("#main span.selectable-text")].slice(-40).reverse();
    for (const node of texts) {
      const match = /(?:^|\D)(\d{7,9})(?!\d)/.exec(node.textContent || "");
      if (match) return match[1];
    }
    return "";
  }

  function showFollowup() {
    dialogTitle.textContent = "Cargar seguimiento";
    dialogBody.replaceChildren();
    const form = elemento("form", "rbw-followup");
    function field(labelText, name, area = false) {
      const label = elemento("label", "rbw-field");
      label.appendChild(elemento("span", "", labelText));
      const control = document.createElement(area ? "textarea" : "input");
      control.name = name;
      if (area) control.rows = 5;
      label.appendChild(control);
      return { label, control };
    }
    const trip = field("ID del viaje", "casoId");
    trip.control.inputMode = "numeric";
    trip.control.maxLength = 12;
    trip.control.value = detectTripId();
    const comment = field("Comentario", "comentario", true);
    comment.control.maxLength = 4000;
    const optional = elemento("div", "rbw-field-grid");
    const driver = field("Driver (opcional)", "driver");
    const seller = field("Seller (opcional)", "seller");
    optional.append(driver.label, seller.label);
    const status = elemento("p", "rbw-form-status");
    const submit = elemento("button", "rbw-dialog-save", "Crear seguimiento");
    submit.type = "submit";
    form.append(trip.label, comment.label, optional, status, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = "Guardando…";
      const result = await browser.runtime.sendMessage({
        type: "followup:create",
        casoId: trip.control.value,
        comentario: comment.control.value,
        driver: driver.control.value,
        seller: seller.control.value,
      }).catch(() => null);
      submit.disabled = false;
      if (!result?.ok) { status.textContent = result?.error || "No se pudo crear el seguimiento."; status.className = "rbw-form-status rbw-error"; return; }
      status.replaceChildren(document.createTextNode("Seguimiento creado. "));
      const link = elemento("a", "", "Abrir en la plataforma");
      link.href = new URL(result.enlace || "/seguimiento", result.platformOrigin || platformOrigin).href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      status.appendChild(link);
      status.className = "rbw-form-status rbw-success";
    });
    dialogBody.appendChild(form);
    scrim.hidden = false;
    (trip.control.value ? comment.control : trip.control).focus();
  }

  function closeModal() { scrim.hidden = true; }

  function setLeft(open) {
    document.documentElement.dataset.rbLeft = open ? "open" : "closed";
    left.hidden = !open;
    openLeft.hidden = open;
  }
  function setRight(open) {
    document.documentElement.dataset.rbRight = open ? "open" : "closed";
    right.hidden = !open;
    openRight.hidden = open;
  }

  function selectedChatTitle() {
    const candidates = document.querySelectorAll("#main header [title]");
    return [...candidates].map((node) => node.getAttribute("title") || "").find(Boolean) || "";
  }

  let lastTitle = "";
  function watchCurrentChat() {
    const title = selectedChatTitle();
    if (!title || title === lastTitle) return;
    lastTitle = title;
    const all = [...chats.primary, ...chats.secondary];
    const known = all.find((chat) => chat.nombre === title);
    loadSummary(known?.sellerId || extraerSellerId(title));
  }

  search.addEventListener("input", renderChats);
  refreshButton.addEventListener("click", () => { summaries.clear(); void loadChats(); });
  settingsButton.addEventListener("click", showSettings);
  collapseLeft.addEventListener("click", () => setLeft(false));
  collapseRight.addEventListener("click", () => setRight(false));
  openLeft.addEventListener("click", () => setLeft(true));
  openRight.addEventListener("click", () => setRight(true));
  closeDialog.addEventListener("click", closeModal);
  scrim.addEventListener("pointerdown", (event) => { if (event.target === scrim) closeModal(); });
  assistantButton.addEventListener("click", () => document.dispatchEvent(new CustomEvent("rapiboy:open-assistant")));
  followupButton.addEventListener("click", showFollowup);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !scrim.hidden) closeModal(); });

  setLeft(true);
  setRight(true);
  const observer = new MutationObserver(watchCurrentChat);
  observer.observe(document.body, { subtree: true, childList: true });
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });
  window.setInterval(watchCurrentChat, 1500);
  window.setInterval(() => void loadChats(), 30_000);
  void initialize();
})();
