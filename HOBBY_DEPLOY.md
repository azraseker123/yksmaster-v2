# Vercel Hobby deployment

This build uses a single physical Vercel Function: `api/index.js`.
All existing `/api/...` URLs are rewritten to that router by `vercel.json`, while the original handlers live under `handlers/` and therefore do not count as separate Vercel Functions.

Required environment variables are documented in `.env.example`.
