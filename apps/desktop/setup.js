// Lógica de la pantalla "Conectar con el servidor". Usa solo window.stodiaDesktop (preload).
(function () {
  const form = document.getElementById('form');
  const input = document.getElementById('url');
  const boton = document.getElementById('enviar');
  const aviso = document.getElementById('aviso');
  const info = document.getElementById('info');

  function mostrar(tipo, texto) {
    aviso.className = 'aviso visible ' + tipo;
    aviso.textContent = texto;
  }

  function ocultarAviso() {
    aviso.className = 'aviso';
    aviso.textContent = '';
  }

  function mostrarInfo(r) {
    const partes = [];
    if (r.institucion) partes.push('<strong>Institución:</strong> ' + escapar(r.institucion));
    if (r.version) partes.push('<strong>Versión:</strong> ' + escapar(r.version));
    info.innerHTML = partes.join('<br>');
  }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Parámetros que main pasa al cargar la página tras un fallo o desde el menú.
  const params = new URLSearchParams(location.search);
  if (params.get('url')) input.value = params.get('url');
  if (params.get('error')) mostrar('error', params.get('error'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;
    ocultarAviso();
    info.textContent = '';
    boton.disabled = true;
    boton.textContent = 'Probando conexión…';
    try {
      const probe = await window.stodiaDesktop.probar(url);
      if (!probe.ok) {
        mostrar('error', probe.error || 'No se pudo conectar con el servidor.');
        return;
      }
      mostrarInfo(probe);
      if (probe.estado === 'pendiente') {
        mostrar('pendiente', 'Este servidor aún no está activado: ejecuta el instalador del cliente en modo instalación nueva.');
        return;
      }
      const r = await window.stodiaDesktop.guardar(url);
      if (!r.ok) {
        mostrar(r.pendiente ? 'pendiente' : 'error', r.error || 'No se pudo guardar la configuración.');
        return;
      }
      // main carga la web; esta página se sustituye.
    } catch (err) {
      mostrar('error', 'Error inesperado: ' + (err && err.message ? err.message : err));
    } finally {
      boton.disabled = false;
      boton.textContent = 'Conectar';
    }
  });
})();
