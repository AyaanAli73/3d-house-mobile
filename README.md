# Cozy Cottage — Mobile Performance Edition

## Quick start (Windows)
1. Extract this ZIP fully.
2. Open the `cottage_cinematic_mobile_optimized_project` folder.
3. Double-click `run_local.bat` or open the folder in VS Code and use Live Server.
4. Keep an internet connection active for Three.js modules hosted on jsDelivr.

The batch launcher uses port `8001` so an older copy on `localhost:8000` can stay open.

## Mobile performance work
- Mobile uses a single direct WebGL scene render. Desktop-only SSAO/bloom post-processing modules are not imported on mobile.
- Mobile uses glossy PBR water with an animated scrolling normal map instead of rendering a second full-scene planar reflection every frame. This retains moving ripples/highlights while removing one large duplicate scene render.
- Mobile grass keeps the same curved/tapered appearance but uses three blades and fewer subdivisions per tuft; up to 96,000 instances are allocated, with a balanced starting draw count.
- The terrain, meadow, trees, house materials, cloud layers, mountains, and weather visuals remain in the scene. Pixel ratio adaptively decreases only if frame time stays high and recovers when performance improves.
- Mobile shadow maps are capped to 1024px and are updated on time-of-day changes instead of every frame. Most tiny vegetation props do not cast individual shadow maps; the cottage remains the important silhouette caster.
- Rain uses mobile-specific particle/ripple counts and updates at 24Hz, while the camera and render loop keep updating independently.
- Rain material changes no longer force every material through a shader recompilation when toggled.

## Controls
- Drag to orbit; pinch to zoom.
- On narrow/touch screens, use the **Controls** drawer for camera views, quality, rain, time-of-day, shadows and export.
- Quality presets: Cinematic / Balanced / Performance. Mobile starts in Balanced at a crisp pixel ratio; adaptive resolution can lower raster scale (not scene geometry/material detail) if frame time stays high.
- Motion blur and screen-space post-processing remain desktop-only because they are expensive on mobile GPUs.

## Fidelity note
Desktop keeps Three.js Water.js planar reflections and the cinematic post-processing chain. Mobile's river uses animated PBR normal-map ripples and environment lighting to achieve a similar glossy result at lower GPU cost; it is not a full reflection pass or fluid-dynamics simulation. This project uses WebGL, not hardware ray tracing.
