/**
 * background/service_worker.js
 * ------------------------------------------------------------
 * Service worker (Manifest V3). Responsabilidades:
 *  1. Persistir o histórico RPC recebido do content script.
 *  2. Repassar atalhos de teclado (chrome.commands) para a aba ativa.
 *  3. Garantir configurações padrão na instalação.
 *
 * Não executa nenhuma lógica de negócio do Odoo em si - apenas
 * coordenação entre popup, content script e storage.
 * ------------------------------------------------------------
 */

importScripts('../utils/storage.js');

chrome.runtime.onInstalled.addListener(async () => {
  // Garante que as configurações padrão existam desde a primeira instalação.
  await getSettings();
});

/* -------------------------------------------------------- *
 * MENSAGENS vindas do content script / popup
 * -------------------------------------------------------- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RPC_HISTORY_ADD' && message.entry) {
    addRpcHistoryEntry(message.entry)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error && error.message ? error.message : 'Erro ao salvar histórico RPC' }));
    return true; // resposta assíncrona
  }

  if (message.type === 'RPC_HISTORY_GET') {
    getRpcHistory().then((history) => sendResponse({ history }));
    return true;
  }

  if (message.type === 'RPC_HISTORY_CLEAR') {
    clearRpcHistory().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

/* -------------------------------------------------------- *
 * ATALHOS DE TECLADO (item 16)
 * -------------------------------------------------------- */
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) return;

  chrome.tabs.sendMessage(activeTab.id, { type: 'COMMAND', command }).catch(() => {
    // Aba sem content script ativo (ex: chrome://) - ignora silenciosamente.
  });
});
