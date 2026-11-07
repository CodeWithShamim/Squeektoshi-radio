/**
 * Launch Transition Manager
 * - Prefetches app.html on hover/focus.
 * - On click: 0.9s camera push through wheel center + amber line sweep wipe.
 * - Navigates cleanly to app.html.
 * - Bypassed instantly when prefers-reduced-motion is active.
 */

import { gsap } from '../../vendor/gsap.js';

let isTransitioning = false;

/**
 * Injects <link rel="prefetch" href="app.html"> into head.
 */
function prefetchApp() {
  if (document.querySelector('link[rel="prefetch"][href="app.html"]')) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = 'app.html';
  document.head.appendChild(link);
}

/**
 * Execute the 0.9s push-through & amber wipe transition.
 */
function handleLaunchClick(e, scene, targetHref) {
  // Allow new-tab / middle click
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
    return;
  }

  // Respect reduced-motion: instant navigation
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !scene) {
    return; // let default link navigation occur
  }

  e.preventDefault();
  if (isTransitioning) return;
  isTransitioning = true;

  // 1. Camera pushes through the center of the wheel (posZ -> -1.5)
  const cam = scene.cameraProgress;
  gsap.to(cam, {
    posX: 0,
    posY: 0,
    posZ: -1.2,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    duration: 0.85,
    ease: 'power3.in',
  });

  // 2. Amber Wipe Line sweeps across the screen
  const wipe = document.getElementById('wipe-overlay');
  if (wipe) {
    wipe.classList.add('active');
  }

  // 3. Navigate to app.html
  setTimeout(() => {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        window.location.href = targetHref;
      });
    } else {
      window.location.href = targetHref;
    }
  }, 780);
}

export function initLaunchTransitions(scene) {
  const launchLinks = document.querySelectorAll('a[href="app.html"]');
  launchLinks.forEach((link) => {
    // Hover & focus prefetch
    link.addEventListener('mouseenter', prefetchApp, { passive: true });
    link.addEventListener('focus', prefetchApp, { passive: true });

    // Click transition
    link.addEventListener('click', (e) => {
      handleLaunchClick(e, scene, link.href);
    });
  });
}

