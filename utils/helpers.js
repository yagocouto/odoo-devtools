/**
 * utils/helpers.js
 * ------------------------------------------------------------
 * Funções utilitárias genéricas, sem dependência de DOM ou storage.
 * Responsabilidade única: helpers puros reutilizáveis por qualquer módulo.
 * ------------------------------------------------------------
 */

/**
 * Gera um ID único simples (usado para chaves de histórico/favoritos).
 * @returns {string}
 */
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formata milissegundos em texto legível (ex: "128ms", "1.2s").
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Formata uma data ISO em formato legível pt-BR.
 * @param {string|number|Date} date
 * @returns {string}
 */
function formatDate(date) {
  try {
    const d = new Date(date);
    return d.toLocaleString('pt-BR');
  } catch (e) {
    return String(date);
  }
}

/**
 * Debounce clássico: adia a execução de fn até que pare de ser chamada
 * pelo intervalo definido em wait (ms).
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
function debounce(fn, wait = 200) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Copia um texto para a área de transferência.
 * Retorna true/false indicando sucesso.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback para contextos sem permissão de clipboard assíncrono.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (err) {
      return false;
    }
  }
}

/**
 * Converte um objeto em JSON formatado (indentado) de forma segura,
 * tratando referências circulares.
 * @param {*} obj
 * @param {number} indent
 * @returns {string}
 */
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      },
      indent
    );
  } catch (e) {
    return String(obj);
  }
}

/**
 * Extrai o modelo e método de uma URL de RPC do Odoo, quando possível.
 * Ex: /web/dataset/call_kw/res.partner/read -> { model: 'res.partner', method: 'read' }
 * @param {string} url
 * @returns {{model: string|null, method: string|null}}
 */
function parseOdooRpcUrl(url) {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const parts = path.split('/').filter(Boolean);
    // /web/dataset/call_kw/<model>/<method>
    const idx = parts.indexOf('call_kw');
    if (idx !== -1 && parts.length > idx + 2) {
      return { model: parts[idx + 1], method: parts[idx + 2] };
    }
    return { model: null, method: null };
  } catch (e) {
    return { model: null, method: null };
  }
}

/**
 * Trunca uma string para exibição, adicionando reticências.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(str, maxLength = 80) {
  if (!str) return '';
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

/**
 * Escapa texto para uso seguro dentro de HTML (evita XSS ao renderizar
 * valores vindos de dados do Odoo dentro do painel).
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateId,
    formatDuration,
    formatDate,
    debounce,
    copyToClipboard,
    safeStringify,
    parseOdooRpcUrl,
    truncate,
    escapeHtml,
  };
}
