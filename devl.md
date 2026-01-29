# lib5 Development Guide

## Monorepo Structure

```
lib5/
├── apps/
│   ├── imageflow/          # Image processing node editor (if.lib5.com)
│   └── pdfedit/            # PDF text editor
├── node_modules/           # Shared hoisted dependencies
├── package.json            # Root workspace config
└── tsconfig.json           # Shared base TypeScript config
```

## Quick Start

```bash
# Install all dependencies
npm install

# Start default app (imageflow)
npm run dev
```

## Apps

### ImageFlow (`apps/imageflow/`)

Node-based image processing editor with GPU acceleration.

| Port | Domain |
|------|--------|
| 3000 | if.lib5.com |

**Commands:**
```bash
npm run dev:imageflow    # Start dev server
npm run build:imageflow  # Build for production
npm run preview          # Preview production build
```

**Tech Stack:**
- React + TypeScript
- Zustand (state management)
- WebGL/TWGL.js (GPU rendering)
- Tailwind CSS

---

### PDF Edit (`apps/pdfedit/`)

Native PDF text editor - edit text line by line without external extensions.

| Port | Domain |
|------|--------|
| 3001 | pdf.lib5.com |

**Commands:**
```bash
npm run dev:pdfedit      # Start dev server
npm run build:pdfedit    # Build for production
npm run preview:pdfedit  # Preview production build
```

**Tech Stack:**
- React + TypeScript
- pdfjs-dist (PDF rendering & text extraction)
- pdf-lib (PDF modification & saving)
- Tailwind CSS

**Features:**
- Load and render PDF pages natively in browser
- Extract all text with positions automatically
- Edit text line-by-line in sidebar (click to edit)
- Visual highlighting of modified text on canvas
- Zoom control for preview
- Page navigation
- Download edited PDF with changes applied
- Modified items highlighted in yellow

---

## Adding a New App

1. Create app directory:
   ```bash
   mkdir -p apps/newapp/src
   ```

2. Copy config files from an existing app:
   ```bash
   cp apps/pdfedit/package.json apps/newapp/
   cp apps/pdfedit/vite.config.ts apps/newapp/
   cp apps/pdfedit/tsconfig.json apps/newapp/
   cp apps/pdfedit/tsconfig.node.json apps/newapp/
   cp apps/pdfedit/tailwind.config.js apps/newapp/
   cp apps/pdfedit/postcss.config.js apps/newapp/
   cp apps/pdfedit/index.html apps/newapp/
   ```

3. Update `apps/newapp/package.json`:
   - Change `"name"` to your app name
   - Adjust dependencies as needed

4. Update `apps/newapp/vite.config.ts`:
   - Change port to avoid conflicts

5. Add scripts to root `package.json`:
   ```json
   "dev:newapp": "npm run dev -w newapp",
   "build:newapp": "npm run build -w newapp"
   ```

6. Install dependencies:
   ```bash
   npm install
   ```

## All Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Start imageflow (default) |
| `npm run dev:imageflow` | Start imageflow on port 3000 |
| `npm run dev:pdfedit` | Start pdfedit on port 3001 |
| `npm run build` | Build imageflow |
| `npm run build:imageflow` | Build imageflow |
| `npm run build:pdfedit` | Build pdfedit |
| `npm run preview` | Preview imageflow build |
| `npm run preview:pdfedit` | Preview pdfedit build |
