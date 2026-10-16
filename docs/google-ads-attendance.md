# Atendimento NOMA — migração de WhatsApp para GTM

**Preparada localmente; publicação bloqueada pela configuração remota do GTM.** Não enviar esta alteração para `main` antes de cumprir as condições abaixo. A loja em produção continua com seu código atual; não houve commit, push ou deploy desta migração.

## Auditoria dos disparos diretos

| Origem | Antes desta migração | Alteração preparada |
| --- | --- | --- |
| `ProductDetailPurchase.handleAssistedPurchase`, incluindo atendimento após cotação de frete | WhatsApp + `AW-17990986153/8MvVCLnLjIEdEKnT4oJD` + `AW-415422628/_2feCLKWzP4cEKSxi8YB` | WhatsApp + um evento `noma_whatsapp_click`; sem conversão direta |
| Formulário `AssistedPurchaseModal`, após resposta de sucesso da API | `AW-17990986153/8MvVCLnLjIEdEKnT4oJD` | Preservado: formulário não é clique de WhatsApp |
| Compra aprovada, `GoogleAdsPurchaseConversion` | `AW-17990986153/BslfCL7KjIEdEKnT4oJD`, valor, moeda e ID do pedido | Preservado |
| Landing de manutenção | Conversão opcional definida por `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` | Preservada; evitar essa página na validação |

O helper `sendGoogleAdsAssistedPurchaseConversions` e seus testes permanecem disponíveis, mas deixam de ser chamados pelo botão de WhatsApp. Nenhuma biblioteca, tag base, função de compra/formulário ou evento interno foi removido. O `gtag.js` existente, as configurações base `AW-17990986153`/`AW-415422628`, a deduplicação de compras, o checkout e o Mercado Pago permanecem intactos.

## Contrato do evento

O clique abre `https://wa.me/5511993595887?...` imediatamente, na mesma execução síncrona, antes de qualquer tracking. Depois, `trackNomaWhatsAppClick` acrescenta à fila existente:

```json
{
  "event": "noma_whatsapp_click",
  "transaction_id": "whatsapp-<identificador aleatório por clique>"
}
```

O evento não contém dados pessoais, preço de compra ou destino Ads. O GTM decide o destino. A fila é criada se necessário, sem sobrescrever consentimento ou eventos anteriores. Falhas em `dataLayer.push` não impedem o WhatsApp nem o evento interno `assisted_purchase_click`. Não há espera por callback do GTM, nem timeout que dispare a conversão direta como fallback, pois isso poderia duplicar envios.

Montagem, navegação, cotação de frete e botão de checkout desabilitado não emitem o evento. Cada clique de atendimento emite uma vez, com um novo `transaction_id`. O evento interno `assisted_purchase_click` mantém sua lógica anterior, inclusive no retorno de checkout que oferece atendimento; ele não foi convertido em disparador Ads.

## Ajustes obrigatórios no GTM antes de publicar o site

No contêiner **NOMA `GTM-T8ZDJ45R`**, o responsável deve:

1. Criar um acionador **Evento personalizado**, nome exato `noma_whatsapp_click`, sem expressão regular e sem seletores CSS.
2. Configurar a tag nativa de acompanhamento de conversões do Google Ads para **ID `415422628` e rótulo `_2feCLKWzP4cEKSxi8YB`**. Associar somente o acionador acima e manter uma execução por evento.
3. Criar uma variável de camada de dados, versão 2, chamada `transaction_id`, e usá-la no campo **ID da transação** dessa tag. Manter os requisitos de consentimento aplicáveis e confirmar a Google tag correspondente/Conversion Linker, evitando configurar novamente as bases já carregadas pelo site.
4. Retirar do fluxo NOMA a conversão de clique `AW-17990986153/DhxuCLXKnp8dEKnT4oJD` baseada em `.product-detail_buyButton__AtJQl`. Ela é uma ação diferente, não um alias da ação oficial. Não mover o rótulo `_2fe...` para o ID `17990986153`.
5. Resolver a tag remota `AW-17990986153/2TAmCIWkn58dEKnT4oJD`, atualmente disparada no DOM Ready quando o caminho contém `pedido`. Esse critério pode incluir pedidos pendentes/falhos e somar uma conversão à compra direta aprovada. A migração solicitada é apenas de WhatsApp; não ativar outra medição de compra sobre a integração existente.
6. Confirmar, na conta Google Ads correta, que a ação **`AW-415422628/_2feCLKWzP4cEKSxi8YB`** está vinculada à campanha NOMA desejada e à sua meta de conversão. O JavaScript público do GTM não comprova esse vínculo. Nenhuma configuração da RBS Eletro deve ser alterada.
7. **Publicar** a versão do contêiner. Salvar no workspace ou validar somente em Preview não é suficiente. Fornecer a versão publicada e a confirmação do vínculo com a campanha para liberar a publicação do site.

A alteração no site deve entrar como uma unidade: instalação GTM preservada + evento novo + remoção dos dois disparos diretos do clique. Não publicar uma etapa intermediária com ambos os caminhos de conversão ou apenas com a remoção. Revalidar a versão pública do contêiner imediatamente antes do push/deploy.

## Validação sem conversões reais de teste

Os testes locais simulam `window.open`, `gtag` e falhas de tags, sem enviar conversões. Cobrem os dois caminhos do botão, ordem síncrona, um evento por clique, fila antes do carregamento, preservação do consentimento, falhas e ausência de eventos/conversões na montagem/navegação.

Depois da liberação e do deploy, conectar `https://www.nomarooms.com/br` no [Tag Assistant](https://tagassistant.google.com/), com manutenção desativada. Confirmar o contêiner, as tags base, uma carga do contêiner por documento e ausência de conversões ao navegar por home/categorias. Não clicar em atendimento, enviar formulários, abrir pedidos ou executar `dataLayer.push` manualmente em produção. Preview/Debug não impede envios reais. A validação do evento e do destino pode usar um ambiente isolado com saídas de rede bloqueadas; em produção, observar apenas um atendimento legítimo, sem gerar um clique artificial.

Referências: [eventos na camada de dados](https://developers.google.com/tag-platform/tag-manager/datalayer), [configuração de conversões Google Ads no GTM](https://support.google.com/tagmanager/answer/6105160), [auditoria do contêiner e instalação](./google-tag-manager.md).
