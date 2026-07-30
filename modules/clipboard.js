/**
 * modules/clipboard.js
 * ------------------------------------------------------------
 * Implementa o item 14 do escopo: Copiadores rápidos.
 * Funções finas e específicas (responsabilidade única cada uma)
 * para copiar valores comuns exibidos em outros painéis, sempre
 * com feedback via toast.
 * ------------------------------------------------------------
 */

const OdooDevtoolsClipboard = (() => {
  async function copyValue(value, label) {
    const text = value == null ? '' : (typeof value === 'string' ? value : safeStringify(value));
    if (!text) {
      notifyError(`${label} não disponível`);
      return;
    }
    const ok = await copyToClipboard(text);
    if (ok) notifyCopied(label);
    else notifyError(`Falha ao copiar ${label}`);
  }

  const copyUrl = () => copyValue(window.location.href, 'URL');
  const copyXmlId = (xmlId) => copyValue(xmlId, 'XML ID');
  const copyViewId = (viewId) => copyValue(viewId, 'View ID');
  const copyRecordId = (id) => copyValue(id, 'Record ID');
  const copyModel = (model) => copyValue(model, 'Model');
  const copyDatabase = (db) => copyValue(db, 'Database');
  const copyContext = (context) => copyValue(context, 'Contexto');
  const copyDomain = (domain) => copyValue(domain, 'Domínio');

  return {
    copyUrl,
    copyXmlId,
    copyViewId,
    copyRecordId,
    copyModel,
    copyDatabase,
    copyContext,
    copyDomain,
  };
})();
