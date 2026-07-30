/**
 * modules/debug.js
 * ------------------------------------------------------------
 * Controla o modo debug do Odoo via query string (?debug=1 / ?debug=assets),
 * sem exigir edição manual da URL pelo usuário.
 * Responsabilidade única: montar e aplicar a URL de debug.
 * ------------------------------------------------------------
 */

/**
 * Monta a URL atual com o parâmetro "debug" ajustado.
 * @param {'1'|'assets'|null} mode - null remove o debug
 * @returns {string}
 */
function buildDebugUrl(mode) {
  const url = new URL(window.location.href);
  if (mode === null) {
    url.searchParams.delete('debug');
  } else {
    url.searchParams.set('debug', mode);
  }
  return url.toString();
}

/**
 * Retorna o modo debug atual detectado na URL.
 * @returns {'1'|'assets'|null}
 */
function getCurrentDebugMode() {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('debug');
  return value || null;
}

/**
 * Navega para a URL com o modo de debug desejado (recarrega a página,
 * já que o modo debug do Odoo é lido no bootstrap do web client).
 * @param {'1'|'assets'|null} mode
 */
function applyDebugMode(mode) {
  window.location.href = buildDebugUrl(mode);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildDebugUrl, getCurrentDebugMode, applyDebugMode };
}
