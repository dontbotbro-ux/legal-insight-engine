# LawyerBot

Legal document analysis app built with React, Vite, and local/PDF-backed intelligence workflows.

## Stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Supabase schema

Migration added:

- `supabase/migrations/202603010001_legal_intelligence_engine.sql`

Apply with Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or run the migration contents in the Supabase SQL editor.
