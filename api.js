// Capa de comunicación. Usa POST (las credenciales NO viajan en la URL).
(function () {
  async function post(payload) {
    const r = await fetch(window.APP_CONFIG.WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store"
    });
    return r.json();
  }
  window.Api = {
    login: (user, pass) => post({ action: "login", user, pass }),
    search: (token, f) => post({ action: "search", token, type: f.type, value: f.value, estado: f.estado, cct: f.cct, scope: f.scope }),
    logout: token => post({ action: "logout", token })
  };
})();
