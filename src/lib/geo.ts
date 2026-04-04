/**
 * Calcula distância entre dois pontos usando a fórmula de Haversine.
 * @returns distância em metros
 */
export function calcularDistancia(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Verifica se uma posição está dentro do raio permitido.
 */
export function dentroDoRaio(
  latCorretor: number,
  lonCorretor: number,
  latEmpreendimento: number,
  lonEmpreendimento: number,
  raioMetros: number
): { valido: boolean; distancia: number } {
  const distancia = calcularDistancia(
    latCorretor,
    lonCorretor,
    latEmpreendimento,
    lonEmpreendimento
  )
  return {
    valido: distancia <= raioMetros,
    distancia: Math.round(distancia),
  }
}
