# Odoo 19 DevTools — Extensão Chrome

Extensão Manifest V3, **somente leitura**, para inspeção, produtividade e
diagnóstico em instâncias Odoo 19 Enterprise. Voltada para desenvolvedores,
analistas de sistemas, suporte técnico, consultores funcionais e key users.

## Instalação (modo desenvolvedor)

1. Acesse `chrome://extensions`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (Load unpacked).
4. Selecione a pasta raiz deste projeto (`odoo-devtools/`).
5. Abra qualquer instância Odoo 19 — o botão flutuante ⚙ aparecerá no
   canto inferior direito da tela.

## Arquitetura

```
manifest.json
popup/            → UI do popup da barra de ferramentas (ações rápidas)
background/        → service worker (histórico RPC, atalhos de teclado)
content/
  inject.js         → roda no MAIN WORLD da página (hook de fetch/XHR,
                       leitura de window.odoo)
  content.js         → roda no ISOLATED WORLD (monta o painel flutuante)
  panel.css
modules/            → uma responsabilidade por arquivo (debug, fields,
                       network, rpc, views, models, performance,
                       favorites, clipboard)
utils/              → storage, dom, notifications, helpers (sem lógica
                       de negócio do Odoo)
icons/
```

Todo o código é **JavaScript puro**, sem frameworks e sem bundler — os
arquivos são concatenados pelo próprio Chrome na ordem declarada em
`manifest.json → content_scripts`.

## Segurança (somente leitura)

- `modules/rpc.js` mantém uma **whitelist rígida** de métodos RPC
  permitidos (`read`, `search_read`, `fields_get`, `get_views`,
  `get_metadata`, etc.). Qualquer método fora da lista (`write`,
  `create`, `unlink`, execução de SQL) é bloqueado antes mesmo de a
  requisição ser montada.
- O hook de `fetch`/`XMLHttpRequest` em `content/inject.js` apenas
  **observa** as chamadas já feitas pelo próprio Odoo — nunca as
  modifica, bloqueia ou reenvia.
- Não há nenhuma chamada de escrita em nenhum módulo do projeto.

## Atalhos de teclado

| Atalho         | Ação                                   |
|----------------|----------------------------------------|
| `Alt+clique`   | para inspeção de campo em tela         |


No painel de **Configurações**, a interface exibe somente a ação
`Alt+clique` para inspeção de campo em tela.

## Limitações conhecidas

- **Registro atual / OWL**: o Odoo não expõe uma API pública estável
  para "o registro em tela". `content/inject.js` usa heurísticas sobre
  `odoo.__WOWL_DEBUG__` (disponível apenas com `?debug=1` ativo) que
  podem parar de funcionar em builds futuras do Odoo 19 caso a
  estrutura interna do OWL mude. Quando a heurística falha, a extensão
  informa "nenhum registro identificado" em vez de travar.
- **XML completo do campo**: obtido via regex sobre o `arch` retornado
  por `get_views` — funciona bem para campos declarados diretamente na
  view principal, mas pode não capturar campos vindos de heranças
  complexas.
- **Detecção de tipo de view**: feita por classes CSS conhecidas
  (`.o_form_view`, `.o_list_view`, etc.). Views totalmente customizadas
  por módulos de terceiros podem não ser detectadas corretamente.

## Troubleshooting

- **`Uncaught RangeError: Maximum call stack size exceeded` em
  `content/inject.js`**:
  A extensão agora evita inicialização dupla do script injetado e protege
  o hook de rede para não recapturar/encadear wrappers de `fetch` e
  `XMLHttpRequest`.
- **`kQuotaBytes quota exceeded` ao salvar histórico RPC**:
  As entradas persistidas no `chrome.storage.local` são compactadas
  (truncamento de payloads grandes) e há fallback para reduzir volume do
  histórico quando necessário.
- Após atualizar arquivos da extensão, sempre recarregue em
  `chrome://extensions` e depois recarregue a aba do Odoo.

## Funcionalidades implementadas

1. Ativar/remover Debug e Debug Assets via URL
2. Inspeção de campo com ALT + clique (nome técnico, modelo, tipo,
   widget, relacionado, computado, readonly, required, store) + cópia
   rápida (nome, modelo, XML, XPath, JSON)
3. Inspeção de View (ID, XML ID, módulo, tipo, modelo, views relacionadas)
4. Informações do Registro atual (model, id, display name, auditoria,
   context, record rules)
5. Monitor de Network (captura automática dos endpoints RPC do escopo)
6. Histórico RPC (até N requests configurável, com filtros)
7. Identificação de erros (traceback, tipo de exceção)
8. Painel de Performance (tempo de página, tempo RPC, médias, extremos)
9. Favoritos (views, modelos, menus, registros)
10. Detalhamento técnico completo do campo
11. Gerador de XPath por tipo de elemento
12. Exportador de tela (JSON/TXT/Markdown)
13. Copiadores rápidos
14. Painel flutuante recolhível, arrastável e redimensionável
15. Atalhos de teclado
16. Configurações persistentes (tema, idioma, limite de histórico,
    auto-limpeza)
17. Segurança somente-leitura (whitelist de métodos RPC)
18. Interface dark/light inspirada em DevTools/VSCode/GitHub

## Mudanças recentes

- Removida a aba **Sessão** do painel.
- Na aba **Configurações**, removida a listagem de atalhos fixos e
  mantida apenas a referência ao uso de `Alt+clique`.
