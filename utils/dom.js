/**
 * utils/dom.js
 * ------------------------------------------------------------
 * Helpers de manipulação de DOM usados pelo content script.
 * Responsabilidade única: criar/manipular elementos e calcular XPath.
 * ------------------------------------------------------------
 */

/**
 * Cria um elemento HTML com atributos e filhos de forma declarativa.
 * @param {string} tag
 * @param {Object} attrs
 * @param {Array<HTMLElement|string>} children
 * @returns {HTMLElement}
 */
function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([dKey, dVal]) => {
        el.dataset[dKey] = dVal;
      });
    } else {
      el.setAttribute(key, value);
    }
  });
  children.forEach((child) => {
    if (child == null) return;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return el;
}

/**
 * Calcula o XPath absoluto de um elemento DOM.
 * @param {HTMLElement} el
 * @returns {string}
 */
function getElementXPath(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return `//*[@id="${el.id}"]`;

  const parts = [];
  let current = el;
  while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    const tagName = current.tagName.toLowerCase();
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }
  return `/html/${parts.join('/')}`;
}

/**
 * Tenta localizar o "field" Odoo (elemento com name/data-name) mais próximo
 * a partir de um elemento clicado, subindo na árvore DOM.
 * @param {HTMLElement} el
 * @returns {HTMLElement|null}
 */
function findClosestOdooField(el) {
  return el.closest('[name], .o_field_widget, [data-tooltip]');
}

/**
 * Retorna o retângulo (posição/tamanho) de um elemento, útil para
 * desenhar o overlay de destaque.
 * @param {HTMLElement} el
 * @returns {DOMRect}
 */
function getElementRect(el) {
  return el.getBoundingClientRect();
}

/**
 * Adiciona/remove uma classe CSS de destaque em um elemento.
 * @param {HTMLElement} el
 * @param {boolean} enabled
 */
function toggleHighlight(el, enabled) {
  el.classList.toggle('odoo-devtools-highlight', enabled);
}

/**
 * Remove todos os destaques de campo aplicados na página.
 */
function clearAllHighlights() {
  document.querySelectorAll('.odoo-devtools-highlight').forEach((el) => {
    el.classList.remove('odoo-devtools-highlight');
  });
}

/**
 * Cria (ou retorna, se já existir) o container raiz do painel flutuante,
 * anexado diretamente ao <body> para não interferir no layout do Odoo.
 * @returns {HTMLElement}
 */
function getOrCreatePanelRoot() {
  let root = document.getElementById('odoo-devtools-root');
  if (!root) {
    root = createEl('div', { id: 'odoo-devtools-root' });
    document.body.appendChild(root);
  }
  return root;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createEl,
    getElementXPath,
    findClosestOdooField,
    getElementRect,
    toggleHighlight,
    clearAllHighlights,
    getOrCreatePanelRoot,
  };
}
