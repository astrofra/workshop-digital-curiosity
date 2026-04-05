# Curiosity Museum — Implementation Plan

## 🎯 Goal
Build a **data-driven virtual museum** where participants:
- Upload an image
- Write a short description

Admin:
- Retrieves submissions
- Generates 3D models (GLB via Meshy or similar)
- Uploads models back

Frontend:
- Displays objects in a swipeable ThreeJS interface

Deployment:
- Hosted on `curiosity.astrofra.com`

---

## 🧱 Architecture Overview

### 1. Frontend (Public)
- Submission form (upload + metadata)
- Museum viewer (ThreeJS swipe interface)

### 2. Backend (Lightweight API)
- Handles uploads
- Stores files + metadata
- Provides API endpoints

### 3. Admin Interface
- Lists submissions
- Download images
- Upload GLB files

---

## 📁 Data Structure

```
/data/
  /items/
    /<id>/
      image.png
      model.glb (optional)
      meta.json
  index.json
```

---

## 📄 meta.json format

```json
{
  "name": "Relique oscillante",
  "description": "Stabilise les rêves collectifs.",
  "author": "Alice",
  "created_at": "2026-04-05",
  "has_model": false
}
```

---

## 🔌 API Design

### POST /api/upload
- Upload image + metadata
- Creates new item folder

### GET /api/items
- Returns index.json

### GET /api/items/:id
- Returns meta.json

### POST /api/items/:id/model
- Upload GLB file
- Updates has_model = true

---

## 🖥️ Submission Interface

### Features
- File upload (image)
- Text fields:
  - name
  - description
  - author (optional)
- Submit button

### Behavior
- POST to /api/upload
- Show confirmation

---

## 🔐 Admin Interface

### Access
- Protected route: /admin (simple password or token)

### Features
- List all submissions
- Preview images
- Download images
- Upload GLB per item

---

## 🌐 Museum Interface (ThreeJS)

### Core Features
- Load index.json
- Navigate items (swipe / arrows)
- Load GLB dynamically
- Display metadata

### Visual Setup
- Dark grey cyclorama background
- Ground plane
- Spotlight (shadow enabled)
- Ambient light (low intensity)

### Interaction
- Auto-rotate model
- Drag to rotate
- Swipe navigation

---

## 🧠 Logic Flow

1. Load index.json
2. For current item:
   - Load meta.json
   - If model exists → load GLB
3. Render scene
4. Handle navigation

---

## ⚙️ Tech Stack

### Frontend
- HTML / CSS / Vanilla JS
- ThreeJS

### Backend
- Node.js (Express) or simple serverless (Vercel / Netlify functions)
- File storage (local or S3-like)

### Deployment
- Static frontend → GitHub Pages or Vercel
- API → Vercel / Render / Node server

---

## 🧩 Optional Enhancements

- Fade transitions between objects
- Grid overview mode
- QR code for each object
- Export full dataset

---

## 🚀 Implementation Steps

### Phase 1 — MVP
- [ ] Upload form
- [ ] Store image + JSON
- [ ] Basic admin list

### Phase 2 — Pipeline
- [ ] Admin GLB upload
- [ ] Update metadata

### Phase 3 — Viewer
- [ ] ThreeJS viewer
- [ ] Navigation
- [ ] Lighting setup

### Phase 4 — Polish
- [ ] UI improvements
- [ ] Transitions
- [ ] Mobile support

---

## 🧪 Testing Checklist

- Upload works
- Files stored correctly
- Admin sees submissions
- GLB upload works
- Viewer loads models
- Swipe navigation works

---

## 📦 Deliverable

A fully functional:
- Submission system
- Admin panel
- Virtual museum

Accessible via:
👉 https://curiosity.astrofra.com

---

## 🧠 Conceptual Layer (important)

This system acts as:
- A **speculative archive**
- A **machine-interpreted museum**
- A **collective artifact generator**

The imperfections of reconstruction are part of the meaning.

