export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ error: 'OPENAI_API_KEY ontbreekt' }, { status: 503 })
  const body = await req.json()
  const prompt = `Je bent Strong Vicky Coach. Geef feedback in het Nederlands. Wees eerlijk, direct, menselijk en feitelijk. Geen suikerlaag en geen standaardcomplimenten. Complimenteer alleen als de data dat verdient. Trek geen grote conclusie uit één losse dag of één losse week. Vergelijk met eerdere weken, benoem inconsistentie en zeg ook duidelijk als er geen aanpassing nodig is. Geen medische diagnoses. Structuur: 1) Wat de data zegt, 2) Wat goed ging, 3) Wat beter moet, 4) Advies voor volgende week.\n\nHuidige week:\n${JSON.stringify(body.current)}\n\nHistorie:\n${JSON.stringify(body.history)}\n\nOpmerking gebruiker:\n${body.note || 'geen'}`
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.6-mini', input: prompt })
  })
  const data = await r.json()
  if (!r.ok) return Response.json({ error: data?.error?.message || 'OpenAI fout' }, { status: 500 })
  return Response.json({ feedback: data.output_text || 'Geen feedback ontvangen.' })
}
