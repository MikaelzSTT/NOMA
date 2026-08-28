# Workflow Blender → showroom web

## Organização e escala

1. Em **Scene Properties → Units**, use `Metric`, `Unit Scale = 1.0` e modele em metros.
2. Posicione o pivô do móvel no centro da base e o piso em `Z = 0`. Para um ambiente completo, use a origem
   global do cômodo descrita abaixo.
3. Nomeie objetos e materiais em `kebab-case`, sem `.001`: `sofa-seat-left`, `walnut-matte`.
4. Antes de exportar, selecione tudo e use **Ctrl+A → Rotation & Scale**. Evite aplicar Location em objetos que
   precisem manter posicionamento relativo.
5. Aplique modifiers que definem a silhueta. Mantenha bevels pequenos: normalmente 2–6 mm em marcenaria e
   pedra, 6–20 mm em estofados. Use 2 segmentos em peças distantes e 3–4 nos protagonistas.

O Blender trabalha com Z para cima; o exportador glTF converte automaticamente para Y-up. Não rotacione a
cena manualmente para compensar. No exportador, mantenha `+Y Up` habilitado.

## Modelagem e materiais

1. Corrija proporções e silhueta antes de subdividir. Sofá, colchão, duvet e travesseiros devem ter volumes
   separados e pequenas assimetrias.
2. Remova faces internas/invisíveis e detalhes menores que 2–3 px na distância normal da câmera.
3. Faça UV unwrap sem sobreposição para peças únicas; objetos repetidos podem compartilhar UV/material.
4. Use materiais **Principled BSDF** com valores físicos. Conecte Base Color, Roughness, Metallic, Normal e AO.
   Para glTF, roughness usa G, metalness usa B e AO usa R quando os mapas forem empacotados.
5. Marque texturas de cor como sRGB. Roughness, metalness, AO e normal devem permanecer em Non-Color.
6. Use normal maps em Tangent Space e o nó Normal Map. Evite displacement real na web quando o relevo puder
   ser representado por normal.
7. Prefira texturas 1K; reserve 2K para sofá, cama, madeira e pedra em primeiro plano. Use 4K apenas após medir
   ganho visível. Embuta as exclusivas no GLB e compartilhe as repetidas em `/public/models/textures`.

Orçamento inicial recomendado: 35–60 mil triângulos por ambiente completo no desktop, 8–20 mil por móvel
protagonista e menos de 5 mil por item decorativo. Gere uma variante simplificada quando o modelo exceder esse
orçamento ou ocupar pouco espaço na tela.

## Exportação GLB

Em **File → Export → glTF 2.0**:

- Format: `glTF Binary (.glb)`
- Include: `Selected Objects` e `Visible Objects`
- Transform: `+Y Up` habilitado
- Geometry: `Apply Modifiers`, `UVs`, `Normals` e `Tangents` habilitados
- Materials: `Export`; Images em `Automatic`
- Animation: desabilitada, exceto para objetos que realmente animam
- Cameras/Lights: desabilitados; iluminação e câmera continuam controladas pela home
- Data → Custom Properties: opcional, somente para hotspots/metadados

Valide o GLB no Khronos glTF Validator antes de integrar. Teste também normais, escala, pivô e ausência de
materiais duplicados.

## Compressão

Meshopt é o padrão recomendado neste projeto porque `ShowroomModel` já habilita o decoder integrado:

```bash
npx @gltf-transform/cli optimize source.glb public/models/furniture/sofa.glb \
  --compress meshopt --texture-compress webp
```

Se Draco produzir um arquivo materialmente menor, hospede os decoders no próprio projeto (por exemplo,
`/public/draco/`) e passe `dracoDecoderPath="/draco/"` para `ShowroomModel`. Não use decoder remoto: a CSP da
home aceita conexões somente da própria origem.

## Integração

Os pontos de entrada ficam em `components/home/showroom/model-manifest.ts`. Para substituir um conjunto
procedural, renderize o asset dentro do mesmo grupo espacial:

```tsx
<Suspense fallback={<ProceduralSofa />}>
  <ShowroomModel src={showroomModels.furniture.sofa} position={[-2.45, 0, 0.65]} />
</Suspense>
```

Chame `preloadShowroomModel` apenas para o primeiro ambiente. Suíte e cozinha devem ser carregadas depois do
canvas inicial ou quando o progresso se aproximar da transição. Preserve `castShadow`, `receiveShadow` e os
materiais glTF; não recrie materiais em cada frame.

## Coordenadas atuais

| Conjunto | Origem na cena (x, y, z) |
| --- | --- |
| Sofá | `(-2.45, 0, 0.65)` |
| Cama | `(-3.35, 0, -12.20)` |
| Ilha | `(0.50, 0, -23.30)` |
| Marcenaria da cozinha | `(0, 0, -29.72)` |

Ao exportar um ambiente inteiro, prefira manter essas coordenadas no componente React e o GLB com origem
local limpa. Assim a câmera, os portais e os textos laterais não precisam mudar.
