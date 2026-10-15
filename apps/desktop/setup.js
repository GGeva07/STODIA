// Pantalla local de conexión: conecta con un servidor y, si está nuevo, hace su primera configuración.
// Solo usa window.stodiaDesktop (preload): probar / conectar / activar.
(function () {
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso'), info = $('info'), tarjeta = $('tarjeta');
  const input = $('url');
  let urlActual = '';

  const mostrar = (tipo, texto) => { aviso.className = 'aviso visible ' + tipo; aviso.textContent = texto; };
  const ocultarAviso = () => { aviso.className = 'aviso'; aviso.textContent = ''; };
  const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mostrarInfo = (r) => {
    const p = [];
    if (r.institucion) p.push('<strong>Institución:</strong> ' + escapar(r.institucion));
    if (r.version) p.push('<strong>Versión del servidor:</strong> ' + escapar(r.version));
    info.innerHTML = p.join('<br>');
  };
  const paso = (n) => {
    $('paso1').classList.toggle('oculto', n !== 1);
    $('paso2').classList.toggle('oculto', n !== 2);
    tarjeta.classList.toggle('ancha', n === 2);
    window.scrollTo(0, 0);
  };

  // main nos vuelve a cargar con ?url= (y ?error= / ?pendiente=1) tras un fallo, desde el menú o al abrir un servidor nuevo.
  const params = new URLSearchParams(location.search);
  if (params.get('url')) { input.value = params.get('url'); urlActual = params.get('url'); }
  if (params.get('error')) mostrar('error', params.get('error'));
  if (params.get('pendiente') && urlActual) { paso(2); mostrar('pendiente', 'Este servidor aún no está configurado.'); }

  // Paso 1: probar y conectar (o pasar a la configuración si el servidor está nuevo)
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = input.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url; // permite escribir solo el dominio
    input.value = url;
    ocultarAviso(); info.textContent = '';
    const b = $('enviar'); b.disabled = true; b.textContent = 'Probando conexión…';
    try {
      const r = await window.stodiaDesktop.probar(url);
      if (!r.ok) return mostrar('error', r.error || 'No se pudo conectar con el servidor.');
      mostrarInfo(r);
      urlActual = url;
      if (r.estado === 'pendiente') { paso(2); mostrar('pendiente', 'Servidor nuevo: falta su configuración inicial.'); return; }
      const c = await window.stodiaDesktop.conectar(url);
      if (!c.ok) mostrar('error', c.error || 'No se pudo guardar la configuración.');
    } catch (err) {
      mostrar('error', 'Error inesperado: ' + (err && err.message ? err.message : err));
    } finally { b.disabled = false; b.textContent = 'Conectar'; }
  });

  $('volver').addEventListener('click', () => { ocultarAviso(); info.textContent = ''; paso(1); });

  // Paso 2: activación
  $('form2').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarAviso();
    const v = (id) => $(id).value;
    const rncDig = v('rnc').replace(/\D/g, '');
    if (rncDig.length !== 9 && rncDig.length !== 11) return mostrar('error', 'El RNC debe tener 9 dígitos (o 11 si es cédula).');
    if (!/^[a-z0-9._-]{3,32}$/.test(v('usuario').trim().toLowerCase())) return mostrar('error', 'Usuario: 3 a 32 caracteres (minúsculas, números, punto o guion).');
    if (v('password').length < 8) return mostrar('error', 'La contraseña debe tener al menos 8 caracteres.');
    if (v('password') !== v('password2')) return mostrar('error', 'Las contraseñas no coinciden.');
    if (v('pin').length < 4 || v('pin').length > 8) return mostrar('error', 'El PIN debe tener entre 4 y 8 caracteres.');
    const b = $('enviar2'); b.disabled = true; b.textContent = 'Configurando… (puede tardar unos segundos)';
    try {
      const r = await window.stodiaDesktop.activar(urlActual, {
        codigo: v('codigo'), nombre: v('nombre'), rnc: rncDig, telefono: v('telefono'), direccion: v('direccion'), ciudad: v('ciudad'), email: v('email'),
        adminNombre: v('adminNombre'), usuario: v('usuario').trim().toLowerCase(), password: v('password'), pin: v('pin'), licencia: v('licencia'),
      });
      if (!r.ok) return mostrar('error', r.error || 'No se pudo configurar el servidor.');
      const rnc = r.rnc && r.rnc.verificado ? 'RNC verificado en la DGII.' : 'RNC sin verificar (se puede confirmar luego en Configuración).';
      mostrar('ok', `Colegio configurado. Administrador: ${r.admin}. ${rnc} Abriendo STODIA…`);
      $('password').value = ''; $('password2').value = ''; $('pin').value = '';
      setTimeout(async () => { const c = await window.stodiaDesktop.conectar(urlActual); if (!c.ok) mostrar('error', c.error || 'No se pudo abrir STODIA.'); }, 1500);
    } catch (err) {
      mostrar('error', 'Error inesperado: ' + (err && err.message ? err.message : err));
    } finally { b.disabled = false; b.textContent = 'Configurar y entrar'; }
  });
})();
