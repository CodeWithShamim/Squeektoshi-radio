/**
 * Landing Page Master Coordinator
 * Connects 3D Scene, Live HUD, Scroll Narrative, and Launch Flow.
 */

import { LandingScene } from './scene.js';
import { initHUD } from './hud.js';
import { initScrollStory } from './scroll.js';
import { initLaunchTransitions } from './transition.js';

let scene = null;

export function getLandingScene() {
  return scene;
}

function init() {
  const canvas = document.getElementById('webgl-canvas');
  if (canvas) {
    try {
      scene = new LandingScene(canvas);
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to static SVG wheel:', err);
      document.body.classList.add('webgl-fallback');
    }
  }

  // Live Telemetry HUD (<= once every 5 seconds)
  initHUD((telemetry) => {
    if (scene) {
      scene.setTelemetry(telemetry);
    }
  });

  // GSAP ScrollTrigger narrative
  initScrollStory(scene);

  // Launch transition & prefetching
  initLaunchTransitions(scene);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
