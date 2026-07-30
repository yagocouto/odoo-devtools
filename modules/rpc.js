/**
 * modules/rpc.js
 * ------------------------------------------------------------
 * Módulo central de comunicação RPC com o Odoo.
 *
 * REGRA DE SEGURANÇA (item 18 do escopo): esta extensão NUNCA pode
 * escrever dados. Por isso existe uma whitelist rígida de métodos
 * permitidos - qualquer método fora dela é bloqueado antes mesmo
 * de montar a requisição.
 *
 * Responsabilidade única: chamadas RPC + formatação de payloads
 * para exportação (JSON/TXT/cURL).
 * ------------------------------------------------------------
 */

const ODOO_DEVTOOLS_READONLY_METHODS = [
  'read',
  'search',
  'search_read',
  'search_count',
  'fields_get',
  'get_views',
  'get_view',
  'name_get',
  'name_search',
  'read_group',
  'default_get',
  'check_access_rights',
  'check_access_rule',
  'get_metadata',
  'load_views',
];

/**
 * Executa uma chamada JSON-RPC somente-leitura em /web/dataset/call_kw.
 * Lança erro se o método não estiver na whitelist de leitura.
 * @param {string} model
 * @param {string} method
 * @param {Array} args
 * @param {Object} kwargs
 * @returns {Promise<*>}
 */
async function odooDevtoolsCallKw(model, method, args = [], kwargs = {}) {
  if (!ODOO_DEVTOOLS_READONLY_METHODS.includes(method)) {
    throw new Error(
      `[Odoo DevTools] Método "${method}" bloqueado. A extensão é somente-leitura.`
    );
  }

  const body = {
    jsonrpc: '2.0',
    method: 'call',
    id: Date.now(),
    params: { model, method, args, kwargs },
  };

  const response = await fetch('/web/dataset/call_kw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });

  const json = await response.json();
  if (json.error) {
    const err = new Error(json.error.message || 'Erro RPC');
    err.details = json.error;
    throw err;
  }
  return json.result;
}

/**
 * Gera um comando cURL equivalente a uma entrada de histórico RPC,
 * útil para reproduzir a chamada fora do navegador (ex: Postman, terminal).
 * @param {Object} entry - entrada do histórico (ver modules/network.js)
 * @returns {string}
 */
function buildCurlCommand(entry) {
  const url = new URL(entry.url, window.location.origin).toString();
  const body = entry.requestBody ? entry.requestBody.replace(/'/g, "'\\''") : '';
  return [
    `curl -X POST '${url}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Cookie: <sua-sessao-odoo>' \\`,
    body ? `  --data-raw '${body}'` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Formata uma entrada de histórico como texto plano legível.
 * @param {Object} entry
 * @returns {string}
 */
function formatEntryAsText(entry) {
  const lines = [
    `URL: ${entry.url}`,
    `Modelo: ${entry.model || '-'}`,
    `Método: ${entry.method || '-'}`,
    `Status HTTP: ${entry.status ?? '-'}`,
    `Tempo: ${formatDuration(entry.duration)}`,
    `Data: ${formatDate(entry.timestamp)}`,
    '',
    '--- REQUEST ---',
    entry.requestBody || '(vazio)',
    '',
    '--- RESPONSE ---',
    entry.responseBody || '(vazio)',
  ];
  if (entry.error) {
    lines.push('', '--- ERRO ---', safeStringify(entry.error));
  }
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ODOO_DEVTOOLS_READONLY_METHODS,
    odooDevtoolsCallKw,
    buildCurlCommand,
    formatEntryAsText,
  };
}
