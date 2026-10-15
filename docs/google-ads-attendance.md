# Google Ads — atendimento NOMA

O clique em **Solicitar atendimento de compra** na página de produto abre o WhatsApp de forma síncrona em nova aba e envia dois eventos `conversion` pelo `gtag` existente:

| Destino | `send_to` |
| --- | --- |
| Conversão existente | `AW-17990986153/8MvVCLnLjIEdEKnT4oJD` |
| solicitação de atendimento noma | `AW-415422628/_2feCLKWzP4cEKSxi8YB` |

O destino de **solicitação de atendimento noma** corresponde ao snippet oficial fornecido pelo responsável pela conta: ID `AW-415422628` e rótulo `_2feCLKWzP4cEKSxi8YB`, com `C` maiúsculo após `_2fe`. O destino existente em `AW-17990986153` permanece preservado até a confirmação de seus vínculos e necessidade.

Cada clique recebe um `transaction_id` aleatório, compartilhado pelos dois destinos. A deduplicação usa destino + identificador, em memória e no armazenamento já utilizado pela aplicação. Falhas de armazenamento não impedem o envio. Falhas de uma tag não impedem a tentativa na outra nem a abertura do WhatsApp.

O segundo destino é configurado no mesmo `gtag.js`, sem outro loader ou variável de ambiente. O roteamento explícito segue a [documentação do Google](https://developers.google.com/tag-platform/gtagjs/routing). Compra, formulário de atendimento e a conversão opcional da landing de teste mantêm seus destinos existentes. A montagem e a navegação na página de produto não disparam as conversões de atendimento.

A CSP permanece inalterada. A integração reutiliza `window.gtag` e `dataLayer` e não adiciona nem altera comandos `consent`. O repositório não contém uma implementação de Consent Mode/CMP; se configurada externamente, deve ser conferida na validação em produção. O consentimento do formulário de atendimento permanece separado e inalterado.

## Validação após publicar

1. Abra o [Tag Assistant](https://tagassistant.google.com/) e conecte `https://nomarooms.com`. Alternativamente, inicie a solução de problemas da ação de conversão no Google Ads, conforme a [documentação oficial](https://support.google.com/google-ads/answer/10989978?hl=pt-BR).
2. Navegue até um produto com **Solicitar atendimento de compra**. Confira os destinos `AW-17990986153` e `AW-415422628`. Recarregue e navegue sem clicar: não deve haver eventos `conversion` com os dois rótulos de atendimento.
3. Clique uma vez. O WhatsApp deve abrir imediatamente em nova aba; mantenha a aba do site aberta e volte ao Tag Assistant.
4. Confira um evento de conversão para cada par ID/rótulo da tabela, com o mesmo `transaction_id`. Inspecione os eventos/payloads, pois um único evento pode gerar múltiplas requisições de rede do Google.
5. Clique novamente: devem aparecer mais dois eventos, com um novo identificador. Repita no botão de atendimento apresentado quando o frete exige assistência.
6. Confira a aba de consentimento conforme a configuração efetiva do site e a ausência de erros de CSP no console. Verifique também o fluxo normal de checkout, cuja conversão de compra permanece `AW-17990986153/BslfCL7KjIEdEKnT4oJD`.

## Conferência na conta Google Ads

O código não cria nem altera ações na conta. O destino confirmado para **solicitação de atendimento noma** é `AW-415422628/_2feCLKWzP4cEKSxi8YB`. Confira se a ação usa o evento de clique implementado e se não possui outro disparador externo para o mesmo clique ou para carregamento de página. Confira também se a ação participa das metas das campanhas desejadas. A validação do recebimento deve observar atendimentos legítimos; cliques de teste devem usar `gtag` simulado, sem enviar conversões reais.

## Verificações locais

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Os testes de DOM usam `jsdom` somente como dependência de desenvolvimento. Eles verificam montagem/navegação, os dois caminhos do botão, abertura síncrona, falha das tags, fila antes do carregamento do script e ausência de conversão no botão de checkout desabilitado. Os testes de conversão também cobrem deduplicação por destino, consentimento enfileirado e preservação de compra/formulário. A recepção real no Google Ads requer a validação acima após o deploy.
