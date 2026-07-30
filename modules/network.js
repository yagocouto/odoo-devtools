/**
 * modules/network.js
 * ------------------------------------------------------------
 * Painel "Monitor de Network": recebe eventos de RPC capturados
 * pelo content/inject.js (MAIN world), mantém uma lista em memória
 * da sessão atual, envia cada entrada para o background persistir
 * no histórico (utils/storage.js) e renderiza a UI de listagem/detalhe.
 * Responsabilidade única: captura, filtragem e exportação de RPCs.
 * ------------------------------------------------------------
 */

const OdooDevtoolsNetwork = (() => {
  const entries = []; // sessão atual (mais recente primeiro)
  const listeners = [];

  function onRpcCaptured(ev) {
    const detail = ev.detail;
    const entry = {
      id: generateId(),
      ...detail,
    };
    entries.unshift(entry);

    // Persiste no histórico via background (mantém os últimos N configurados).
    chrome.runtime.sendMessage({ type: 'RPC_HISTORY_ADD', entry }).catch(() => {});

    listeners.forEach((cb) => cb(entry));
  }

  function init() {
    window.addEventListener('odoo-devtools:rpc-captured', onRpcCaptured);
  }

  /**
   * Registra um callback chamado a cada novo request capturado
   * (usado pelo content.js para atualizar a UI em tempo real).
   * @param {Function} cb
   */
  function onNewEntry(cb) {
    listeners.push(cb);
  }

  function getEntries() {
    return entries;
  }

  /**
   * Filtra entradas por modelo, método, status ou presença de erro.
   * @param {Object} filters
   */
  function filterEntries(filters = {}) {
    return entries.filter((e) => {
      if (filters.model && e.model !== filters.model) return false;
      if (filters.method && e.method !== filters.method) return false;
      if (filters.status && String(e.status) !== String(filters.status)) return false;
      if (filters.onlyErrors && !e.error) return false;
      if (filters.search) {
        const haystack = `${e.url} ${e.model} ${e.method}`.toLowerCase();
        if (!haystack.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
  }

  function clear() {
    entries.length = 0;
  }

  /**
   * Dispara download de um arquivo de texto no navegador.
   * @param {string} filename
   * @param {string} content
   * @param {string} mime
   */
  function downloadFile(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = createEl('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportEntryAsJson(entry) {
    downloadFile(`odoo-rpc-${entry.id}.json`, safeStringify(entry), 'application/json');
  }

  function exportEntryAsTxt(entry) {
    downloadFile(`odoo-rpc-${entry.id}.txt`, formatEntryAsText(entry), 'text/plain');
  }

  function exportEntryAsCurl(entry) {
    downloadFile(`odoo-rpc-${entry.id}.sh`, buildCurlCommand(entry), 'text/plain');
  }

  function exportAllAsJson() {
    downloadFile('odoo-rpc-history.json', safeStringify(entries), 'application/json');
  }

  return {
    init,
    onNewEntry,
    getEntries,
    filterEntries,
    clear,
    downloadFile,
    exportEntryAsJson,
    exportEntryAsTxt,
    exportEntryAsCurl,
    exportAllAsJson,
  };
})();
