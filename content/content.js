/**
 * content/content.js
 * ------------------------------------------------------------
 * Executado no ISOLATED WORLD (contexto padrão de content scripts).
 * Responsabilidade: montar a UI do painel flutuante (item 15),
 * orquestrar os módulos (debug, fields, views, models, network,
 * performance, favorites, clipboard) e reagir a atalhos/mensagens
 * vindas do background e do popup.
 *
 * Este arquivo NÃO implementa regras de negócio - apenas conecta
 * a UI aos módulos que já as implementam.
 * ------------------------------------------------------------
 */

(function () {
  'use strict';

  // Só ativa a extensão se a página realmente for um cliente Odoo.
  let odooDetected = false;
  let sessionInfo = null;

  let panelRoot = null;
  let activeTab = 'debug';
  let panelVisible = false;

  const TABS = [
    { id: 'debug', label: 'Debug' },
    { id: 'view', label: 'View' },
    { id: 'record', label: 'Registro' },
    { id: 'network', label: 'Network' },
    { id: 'performance', label: 'Performance' },
    { id: 'favorites', label: 'Favoritos' },
    { id: 'tools', label: 'Ferramentas' },
    { id: 'settings', label: 'Config' },
  ];

  /* -------------------------------------------------------- *
   * BOOTSTRAP
   * -------------------------------------------------------- */

  window.addEventListener('odoo-devtools:odoo-detected', () => {
    odooDetected = true;
    mountLauncher();
  });

  window.addEventListener('odoo-devtools:session-info', (ev) => {
    sessionInfo = ev.detail;
  });

  OdooDevtoolsNetwork.init();
  OdooDevtoolsFields.init();
  OdooDevtoolsNetwork.onNewEntry(() => {
    if (panelVisible && activeTab === 'network') renderActiveTab();
  });

  /* -------------------------------------------------------- *
   * LAUNCHER (botão flutuante fixo para abrir/fechar o painel)
   * -------------------------------------------------------- */

  function mountLauncher() {
    if (document.getElementById('odt-launcher')) return;
    const launcher = createEl(
      'button',
      { id: 'odt-launcher', title: 'Odoo DevTools', onClick: togglePanel },
      ['⚙']
    );
    getOrCreatePanelRoot().appendChild(launcher);
    applyStoredTheme();
  }

  async function applyStoredTheme() {
    const settings = await getSettings();
    document.documentElement.setAttribute('data-odt-theme', settings.theme || 'dark');
  }

  function togglePanel() {
    panelVisible ? closePanel() : openPanel();
  }

  function openPanel() {
    panelVisible = true;
    buildPanel();
  }

  function closePanel() {
    panelVisible = false;
    if (panelRoot) {
      panelRoot.remove();
      panelRoot = null;
    }
  }

  /* -------------------------------------------------------- *
   * ESTRUTURA DO PAINEL (draggable + resizable + collapsible)
   * -------------------------------------------------------- */

  function buildPanel() {
    if (panelRoot) panelRoot.remove();

    const tabBar = createEl(
      'div',
      { class: 'odt-tabbar' },
      TABS.map((tab) =>
        createEl(
          'button',
          {
            class: `odt-tab ${tab.id === activeTab ? 'odt-tab--active' : ''}`,
            onClick: () => {
              activeTab = tab.id;
              renderActiveTab();
              refreshTabButtons();
            },
            dataset: { tabId: tab.id },
          },
          [tab.label]
        )
      )
    );

    const body = createEl('div', { class: 'odt-panel-body' });

    panelRoot = createEl('div', { class: 'odt-panel', id: 'odt-panel' }, [
      createEl('div', { class: 'odt-panel-header', id: 'odt-panel-drag-handle' }, [
        createEl('span', {}, ['Odoo 19 DevTools']),
        createEl('div', { class: 'odt-panel-header-actions' }, [
          createEl('button', { title: 'Alternar tema', onClick: toggleTheme }, ['◐']),
          createEl('button', { title: 'Fechar', onClick: closePanel }, ['×']),
        ]),
      ]),
      tabBar,
      body,
      createEl('div', { class: 'odt-resize-handle' }),
    ]);

    getOrCreatePanelRoot().appendChild(panelRoot);
    makeDraggable(panelRoot, panelRoot.querySelector('#odt-panel-drag-handle'));
    makeResizable(panelRoot, panelRoot.querySelector('.odt-resize-handle'));
    renderActiveTab();
  }

  function refreshTabButtons() {
    panelRoot.querySelectorAll('.odt-tab').forEach((btn) => {
      btn.classList.toggle('odt-tab--active', btn.dataset.tabId === activeTab);
    });
  }

  async function toggleTheme() {
    const settings = await getSettings();
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    await updateSettings({ theme: next });
    document.documentElement.setAttribute('data-odt-theme', next);
  }

  function getBody() {
    return panelRoot.querySelector('.odt-panel-body');
  }

  function renderActiveTab() {
    const body = getBody();
    if (!body) return;
    body.innerHTML = '';

    const renderers = {
      debug: renderDebugTab,
      view: renderViewTab,
      record: renderRecordTab,
      network: renderNetworkTab,
      performance: renderPerformanceTab,
      favorites: renderFavoritesTab,
      tools: renderToolsTab,
      settings: renderSettingsTab,
    };
    (renderers[activeTab] || (() => {}))(body);
  }

  /* -------------------------------------------------------- *
   * ABA: DEBUG (item 1)
   * -------------------------------------------------------- */

  function renderDebugTab(body) {
    const current = getCurrentDebugMode();
    const buttons = [];

    if (current !== '1') {
      buttons.push(createEl('button', { class: 'odt-btn odt-btn--primary', onClick: () => applyDebugMode('1') }, ['Ativar Debug']));
    }

    if (current !== 'assets') {
      buttons.push(createEl('button', { class: 'odt-btn odt-btn--primary', onClick: () => applyDebugMode('assets') }, ['Ativar Debug Assets']));
    }

    if (current) {
      buttons.push(createEl('button', { class: 'odt-btn', onClick: () => applyDebugMode(null) }, ['Remover Debug']));
    }

    body.appendChild(createEl('div', { class: 'odt-section' }, [
      createEl('p', {}, [`Modo debug atual: ${current || 'desativado'}`]),
      ...buttons,
    ]));
  }

  /* -------------------------------------------------------- *
   * ABA: VIEW (item 3)
   * -------------------------------------------------------- */

  function detectViewType() {
    if (document.querySelector('.o_form_view')) return 'form';
    if (document.querySelector('.o_list_view')) return 'list';
    if (document.querySelector('.o_kanban_view')) return 'kanban';
    if (document.querySelector('.o_search_view, .o_searchview')) return 'search';
    return 'form';
  }

  function detectModelFromLocationHash() {
    try {
      const hash = window.location && window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      if (!hash) return null;
      const params = new URLSearchParams(hash);
      return params.get('model');
    } catch (e) {
      return null;
    }
  }

  function renderViewTab(body) {
    const section = createEl('div', { class: 'odt-section' });
    const result = createEl('div', { class: 'odt-result' });

    section.appendChild(createEl('button', {
      class: 'odt-btn odt-btn--primary',
      onClick: async () => {
        result.innerHTML = 'Carregando…';
        try {
          const record = await OdooDevtoolsModels.requestActiveRecord();
          const model = (record && record.model) || detectModelFromLocationHash();
          const viewType = detectViewType();
          const info = await OdooDevtoolsViews.inspectView(model, viewType);
          renderViewResult(result, info);
        } catch (e) {
          result.innerHTML = '';
          result.appendChild(createEl('div', { class: 'odt-warning' }, [e.message]));
        }
      },
    }, ['Inspecionar View Atual']));

    section.appendChild(result);
    body.appendChild(section);
  }

  function renderViewResult(container, info) {
    container.innerHTML = '';
    const rows = [
      ['View ID', info.viewId],
      ['XML ID', info.xmlId],
      ['Módulo', info.module],
      ['Tipo', info.type],
      ['Modelo', info.model],
    ];
    rows.forEach(([label, value]) => {
      container.appendChild(createEl('div', { class: 'odt-popup-row' }, [
        createEl('span', { class: 'odt-popup-label' }, [label]),
        createEl('span', { class: 'odt-popup-value' }, [String(value ?? '-')]),
      ]));
    });

    container.appendChild(createEl('button', {
      class: 'odt-btn',
      onClick: () => OdooDevtoolsClipboard.copyXmlId(info.xmlId),
    }, ['Copiar XML ID']));
    container.appendChild(createEl('button', {
      class: 'odt-btn',
      onClick: () => OdooDevtoolsClipboard.copyViewId(info.viewId),
    }, ['Copiar View ID']));
    container.appendChild(createEl('button', {
      class: 'odt-btn',
      onClick: () => OdooDevtoolsFavorites.favoriteView(info).then(() => notifyCopied('View adicionada aos favoritos')),
    }, ['Favoritar View']));

    if (info.relatedViews && info.relatedViews.length) {
      const list = createEl('div', { class: 'odt-list' });
      info.relatedViews.forEach((v) => {
        list.appendChild(createEl('div', { class: 'odt-list-item' }, [
          `#${v.id} ${v.name} ${v.inheritName ? `(herda de: ${v.inheritName})` : ''} - prioridade ${v.priority}`,
        ]));
      });
      container.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Views envolvidas (mesmo modelo)']));
      container.appendChild(list);
    }
  }

  /* -------------------------------------------------------- *
   * ABA: REGISTRO (item 4)
   * -------------------------------------------------------- */

  function renderRecordTab(body) {
    const section = createEl('div', { class: 'odt-section' });
    const result = createEl('div', { class: 'odt-result' });

    section.appendChild(createEl('button', {
      class: 'odt-btn odt-btn--primary',
      onClick: async () => {
        result.innerHTML = 'Carregando…';
        const info = await OdooDevtoolsModels.getFullRecordInfo();
        result.innerHTML = '';
        if (!info) {
          const activeRecord = await OdooDevtoolsModels.requestActiveRecord();
          const detectedModel = (activeRecord && activeRecord.model) || detectModelFromLocationHash();
          const warning = detectedModel
            ? `Modelo identificado (${detectedModel}), mas nenhum registro ativo foi encontrado nesta tela.`
            : 'Nenhum registro ativo identificado.';
          result.appendChild(createEl('div', { class: 'odt-warning' }, [warning]));
          return;
        }
        const rows = [
          ['Model', info.model],
          ['ID', info.id],
          ['Display Name', info.displayName],
          ['XML ID', info.xmlId],
          ['Create UID', info.createUid],
          ['Create Date', info.createDate],
          ['Write UID', info.writeUid],
          ['Write Date', info.writeDate],
          ['Context', info.context ? safeStringify(info.context) : '-'],
        ];
        rows.forEach(([label, value]) => {
          result.appendChild(createEl('div', { class: 'odt-popup-row' }, [
            createEl('span', { class: 'odt-popup-label' }, [label]),
            createEl('span', { class: 'odt-popup-value' }, [truncate(String(value ?? '-'), 60)]),
          ]));
        });

        if (info.recordRules && info.recordRules.length) {
          result.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Record Rules']));
          const list = createEl('div', { class: 'odt-list' });
          info.recordRules.forEach((r) => {
            list.appendChild(createEl('div', { class: 'odt-list-item' }, [`${r.name}: ${r.domain_force || '-'}`]));
          });
          result.appendChild(list);
        }

        result.appendChild(createEl('button', {
          class: 'odt-btn',
          onClick: () => OdooDevtoolsClipboard.copyRecordId(info.id),
        }, ['Copiar Record ID']));
        result.appendChild(createEl('button', {
          class: 'odt-btn',
          onClick: () => OdooDevtoolsFavorites.favoriteCurrentRecord().then(() => notifyCopied('Registro adicionado aos favoritos')),
        }, ['Favoritar Registro']));
      },
    }, ['Registro Atual']));

    section.appendChild(result);
    body.appendChild(section);
  }

  /* -------------------------------------------------------- *
   * ABA: NETWORK (itens 5, 6, 7)
   * -------------------------------------------------------- */

  function renderNetworkTab(body) {
    const filters = { search: '', onlyErrors: false };

    const filterBar = createEl('div', { class: 'odt-filter-bar' }, [
      createEl('input', {
        type: 'text',
        placeholder: 'Buscar por modelo/método/url…',
        onInput: (ev) => {
          filters.search = ev.target.value;
          renderList();
        },
      }),
      createEl('label', {}, [
        createEl('input', {
          type: 'checkbox',
          onChange: (ev) => {
            filters.onlyErrors = ev.target.checked;
            renderList();
          },
        }),
        ' Apenas erros',
      ]),
      createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsNetwork.exportAllAsJson() }, ['Exportar tudo (JSON)']),
      createEl('button', { class: 'odt-btn', onClick: () => { OdooDevtoolsNetwork.clear(); renderList(); } }, ['Limpar histórico']),
    ]);

    const listEl = createEl('div', { class: 'odt-network-list' });
    const detailEl = createEl('div', { class: 'odt-network-detail' });

    function renderList() {
      listEl.innerHTML = '';
      const entries = OdooDevtoolsNetwork.filterEntries(filters);
      if (!entries.length) {
        listEl.appendChild(createEl('div', { class: 'odt-warning' }, ['Nenhuma requisição capturada ainda.']));
        return;
      }
      entries.forEach((entry) => {
        const statusClass = entry.error ? 'odt-req--error' : 'odt-req--ok';
        listEl.appendChild(createEl('div', {
          class: `odt-req ${statusClass}`,
          onClick: () => renderDetail(entry),
        }, [
          createEl('span', { class: 'odt-req-model' }, [entry.model || '-']),
          createEl('span', { class: 'odt-req-method' }, [entry.method || '-']),
          createEl('span', { class: 'odt-req-status' }, [String(entry.status ?? '-')]),
          createEl('span', { class: 'odt-req-time' }, [formatDuration(entry.duration)]),
        ]));
      });
    }

    function renderDetail(entry) {
      detailEl.innerHTML = '';
      detailEl.appendChild(createEl('div', { class: 'odt-popup-row' }, [
        createEl('span', { class: 'odt-popup-label' }, ['URL']),
        createEl('span', { class: 'odt-popup-value' }, [entry.url]),
      ]));
      detailEl.appendChild(createEl('div', { class: 'odt-popup-row' }, [
        createEl('span', { class: 'odt-popup-label' }, ['Tempo']),
        createEl('span', { class: 'odt-popup-value' }, [formatDuration(entry.duration)]),
      ]));
      if (entry.error) {
        detailEl.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Erro']));
        detailEl.appendChild(createEl('pre', { class: 'odt-pre' }, [safeStringify(entry.error)]));
      }
      detailEl.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Payload']));
      detailEl.appendChild(createEl('pre', { class: 'odt-pre' }, [truncate(entry.requestBody || '-', 800)]));
      detailEl.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Response']));
      detailEl.appendChild(createEl('pre', { class: 'odt-pre' }, [truncate(entry.responseBody || '-', 800)]));

      detailEl.appendChild(createEl('div', { class: 'odt-btn-row' }, [
        createEl('button', { class: 'odt-btn', onClick: () => copyToClipboard(entry.requestBody).then(() => notifyCopied('Request')) }, ['Copiar Request']),
        createEl('button', { class: 'odt-btn', onClick: () => copyToClipboard(entry.responseBody).then(() => notifyCopied('Response')) }, ['Copiar Response']),
        createEl('button', { class: 'odt-btn', onClick: () => copyToClipboard(safeStringify(entry)).then(() => notifyCopied('JSON')) }, ['Copiar JSON']),
        createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsNetwork.exportEntryAsJson(entry) }, ['Exportar JSON']),
        createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsNetwork.exportEntryAsTxt(entry) }, ['Exportar TXT']),
        createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsNetwork.exportEntryAsCurl(entry) }, ['Exportar cURL']),
      ]));
    }

    body.appendChild(filterBar);
    body.appendChild(createEl('div', { class: 'odt-network-layout' }, [listEl, detailEl]));
    renderList();
  }

  /* -------------------------------------------------------- *
   * ABA: PERFORMANCE (item 8)
   * -------------------------------------------------------- */

  function renderPerformanceTab(body) {
    const result = createEl('div', { class: 'odt-result' });

    function refresh() {
      const summary = OdooDevtoolsPerformance.getSummary();
      result.innerHTML = '';
      const rows = [
        ['Tempo da página', formatDuration(summary.pageLoadTime)],
        ['Quantidade de Requests', summary.totalRequests],
        ['Tempo RPC (total)', formatDuration(summary.totalRpcTime)],
        ['Tempo médio', formatDuration(summary.averageTime)],
        ['Maior Request', summary.maxRequest ? `${summary.maxRequest.model}.${summary.maxRequest.method} (${formatDuration(summary.maxRequest.duration)})` : '-'],
        ['Menor Request', summary.minRequest ? `${summary.minRequest.model}.${summary.minRequest.method} (${formatDuration(summary.minRequest.duration)})` : '-'],
      ];
      rows.forEach(([label, value]) => {
        result.appendChild(createEl('div', { class: 'odt-popup-row' }, [
          createEl('span', { class: 'odt-popup-label' }, [label]),
          createEl('span', { class: 'odt-popup-value' }, [String(value)]),
        ]));
      });
    }

    body.appendChild(createEl('button', { class: 'odt-btn odt-btn--primary', onClick: refresh }, ['Atualizar Métricas']));
    body.appendChild(result);
    refresh();
  }

  /* -------------------------------------------------------- *
   * ABA: FAVORITOS (item 10)
   * -------------------------------------------------------- */

  async function renderFavoritesTab(body) {
    const favorites = await OdooDevtoolsFavorites.list();
    const categories = [
      ['views', 'Views'],
      ['models', 'Modelos'],
      ['menus', 'Menus'],
      ['records', 'Registros'],
    ];

    categories.forEach(([key, label]) => {
      body.appendChild(createEl('div', { class: 'odt-subsection-title' }, [label]));
      const items = favorites[key] || [];
      if (!items.length) {
        body.appendChild(createEl('div', { class: 'odt-warning' }, ['Nenhum item favoritado.']));
      } else {
        items.forEach((item) => {
          body.appendChild(createEl('div', { class: 'odt-list-item' }, [
            createEl('span', {}, [item.displayName || item.name || item.xmlId || String(item.id)]),
            createEl('button', {
              class: 'odt-btn odt-btn--small',
              onClick: async () => {
                await OdooDevtoolsFavorites.remove(key, item.id);
                renderActiveTab();
              },
            }, ['Remover']),
          ]));
        });
      }
    });

    body.appendChild(createEl('div', { class: 'odt-btn-row' }, [
      createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsFavorites.favoriteCurrentRecord().then(() => renderActiveTab()).catch((e) => notifyError(e.message)) }, ['+ Registro atual']),
      createEl('button', { class: 'odt-btn', onClick: () => OdooDevtoolsFavorites.favoriteCurrentMenu().then(() => renderActiveTab()).catch((e) => notifyError(e.message)) }, ['+ Menu atual']),
    ]));
  }

  /* -------------------------------------------------------- *
   * ABA: FERRAMENTAS (itens 12 e 13 - XPath Generator + Exportador)
   * -------------------------------------------------------- */

  const XPATH_SELECTORS = {
    field: '[name].o_field_widget, [name]',
    group: '.o_group, group',
    page: '.o_notebook_page, page',
    button: 'button',
    sheet: '.o_form_sheet, sheet',
    notebook: '.o_notebook, notebook',
    div: 'div',
    span: 'span',
  };

  function renderToolsTab(body) {
    body.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Gerador de XPath']));
    body.appendChild(createEl('p', {}, ['Escolha o tipo de elemento e clique em qualquer ponto da tela.']));

    const select = createEl('select', {}, Object.keys(XPATH_SELECTORS).map((key) => createEl('option', { value: key }, [key])));
    const status = createEl('div', { class: 'odt-warning' }, ['']);

    body.appendChild(select);
    body.appendChild(createEl('button', {
      class: 'odt-btn odt-btn--primary',
      onClick: () => armXPathPicker(select.value, status),
    }, ['Ativar seletor de elemento']));
    body.appendChild(status);

    body.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Exportador de tela']));
    body.appendChild(createEl('div', { class: 'odt-btn-row' }, [
      createEl('button', { class: 'odt-btn', onClick: () => exportScreen('json') }, ['Exportar JSON']),
      createEl('button', { class: 'odt-btn', onClick: () => exportScreen('txt') }, ['Exportar TXT']),
      createEl('button', { class: 'odt-btn', onClick: () => exportScreen('md') }, ['Exportar Markdown']),
    ]));
  }

  function armXPathPicker(type, statusEl) {
    statusEl.textContent = 'Clique em um elemento na página…';
    const selector = XPATH_SELECTORS[type] || 'div';

    function onPick(ev) {
      const el = ev.target.closest(selector);
      if (!el) {
        statusEl.textContent = 'Nenhum elemento correspondente ao tipo selecionado.';
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const xpath = getElementXPath(el);
      copyToClipboard(xpath).then(() => notifyCopied('XPath'));
      statusEl.textContent = xpath;
      document.removeEventListener('click', onPick, true);
    }
    document.addEventListener('click', onPick, true);
  }

  async function exportScreen(format) {
    const record = await OdooDevtoolsModels.getFullRecordInfo();
    const viewType = detectViewType();
    const model = (record && record.model) || detectModelFromLocationHash();
    let view = null;
    try {
      view = await OdooDevtoolsViews.inspectView(model, viewType);
    } catch (e) {
      view = null;
    }

    const data = { url: window.location.href, session: sessionInfo, record, view };

    if (format === 'json') {
      OdooDevtoolsNetwork.downloadFile('odoo-screen-export.json', safeStringify(data), 'application/json');
    } else if (format === 'txt') {
      OdooDevtoolsNetwork.downloadFile('odoo-screen-export.txt', safeStringify(data), 'text/plain');
    } else {
      const md = [
        `# Exportação de tela Odoo`,
        `- URL: ${data.url}`,
        `- Modelo: ${record ? record.model : '-'}`,
        `- Registro: ${record ? record.id : '-'}`,
        `- View: ${view ? view.viewId : '-'} (${view ? view.xmlId : '-'})`,
      ].join('\n');
      OdooDevtoolsNetwork.downloadFile('odoo-screen-export.md', md, 'text/markdown');
    }
  }

  /* -------------------------------------------------------- *
   * ABA: CONFIGURAÇÕES (item 17)
   * -------------------------------------------------------- */

  async function renderSettingsTab(body) {
    const settings = await getSettings();

    const themeSelect = createEl('select', {
      onChange: (ev) => updateSettings({ theme: ev.target.value }).then(() => document.documentElement.setAttribute('data-odt-theme', ev.target.value)),
    }, [
      createEl('option', { value: 'dark', selected: settings.theme === 'dark' }, ['Dark']),
      createEl('option', { value: 'light', selected: settings.theme === 'light' }, ['Light']),
    ]);

    const maxRequestsInput = createEl('input', {
      type: 'number',
      value: settings.maxRequests,
      min: '10',
      max: '1000',
      onChange: (ev) => updateSettings({ maxRequests: Number(ev.target.value) }),
    });

    const autoClearInput = createEl('input', {
      type: 'checkbox',
      onChange: (ev) => updateSettings({ autoClearHistory: ev.target.checked }),
    });
    if (settings.autoClearHistory) autoClearInput.setAttribute('checked', 'checked');

    body.appendChild(createEl('div', { class: 'odt-popup-row' }, [createEl('span', { class: 'odt-popup-label' }, ['Tema']), themeSelect]));
    body.appendChild(createEl('div', { class: 'odt-popup-row' }, [createEl('span', { class: 'odt-popup-label' }, ['Máx. requests no histórico']), maxRequestsInput]));
    body.appendChild(createEl('div', { class: 'odt-popup-row' }, [createEl('span', { class: 'odt-popup-label' }, ['Auto-limpar histórico']), autoClearInput]));
    body.appendChild(createEl('div', { class: 'odt-subsection-title' }, ['Atalho disponível']));
    body.appendChild(createEl('div', { class: 'odt-popup-row' }, [
      createEl('span', { class: 'odt-popup-label' }, ['Alt+clique']),
      createEl('span', { class: 'odt-popup-value' }, ['Inspecionar campo em tela']),
    ]));
  }

  /* -------------------------------------------------------- *
   * DRAG & RESIZE (item 15)
   * -------------------------------------------------------- */

  function makeDraggable(panel, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', (ev) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = ev.clientX - rect.left;
      offsetY = ev.clientY - rect.top;
      ev.preventDefault();
    });

    document.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      panel.style.left = `${ev.clientX - offsetX}px`;
      panel.style.top = `${ev.clientY - offsetY}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function makeResizable(panel, handle) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (ev) => {
      resizing = true;
      startX = ev.clientX;
      startY = ev.clientY;
      startWidth = panel.offsetWidth;
      startHeight = panel.offsetHeight;
      ev.preventDefault();
      ev.stopPropagation();
    });

    document.addEventListener('mousemove', (ev) => {
      if (!resizing) return;
      panel.style.width = `${Math.max(320, startWidth + (ev.clientX - startX))}px`;
      panel.style.height = `${Math.max(240, startHeight + (ev.clientY - startY))}px`;
    });

    document.addEventListener('mouseup', () => {
      resizing = false;
    });
  }

  /* -------------------------------------------------------- *
   * MENSAGENS (atalhos vindos do background, ações do popup)
   * -------------------------------------------------------- */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'COMMAND') {
      handleCommand(message.command);
    } else if (message.type === 'APPLY_DEBUG') {
      applyDebugMode(message.mode);
    } else if (message.type === 'TOGGLE_PANEL') {
      togglePanel();
    } else if (message.type === 'GET_DEBUG_MODE') {
      sendResponse({ mode: getCurrentDebugMode() });
    }
    return true;
  });

  function handleCommand(command) {
    const map = {
      'toggle-debug': () => applyDebugMode(getCurrentDebugMode() ? null : '1'),
      'open-network': () => { openPanel(); activeTab = 'network'; renderActiveTab(); refreshTabButtons(); },
      'open-record': () => { openPanel(); activeTab = 'record'; renderActiveTab(); refreshTabButtons(); },
      'open-xpath': () => { openPanel(); activeTab = 'tools'; renderActiveTab(); refreshTabButtons(); },
    };
    (map[command] || (() => {}))();
  }
})();
