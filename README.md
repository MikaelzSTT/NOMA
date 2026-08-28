# Noma — catálogo multi-fornecedor

Base de e-commerce para móveis e produtos para casa em Next.js 16, React 19,
TypeScript, Prisma 7 e PostgreSQL. A home aprovada foi preservada; os cards e a
página de produto agora leem um catálogo interno padronizado.

```text
fornecedores -> SupplierAdapter -> normalização/validação -> PostgreSQL/Prisma -> DTO público -> frontend
                         CSV/XLSX -----^      URL específica -----^
```

O frontend não conhece contratos de fornecedores. `lib/catalog.ts` seleciona e
serializa apenas campos públicos; `costPrice`, configurações e credenciais nunca
entram nesse DTO.

## Rodando localmente

Requisitos: Node 20.19+ e PostgreSQL 15+.

```bash
npm install
cp .env.example .env
npm run db:deploy
npm run seed
npm run dev
```

O Compose continua disponível para ambientes com Docker:

```bash
docker compose up -d
```

Rotas principais:

- `/`: home dinâmica, com o visual Noma existente;
- `/buscar` e `/categoria/[slug]`: catálogo público;
- `/produto/[slug]`: detalhe, imagens, variantes e disponibilidade;
- `/admin/produtos`: custo, venda, margem, estoque, filtros e arquivamento;
- `/admin/fornecedores`: fontes, autorização, configuração e credenciais criptografadas;
- `/admin/importar`: CSV/XLSX, URL individual e fila de URLs;
- `/admin/logs`: histórico de sincronização.

## Modelo interno

`prisma/schema.prisma` contém:

- `Supplier`: adapter, capacidades, configurações não sensíveis e credenciais criptografadas;
- `Product`: IDs de origem, SKU, conteúdo, custo, venda, estoque, disponibilidade, frete, atributos, publicação e timestamps de sync;
- `ProductVariant` e `ProductImage`;
- `PricingRule`: `FIXED_MARGIN` ou `MARKUP`, com escopo global, categoria e/ou fornecedor;
- `ImportMappingTemplate`, `ImportJob` e `ImportItem`;
- `PriceHistory`, `SyncLog` e `SyncLock`.

Os nomes físicos de algumas colunas/tabelas da versão anterior são preservados
com `@map`/`@@map`, evitando uma cópia destrutiva de dados durante a migração.

Exemplo de preço:

```ts
calculateSellingPrice(100, { type: "MARKUP", value: 1.8 }) // 180
```

Um override manual no produto prevalece sobre regras automáticas durante futuras
sincronizações.

## Adapters de fornecedores

O contrato está em `suppliers/types.ts`. Cada método operacional é opcional:

```ts
interface SupplierAdapter {
  normalizeProduct(raw: unknown): NormalizedSupplierProduct | Promise<NormalizedSupplierProduct>;
  fetchProduct?(supplierProductId: string): Promise<NormalizedSupplierProduct | null>;
  fetchProducts?(query?: SupplierFetchQuery): AsyncGenerator<SupplierProductBatch>;
  supportsUrl?(url: URL): boolean;
  fetchProductByUrl?(url: URL): Promise<NormalizedSupplierProduct>;
  getStock?(supplierProductId: string): Promise<number | null>;
  getPrice?(supplierProductId: string): Promise<{ costPrice?: number; currency: string } | null>;
  createOrder?(order: unknown): Promise<unknown>; // contrato futuro; não usado nesta etapa
}
```

Registre um adapter real em `suppliers/registry.ts` somente depois de obter a
documentação, autorização e credenciais do fornecedor. Não há API inventada nem
scraper universal. Uma URL sem adapter específico retorna uma mensagem explícita
e não dispara tentativas de contornar bloqueios.

O adapter `mock-catalog` existe apenas para o seed e aceita exclusivamente URLs
`https://example.com/noma-demo/...`. Os seis registros demonstrativos usam o
mesmo modelo e o mesmo pipeline definitivos.

## Importação

### CSV/XLSX

O arquivo é lido no backend, limitado a 10 MB e 10.000 linhas. O admin recebe as
colunas e até dez linhas de preview, define `coluna do fornecedor -> campo
interno`, pode salvar o template por fornecedor e confirma a importação. A
biblioteca XLSX é carregada somente no runtime Node do Route Handler.

### URL

O backend identifica o adapter por domínio/caminho, busca apenas o que o adapter
implementa, normaliza e devolve um preview. Título, descrição, imagens, categoria,
custo, preço, estoque e variantes podem ser revisados antes da confirmação.

### Lote de URLs

Até 500 URLs criam `ImportJob`/`ImportItem` persistidos. A interface processa
pequenos lotes e atualiza os estados `PENDING`, `IMPORTING`, `SUCCESS` e `ERROR`,
sem manter uma única requisição longa. O mesmo serviço pode ser movido para um
worker/queue externo sem alterar o modelo ou a UI.

## Imagens

`ProductImage` separa `sourceUrl`, URL servida, `storageKey` e `storageStatus`
(`EXTERNAL`, `PENDING_COPY`, `STORED`, `COPY_ERROR`). Hoje o catálogo aceita HTTPS
externo autorizado; um pipeline futuro pode copiar os arquivos para storage/CDN
próprio e trocar `url` sem afetar o frontend.

## Configuração e segurança

Veja `.env.example`. Valores relevantes:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `NEXT_PUBLIC_SITE_URL` | URL pública; é a única configuração pública |
| `SUPPLIER_CONFIG_ENCRYPTION_KEY` | AES-GCM para tokens/configs de fornecedores |
| `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | sessão administrativa |
| `CRON_SECRET` | endpoint de sincronização |
| `SYNC_*` | lotes, ritmo e janela incremental |

Configurações sensíveis ficam em `Supplier.credentialsEncrypted`. Integrações,
normalização, custo e precificação importam `server-only`. Todas as mutações do
admin revalidam autenticação e entradas; Route Handlers também verificam sessão e
origem.

## Verificação

```bash
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Antes do primeiro uso em um banco já existente, faça backup e execute
`npm run db:deploy`. Depois rode `npm run seed` se ainda não houver produtos reais.

## Fora desta etapa

Checkout, pagamentos e criação de pedido no fornecedor não foram implementados.
O método `createOrder?` é apenas um ponto de extensão. Também não há cron/worker
complexo de preço e estoque: `lastPriceSyncAt`, `lastStockSyncAt` e `syncStatus`
já deixam o catálogo preparado para isso.
