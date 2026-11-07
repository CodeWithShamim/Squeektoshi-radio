/**
 * Scroll Story & Camera Choreography
 * Scrubbed camera path using GSAP + ScrollTrigger across the 5 chapters:
 * 1. Hero: Wheel at distance, slowly turning.
 * 2. Chapter 01: Camera dollies into the rim; magnets stream past like a ruler.
 * 3. Chapter 02: The ring fills like a gauge (block progress), chord-change flash across rim.
 * 4. Chapter 03: Camera pulls back through the wheel; orbiting Squeek voices light up.
 * 5. Closing: Wheel centred, large Launch.
 * 
 * Masked text reveals using cubic-bezier(0.22, 1, 0.36, 1).
 * Respects prefers-reduced-motion by skipping scroll scrub.
 */

import { gsap } from '../../vendor/gsap.js';
import { ScrollTrigger } from '../../vendor/ScrollTrigger.js';

gsap.registerPlugin(ScrollTrigger);

export function initScrollStory(scene) {
  // If user prefers reduced motion, do not bind camera scrub
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !scene) {
    document.querySelectorAll('.mask-line').forEach((line) => {
      line.style.transform = 'none';
    });
    return;
  }

  // 1. Text reveals per chapter
  const sections = document.querySelectorAll('.scroll-section');
  sections.forEach((section) => {
    const lines = section.querySelectorAll('.mask-line');
    if (lines.length > 0) {
      gsap.fromTo(
        lines,
        { yPercent: 105 },
        {
          yPercent: 0,
          duration: 0.6,
          ease: 'power3.out', // cubic-bezier(0.22, 1, 0.36, 1)
          stagger: 0.08,
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }
  });

  // 2. Continuous Master Camera Scrub Timeline
  const cam = scene.cameraProgress;
  const masterTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: '.scroll-viewport',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2, // Smooth interpolation with no jank
    },
  });

  // Chapter 01: Dolly close into the rim
  masterTimeline.to(
    cam,
    {
      posX: 2.3,
      posY: 0.4,
      posZ: 3.6,
      lookX: 2.7,
      lookY: 0.2,
      lookZ: 0,
      gaugeRatio: 0.15,
      squeekGlow: 0,
      ease: 'none',
      duration: 1,
    },
    'chapter01'
  );

  // Chapter 02: Ring fills like a gauge, chord flash
  masterTimeline.to(
    cam,
    {
      posX: 0,
      posY: 1.1,
      posZ: 5.8,
      lookX: 0,
      lookY: 0.6,
      lookZ: 0,
      gaugeRatio: 0.85,
      squeekGlow: 0,
      ease: 'none',
      duration: 1,
    },
    'chapter02'
  );

  // Chapter 03: Pulls back through wheel, Squeek ring lights up
  masterTimeline.to(
    cam,
    {
      posX: -0.6,
      posY: -0.2,
      posZ: 10.2,
      lookX: 0,
      lookY: 0,
      lookZ: 0,
      gaugeRatio: 0.35,
      squeekGlow: 0.9,
      ease: 'none',
      duration: 1,
    },
    'chapter03'
  );

  // Closing: Wheel centered, large Launch
  masterTimeline.to(
    cam,
    {
      posX: 0,
      posY: 0,
      posZ: 8.8,
      lookX: 0,
      lookY: 0,
      lookZ: 0,
      gaugeRatio: 0.2,
      squeekGlow: 0.1,
      ease: 'none',
      duration: 1,
    },
    'closing'
  );
}
