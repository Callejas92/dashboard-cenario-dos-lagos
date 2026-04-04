import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"
import { dentroDoRaio } from "@/lib/geo"

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }

  const body = await request.json()
  const { latitude, longitude, accuracy, empreendimento_id } = body

  if (!latitude || !longitude || !empreendimento_id) {
    return NextResponse.json(
      { error: "Dados incompletos: latitude, longitude e empreendimento_id sao obrigatorios" },
      { status: 400 }
    )
  }

  if (accuracy && accuracy > 100) {
    return NextResponse.json(
      { error: "Precisao do GPS insuficiente. Tente novamente em local aberto.", accuracy },
      { status: 422 }
    )
  }

  const supabase = await createServiceSupabase()

  const { data: empreendimento, error: empError } = await supabase
    .from("empreendimentos")
    .select("*")
    .eq("id", empreendimento_id)
    .eq("ativo", true)
    .single()

  if (empError || !empreendimento) {
    return NextResponse.json(
      { error: "Empreendimento nao encontrado ou inativo" },
      { status: 404 }
    )
  }

  const { valido, distancia } = dentroDoRaio(
    latitude, longitude,
    empreendimento.latitude, empreendimento.longitude,
    empreendimento.raio_metros
  )

  const status = valido ? "valido" : "rejeitado"

  const deviceInfo = {
    userAgent: request.headers.get("user-agent"),
    platform: body.platform || null,
  }

  const { data: checkin, error: insertError } = await supabase
    .from("checkins")
    .insert({
      corretor_id: session.id,
      empreendimento_id,
      latitude, longitude, accuracy,
      distancia_metros: distancia,
      status,
      device_info: deviceInfo,
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Voce ja fez check-in neste empreendimento hoje." },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: "Erro ao salvar check-in", details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    checkin, status, distancia,
    raio: empreendimento.raio_metros,
    mensagem: valido
      ? `Check-in valido! Voce esta a ${distancia}m do empreendimento.`
      : `Check-in rejeitado. Voce esta a ${distancia}m (maximo: ${empreendimento.raio_metros}m).`,
  })
}
