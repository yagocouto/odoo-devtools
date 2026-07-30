/**
 * popup/popup.js
 * ------------------------------------------------------------
 * Lógica do popup: envia comandos para o content script da aba ativa
 * (abrir painel, aplicar modo debug) e consulta o histórico RPC
 * salvo no background para exibir um contador rápido.
 * ------------------------------------------------------------
 */

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    return null;
  }
}

function updateDebugButtons(currentMode) {
  const btnDebugOn = document.getElementById('btn-debug-on');
  const btnDebugAssets = document.getElementById('btn-debug-assets');
  const btnDebugOff = document.getElementById('btn-debug-off');

  btnDebugOn.style.display = currentMode !== '1' ? '' : 'none';
  btnDebugAssets.style.display = currentMode !== 'assets' ? '' : 'none';
  btnDebugOff.style.display = currentMode ? '' : 'none';
}

async function init() {
  const statusEl = document.getElementById('odt-status');
  const tab = await getActiveTab();

  updateDebugButtons(null);

  if (!tab || !/^https?:/.test(tab.url || '')) {
    statusEl.textContent = 'Abra uma instância Odoo para usar a extensão.';
  } else {
    const response = await sendToActiveTab({ type: 'GET_DEBUG_MODE' });
    if (response) {
      statusEl.textContent = `Modo debug: ${response.mode || 'desativado'}`;
      updateDebugButtons(response.mode || null);
    } else {
      statusEl.textContent = 'Odoo não detectado nesta aba (ou página ainda carregando).';
      updateDebugButtons(null);
    }
  }

  chrome.runtime.sendMessage({ type: 'RPC_HISTORY_GET' }, (res) => {
    const count = res && res.history ? res.history.length : 0;
    document.getElementById('odt-history-count').textContent = `${count} requests salvos`;
  });

  document.getElementById('btn-open-panel').addEventListener('click', () => {
    sendToActiveTab({ type: 'TOGGLE_PANEL' });
    window.close();
  });

  document.getElementById('btn-debug-on').addEventListener('click', () => {
    sendToActiveTab({ type: 'APPLY_DEBUG', mode: '1' });
    window.close();
  });

  document.getElementById('btn-debug-assets').addEventListener('click', () => {
    sendToActiveTab({ type: 'APPLY_DEBUG', mode: 'assets' });
    window.close();
  });

  document.getElementById('btn-debug-off').addEventListener('click', () => {
    sendToActiveTab({ type: 'APPLY_DEBUG', mode: null });
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
