# Strong Vicky V2 – layout reset

Dit is de schone React + Vite codebase met de afgesproken premium layout als vaste visuele basis.

## Netlify
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Base directory: leeg

## Environment variables
Voor Supabase sync:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Voor AI Coach:
- `OPENAI_API_KEY`
- optioneel: `OPENAI_MODEL`

## Supabase
Voer `supabase/setup.sql` uit in de SQL Editor.
Redeploy 24-09
