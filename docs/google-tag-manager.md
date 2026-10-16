# Google Tag Manager — NOMA

Contêiner: `GTM-T8ZDJ45R`.

## Instalação no Next.js 16.3.2

O layout compartilhado `app/(store)/layout.tsx` inclui a integração uma única vez para BR, US e a landing de manutenção. O layout raiz continua compartilhado com o admin e não recebe tags globais. Os layouts de cada mercado não repetem a integração.

O bootstrap oficial usa `next/script`, ID estável `noma-google-tag-manager` e `afterInteractive`, estratégia recomendada pela documentação instalada do Next.js para gerenciadores de tags. O bootstrap é executado após a hidratação começar e insere o `gtm.js` assíncrono antes do primeiro script, no `<head>`. Isso adapta a posição/execução do snippet inline ao App Router: o bootstrap inline é gerenciado pelo Next.js no corpo, em vez de ser copiado literalmente para o `<head>` inicial. Não se usa `beforeInteractive` em layout aninhado, nem se adiciona a dependência experimental `@next/third-parties`.

O `noscript` oficial é o primeiro elemento do layout da loja, antes de qualquer conteúdo, dentro do `<body>` fornecido por `app/layout.tsx`. Seu iframe usa `https://www.googletagmanager.com/ns.html?id=GTM-T8ZDJ45R`, dimensões zero e `display:none;visibility:hidden`. O cache de `next/script` impede que o bootstrap seja executado novamente durante navegações e remontagens.

O bootstrap reutiliza `window.dataLayer`. Não adiciona configuração de Ads ou comandos de consentimento. A migração local do botão de WhatsApp passa a emitir `noma_whatsapp_click`, conforme o [contrato e plano de publicação](./google-ads-attendance.md). O carregador `gtag.js` existente e a deduplicação dos demais fluxos permanecem intactos:

| Uso | Destino existente |
| --- | --- |
| Compra aprovada | `AW-17990986153/BslfCL7KjIEdEKnT4oJD` |
| Formulário de atendimento (direto, preservado) | `AW-17990986153/8MvVCLnLjIEdEKnT4oJD` |
| WhatsApp (destino exigido no GTM, ainda não publicado) | `AW-415422628/_2feCLKWzP4cEKSxi8YB` |

A CSP existente já permite `www.googletagmanager.com` em `script-src`, `connect-src` e `frame-src`, e permite as imagens necessárias. Ela já tinha `'unsafe-inline'`; esta instalação não amplia permissões, não adiciona origens e não habilita `'unsafe-eval'` em produção. A configuração atual não garante todos os recursos adicionais do modo Preview. Não liberar domínios ou execução arbitrária apenas para contornar um erro de depuração.

## Risco confirmado no contêiner publicado

**Publicação do site bloqueada.** Uma nova consulta HTTP somente de leitura ao [JavaScript público do contêiner](https://www.googletagmanager.com/gtm.js?id=GTM-T8ZDJ45R), sem executá-lo, em **2026-10-16 às 19:41:38 UTC**, retornou HTTP 200 e encontrou:

- Uma Google tag `AW-17990986153` acionada em `gtm.init`, sobreposta à configuração direta já existente no site.
- Uma tag de conversão `AW-17990986153/DhxuCLXKnp8dEKnT4oJD` acionada em `gtm.click` para o seletor `.product-detail_buyButton__AtJQl`.
- Uma tag de conversão `AW-17990986153/2TAmCIWkn58dEKnT4oJD` acionada em `gtm.dom` quando o caminho contém `pedido`, sem checar aprovação de pagamento. As variáveis de ID e valor consultam elementos do DOM por JavaScript personalizado.
- Conversion Linker e um listener de cliques.
- Ausência de `noma_whatsapp_click`, do ID `415422628` e do rótulo `_2feCLKWzP4cEKSxi8YB` no arquivo publicado.

O SHA-256 do arquivo consultado foi `d5daa4b38f680981c73186eac3d8fb98b81971a76f2eca7d02622dc64091bf8b`; o campo `resource.version` era `4` (não usado como prova do número da versão no painel GTM).

O destino `AW-17990986153/DhxuCLXKnp8dEKnT4oJD` **não equivale** a `AW-415422628/_2feCLKWzP4cEKSxi8YB`. Publicar o código local agora retiraria as conversões diretas do clique sem um receptor correto no GTM. Além disso, ativaria a regra remota de pedido, que pode medir compra sem aprovação. A deduplicação local não controla esses disparos remotos. Não houve alteração de contas Google, do contêiner ou da RBS Eletro. Não houve commit, push ou deploy; os disparos diretos da produção não foram retirados.

O especialista precisa concluir e publicar os [ajustes de atendimento e revisão de sobreposições](./google-ads-attendance.md#ajustes-obrigatórios-no-gtm-antes-de-publicar-o-site). Também falta confirmar o vínculo da ação oficial com a campanha NOMA na conta Google Ads; isso não pode ser inferido do código público do contêiner. Não ampliar a CSP para permitir JavaScript personalizado da nova tag de pedido: compras continuam sob responsabilidade do código existente.

Na mesma auditoria, `https://www.nomarooms.com/br` respondeu HTTP 200. A leitura estática do HTML e de 10 scripts Next.js referenciados, sem executá-los, encontrou os três rótulos diretos existentes, mas não `GTM-T8ZDJ45R` nem `noma_whatsapp_click`. Isso registra o conteúdo consultado, não substitui validação em navegador ou comprovação de recebimento no Ads. Nenhum deploy foi iniciado nesta sessão.

## Verificação sem conversões fictícias

1. Antes de abrir uma página com tags reais, resolver os bloqueios acima e confirmar a configuração publicada e a ação correta da campanha. Não usar cliques reais de teste como forma de obter essa confirmação.
2. No ambiente que estiver executando esta versão, com a manutenção desativada, abra o [Tag Assistant](https://tagassistant.google.com/), escolha **Add domain**, informe uma URL pública como `/br` e clique em **Connect**. Siga a [orientação oficial de conexão](https://support.google.com/tagmanager/answer/10039345).
3. Confirme que `GTM-T8ZDJ45R` aparece entre os contêineres detectados. No DevTools, filtre a rede por `gtm.js?id=GTM-T8ZDJ45R`: deve haver uma carga por documento. Navegar por links internos da loja não deve carregar esse mesmo contêiner novamente. Recarregar a página cria outro documento e outra carga, como esperado. `gtag/js?id=AW-17990986153` é a integração direta preservada, não uma segunda instalação do contêiner.
4. Confira no DOM o script assíncrono no `<head>` e, no HTML da resposta, o `noscript` com o iframe correto antes do conteúdo da loja. Verifique o console para violações CSP.
5. Navegue apenas pela home e categorias. Não clique em Solicitar Atendimento/WhatsApp, não envie formulários, não conclua checkout e não abra URLs de pedidos aprovados. Não envie eventos manuais ao `dataLayer` ou ao `gtag`.
6. Não use `/traffic-test/*` nem páginas reescritas pela manutenção: a landing existente pode enviar uma conversão se `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` estiver configurado. Debug/Preview não é um modo que automaticamente impeça envios reais.

Os testes locais usam tags simuladas e não carregam scripts remotos. Eles verificam uma única carga ao navegar/remontar, preservação de `dataLayer`, configurações de Ads, ausência de novas conversões e o fallback HTML. A recepção real pelo Tag Assistant só pode ser confirmada em navegador no ambiente de destino.

Referências: [snippet oficial](https://support.google.com/tagmanager/answer/14847097), [GTM e CSP](https://developers.google.com/tag-platform/security/guides/csp), documentação local em `node_modules/next/dist/docs/01-app/02-guides/scripts.md` e `03-api-reference/02-components/script.md`.
