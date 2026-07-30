/**
 * modules/favorites.js
 * ------------------------------------------------------------
 * Implementa o item 10 do escopo: Favoritos.
 * Camada fina sobre utils/storage.js, adicionando a lógica de
 * "capturar o contexto atual da página" para montar o item favorito.
 * Responsabilidade única: favoritar/desfavoritar views, modelos,
 * menus e registros a partir do contexto atual.
 * ------------------------------------------------------------
 */

const OdooDevtoolsFavorites = (() => {
  /**
   * Favorita o registro atualmente aberto em tela.
   */
  async function favoriteCurrentRecord() {
    const info = await OdooDevtoolsModels.requestActiveRecord();
    if (!info || !info.model || !info.id) {
      throw new Error('Nenhum registro ativo identificado.');
    }
    await addFavorite('records', {
      id: `${info.model}-${info.id}`,
      model: info.model,
      recordId: info.id,
      displayName: info.displayName || `${info.model} #${info.id}`,
      url: window.location.href,
      savedAt: Date.now(),
    });
  }

  /**
   * Favorita a view atualmente inspecionada.
   * @param {Object} viewInfo - retorno de OdooDevtoolsViews.inspectView
   */
  async function favoriteView(viewInfo) {
    if (!viewInfo || !viewInfo.viewId) throw new Error('View inválida.');
    await addFavorite('views', {
      id: viewInfo.viewId,
      xmlId: viewInfo.xmlId,
      model: viewInfo.model,
      type: viewInfo.type,
      url: window.location.href,
      savedAt: Date.now(),
    });
  }

  /**
   * Favorita um modelo técnico (ex: durante inspeção de campo/registro).
   * @param {string} model
   */
  async function favoriteModel(model) {
    if (!model) throw new Error('Modelo inválido.');
    await addFavorite('models', {
      id: model,
      model,
      savedAt: Date.now(),
    });
  }

  /**
   * Favorita o menu atualmente ativo (obtido via URL/hash do Odoo).
   */
  async function favoriteCurrentMenu() {
    const url = new URL(window.location.href);
    const menuId = url.searchParams.get('menu_id') || url.hash.match(/menu_id=(\d+)/)?.[1];
    if (!menuId) throw new Error('Nenhum menu ativo identificado na URL.');

    await addFavorite('menus', {
      id: menuId,
      menuId,
      url: window.location.href,
      savedAt: Date.now(),
    });
  }

  async function list() {
    return getFavorites();
  }

  async function remove(category, id) {
    return removeFavorite(category, id);
  }

  return {
    favoriteCurrentRecord,
    favoriteView,
    favoriteModel,
    favoriteCurrentMenu,
    list,
    remove,
  };
})();
