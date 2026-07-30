/**
 * modules/views.js
 * ------------------------------------------------------------
 * Implementa o item 3 do escopo: Inspecionar View.
 * Usa apenas métodos RPC somente-leitura (get_views, get_metadata,
 * search_read) para reconstruir view id, xml id, tipo, modelo,
 * cadeia de herança e prioridade.
 * Responsabilidade única: coleta de metadados de views.
 * ------------------------------------------------------------
 */

const OdooDevtoolsViews = (() => {
  /**
   * Busca a view de formulário ativa para o modelo informado,
   * junto da cadeia de herança (views que compartilham o mesmo model).
   * @param {string} model
   * @param {'form'|'list'|'kanban'|'search'} viewType
   */
  async function inspectView(model, viewType = 'form') {
    if (!model) throw new Error('Modelo não identificado.');

    const viewsResult = await odooDevtoolsCallKw(model, 'get_views', [[[false, viewType]]], { options: {} });
    const viewData = viewsResult && viewsResult.views && viewsResult.views[viewType];
    if (!viewData) throw new Error(`View do tipo "${viewType}" não encontrada para ${model}.`);

    const viewId = viewData.id;

    // Metadados (XML ID, módulo de origem) - somente leitura.
    let metadata = null;
    if (viewId) {
      try {
        const metaResult = await odooDevtoolsCallKw('ir.ui.view', 'get_metadata', [[viewId]]);
        metadata = metaResult && metaResult[0];
      } catch (e) {
        metadata = null;
      }
    }

    // Cadeia de views relacionadas ao mesmo modelo (candidatas a herança).
    let related = [];
    try {
      related = await odooDevtoolsCallKw(
        'ir.ui.view',
        'search_read',
        [[['model', '=', model], ['type', '=', viewType]]],
        { fields: ['name', 'inherit_id', 'priority', 'type', 'active'] }
      );
    } catch (e) {
      related = [];
    }

    return {
      viewId,
      xmlId: metadata && metadata.xmlid ? metadata.xmlid : null,
      module: metadata && metadata.xmlid ? metadata.xmlid.split('.')[0] : null,
      type: viewType,
      model,
      arch: viewData.arch || null,
      relatedViews: related.map((v) => ({
        id: v.id,
        name: v.name,
        inheritId: v.inherit_id ? v.inherit_id[0] : null,
        inheritName: v.inherit_id ? v.inherit_id[1] : null,
        priority: v.priority,
        active: v.active,
      })),
    };
  }

  return { inspectView };
})();
