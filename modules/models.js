/**
 * modules/models.js
 * ------------------------------------------------------------
 * Implementa o item 4 do escopo: "Registro Atual".
 * Combina dados do ambiente OWL (via inject.js) com chamadas RPC
 * somente-leitura (read, get_metadata, search_read em ir.rule)
 * para montar um resumo completo do registro em tela.
 * Responsabilidade única: coleta de dados do registro ativo.
 * ------------------------------------------------------------
 */

const OdooDevtoolsModels = (() => {
  function getRecordFromLocationHash() {
    try {
      const hash = window.location && window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      const search = window.location && window.location.search ? window.location.search.replace(/^\?/, '') : '';
      const mergedParams = [hash, search].filter(Boolean).join('&');
      if (!mergedParams) return null;

      const params = new URLSearchParams(mergedParams);
      const model = params.get('model') || null;
      const rawId = params.get('id') || params.get('res_id') || params.get('active_id') || null;
      const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

      if (!model && !id) return null;
      return { model, id, displayName: null, context: null };
    } catch (e) {
      return null;
    }
  }

  /**
   * Solicita ao inject.js (MAIN world) as informações do registro ativo
   * e aguarda a resposta via CustomEvent (com timeout de segurança).
   * @returns {Promise<{model: string, id: number, displayName: string, context: Object}|null>}
   */
  function requestActiveRecord() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('odoo-devtools:record-info', handler);
        resolve(null);
      }, 1500);

      function handler(ev) {
        clearTimeout(timeout);
        window.removeEventListener('odoo-devtools:record-info', handler);
        resolve(ev.detail);
      }

      window.addEventListener('odoo-devtools:record-info', handler);
      window.dispatchEvent(new CustomEvent('odoo-devtools:request-record'));
    });
  }

  /**
   * Busca as regras de registro (ir.rule) aplicáveis ao modelo.
   * Somente leitura - apenas lista as regras existentes.
   * @param {string} model
   */
  async function getRecordRules(model) {
    try {
      return await odooDevtoolsCallKw(
        'ir.rule',
        'search_read',
        [[['model_id.model', '=', model]]],
        { fields: ['name', 'domain_force', 'groups', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink'] }
      );
    } catch (e) {
      return [];
    }
  }

  /**
   * Monta o resumo completo do registro atual em tela.
   * @returns {Promise<Object|null>}
   */
  async function getFullRecordInfo() {
    const activeFromEvent = await requestActiveRecord();
    const activeFromHash = getRecordFromLocationHash();
    const active = {
      model: (activeFromEvent && activeFromEvent.model) || (activeFromHash && activeFromHash.model) || null,
      id: (activeFromEvent && activeFromEvent.id) || (activeFromHash && activeFromHash.id) || null,
      displayName: (activeFromEvent && activeFromEvent.displayName) || null,
      context: (activeFromEvent && activeFromEvent.context) || null,
    };

    if (!active || !active.model || !active.id) return null;

    const { model, id, context } = active;

    let metadata = null;
    try {
      const result = await odooDevtoolsCallKw(model, 'get_metadata', [[id]]);
      metadata = result && result[0];
    } catch (e) {
      metadata = null;
    }

    let record = null;
    try {
      const fields = ['display_name'];
      const result = await odooDevtoolsCallKw(model, 'read', [[id], fields]);
      record = result && result[0];
    } catch (e) {
      record = null;
    }

    const rules = await getRecordRules(model);

    return {
      model,
      id,
      displayName: (record && record.display_name) || active.displayName || null,
      xmlId: metadata ? metadata.xmlid : null,
      createUid: metadata ? metadata.create_uid : null,
      createDate: metadata ? metadata.create_date : null,
      writeUid: metadata ? metadata.write_uid : null,
      writeDate: metadata ? metadata.write_date : null,
      noupdate: metadata ? metadata.noupdate : null,
      context: context || null,
      recordRules: rules,
    };
  }

  return { requestActiveRecord, getRecordRules, getFullRecordInfo };
})();
