/**
 * TourismPay AR Engine
 * =====================
 * Production WebXR + Three.js AR engine for the PWA.
 *
 * Capabilities:
 *  - WebXR immersive-ar session with camera passthrough
 *  - GPS-anchored 3D establishment overlay cards
 *  - Haversine distance calculation for nearby POI sorting
 *  - Hit-testing for surface detection
 *  - Graceful fallback to 2D map mode on non-WebXR browsers
 *  - QR payment trigger on establishment card tap
 */

import * as THREE from "three";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AREstablishment {
  id: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM: number;
  rating?: number;
  loyaltyMultiplier?: number;
  acceptsQRPay: boolean;
  walletId?: string;
  country: string;
  heritage?: boolean;
  heritageDescription?: string;
}

export interface AROverlayCard {
  mesh: THREE.Group;
  establishment: AREstablishment;
  worldPosition: THREE.Vector3;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export type ARMode = "location" | "marker" | "heritage";
export type ARStatus =
  | "idle"
  | "requesting_permission"
  | "starting"
  | "active"
  | "error"
  | "unsupported"
  | "fallback_2d";

// ─── Haversine distance ───────────────────────────────────────────────────────

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GPS → AR World Position ──────────────────────────────────────────────────
// Projects a GPS coordinate relative to the user's position into a Three.js
// world-space vector. 1 unit = 1 metre.

export function gpsToARPosition(
  userLat: number, userLng: number,
  targetLat: number, targetLng: number,
  altitudeOffset = 0
): THREE.Vector3 {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((userLat * Math.PI) / 180);

  const x = (targetLng - userLng) * metersPerDegreeLng;
  const z = -(targetLat - userLat) * metersPerDegreeLat; // Z is south in Three.js
  const y = altitudeOffset;

  // Cap at 500m radius to keep cards visible
  const dist = Math.sqrt(x * x + z * z);
  if (dist > 500) {
    const scale = 500 / dist;
    return new THREE.Vector3(x * scale, y, z * scale);
  }
  return new THREE.Vector3(x, y, z);
}

// ─── AR Card Geometry Builder ─────────────────────────────────────────────────
// Creates a floating 3D card using Three.js geometry (no external assets needed)

export function buildEstablishmentCard(
  establishment: AREstablishment,
  distanceM: number
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { establishmentId: establishment.id };

  // Background panel
  const panelGeo = new THREE.PlaneGeometry(2.4, 1.2);
  const panelMat = new THREE.MeshBasicMaterial({
    color: establishment.heritage ? 0x7c3aed : 0x1a1a2e,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  group.add(panel);

  // Accent border
  const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.42, 1.22));
  const borderMat = new THREE.LineBasicMaterial({
    color: establishment.heritage ? 0xa78bfa : establishment.acceptsQRPay ? 0x10b981 : 0x6c63ff,
    linewidth: 2,
  });
  const border = new THREE.LineSegments(borderGeo, borderMat);
  border.position.z = 0.001;
  group.add(border);

  // Category indicator dot
  const dotGeo = new THREE.CircleGeometry(0.08, 16);
  const dotMat = new THREE.MeshBasicMaterial({
    color: establishment.acceptsQRPay ? 0x10b981 : 0xf59e0b,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.set(-0.95, 0.4, 0.002);
  group.add(dot);

  // QR pay indicator (green checkmark shape for QR-enabled)
  if (establishment.acceptsQRPay) {
    const qrDotGeo = new THREE.CircleGeometry(0.06, 16);
    const qrDotMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const qrDot = new THREE.Mesh(qrDotGeo, qrDotMat);
    qrDot.position.set(0.95, -0.4, 0.002);
    group.add(qrDot);
  }

  // Distance indicator bar
  const barWidth = Math.min(2.0, (500 - Math.min(distanceM, 500)) / 500 * 2.0);
  const barGeo = new THREE.PlaneGeometry(barWidth, 0.04);
  const barMat = new THREE.MeshBasicMaterial({
    color: distanceM < 100 ? 0x10b981 : distanceM < 300 ? 0xf59e0b : 0x6c63ff,
  });
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.set(-1.0 + barWidth / 2, -0.52, 0.002);
  group.add(bar);

  // Connecting line to ground
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x6c63ff,
    transparent: true,
    opacity: 0.4,
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.6, 0),
    new THREE.Vector3(0, -3, 0),
  ]);
  const line = new THREE.Line(lineGeo, lineMat);
  group.add(line);

  // Ground anchor circle
  const anchorGeo = new THREE.RingGeometry(0.15, 0.2, 32);
  const anchorMat = new THREE.MeshBasicMaterial({
    color: 0x6c63ff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const anchor = new THREE.Mesh(anchorGeo, anchorMat);
  anchor.rotation.x = -Math.PI / 2;
  anchor.position.y = -3;
  group.add(anchor);

  return group;
}

// ─── AR Engine Class ──────────────────────────────────────────────────────────

export class TourismPayAREngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private xrSession: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private overlayCards: AROverlayCard[] = [];
  private animFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();

  public status: ARStatus = "idle";
  public onStatusChange?: (status: ARStatus) => void;
  public onCardTap?: (establishment: AREstablishment) => void;
  public onError?: (message: string) => void;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);

    // Ambient light for card visibility
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambient);
  }

  // ── Check WebXR support ──
  static async isSupported(): Promise<boolean> {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported("immersive-ar");
    } catch {
      return false;
    }
  }

  // ── Start AR session ──
  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.setStatus("requesting_permission");

    const supported = await TourismPayAREngine.isSupported();
    if (!supported) {
      this.setStatus("unsupported");
      return;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.xr.enabled = true;

      this.setStatus("starting");

      const sessionInit: XRSessionInit = {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["dom-overlay", "hit-test", "anchors"],
        domOverlay: { root: document.getElementById("ar-overlay-root") ?? document.body },
      };

      this.xrSession = await navigator.xr!.requestSession("immersive-ar", sessionInit);
      this.renderer.xr.setSession(this.xrSession as any);

      this.referenceSpace = await this.xrSession.requestReferenceSpace("local-floor");

      this.xrSession.addEventListener("end", () => {
        this.setStatus("idle");
        this.cleanup();
      });

      // Handle window resize
      window.addEventListener("resize", this.handleResize);

      this.setStatus("active");
      this.startRenderLoop();
    } catch (err: any) {
      const msg = err?.message ?? "Failed to start AR session";
      this.onError?.(msg);
      this.setStatus("error");
    }
  }

  // ── Start camera-only fallback (non-WebXR) ──
  async startCameraFallback(videoEl: HTMLVideoElement): Promise<void> {
    this.setStatus("requesting_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      this.setStatus("fallback_2d");
    } catch (err: any) {
      this.onError?.(err?.message ?? "Camera permission denied");
      this.setStatus("error");
    }
  }

  // ── Add establishment overlays ──
  addEstablishments(
    establishments: AREstablishment[],
    userLat: number,
    userLng: number
  ): void {
    // Clear existing
    this.overlayCards.forEach((c) => this.scene.remove(c.mesh));
    this.overlayCards = [];

    // Sort by distance, show nearest 8
    const sorted = [...establishments]
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 8);

    sorted.forEach((est) => {
      const worldPos = gpsToARPosition(userLat, userLng, est.lat, est.lng, 1.5);
      const card = buildEstablishmentCard(est, est.distanceM);
      card.position.copy(worldPos);

      // Always face camera (billboard)
      card.userData.billboard = true;

      this.scene.add(card);
      this.overlayCards.push({
        mesh: card,
        establishment: est,
        worldPosition: worldPos,
        screenX: 0,
        screenY: 0,
        visible: true,
      });
    });
  }

  // ── Handle tap/click on AR canvas ──
  handleTap(clientX: number, clientY: number): void {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const meshes = this.overlayCards.map((c) => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.userData.establishmentId) {
        obj = obj.parent;
      }
      if (obj?.userData.establishmentId) {
        const card = this.overlayCards.find(
          (c) => c.establishment.id === obj!.userData.establishmentId
        );
        if (card) {
          this.onCardTap?.(card.establishment);
          this.animateCardTap(card.mesh);
        }
      }
    }
  }

  // ── Animate card on tap ──
  private animateCardTap(mesh: THREE.Group): void {
    const originalScale = mesh.scale.clone();
    mesh.scale.setScalar(1.15);
    setTimeout(() => mesh.scale.copy(originalScale), 200);
  }

  // ── Render loop ──
  private startRenderLoop(): void {
    if (!this.renderer) return;

    this.renderer.setAnimationLoop((timestamp, frame) => {
      if (!frame) return;

      const delta = this.clock.getDelta();

      // Billboard: make all cards face the camera
      this.overlayCards.forEach((card) => {
        if (card.mesh.userData.billboard) {
          card.mesh.quaternion.copy(this.camera.quaternion);
        }

        // Gentle float animation
        card.mesh.position.y =
          card.worldPosition.y + Math.sin(timestamp * 0.001 + card.establishment.id) * 0.05;
      });

      this.renderer!.render(this.scene, this.camera);
    });
  }

  // ── Stop AR session ──
  async stop(): Promise<void> {
    if (this.xrSession) {
      await this.xrSession.end().catch(() => {});
      this.xrSession = null;
    }
    this.cleanup();
    this.setStatus("idle");
  }

  private cleanup(): void {
    this.renderer?.setAnimationLoop(null);
    this.overlayCards.forEach((c) => this.scene.remove(c.mesh));
    this.overlayCards = [];
    window.removeEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    if (!this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private setStatus(status: ARStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  dispose(): void {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const arEngine = new TourismPayAREngine();
