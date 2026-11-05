# Poorna Market — website implementation ready

The 9th-semester architectural website has been developed from the user's real project materials.

## Prepared deliverable
The completed source package is attached to the ChatGPT conversation as **Poorna-Market-VR-Website.zip** (approximately 14.7 MB compressed). It has not been automatically pushed to this repository.

Source contents:
- `index.html` — architectural exhibition site
- `styles.css` — responsive design system
- `main.js` — navigation, drawings gallery, filter/lightbox interactions
- `viewer.js` — Three.js orbit, first-person walkthrough, top plan and WebXR entry
- `assets/*.webp` — actual presentation drawings extracted from the PDF
- `models/svp-market-optimized.glb` — **actual model**, not a fabricated demonstration building
- `vercel.json` — deployment settings
- `README.md` — setup and technical details

## Model optimization
- Initial model: 221 MB, 235,816 mesh primitives
- Batched export: about 79.3 MB, **39 material-batched mesh primitives**
- Original polygon topology preserved through deindexing/mesh batching (no deliberate decimation)
- 12 textures recompressed to JPEG (they were all opaque)
- Bounds: approximately 91.76 × 19.2 × 75.67 m

## Publication requirements
To publish the fully functional website:
1. Extract the full ZIP locally.
2. Commit **all extracted files, including `models/svp-market-optimized.glb`** to this repository. The model is below GitHub's 100-MB per-file limit, though Git LFS/object storage can be used if preferred.
3. Import the repository into Vercel with Framework Preset `Other`, no build command, root output directory `.`.
4. Verify the deployed HTTPS URL, assets, model loading and real headset compatibility.

Vercel listed no teams or existing projects through the connected account at delivery time. Automated deployment could not be completed.

## Quality status
- HTML static asset references validated locally
- JS syntax checked with Node
- GLB binary structure, bufferView bounds, material/image links and archive integrity verified
- Live browser screenshots and physical headset testing **not yet completed**

Do not claim production VR verification until tested on the actual headset.
