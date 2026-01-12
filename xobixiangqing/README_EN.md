# xobi

xobi is an AI e-commerce image generator for **main images** (default `1:1`) and **detail pages** (default `3:4`). It supports per-image custom aspect ratios and a **Product Replace** workflow (reference composition + your product image).

## Features
- One-line product brief → generate a multi-image set (hero + detail pages)
- Batch generate copy & images (per-image aspect ratio override)
- Upload template/material images to keep a consistent style
- Product Replace: reference image + your product image → new e-commerce image
- Export: single image download, or JPG ZIP bundle

## Default Aspect Ratios
- Main image: `1:1`
- Detail pages: `3:4`
- You can override the ratio for each image (e.g. `4:5`, `9:16`, `16:9`)

## Quick Start (Docker)
1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` (optionally `OPENAI_API_BASE` for proxy providers).
2. Run: `docker compose up --build`
3. Open:
   - Frontend: `http://localhost:3000`
   - Backend health: `http://localhost:5000/health`

## Local Development
Backend:
```bash
cd backend
uv run python app.py
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## References
- `电商参考.txt`: e-commerce structure & copy examples

