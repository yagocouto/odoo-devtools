/**
 * modules/fields.js
 * ------------------------------------------------------------
 * Implementa o item 2 do escopo: manter ALT pressionado destaca
 * todos os campos da tela; clicar em um campo abre um popup com
 * seus metadados técnicos e botões de cópia rápida.
 * Responsabilidade única: inspeção de campos (somente leitura).
 * ------------------------------------------------------------
 */

const OdooDevtoolsFields = (() => {
  let altPressed = false;
  let currentModel = null; // preenchido via evento de record info (inject.js)
  let popupEl = null;

  /**
   * Escuta o evento disparado pelo inject.js com o registro/modelo ativo,
   * para sabermos em qual "model" buscar os metadados dos campos.
   */
  function trackActiveModel() {
    window.addEventListener('odoo-devtools:record-info', (ev) => {
      if (ev.detail && ev.detail.model) currentModel = ev.detail.model;
    });
    // Solicita a informação assim que o módulo inicializa.
    window.dispatchEvent(new CustomEvent('odoo-devtools:request-record'));
  }

  function onKeyDown(ev) {
    if (ev.key === 'Alt' && !altPressed) {
      altPressed = true;
      document.body.classList.add('odt-alt-mode');
    }
  }

  function onKeyUp(ev) {
    if (ev.key === 'Alt') {
      altPressed = false;
      document.body.classList.remove('odt-alt-mode');
      clearAllHighlights();
    }
  }

  function onMouseOver(ev) {
    if (!altPressed) return;
    const field = findClosestOdooField(ev.target);
    if (field) toggleHighlight(field, true);
  }

  function onMouseOut(ev) {
    if (!altPressed) return;
    const field = findClosestOdooField(ev.target);
    if (field) toggleHighlight(field, false);
  }

  async function onClick(ev) {
    if (!altPressed) return;
    const field = findClosestOdooField(ev.target);
    if (!field) return;

    ev.preventDefault();
    ev.stopPropagation();

    await openFieldPopup(field, ev.clientX, ev.clientY);
  }

  /**
   * Extrai o nome técnico do campo a partir dos atributos DOM do Odoo.
   * @param {HTMLElement} el
   * @returns {string|null}
   */
  function getTechnicalName(el) {
    return el.getAttribute('name') || el.dataset.fieldName || null;
  }

  /**
   * Busca metadados completos do campo via fields_get (somente leitura).
   * @param {string} model
   * @param {string} fieldName
   */
  async function fetchFieldMetadata(model, fieldName) {
    const attributes = [
      'string', 'type', 'relation', 'inverse_fields_name', 'compute',
      'store', 'readonly', 'required', 'tracking', 'company_dependent',
      'groups', 'domain', 'context', 'help', 'selection', 'depends',
    ];
    const result = await odooDevtoolsCallKw(model, 'fields_get', [[fieldName]], { attributes });
    return result ? result[fieldName] : null;
  }

  /**
   * Busca o XML do campo dentro do arch da view (best-effort: extrai
   * o trecho correspondente via regex a partir do arch retornado por get_views).
   */
  async function fetchFieldXml(model, fieldName) {
    try {
      const result = await odooDevtoolsCallKw(model, 'get_views', [[[false, 'form']]], { options: {} });
      const arch = result && result.views && result.views.form && result.views.form.arch;
      if (!arch) return null;

      const regex = new RegExp(`<field[^>]*name=["']${fieldName}["'][^>]*/?>`, 'i');
      const match = arch.match(regex);
      return match ? match[0] : null;
    } catch (e) {
      return null;
    }
  }

  function closePopup() {
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  }

  /**
   * Monta e exibe o popup de inspeção do campo próximo ao ponto clicado.
   */
  async function openFieldPopup(fieldEl, x, y) {
    closePopup();

    const fieldName = getTechnicalName(fieldEl);
    const model = currentModel;
    const xpath = getElementXPath(fieldEl);

    const body = createEl('div', { class: 'odt-popup-body' }, ['Carregando metadados…']);
    popupEl = createEl('div', {
      class: 'odt-field-popup',
      style: { left: `${x + 8}px`, top: `${y + 8}px` },
    }, [
      createEl('div', { class: 'odt-popup-header' }, [
        createEl('span', {}, [fieldName || '(campo sem nome técnico)']),
        createEl('button', { class: 'odt-popup-close', onClick: closePopup }, ['×']),
      ]),
      body,
    ]);
    getOrCreatePanelRoot().appendChild(popupEl);

    if (!fieldName || !model) {
      body.innerHTML = '';
      body.appendChild(createEl('div', { class: 'odt-popup-warning' }, [
        !model
          ? 'Não foi possível identificar o modelo ativo automaticamente.'
          : 'Campo sem atributo "name" reconhecível.',
      ]));
      return;
    }

    let meta = null;
    try {
      meta = await fetchFieldMetadata(model, fieldName);
    } catch (e) {
      body.innerHTML = '';
      body.appendChild(createEl('div', { class: 'odt-popup-warning' }, [`Erro ao buscar metadados: ${e.message}`]));
      return;
    }

    body.innerHTML = '';
    if (!meta) {
      body.appendChild(createEl('div', { class: 'odt-popup-warning' }, ['Metadados não encontrados.']));
      return;
    }

    const rows = [
      ['Nome técnico', fieldName],
      ['Modelo', model],
      ['Tipo', meta.type],
      ['Widget', fieldEl.dataset.widget || '-'],
      ['Campo relacionado', meta.relation || '-'],
      ['Campo computado', meta.compute ? 'Sim' : 'Não'],
      ['Readonly', meta.readonly ? 'Sim' : 'Não'],
      ['Required', meta.required ? 'Sim' : 'Não'],
      ['Store', meta.store ? 'Sim' : 'Não'],
      ['Domínio', meta.domain ? safeStringify(meta.domain) : '-'],
      ['Contexto', meta.context ? safeStringify(meta.context) : '-'],
    ];

    rows.forEach(([label, value]) => {
      body.appendChild(createEl('div', { class: 'odt-popup-row' }, [
        createEl('span', { class: 'odt-popup-label' }, [label]),
        createEl('span', { class: 'odt-popup-value' }, [truncate(String(value ?? '-'), 60)]),
      ]));
    });

    const actions = createEl('div', { class: 'odt-popup-actions' }, [
      createEl('button', {
        onClick: async () => {
          await copyToClipboard(fieldName);
          notifyCopied('Nome técnico');
        },
      }, ['Copiar Nome Técnico']),
      createEl('button', {
        onClick: async () => {
          await copyToClipboard(model);
          notifyCopied('Modelo');
        },
      }, ['Copiar Modelo']),
      createEl('button', {
        onClick: async () => {
          const xml = await fetchFieldXml(model, fieldName);
          await copyToClipboard(xml || '<!-- XML não encontrado -->');
          notifyCopied('XML do campo');
        },
      }, ['Copiar XML completo']),
      createEl('button', {
        onClick: async () => {
          await copyToClipboard(xpath);
          notifyCopied('XPath');
        },
      }, ['Copiar XPath']),
      createEl('button', {
        onClick: async () => {
          await copyToClipboard(safeStringify({ fieldName, model, ...meta }));
          notifyCopied('JSON do campo');
        },
      }, ['Copiar JSON']),
    ]);
    body.appendChild(actions);
  }

  function init() {
    trackActiveModel();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('click', (ev) => {
      if (popupEl && !popupEl.contains(ev.target)) closePopup();
    });
  }

  return { init, getTechnicalName, fetchFieldMetadata, fetchFieldXml };
})();
