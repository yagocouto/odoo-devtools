/**
 * modules/performance.js
 * ------------------------------------------------------------
 * Implementa o item 8 do escopo: painel de Performance.
 * Usa a Navigation Timing API do próprio navegador (somente leitura,
 * nenhuma instrumentação é injetada no Odoo) e as entradas já
 * capturadas pelo modules/network.js.
 * Responsabilidade única: cálculo de métricas de performance.
 * ------------------------------------------------------------
 */

const OdooDevtoolsPerformance = (() => {
  /**
   * Tempo de carregamento da página atual (Navigation Timing Level 2).
   * @returns {number|null} milissegundos
   */
  function getPageLoadTime() {
    const [nav] = performance.getEntriesByType('navigation');
    if (nav) return nav.loadEventEnd - nav.startTime;

    // Fallback para API legada (Navigation Timing Level 1).
    const t = performance.timing;
    if (t && t.loadEventEnd && t.navigationStart) {
      return t.loadEventEnd - t.navigationStart;
    }
    return null;
  }

  /**
   * Calcula estatísticas agregadas das chamadas RPC capturadas na sessão.
   * @returns {Object}
   */
  function getRpcStats() {
    const entries = OdooDevtoolsNetwork.getEntries();
    if (!entries.length) {
      return {
        totalRequests: 0,
        totalRpcTime: 0,
        averageTime: 0,
        maxRequest: null,
        minRequest: null,
      };
    }

    const durations = entries.map((e) => e.duration || 0);
    const totalRpcTime = durations.reduce((sum, d) => sum + d, 0);
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    return {
      totalRequests: entries.length,
      totalRpcTime,
      averageTime: totalRpcTime / entries.length,
      maxRequest: entries.find((e) => e.duration === maxDuration) || null,
      minRequest: entries.find((e) => e.duration === minDuration) || null,
    };
  }

  /**
   * Retorna o resumo completo exibido no painel de Performance.
   */
  function getSummary() {
    const rpcStats = getRpcStats();
    return {
      pageLoadTime: getPageLoadTime(),
      ...rpcStats,
    };
  }

  return { getPageLoadTime, getRpcStats, getSummary };
})();
