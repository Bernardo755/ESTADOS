// Lógica de interfaz. El token vive solo en memoria; no hay datos sin sesión validada.
(function () {
  const $ = id => document.getElementById(id);
  const S = { token: "", consultas: 0, maxConsultas: 5, sesion: 0, maxSesiones: 6, usados: 0, max: 30, pending: false, cerrado: false };
  const COLORES = {
    JEF: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    EMS: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    GB: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    BASICA: "bg-purple-500/20 text-purple-300 border border-purple-500/30"
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function badge() {
    $("searchCounterBadge").textContent =
      `Consultas ${S.consultas}/${S.maxConsultas} · Sesión ${S.sesion}/${S.maxSesiones} · Registros hoy ${S.usados}/${S.max}`;
  }
  function limpiarResultados() {
    $("tableContainer").replaceChildren();
    $("resultsSection").classList.add("hidden");
  }
  function mostrarLogin(msg, esError) {
    limpiarResultados();
    $("main").classList.add("hidden");
    $("modalUsuario").value = ""; $("modalPassword").value = "";
    const m = $("loginError");
    m.textContent = msg || "";
    m.classList.toggle("hidden", !msg);
    m.className = (esError === false ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20") +
      " text-xs p-3 rounded-lg border" + (msg ? "" : " hidden");
    $("loginModal").classList.remove("hidden");
    setTimeout(() => $("modalUsuario").focus(), 50);
  }
  function cerrarDia(msg) {
    S.token = ""; S.cerrado = true; S.pending = false;
    limpiarResultados();
    $("main").classList.add("hidden");
    $("loginForm").classList.add("hidden");
    $("modalTexto").textContent = msg || "Cupo diario agotado. Podrás consultar mañana.";
    $("loginError").classList.add("hidden");
    $("loginModal").classList.remove("hidden");
  }
  function actualizarContadores(d) {
    if (d.consultasSesion !== undefined) S.consultas = d.consultasSesion;
    if (d.maxConsultas) S.maxConsultas = d.maxConsultas;
    if (d.sesionNo) S.sesion = d.sesionNo;
    if (d.maxSesiones) S.maxSesiones = d.maxSesiones;
    if (d.registrosUsados !== undefined) S.usados = d.registrosUsados;
    if (d.maxRegistros) S.max = d.maxRegistros;
    badge();
  }

  async function autenticar(e) {
    e.preventDefault();
    const btn = $("btnLoginSubmit");
    btn.disabled = true; btn.textContent = "Verificando...";
    $("loginError").classList.add("hidden");
    try {
      const d = await Api.login($("modalUsuario").value.trim(), $("modalPassword").value);
      $("modalPassword").value = "";
      if (d.status === "day_closed" || d.status === "blocked") return cerrarDia(d.message);
      if (d.status !== "success" || !d.token) return mostrarLogin("❌ " + (d.message || "No se pudo autenticar."), true);
      S.token = d.token; S.consultas = 0; S.loginAt = S.lastContact = Date.now();
      actualizarContadores({ sesionNo: d.sesionNo, maxSesiones: d.maxSesiones, maxConsultas: d.maxConsultas, registrosUsados: d.registrosUsados, maxRegistros: d.maxRegistros });
      $("loginModal").classList.add("hidden");
      $("main").classList.remove("hidden");
      if (S.pending) { S.pending = false; await buscar(); }
    } catch (err) {
      mostrarLogin("❌ Error al conectar con el servidor.", true);
    } finally { btn.disabled = false; btn.textContent = "Validar y Continuar"; }
  }

  function filtros() {
    return { type: $("searchType").value, value: $("searchValue").value.trim(), estado: $("estado").value.trim(), cct: $("cct").value.trim(), scope: $("searchScope").value };
  }
  function validar(f) {
    if (!f.value) return "Es obligatorio ingresar una CURP o un ID.";
    if (f.type === "curp" && !/^[A-Za-z0-9]{18}$/.test(f.value)) return "La CURP debe tener EXACTAMENTE 18 caracteres.";
    if (f.type === "id" && !/^\d{5,}$/.test(f.value)) return "El ID debe contener al menos 5 NÚMEROS.";
    return "";
  }

  async function buscarInterno() {
    if (S.cerrado) return;
    if (!S.token) { S.pending = true; return mostrarLogin(S.consultas >= S.maxConsultas ? "Completaste 5 consultas. Ingresa tu contraseña para continuar." : "Debes autenticarte para consultar.", false); }
    const loading = $("loading");
    loading.classList.remove("hidden"); $("resultsSection").classList.add("hidden"); S.lastContact = Date.now();
    try {
      const d = await Api.search(S.token, filtros());
      loading.classList.add("hidden");
      if (d.status === "auth_required") { S.token = ""; S.pending = true; return mostrarLogin(d.message, true); }
      if (d.status === "reauth_required") { S.token = ""; S.pending = true; S.consultas = S.maxConsultas; return mostrarLogin(d.message, false); }
      if (d.status === "day_closed" || d.status === "blocked") return cerrarDia(d.message);
      if (d.status !== "success") return alert(d.message || "No fue posible realizar la búsqueda.");

      actualizarContadores(d);
      render(d);
      if (d.dayClosed) { alert(d.message); cerrarDia(d.message); }
      else if (d.reauthRequired) { S.token = ""; }  // la siguiente consulta (la 6ª) pedirá contraseña
    } catch (err) {
      loading.classList.add("hidden");
      alert("Ocurrió un error al conectar con el servidor.");
    }
  }

  // Evita doble envío (un doble clic no debe parecer una ráfaga)
  async function buscar() {
    if (S.cargando) return;
    S.cargando = true;
    try { await buscarInterno(); } finally { S.cargando = false; }
  }

  function render(d) {
    const box = $("tableContainer");
    box.replaceChildren();
    $("resultCount").textContent = `${d.count} resultado(s) · quedan ${Math.max(0, d.maxRegistros - d.registrosUsados)} hoy`;
    $("resultsSection").classList.remove("hidden");
    if (!d.groups.length) { box.appendChild(el("p", "p-8 text-center text-slate-500", "No se encontraron registros.")); return; }
    d.groups.forEach(g => {
      const wrap = el("div", "mb-6");
      const title = el("div", "flex items-center gap-2 mb-2");
      title.appendChild(el("span", "px-2.5 py-1 rounded-md text-xs font-bold " + (COLORES[g.source] || "bg-slate-700 text-slate-300"), g.source));
      title.appendChild(el("span", "text-xs text-slate-400", g.sheetName));
      wrap.appendChild(title);
      const scroll = el("div", "overflow-x-auto border border-slate-700 rounded-xl");
      const table = el("table", "w-full text-left border-collapse");
      const thead = el("thead", "bg-slate-900/90 text-xs text-slate-400 uppercase font-semibold tracking-wider");
      const trh = el("tr");
      g.headers.forEach(h => trh.appendChild(el("th", "p-3 border-b border-slate-700 whitespace-nowrap", h || "Columna")));
      thead.appendChild(trh); table.appendChild(thead);
      const tbody = el("tbody", "divide-y divide-slate-700/60 text-sm text-slate-300");
      g.rows.forEach(r => {
        const tr = el("tr", "hover:bg-slate-700/40");
        r.forEach(c => tr.appendChild(el("td", "p-3 whitespace-nowrap", c)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); scroll.appendChild(table); wrap.appendChild(scroll); box.appendChild(wrap);
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    badge();
    $("searchForm").addEventListener("submit", e => {
      e.preventDefault();
      const err = validar(filtros());
      if (err) return alert("⚠️ " + err);
      buscar();
    });
    $("loginForm").addEventListener("submit", autenticar);
    // Aviso de expiración en el navegador (el servidor es quien manda): 15 min sin consultar o 2 h de sesión
    setInterval(() => {
      if (!S.token) return;
      const ahora = Date.now();
      if (ahora - S.lastContact > 15 * 60 * 1000 || ahora - S.loginAt > 2 * 60 * 60 * 1000) {
        const t = S.token; S.token = ""; S.pending = false;
        Api.logout(t).catch(() => {});
        mostrarLogin("Tu sesión expiró (15 min de inactividad o 2 h de duración). Ingresa de nuevo.", false);
      }
    }, 15000);
    $("btnLogout").addEventListener("click", async () => {
      const t = S.token; S.token = ""; S.pending = false;
      if (t) { try { await Api.logout(t); } catch (_) {} }
      mostrarLogin("Sesión cerrada.", false);
    });
    // Disuasivos (no son seguridad real): sin copiar/menú contextual sobre resultados
    ["copy", "cut", "contextmenu", "dragstart"].forEach(ev =>
      $("resultsSection").addEventListener(ev, e => e.preventDefault()));
    mostrarLogin("Para abrir ESTADOS, ingresa tu usuario y contraseña.", false);
  });
})();
