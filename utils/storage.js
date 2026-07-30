/**
 * utils/storage.js
 * ------------------------------------------------------------
 * Camada única de acesso ao chrome.storage.local.
 * Toda a extensão deve ler/gravar dados através deste módulo,
 * nunca chamando chrome.storage diretamente em outros arquivos.
 *
 * Responsabilidade única: persistência de dados locais.
 * ------------------------------------------------------------
 */

// Chaves fixas usadas no storage, centralizadas para evitar erros de digitação.
const STORAGE_KEYS = {
  RPC_HISTORY: 'odoo_devtools_rpc_history',
  FAVORITES: 'odoo_devtools_favorites',
  SETTINGS: 'odoo_devtools_settings',
};

// Configurações padrão da extensão (usadas na primeira instalação).
const DEFAULT_SETTINGS = {
  theme: 'dark',
  language: 'pt-BR',
  maxRequests: 300,
  autoClearHistory: false,
  shortcuts: {
    toggleDebug: 'Ctrl+Shift+D',
    openNetwork: 'Ctrl+Shift+N',
    openRecord: 'Ctrl+Shift+R',
    openXPath: 'Ctrl+Shift+X',
  },
};

const MAX_BODY_CHARS = 5000;
const MAX_ERROR_DEBUG_CHARS = 2000;

function limitText(value, maxChars) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function compactRpcEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;

  const compacted = {
    ...entry,
    requestBody: limitText(entry.requestBody, MAX_BODY_CHARS),
    responseBody: limitText(entry.responseBody, MAX_BODY_CHARS),
  };

  if (compacted.error && typeof compacted.error === 'object') {
    compacted.error = {
      ...compacted.error,
      debug: limitText(compacted.error.debug, MAX_ERROR_DEBUG_CHARS),
    };
  }

  return compacted;
}

/**
 * Lê um valor do storage local.
 * @param {string} key
 * @param {*} fallback - valor retornado caso a chave não exista
 * @returns {Promise<*>}
 */
async function storageGet(key, fallback = null) {
  const result = await chrome.storage.local.get(key);
  return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : fallback;
}

/**
 * Grava um valor no storage local.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
async function storageSet(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Remove uma chave do storage local.
 * @param {string} key
 * @returns {Promise<void>}
 */
async function storageRemove(key) {
  await chrome.storage.local.remove(key);
}

/* ------------------------------------------------------------ *
 * HISTÓRICO RPC
 * ------------------------------------------------------------ */

/**
 * Retorna o histórico de requests RPC salvos (máx. configurado pelo usuário).
 * @returns {Promise<Array>}
 */
async function getRpcHistory() {
  return storageGet(STORAGE_KEYS.RPC_HISTORY, []);
}

/**
 * Adiciona uma nova entrada ao histórico RPC, respeitando o limite máximo.
 * @param {Object} entry - objeto de request/response já formatado
 * @returns {Promise<void>}
 */
async function addRpcHistoryEntry(entry) {
  const settings = await getSettings();
  const maxRequests = settings.maxRequests || DEFAULT_SETTINGS.maxRequests;

  const history = await getRpcHistory();
  history.unshift(compactRpcEntry(entry)); // mais recente primeiro

  // Mantém apenas os N registros mais recentes.
  const trimmed = history.slice(0, maxRequests);

  try {
    await storageSet(STORAGE_KEYS.RPC_HISTORY, trimmed);
    return;
  } catch (e) {
    const message = e && e.message ? e.message : '';
    const quotaExceeded = message.includes('quota') || message.includes('Quota');
    if (!quotaExceeded) throw e;
  }

  // Fallback para quota: reduz volume de histórico até caber.
  const reduced = trimmed.slice(0, Math.max(20, Math.floor(maxRequests / 2)));
  reduced.forEach((item) => {
    if (item && typeof item === 'object') {
      item.requestBody = limitText(item.requestBody, 1200);
      item.responseBody = limitText(item.responseBody, 1200);
      if (item.error && typeof item.error === 'object') {
        item.error.debug = limitText(item.error.debug, 600);
      }
    }
  });

  await storageSet(STORAGE_KEYS.RPC_HISTORY, reduced);
}

/**
 * Limpa todo o histórico RPC salvo.
 * @returns {Promise<void>}
 */
async function clearRpcHistory() {
  await storageSet(STORAGE_KEYS.RPC_HISTORY, []);
}

/* ------------------------------------------------------------ *
 * FAVORITOS
 * ------------------------------------------------------------ */

/**
 * Estrutura padrão de favoritos, separada por categoria.
 * @returns {Object}
 */
function emptyFavorites() {
  return { views: [], models: [], menus: [], records: [] };
}

/**
 * Retorna todos os favoritos salvos.
 * @returns {Promise<Object>}
 */
async function getFavorites() {
  return storageGet(STORAGE_KEYS.FAVORITES, emptyFavorites());
}

/**
 * Adiciona um item aos favoritos de uma categoria específica.
 * @param {'views'|'models'|'menus'|'records'} category
 * @param {Object} item
 * @returns {Promise<void>}
 */
async function addFavorite(category, item) {
  const favorites = await getFavorites();
  if (!favorites[category]) favorites[category] = [];

  // Evita duplicados comparando por id/técnico.
  const exists = favorites[category].some((f) => f.id === item.id);
  if (!exists) {
    favorites[category].push(item);
    await storageSet(STORAGE_KEYS.FAVORITES, favorites);
  }
}

/**
 * Remove um item dos favoritos de uma categoria específica.
 * @param {'views'|'models'|'menus'|'records'} category
 * @param {string|number} id
 * @returns {Promise<void>}
 */
async function removeFavorite(category, id) {
  const favorites = await getFavorites();
  if (!favorites[category]) return;

  favorites[category] = favorites[category].filter((f) => f.id !== id);
  await storageSet(STORAGE_KEYS.FAVORITES, favorites);
}

/* ------------------------------------------------------------ *
 * CONFIGURAÇÕES
 * ------------------------------------------------------------ */

/**
 * Retorna as configurações da extensão, mescladas com os padrões
 * (garante que novas opções adicionadas em updates futuros tenham fallback).
 * @returns {Promise<Object>}
 */
async function getSettings() {
  const saved = await storageGet(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

/**
 * Atualiza parcialmente as configurações da extensão.
 * @param {Object} partialSettings
 * @returns {Promise<Object>} configurações completas atualizadas
 */
async function updateSettings(partialSettings) {
  const current = await getSettings();
  const updated = { ...current, ...partialSettings };
  await storageSet(STORAGE_KEYS.SETTINGS, updated);
  return updated;
}

// Exporta o módulo (usado via importScripts no service worker e
// via <script> simples no popup/content, já que o projeto não usa bundler).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    storageGet,
    storageSet,
    storageRemove,
    getRpcHistory,
    addRpcHistoryEntry,
    clearRpcHistory,
    getFavorites,
    addFavorite,
    removeFavorite,
    getSettings,
    updateSettings,
  };
}
