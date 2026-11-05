# SVP Market GLB export audit — 5 November 2026

## Received file
- ZIP: `ImageToStl.com_ad-6+for+git+hub.zip`
- GLB inside: `ad-6 for git hub.glb`
- GLB size: **986,040,436 bytes** (~986 MB decimal)
- Valid binary glTF 2.0 container header; generator is `ImageToStl.com`
- Embedded JSON section: **783,458,348 bytes** (~783 MB)
- Streaming inspection detected about **1,104,029 mesh primitive records**.

## Decision
**Do not commit or deploy this raw GLB.** It is too large and has extreme mesh fragmentation for a reliable interactive desktop/standalone VR experience. The user's original GLB and SKP remain outside public GitHub.

## Next steps
1. Reopen the original SketchUp model and simplify imported components, excess faces, tiny objects and repeated detail.
2. Re-export with component instancing where supported, or process with Blender to join meshes by material and reduce draw calls.
3. Reduce textures and geometry, then export GLB again.
4. Validate dimensions, orientation, retained textures and architectural appearance.
5. Target a test asset below ~150 MB initially, potentially substantially smaller for standalone VR.
6. Integrate only after the optimized model is validated.

Note: These counts came from GLB streaming metadata inspection, not a full visual geometry/render verification.
