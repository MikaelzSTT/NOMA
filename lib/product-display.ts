const PADOVA_PUBLIC_NAME = "Sofá Padova By Natuzzi Group";

export function getProductDisplayTitle(title: string, market: "BR" | "US" = "BR") {
  if (market !== "BR") return title;

  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  return /\bpadova\b/.test(normalized) ? PADOVA_PUBLIC_NAME : title;
}
