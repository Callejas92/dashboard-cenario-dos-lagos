export interface Corretor {
  id: string
  nome: string
  creci: string
  role: "admin" | "corretor"
  ativo: boolean
  created_at: string
}

export interface Empreendimento {
  id: string
  nome: string
  endereco: string | null
  latitude: number
  longitude: number
  raio_metros: number
  ativo: boolean
  created_at: string
}

export interface Checkin {
  id: string
  corretor_id: string
  empreendimento_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  distancia_metros: number
  status: "valido" | "rejeitado"
  device_info: Record<string, unknown> | null
  created_at: string
}

export interface CheckinComDetalhes extends Checkin {
  corretor: Corretor
  empreendimento: Empreendimento
}
