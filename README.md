# Poorna Market — Interactive Architectural Website

An architectural exhibition website for the **Re-development of Poorna Market**, built from the student's actual presentation panel and 3D model.

## Features

- Responsive, editorial architecture portfolio UI
- Genuine project drawings and imagery derived from `Pre Final Panel.pdf`
- Actual **SVP Market** glTF model, consolidated from 235,816 original mesh primitives into 39 material batches
- Three.js desktop orbit, plan view, and first-person walkthrough (`W A S D`; click viewport for pointer lock; `Esc` to release)
- Immersive WebXR entry for supported VR headsets and browsers, with basic floor teleportation
- Model download progress, GLB upload and loading-error handling
- Drawing filters, lightbox, keyboard accessibility and reduced-motion support

## Start locally

This is a **static website**, with no npm build step. Start any local HTTP server:

```bash
python -m http.server 8080
```

Then open http://localhost:8080 . Do not use the `file://` protocol because modules and GLB loading require a local HTTP server.

The 3D viewer imports Three.js 0.180.0 using a browser import map from jsDelivr. **An internet connection is needed** for the initial Three.js modules and Google Fonts. The rest of the website loads even if those services are unavailable. Load the model by clicking **Load the actual market model**. It downloads approximately 79 MB.

## Deploying

Upload the **contents of this folder** to a static host (including `models/svp-market-optimized.glb`), such as Vercel. Vercel can import a GitHub repository with this source, with Framework Preset set to **Other**, no build command, and output directory `.` (project root). Run the website on HTTPS for WebXR.

**Important:** A 79 MB model is still large; hosting transfer limits, standalone headset GPU capacity, network speed and device memory will impact VR experience. Real headset benchmarking is required. A loading progress bar doesn't improve runtime rendering performance.

## 3D model audit

| Property | Value |
| --- | ---: |
| Original uploaded GLB | 221 MB |
| Original mesh primitives | 235,816 |
| Batched model GLB | ~79.3 MB |
| Batched mesh primitives | 39 |
| Geometry topology | Original indexed faces expanded into material-batched triangles; no intended polygon decimation |
| Materials | 39 |
| Images | 12; recompressed from PNG to JPEG (opaque textures) |
| Bounding dimensions | approximately 91.76 × 19.2 × 75.67 metres |

The optimized geometry has original node transforms baked into world space, preserving material groupings and the intended architectural shape. Textures are lossy-recompressed JPEG and may show slight color/quality differences. **The complete model has not been visually compared against SketchUp or headset-tested**. The original SKP and larger GLB remain unchanged and should be retained as backups.

## Project structure

- `index.html`, `styles.css`, `main.js`: content, visual design and site UI
- `viewer.js`: interactive Three.js desktop/WebXR experience
- `assets/`: genuine architectural presentation imagery, sourced from the student PDF
- `models/svp-market-optimized.glb`: consolidated architectural model
- `vercel.json`: hosting configuration

## Source attribution

Architectural content and panel imagery: student-provided *Pre Final Panel.pdf*, labelled **RE-DEVELOPMENT OF POORNA MARKET**. Project title, program, typologies, floors, elevations, sections and urban context are grounded in the panel. Generic narrative text is interpretive presentation copy, not a claim of independently verified site data.
