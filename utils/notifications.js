/**
 * utils/notifications.js
 * ------------------------------------------------------------
 * Exibe pequenas notificações "toast" dentro do próprio painel
 * flutuante da extensão (não usa a API chrome.notifications para
 * não gerar notificações nativas invasivas do sistema operacional).
 * Responsabilidade única: feedback visual rápido para o usuário.
 * ------------------------------------------------------------
 */

const TOAST_CONTAINER_ID = 'odoo-devtools-toast-container';
const TOAST_DURATION_MS = 2500;

/**
 * Garante que o container de toasts exista dentro do painel raiz.
 * @returns {HTMLElement}
 */
function getToastContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    const root = getOrCreatePanelRoot();
    container = createEl('div', { id: TOAST_CONTAINER_ID, class: 'odt-toast-container' });
    root.appendChild(container);
  }
  return container;
}

/**
 * Exibe uma notificação toast temporária.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'success') {
  const container = getToastContainer();
  const toast = createEl(
    'div',
    { class: `odt-toast odt-toast--${type}` },
    [message]
  );
  container.appendChild(toast);

  // Força reflow para permitir a transição de entrada via CSS.
  requestAnimationFrame(() => toast.classList.add('odt-toast--visible'));

  setTimeout(() => {
    toast.classList.remove('odt-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION_MS);
}

/**
 * Atalho para notificar sucesso de cópia para a área de transferência.
 * @param {string} label - nome do que foi copiado (ex: "Nome técnico")
 */
function notifyCopied(label = 'Conteúdo') {
  showToast(`${label} copiado para a área de transferência`, 'success');
}

/**
 * Atalho para notificar erro genérico.
 * @param {string} message
 */
function notifyError(message = 'Ocorreu um erro') {
  showToast(message, 'error');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { showToast, notifyCopied, notifyError };
}
