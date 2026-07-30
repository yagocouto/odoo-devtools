/**
 * content/inject.js
 * ------------------------------------------------------------
 * Executado no MAIN WORLD da página (mesmo contexto JS do Odoo).
 * Isso é necessário porque content scripts "isolated world" NÃO
 * enxergam variáveis globais da página (ex: window.odoo) nem
 * conseguem interceptar fetch/XHR feitos pelo próprio Odoo.
 *
 * Responsabilidade única:
 *  - Detectar se a página é um cliente web Odoo.
 *  - Hookar fetch/XHR para capturar chamadas RPC (somente leitura,
 *    NUNCA modifica request/response - apenas observa).
 *  - Expor informações de sessão/ambiente OWL via CustomEvent.
 *
 * Comunicação com o content script (isolated world) é feita via
 * CustomEvent + window.postMessage, pois este script NÃO tem acesso
 * a chrome.runtime.
 * ------------------------------------------------------------
 */

(function () {
  'use strict';

  if (window.__odtInjectInitialized) {
    return;
  }
  window.__odtInjectInitialized = true;

  const EVENT_RPC = 'odoo-devtools:rpc-captured';
  const EVENT_SESSION = 'odoo-devtools:session-info';
  const EVENT_READY = 'odoo-devtools:odoo-detected';
  const REQUEST_SESSION = 'odoo-devtools:request-session';
  const REQUEST_RECORD = 'odoo-devtools:request-record';
  const EVENT_RECORD = 'odoo-devtools:record-info';

  // Endpoints RPC relevantes do Odoo que devem ser capturados.
  const RPC_PATTERNS = [
    '/web/dataset/call_kw',
    '/jsonrpc',
    '/web/action/load',
    '/web/webclient',
    '/web/dataset/search_read',
    '/web/dataset/call_button',
  ];

  function isRpcUrl(url) {
    let normalizedUrl = '';
    if (typeof url === 'string') {
      normalizedUrl = url;
    } else if (url && typeof url.href === 'string') {
      normalizedUrl = url.href;
    } else {
      return false;
    }

    if (!normalizedUrl) return false;
    return RPC_PATTERNS.some((pattern) => normalizedUrl.includes(pattern));
  }

  function dispatch(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Tenta extrair model/method do payload JSON-RPC do Odoo.
   */
  function extractCallInfo(url, bodyText) {
    let model = null;
    let method = null;
    let args = null;
    let kwargs = null;

    try {
      const parsed = JSON.parse(bodyText);
      const params = parsed.params || parsed;
      if (params) {
        model = params.model || null;
        method = params.method || null;
        args = params.args || null;
        kwargs = params.kwargs || null;
      }
    } catch (e) {
      // Corpo não é JSON válido (ou vazio) - tenta extrair pela URL.
    }

    if (!model || !method) {
      const parts = url.split('/').filter(Boolean);
      const idx = parts.indexOf('call_kw');
      if (idx !== -1 && parts.length > idx + 2) {
        model = model || parts[idx + 1];
        method = method || parts[idx + 2];
      }
    }

    return { model, method, args, kwargs };
  }

  /**
   * Classifica o tipo de erro RPC a partir da resposta JSON-RPC.
   */
  function extractError(responseJson) {
    if (!responseJson || !responseJson.error) return null;
    const err = responseJson.error;
    const data = err.data || {};
    return {
      code: err.code || null,
      message: err.message || null,
      exceptionType: data.name || data.exception_type || null,
      debug: data.debug || null, // traceback completo do Python
      arguments: data.arguments || null,
    };
  }

  /* -------------------------------------------------------- *
   * HOOK: fetch
   * -------------------------------------------------------- */
  const originalFetch = window.__odtOriginalFetch || window.fetch;
  window.__odtOriginalFetch = originalFetch;

  if (!window.__odtFetchPatched) {
    window.__odtFetchPatched = true;
    window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    const startTime = performance.now();

    // Não intercepta nada que não seja RPC do Odoo - apenas observa,
    // nunca altera o request original.
    let shouldCapture = false;
    try {
      shouldCapture = !!url && isRpcUrl(url);
    } catch (e) {
      shouldCapture = false;
    }

    if (!shouldCapture) {
      return originalFetch.apply(this, arguments);
    }

    let requestBodyText = '';
    try {
      if (init && init.body) {
        requestBodyText = typeof init.body === 'string' ? init.body : '';
      }
    } catch (e) {
      requestBodyText = '';
    }

    let response;
    let responseClone;
    let responseText = '';
    let responseJson = null;
    let networkError = null;

    try {
      response = await originalFetch.apply(this, arguments);
      responseClone = response.clone();
      responseText = await responseClone.text();
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        responseJson = null;
      }
    } catch (err) {
      networkError = err && err.message ? err.message : String(err);
    }

    const duration = performance.now() - startTime;
    const { model, method, args, kwargs } = extractCallInfo(url, requestBodyText);

    dispatch(EVENT_RPC, {
      url,
      model,
      method,
      args,
      kwargs,
      requestBody: requestBodyText,
      status: response ? response.status : null,
      ok: response ? response.ok : false,
      responseBody: responseText,
      error: networkError ? { message: networkError, exceptionType: 'NetworkError' } : extractError(responseJson),
      duration,
      timestamp: Date.now(),
      transport: 'fetch',
    });

    if (networkError) throw new Error(networkError);
    return response;
    };
  }

  /* -------------------------------------------------------- *
   * HOOK: XMLHttpRequest (fallback para chamadas legadas)
   * -------------------------------------------------------- */
  const OriginalXHR = window.__odtOriginalXHR || window.XMLHttpRequest;
  window.__odtOriginalXHR = OriginalXHR;

  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let url = '';
    let method = '';
    let startTime = 0;
    let requestBody = '';

    const originalOpen = xhr.open;
    xhr.open = function (m, u, ...rest) {
      method = m;
      url = u;
      return originalOpen.call(xhr, m, u, ...rest);
    };

    const originalSend = xhr.send;
    xhr.send = function (body) {
      startTime = performance.now();
      requestBody = typeof body === 'string' ? body : '';

      let shouldCapture = false;
      try {
        shouldCapture = isRpcUrl(url);
      } catch (e) {
        shouldCapture = false;
      }

      if (shouldCapture) {
        xhr.addEventListener('loadend', () => {
          const duration = performance.now() - startTime;
          let responseJson = null;
          try {
            responseJson = JSON.parse(xhr.responseText);
          } catch (e) {
            responseJson = null;
          }
          const info = extractCallInfo(url, requestBody);

          dispatch(EVENT_RPC, {
            url,
            model: info.model,
            method: info.method,
            args: info.args,
            kwargs: info.kwargs,
            requestBody,
            status: xhr.status,
            ok: xhr.status >= 200 && xhr.status < 300,
            responseBody: xhr.responseText,
            error: extractError(responseJson),
            duration,
            timestamp: Date.now(),
            transport: 'xhr',
          });
        });
      }
      return originalSend.call(xhr, body);
    };

    return xhr;
  }
  if (!window.__odtXHRPatched) {
    window.__odtXHRPatched = true;
    window.XMLHttpRequest = PatchedXHR;
  }

  /* -------------------------------------------------------- *
   * DETECÇÃO DO ODOO + INFORMAÇÕES DE SESSÃO
   * -------------------------------------------------------- */

  function normalizeCompanyName(companyInfo) {
    if (!companyInfo) return null;
    if (typeof companyInfo === 'string') return companyInfo;
    if (Array.isArray(companyInfo)) return companyInfo[1] || String(companyInfo[0] || '');
    if (typeof companyInfo === 'object') {
      return companyInfo.name || companyInfo.display_name || companyInfo.label || null;
    }
    return String(companyInfo);
  }

  function buildSessionInfo(data) {
    if (!data) return null;
    return {
      uid: data.uid || null,
      username: data.username || data.name || null,
      companyName: normalizeCompanyName(data.companyName || data.company_name || data.currentCompany || data.company || null),
      lang: data.lang || null,
      timezone: data.timezone || data.tz || null,
      db: data.db || null,
      serverVersion: data.serverVersion || data.server_version || null,
      isAdmin: !!data.isAdmin,
      debug: data.debug !== undefined ? data.debug : null,
    };
  }

  function getSessionInfo() {
    // odoo.session_info é populado pelo web client desde o Odoo 15+.
    const info = (window.odoo && window.odoo.session_info) || null;
    if (info) {
      return buildSessionInfo({
        uid: info.uid,
        username: info.username || info.name || null,
        companyName: info.company_name || (info.user_companies && info.user_companies.current_company) || null,
        lang: info.user_context ? info.user_context.lang : info.lang || null,
        timezone: info.user_context ? info.user_context.tz : info.tz || null,
        db: info.db,
        serverVersion: info.server_version || (window.odoo && window.odoo.info && window.odoo.info.server_version) || null,
        isAdmin: info.is_admin || false,
        debug: window.odoo && window.odoo.debug !== undefined ? window.odoo.debug : null,
      });
    }

    // Fallback para cenários em que session_info não está exposto,
    // mas o ambiente OWL já possui serviços internos carregados.
    try {
      const debugHook = window.odoo && window.odoo.__WOWL_DEBUG__;
      const env = debugHook && debugHook.root && debugHook.root.env;
      const services = env && env.services;
      const userService = services && services.user;
      const userContext = (userService && (userService.user_context || userService.context || userService.userContext)) || null;

      const currentCompany = (userService && (userService.currentCompany
        || (userService.companies && userService.companies.currentCompany)
        || (userService.user_companies && userService.user_companies.current_company))) || null;

      const fallback = buildSessionInfo({
        uid: userService && (userService.userId || userService.uid || userService.id),
        username: userService && (userService.name || userService.displayName || userService.login),
        companyName: currentCompany,
        lang: userContext && userContext.lang,
        timezone: userContext && (userContext.tz || userContext.timezone),
        db: (window.odoo && window.odoo.db) || null,
        serverVersion: (window.odoo && window.odoo.info && window.odoo.info.server_version) || null,
        isAdmin: !!(userService && (userService.isAdmin || userService.is_admin)),
        debug: window.odoo && window.odoo.debug !== undefined ? window.odoo.debug : null,
      });

      const hasAnyValue = fallback && (
        fallback.uid
        || fallback.username
        || fallback.companyName
        || fallback.lang
        || fallback.timezone
        || fallback.db
        || fallback.serverVersion
        || fallback.debug !== null
      );

      return hasAnyValue ? fallback : null;
    } catch (e) {
      return null;
    }
  }

  async function fetchSessionInfoFromEndpoint() {
    try {
      const response = await window.fetch('/web/session/get_session_info', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response || !response.ok) return null;

      const payload = await response.json();
      const info = payload && (payload.result || payload);
      if (!info) return null;

      return buildSessionInfo({
        uid: info.uid,
        username: info.username || info.name,
        companyName: info.company_name || (info.user_companies && info.user_companies.current_company),
        lang: info.user_context ? info.user_context.lang : info.lang,
        timezone: info.user_context ? info.user_context.tz : info.tz,
        db: info.db,
        serverVersion: info.server_version,
        isAdmin: info.is_admin,
        debug: window.odoo && window.odoo.debug !== undefined ? window.odoo.debug : null,
      });
    } catch (e) {
      return null;
    }
  }

  async function dispatchSessionInfo() {
    const session = getSessionInfo() || await fetchSessionInfoFromEndpoint();
    dispatch(EVENT_SESSION, session);
  }

  function detectOdoo() {
    if (window.odoo) {
      dispatch(EVENT_READY, { detected: true });
      dispatchSessionInfo();
      return true;
    }
    return false;
  }

  // Tenta detectar imediatamente e, se ainda não estiver pronto,
  // faz polling curto (o bundle do Odoo carrega de forma assíncrona).
  if (!detectOdoo()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (detectOdoo() || attempts > 40) {
        clearInterval(interval);
      }
    }, 250);
  }

  // Permite que o content script (isolated world) solicite a sessão
  // novamente sob demanda (ex: ao abrir o painel).
  window.addEventListener(REQUEST_SESSION, () => {
    dispatchSessionInfo();
  });

  /* -------------------------------------------------------- *
   * INFORMAÇÕES DO REGISTRO ATUAL (best-effort)
   * -------------------------------------------------------- *
   * A árvore de componentes OWL não expõe uma API pública estável
   * para "pegar o registro atual" - a implementação abaixo tenta
   * heurísticas comuns entre versões do Odoo 17-19 e degrada
   * graciosamente caso a estrutura interna tenha mudado.
   * -------------------------------------------------------- */

  function tryGetActiveController() {
    try {
      const debugHook = window.odoo && window.odoo.__WOWL_DEBUG__;
      if (debugHook && debugHook.root && debugHook.root.env) {
        const actionService = debugHook.root.env.services && debugHook.root.env.services.action;
        if (actionService && actionService.currentController) {
          return actionService.currentController;
        }
      }
    } catch (e) {
      // Estrutura interna não disponível nesta versão/página.
    }
    return null;
  }

  function toPositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function extractSelectedRecordId(root) {
    if (!root) return null;

    const direct = toPositiveInt(root.resId || root.recordId || root.activeId || root.id);
    if (direct) return direct;

    if (root.evalContext && toPositiveInt(root.evalContext.active_id)) return toPositiveInt(root.evalContext.active_id);
    if (root.context && toPositiveInt(root.context.active_id)) return toPositiveInt(root.context.active_id);

    const selectionList = Array.isArray(root.selection)
      ? root.selection
      : (root.selection && typeof root.selection.values === 'function' ? Array.from(root.selection.values()) : []);
    if (selectionList.length) {
      const candidate = selectionList[0];
      const selectionId = toPositiveInt(candidate && (candidate.resId || candidate.id || candidate.recordId || candidate));
      if (selectionId) return selectionId;
    }

    if (Array.isArray(root.records) && root.records.length) {
      const selected = root.records.find((r) => r && (r.selected || r.isSelected));
      if (selected) {
        const selectedId = toPositiveInt(selected.resId || selected.id || selected.recordId);
        if (selectedId) return selectedId;
      }
    }

    return null;
  }

  window.addEventListener(REQUEST_RECORD, () => {
    let payload = null;
    try {
      const controller = tryGetActiveController();
      const model = controller && controller.props && (controller.props.resModel || controller.props.model);
      const component = controller && controller.component;
      // Heurística: procura um "model" OWL (relational model) com resId ativo.
      const rmModel = (component && component.model)
        || (controller && controller.model)
        || null;
      const root = rmModel && (rmModel.root || rmModel);

      const resolvedModel = model
        || (root && root.resModel)
        || (rmModel && rmModel.resModel)
        || (rmModel && rmModel.config && rmModel.config.resModel)
        || (controller && controller.action && controller.action.res_model)
        || (component && component.props && component.props.resModel)
        || null;
      const resolvedId = extractSelectedRecordId(root)
        || (rmModel && rmModel.config && toPositiveInt(rmModel.config.resId))
        || (component && component.props && toPositiveInt(component.props.resId || component.props.recordId || component.props.activeId))
        || (controller && controller.props && toPositiveInt(controller.props.resId || controller.props.recordId || controller.props.activeId))
        || (controller && controller.props && controller.props.context && toPositiveInt(controller.props.context.active_id))
        || (controller && controller.action && toPositiveInt(controller.action.res_id))
        || (controller && controller.action && controller.action.context && toPositiveInt(controller.action.context.active_id))
        || null;

      if (resolvedModel || resolvedId) {
        payload = {
          model: resolvedModel,
          id: resolvedId,
          displayName: root && root.data && (root.data.display_name || root.data.name) || null,
          context: (rmModel && rmModel.config && rmModel.config.context)
            || (controller && controller.props && controller.props.context)
            || null,
        };
      }
    } catch (e) {
      payload = null;
    }
    dispatch(EVENT_RECORD, payload);
  });
})();
