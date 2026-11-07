/**
 * 3D WebGL Scene — Squeektoshi Observatory Hamster Wheel
 * Clean precision engineering line work:
 * - Thin outer rim + inner guidance rings
 * - 16 hairline radial spokes (LineSegments)
 * - 36 instanced cylindrical magnets
 * - Fixed amber sensor gate at top
 * - Pass detection + pulse wave
 * - Pointer parallax bounded to <= 3 degrees
 * - Adaptive performance governor (< 20ms frame time)
 */

import * as THREE from '../../vendor/three.module.js';
import { incrementPassCounter } from './hud.js';

export class LandingScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.isRunning = false;
    this.disposed = false;

    // Check WebGL support
    if (!this.checkWebGLSupport()) {
      document.body.classList.add('webgl-fallback');
      return;
    }

    // Performance Governor state
    this.frameTimes = [];
    this.lastFrameTime = performance.now();
    this.targetDpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.75);

    // Wheel rotation state
    this.wheelRotation = 0;
    this.currentRotationSpeed = 0.25; // radians per second
    this.targetRotationSpeed = 0.25;
    this.lastMagnetIndex = -1;

    // Camera & Parallax state
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetMouseX = 0;
    this.targetMouseY = 0;
    this.maxParallaxAngle = (3.0 * Math.PI) / 180; // 3 degrees in radians

    // Chapter camera progression coordinates (modified by scroll.js)
    this.cameraProgress = {
      posX: 0,
      posY: 0,
      posZ: 8.8,
      lookX: 0,
      lookY: 0,
      lookZ: 0,
      gaugeRatio: 0.15,
      squeekGlow: 0,
    };

    this.initScene();
    this.initWheel();
    this.initSensorGate();
    this.initOrbitingSqueeks();
    this.initEvents();
    this.start();
  }

  checkWebGLSupport() {
    try {
      const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
      return !!gl;
    } catch {
      return false;
    }
  }

  initScene() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 8.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(this.targetDpr);
    this.renderer.setClearColor(0x000000, 0);

    // WebGL Context loss listener
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      document.body.classList.add('webgl-fallback');
    });

    // Precision Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xe9e6dc, 0.65);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe9e6dc, 1.2);
    dirLight.position.set(4, 8, 6);
    this.scene.add(dirLight);

    // Sensor Amber Point Light
    this.sensorLight = new THREE.PointLight(0xffb23e, 0.2, 5);
    this.sensorLight.position.set(0, 3.12, 0.5);
    this.scene.add(this.sensorLight);

    // Remove fallback class once WebGL is active
    document.body.classList.remove('webgl-fallback');
  }

  initWheel() {
    this.wheelGroup = new THREE.Group();
    this.scene.add(this.wheelGroup);

    const rimRadius = 2.9;
    const spokeCount = 16;
    const magnetCount = 36;

    // 1. Outer & Inner Rim (Thin Linework / Edges)
    const rimGeom = new THREE.TorusGeometry(rimRadius, 0.035, 12, 120);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe9e6dc,
      roughness: 0.4,
      metalness: 0.7,
    });
    const outerRim = new THREE.Mesh(rimGeom, rimMat);
    this.wheelGroup.add(outerRim);

    // Subtle hairline inner rim track
    const innerRimGeom = new THREE.TorusGeometry(rimRadius - 0.14, 0.008, 8, 120);
    const innerRimMat = new THREE.MeshBasicMaterial({ color: 0xe9e6dc, transparent: true, opacity: 0.25 });
    const innerRim = new THREE.Mesh(innerRimGeom, innerRimMat);
    this.wheelGroup.add(innerRim);

    // Gauge track ring (for Chapter 02 block progress fill)
    this.gaugeTrackGeom = new THREE.TorusGeometry(rimRadius + 0.08, 0.016, 8, 120, Math.PI * 2);
    this.gaugeTrackMat = new THREE.MeshBasicMaterial({
      color: 0x5b8cff,
      transparent: true,
      opacity: 0.4,
    });
    this.gaugeTrack = new THREE.Mesh(this.gaugeTrackGeom, this.gaugeTrackMat);
    this.wheelGroup.add(this.gaugeTrack);

    // 2. Central Hub
    const hubGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 32);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.3, metalness: 0.8 });
    const hub = new THREE.Mesh(hubGeom, hubMat);
    hub.rotation.x = Math.PI / 2;
    this.wheelGroup.add(hub);

    const pinGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 16);
    const pin = new THREE.Mesh(pinGeom, hubMat);
    pin.rotation.x = Math.PI / 2;
    this.wheelGroup.add(pin);

    // 3. 16 Hairline Spokes (LineSegments)
    const spokePoints = [];
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i * Math.PI * 2) / spokeCount;
      const x = Math.cos(angle) * rimRadius;
      const y = Math.sin(angle) * rimRadius;
      spokePoints.push(0, 0, 0);
      spokePoints.push(x, y, 0);
    }
    const spokeGeom = new THREE.BufferGeometry();
    spokeGeom.setAttribute('position', new THREE.Float32BufferAttribute(spokePoints, 3));
    const spokeMat = new THREE.LineBasicMaterial({
      color: 0xe9e6dc,
      transparent: true,
      opacity: 0.32,
    });
    this.spokes = new THREE.LineSegments(spokeGeom, spokeMat);
    this.wheelGroup.add(this.spokes);

    // 4. 36 Instanced Rim Magnets
    const magnetGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.09, 12);
    this.magnetMat = new THREE.MeshStandardMaterial({
      color: 0xe9e6dc,
      roughness: 0.2,
      metalness: 0.85,
    });
    this.magnets = new THREE.InstancedMesh(magnetGeom, this.magnetMat, magnetCount);

    const dummy = new THREE.Object3D();
    for (let j = 0; j < magnetCount; j++) {
      const angle = (j * Math.PI * 2) / magnetCount;
      const x = Math.cos(angle) * (rimRadius - 0.02);
      const y = Math.sin(angle) * (rimRadius - 0.02);
      dummy.position.set(x, y, 0);
      dummy.rotation.z = angle + Math.PI / 2;
      dummy.updateMatrix();
      this.magnets.setMatrixAt(j, dummy.matrix);
    }
    this.magnets.instanceMatrix.needsUpdate = true;
    this.wheelGroup.add(this.magnets);
  }

  initSensorGate() {
    // Fixed Sensor Gate at the top (world space, does not rotate)
    this.sensorGroup = new THREE.Group();
    this.sensorGroup.position.set(0, 2.92, 0);
    this.scene.add(this.sensorGroup);

    // Sensor amber arc
    const arcGeom = new THREE.TorusGeometry(0.24, 0.025, 8, 24, Math.PI);
    this.sensorArcMat = new THREE.MeshBasicMaterial({ color: 0xffb23e });
    const arc = new THREE.Mesh(arcGeom, this.sensorArcMat);
    arc.rotation.z = Math.PI;
    this.sensorGroup.add(arc);

    // Pulse Wave Ring (expands when magnet passes)
    const pulseGeom = new THREE.RingGeometry(0.04, 0.08, 24);
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffb23e,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.pulseRing = new THREE.Mesh(pulseGeom, this.pulseMat);
    this.pulseRing.position.set(0, 0.12, 0);
    this.sensorGroup.add(this.pulseRing);

    this.pulseProgress = 1.0; // 0 to 1
  }

  initOrbitingSqueeks() {
    // Chapter 03: Ring of instanced Squeek "voices"
    const squeekCount = 8;
    this.squeekGroup = new THREE.Group();
    this.scene.add(this.squeekGroup);

    const geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.squeekMat = new THREE.MeshStandardMaterial({
      color: 0x5b8cff,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.0, // hidden initially until Chapter 03
    });
    this.squeeks = new THREE.InstancedMesh(geom, this.squeekMat, squeekCount);

    const dummy = new THREE.Object3D();
    for (let k = 0; k < squeekCount; k++) {
      const angle = (k * Math.PI * 2) / squeekCount;
      dummy.position.set(Math.cos(angle) * 3.8, Math.sin(angle) * 3.8, 0);
      dummy.updateMatrix();
      this.squeeks.setMatrixAt(k, dummy.matrix);
    }
    this.squeeks.instanceMatrix.needsUpdate = true;
    this.squeekGroup.add(this.squeeks);
  }

  initEvents() {
    this.onResize = () => {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    };
    window.addEventListener('resize', this.onResize, { passive: true });

    // Pointer Parallax (bounded to <= 3 degrees)
    this.onMouseMove = (e) => {
      if (window.innerWidth < 768) return; // Disable parallax on narrow mobile screens
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.targetMouseX = normX * this.maxParallaxAngle;
      this.targetMouseY = normY * this.maxParallaxAngle;
    };
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });

    // Visibility management
    this.onVisibilityChange = () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.lastFrameTime = performance.now();
        this.start();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  setTelemetry(telemetry) {
    if (!telemetry) return;
    const rpm = telemetry.rpm || 0;
    if (telemetry.status === 'running') {
      // omega = rpm * 2 * PI / 60
      this.targetRotationSpeed = Math.max(0.3, (rpm * 2 * Math.PI) / 60);
    } else if (telemetry.status === 'asleep') {
      // calm slow idle drift
      this.targetRotationSpeed = 0.12;
    } else {
      // signal unknown: keep calm drift
      this.targetRotationSpeed = 0.18;
    }
  }

  triggerMagnetPass() {
    this.pulseProgress = 0.0;
    this.sensorLight.intensity = 1.4;
    incrementPassCounter();
  }

  update(delta) {
    // 1. Smoothly interpolate rotation speed
    this.currentRotationSpeed = THREE.MathUtils.lerp(this.currentRotationSpeed, this.targetRotationSpeed, 0.04);
    this.wheelRotation += this.currentRotationSpeed * delta;
    this.wheelGroup.rotation.z = this.wheelRotation;

    // 2. Check magnet passage across the top sensor gate (at top dead center = PI/2)
    const magnetAngleStep = (Math.PI * 2) / 36;
    // Normalize wheel angle
    const normalizedAngle = (this.wheelRotation % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const currentMagnetIndex = Math.floor(normalizedAngle / magnetAngleStep);

    if (currentMagnetIndex !== this.lastMagnetIndex) {
      this.lastMagnetIndex = currentMagnetIndex;
      this.triggerMagnetPass();
    }

    // 3. Sensor Gate Pulse Wave Animation
    if (this.pulseProgress < 1.0) {
      this.pulseProgress += delta * 2.5; // ~0.4s pulse duration
      const scale = 1.0 + this.pulseProgress * 3.5;
      this.pulseRing.scale.set(scale, scale, 1);
      this.pulseMat.opacity = Math.max(0, 1.0 - this.pulseProgress);
      this.sensorLight.intensity = THREE.MathUtils.lerp(this.sensorLight.intensity, 0.15, delta * 8);
    } else {
      this.pulseMat.opacity = 0;
    }

    // 4. Pointer Parallax smoothing (bounded <= 3 degrees)
    this.mouseX = THREE.MathUtils.lerp(this.mouseX, this.targetMouseX, 0.05);
    this.mouseY = THREE.MathUtils.lerp(this.mouseY, this.targetMouseY, 0.05);

    // 5. Camera positioning from scroll story + parallax
    this.camera.position.x = this.cameraProgress.posX + this.mouseX * 2;
    this.camera.position.y = this.cameraProgress.posY + this.mouseY * 2;
    this.camera.position.z = this.cameraProgress.posZ;
    this.camera.lookAt(this.cameraProgress.lookX, this.cameraProgress.lookY, this.cameraProgress.lookZ);

    // 6. Chapter 02 Block Progress Gauge Fill
    if (this.gaugeTrackMat) {
      this.gaugeTrackMat.opacity = THREE.MathUtils.lerp(this.gaugeTrackMat.opacity, this.cameraProgress.gaugeRatio, 0.05);
    }

    // 7. Chapter 03 Orbiting Squeeks
    if (this.squeekGroup) {
      this.squeekGroup.rotation.z -= delta * 0.4;
      if (this.squeekMat) {
        this.squeekMat.opacity = THREE.MathUtils.lerp(this.squeekMat.opacity, this.cameraProgress.squeekGlow, 0.06);
      }
    }
  }

  render() {
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    // Adaptive Performance Governor: monitor average frame time
    this.frameTimes.push(delta * 1000);
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
      const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avgFrameTime > 20 && this.targetDpr > 1.0) {
        // Average frame time exceeded 20ms (> 50fps drop) -> throttle pixel ratio
        this.targetDpr = 1.0;
        this.renderer.setPixelRatio(1.0);
      }
    }

    this.update(delta);
    this.renderer.render(this.scene, this.camera);

    if (this.isRunning) {
      this.animationFrameId = requestAnimationFrame(() => this.render());
    }
  }

  start() {
    if (this.isRunning || this.disposed) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.render();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose() {
    this.stop();
    this.disposed = true;

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    if (this.wheelGroup) {
      this.wheelGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.scene.remove(this.wheelGroup);
    }

    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

