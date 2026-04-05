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
- Hosted on `curiosity.astrofra.com` (user will do it)

---

## 🧱 Architecture Overview

### 0. Constraints & guidelines
- Static website for the frontend
- No NodeJS
- No build step requiring NodeJS
- Frontend must be plain HTML / CSS / vanilla JS (except for ThreeJS)
- Use PHP endpoints only where server-side behavior is required
- Typical PHP use cases: file upload, item listing, item metadata retrieval, GLB upload

### 1. Frontend (Public)
- Submission form (upload + metadata)
- Museum viewer (ThreeJS swipe interface)

### 2. Backend (Lightweight API via PHP endpoints)
- Handles uploads
- Stores files + metadata on disk
- Provides small PHP endpoints only when needed

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

### POST /api/upload.php
- Upload image + metadata
- Creates new item folder

### GET /api/items.php
- Returns index.json

### GET /api/item.php?id=<id>
- Returns meta.json

### POST /api/upload-model.php?id=<id>
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
- POST to /api/upload.php
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
- PHP endpoints
- Local file storage on disk
- No NodeJS runtime

### Deployment
- Static HTML/CSS/JS pages plus a few PHP scripts
- Requires a PHP-capable host for the upload and data endpoints
- No Node server

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
