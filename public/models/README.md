# Assets 3D do showroom

Diretório público para os GLBs substitutos da cena procedural. A home não tenta carregar os caminhos do
manifesto até que os arquivos existam, portanto os placeholders não geram requisições 404.

```text
models/
  rooms/       ambientes completos, se a autoria for feita por cômodo
  furniture/   sofá, cama, ilha e outros protagonistas substituíveis
  decor/       plantas, luminárias e objetos leves/reutilizáveis
  textures/    texturas externas compartilhadas, somente quando não estiverem embutidas
```

Use nomes em `kebab-case`, metros como unidade e mantenha o ponto de origem no piso. Veja
[`docs/blender-workflow.md`](../../docs/blender-workflow.md) para exportação e compressão.

