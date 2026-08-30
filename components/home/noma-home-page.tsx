import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MoveRight } from "lucide-react";
import { HomeFooter } from "@/components/home/home-footer";
import { HomeHeader } from "@/components/home/home-header";
import { HomeMotion } from "@/components/home/home-motion";
import { ImmersiveHouse } from "@/components/home/immersive-house";
import styles from "@/components/home/noma-home.module.css";
import { getHomeData } from "@/lib/catalog";
import { MARKET_CONFIG, categoryPath, productPath, searchPath, type Market } from "@/lib/market";
import { formatMoney } from "@/lib/utils";

const rooms = [
  {
    name: "Sala",
    note: "Estar · 26 peças",
    image: "/images/noma/living-room.webp",
    alt: "Sala Noma em linho, travertino e nogueira",
    className: styles.roomLiving,
    position: "center",
  },
  {
    name: "Quarto",
    note: "Descanso · 18 peças",
    image: "/images/noma/bedroom.webp",
    alt: "Quarto Noma em tons naturais",
    className: styles.roomBedroom,
    position: "center",
  },
  {
    name: "Cozinha",
    note: "Encontro · sob medida",
    image: "/images/noma/kitchen.webp",
    alt: "Cozinha Noma com ilha de travertino",
    className: styles.roomKitchen,
    position: "center",
  },
  {
    name: "Home Office",
    note: "Foco · 12 peças",
    image: "/images/noma/home-office.webp",
    alt: "Home office com marcenaria de nogueira",
    className: styles.roomOffice,
    position: "center",
  },
  {
    name: "Planejados",
    note: "Projeto · feito para você",
    image: "/images/noma/home-office.webp",
    alt: "Marcenaria Noma desenhada para o espaço",
    className: styles.roomPlanned,
    position: "left center",
  },
];

const materials = [
  ["01", "Nogueira", "Origem responsável, acabamento fosco"],
  ["02", "Linho", "Trama natural, toque que melhora com o tempo"],
  ["03", "Couro", "Curtimento vegetal e pátina particular"],
  ["04", "Pedra", "Veios únicos, selecionados um a um"],
];

function getDiscountLabel(sellingPrice: number | null, compareAtPrice: number | null, discountPercent: number | null) {
  if (discountPercent && discountPercent > 0) return `${Math.round(discountPercent)}% OFF`;
  if (!sellingPrice || !compareAtPrice || compareAtPrice <= sellingPrice) return null;
  return `${Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 100)}% OFF`;
}

export async function NomaHomePage({ market }: { market: Market }) {
  const config = MARKET_CONFIG[market];
  const isUS = market === "US";
  const { products } = await getHomeData({ market });
  const categories = Array.from(
    new Map(products.map((product) => [product.category.slug, product.category])).values(),
  );
  const showCategoryRail = categories.length >= 3;

  return (
      <div className={`noma-home ${styles.home}`} data-noma-home>
      <HomeMotion />
      <HomeHeader market={market} />
      <ImmersiveHouse />

      <section className={styles.productsSection} id="colecao-produtos">
        <div className={styles.shell}>
          <div className={styles.productsHeading} data-reveal>
            <div>
              <p className={styles.kicker}>{isUS ? "Noma Store" : "Loja Noma"}</p>
              <h2>{isUS ? "Featured products" : "Produtos em destaque"}</h2>
              <p className={styles.productsSubhead}>
                {isUS ? "Selected pieces from the US catalog with price, category, and availability in one place." : "Peças selecionadas do catálogo com preço, categoria e disponibilidade em um só lugar."}
              </p>
            </div>
            <Link href={searchPath(market)} className={styles.roundLink} aria-label={isUS ? "View all products" : "Ver todos os produtos"}>
              <ArrowRight aria-hidden="true" size={22} />
            </Link>
          </div>

          <div className={styles.storeProductGrid} data-home-product-count={products.length}>
            {products.map((product, index) => {
              const image = product.images[0];
              const discountLabel = getDiscountLabel(product.sellingPrice, product.compareAtPrice, product.discountPercent);
              const badge = product.attributes.badge ? String(product.attributes.badge) : null;

              return (
                <article
                  className={styles.storeProductCard}
                  data-reveal
                  key={product.id}
                  style={{ transitionDelay: `${Math.min(index * 45, 180)}ms` }}
                >
                  <Link href={productPath(market, product.slug)} aria-label={`${isUS ? "View" : "Ver"} ${product.title}`}>
                    <div
                      className={styles.storeProductImage}
                      role="img"
                      aria-label={image?.alt ?? product.title}
                      style={
                        {
                          "--product-image": `url("${image?.url ?? ""}")`,
                          "--product-x": image?.url === "/images/noma/products.webp" ? `${Number(product.attributes.spriteColumn ?? 0) * 50}%` : "center",
                          "--product-y": image?.url === "/images/noma/products.webp" ? `${Number(product.attributes.spriteRow ?? 0) * 100}%` : "center",
                          "--product-size": image?.url === "/images/noma/products.webp" ? "300% 200%" : "cover",
                        } as CSSProperties
                      }
                    >
                      {discountLabel && <span className={styles.storeDiscount}>{discountLabel}</span>}
                      {badge && <span className={styles.storeBadge}>{badge}</span>}
                    </div>
                    <div className={styles.storeProductBody}>
                      <p className={styles.storeCategory}>{product.category.name}</p>
                      <h3>{product.title}</h3>
                      <div className={styles.storePriceRow}>
                        {product.sellingPrice ? (
                          <strong>{formatMoney(product.sellingPrice, product.currency, config.locale)}</strong>
                        ) : (
                          <strong>{isUS ? "Upon request" : "Sob consulta"}</strong>
                        )}
                        {product.compareAtPrice && product.sellingPrice && product.compareAtPrice > product.sellingPrice && (
                          <span>{formatMoney(product.compareAtPrice, product.currency, config.locale)}</span>
                        )}
                      </div>
                      {product.estimatedDelivery && <p className={styles.storeDelivery}>{product.estimatedDelivery}</p>}
                      <span className={styles.storeCardCta}>
                        {isUS ? "View product" : "Ver produto"} <ArrowUpRight aria-hidden="true" size={14} />
                      </span>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>

          {showCategoryRail && (
            <nav className={styles.categoryRail} aria-label="Atalhos do catálogo" data-reveal>
              <Link href={`${searchPath(market)}?sort=relevance`}>{isUS ? "Best sellers" : "Mais vendidos"}</Link>
              {categories.map((category) => (
                <Link href={categoryPath(market, category.slug)} key={category.id}>
                  {category.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      <section className={styles.manifesto} id="sobre">
        <div className={styles.shell}>
          <div className={styles.manifestoTop} data-reveal>
            <p className={styles.kicker}>{isUS ? "Our point of view" : "Nossa forma de pensar"}</p>
            <span>{isUS ? "Sao Paulo · since 2008" : "São Paulo · desde 2008"}</span>
          </div>
          <div className={styles.manifestoGrid}>
            <p className={styles.manifestoNumber} data-reveal>
              (01)
            </p>
            <h2 data-reveal>
              {isUS ? "Furniture and interiors" : "Mobiliário e interiores"}
              <br />
              {isUS ? "designed as" : "pensados como"}
              <br />
              <em>{isUS ? "one complete project." : "um só projeto."}</em>
            </h2>
            <div className={styles.manifestoCopy} data-reveal>
              <p>
                {isUS ? "From architectural scale to the touch of fabric, every choice makes the home more intuitive, serene, and truly yours." : "Da escala da arquitetura ao toque do tecido, cada escolha existe para tornar a casa mais intuitiva, serena e verdadeiramente sua."}
              </p>
              <Link href="#inspiracao" className={styles.textLink}>
                {isUS ? "Explore our view" : "Conheça nosso olhar"} <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.roomsSection} id="ambientes">
        <div className={styles.shell}>
          <div className={styles.sectionHeader} data-reveal>
            <div>
              <p className={styles.kicker}>{isUS ? "Explore by room" : "Explore por ambiente"}</p>
              <h2>{isUS ? "A whole home," : "Uma casa inteira,"}<br />{isUS ? "one language." : "uma só linguagem."}</h2>
            </div>
            <p>
              {isUS ? "Essential pieces, generous proportions, and natural materials connect each space without repeating formulas." : "Peças essenciais, proporções generosas e materiais naturais conectam cada espaço sem repetir fórmulas."}
            </p>
          </div>

          <div className={styles.roomGrid}>
            {rooms.map((room, index) => (
              <Link
                href="#colecao-produtos"
                key={room.name}
                className={`${styles.roomCard} ${room.className}`}
                data-reveal
                style={{ transitionDelay: `${Math.min(index * 70, 210)}ms` }}
              >
                <div className={styles.roomImage}>
                  <Image
                    src={room.image}
                    alt={room.alt}
                    fill
                    sizes="(max-width: 760px) 100vw, 60vw"
                    style={{ objectPosition: room.position }}
                  />
                </div>
                <div className={styles.roomOverlay} />
                <div className={styles.roomLabel}>
                  <span>{room.note}</span>
                  <div>
                    <h3>{room.name}</h3>
                    <ArrowUpRight aria-hidden="true" size={21} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.collectionsSection} id="colecoes">
        <div className={styles.shell}>
          <div className={styles.collectionIntro} data-reveal>
            <p className={styles.kicker}>{isUS ? "Collections" : "Coleções"}</p>
            <h2>{isUS ? "Four collections. One complete system." : "Quatro coleções. Um sistema completo."}</h2>
            <p>{isUS ? "Quiet volumes, tactile textures, and a palette that lets light become part of the design." : "Volumes silenciosos, texturas táteis e uma paleta que deixa a luz fazer parte do desenho."}</p>
          </div>

          <div className={styles.collectionGrid}>
            <Link href="#colecao-produtos" className={`${styles.collectionCard} ${styles.softLiving}`} data-reveal>
              <Image src="/images/noma/living-room.webp" alt="Coleção Soft Living" fill sizes="(max-width: 800px) 100vw, 60vw" />
              <span>01 · Estar</span>
              <h3>Soft Living</h3>
              <MoveRight aria-hidden="true" size={24} />
            </Link>

            <Link href="#materiais" className={`${styles.collectionCard} ${styles.naturalForms}`} data-reveal>
              <span>02 · Matéria</span>
              <h3>Natural<br /><em>Forms</em></h3>
              <p>Curvas orgânicas encontram a honestidade dos materiais.</p>
              <MoveRight aria-hidden="true" size={24} />
            </Link>

            <Link href="#colecao-produtos" className={`${styles.collectionCard} ${styles.quietBedroom}`} data-reveal>
              <Image src="/images/noma/bedroom.webp" alt="Coleção Quiet Bedroom" fill sizes="(max-width: 800px) 100vw, 48vw" />
              <span>03 · Descanso</span>
              <h3>Quiet Bedroom</h3>
              <MoveRight aria-hidden="true" size={24} />
            </Link>

            <Link href="#planejados" className={`${styles.collectionCard} ${styles.timelessWood}`} data-reveal>
              <Image src="/images/noma/home-office.webp" alt="Coleção Timeless Wood" fill sizes="(max-width: 800px) 100vw, 48vw" />
              <span>04 · Marcenaria</span>
              <h3>Timeless Wood</h3>
              <MoveRight aria-hidden="true" size={24} />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.materialsSection} id="materiais">
        <div className={styles.materialImageWrap} data-reveal>
          <div className={styles.materialImage} data-parallax="34">
            <Image src="/images/noma/materials.webp" alt="Amostras de nogueira, linho, couro, bouclé e travertino" fill sizes="(max-width: 900px) 100vw, 58vw" />
          </div>
          <p>Matéria 04/06</p>
        </div>
        <div className={styles.materialContent}>
          <div data-reveal>
            <p className={styles.kicker}>Feito para envelhecer bem</p>
            <h2>Matéria real.<br /><em>Acabamento preciso.</em></h2>
            <p className={styles.materialLead}>
              Escolhemos materiais que guardam memória. O toque, a luz e o tempo terminam cada peça junto
              com você.
            </p>
          </div>
          <div className={styles.materialList} data-reveal>
            {materials.map(([number, name, description]) => (
              <div key={name}>
                <span>{number}</span>
                <strong>{name}</strong>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.plannedSection} id="planejados">
        <div className={styles.plannedMedia} data-reveal>
          <Image src="/images/noma/home-office.webp" alt="Biblioteca e home office com marcenaria integral sob medida" fill sizes="100vw" />
        </div>
        <div className={styles.plannedPanel} data-reveal>
          <p className={styles.kicker}>Noma Sob Medida</p>
          <span>Desenhado para o seu espaço</span>
          <h2>Precisão do projeto<br />à instalação.</h2>
          <p>
            Um processo próximo, da primeira planta à última textura. Criamos soluções que pertencem ao
            espaço — e a quem vive nele.
          </p>
          <Link href="#contato" className={styles.darkButton}>
            Planeje seu ambiente <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
      </section>

      <section className={styles.journalSection} id="inspiracao">
        <div className={styles.shell}>
          <div className={styles.journalTop} data-reveal>
            <div>
              <p className={styles.kicker}>Noma · Perspectivas</p>
              <h2>Ideias para espaços melhores.</h2>
            </div>
            <Link href="#inspiracao" className={styles.textLink}>
              Ver todos <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className={styles.journalGrid}>
            <article data-reveal>
              <div><Image src="/images/noma/kitchen.webp" alt="Luz natural em cozinha contemporânea" fill sizes="50vw" /></div>
              <span>Arquitetura · 6 min</span>
              <h3>A luz como parte do mobiliário</h3>
            </article>
            <article data-reveal>
              <div><Image src="/images/noma/materials.webp" alt="Texturas naturais de mobiliário" fill sizes="50vw" /></div>
              <span>Materiais · 4 min</span>
              <h3>Objetos que ficam melhores com o tempo</h3>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.finalCta} id="contato">
        <div className={styles.finalImage} data-parallax="28">
          <Image src="/images/noma/living-room.webp" alt="Sala Noma aberta para o jardim" fill sizes="100vw" />
        </div>
        <div className={styles.finalShade} />
        <div className={styles.finalContent} data-reveal>
          <p>Do primeiro traço à última peça.</p>
          <h2>Seu espaço,<br /><em>por inteiro.</em></h2>
          <Link href="#inicio" className={styles.lightButton}>
            Visite nosso showroom <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
