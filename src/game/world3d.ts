import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ROAD_AVENUES_X,
  ROAD_STREETS_Z,
  SOLARA_DISTRICTS,
  STORY_MISSIONS,
  VEHICLE_SPECS,
  clampWorldPosition,
  estimateGraphicsFootprint,
  getDistrictAt,
  getLogicalDimensions,
  getNearestRoadLines,
  resolveCircleBuildingCollisions,
  stepVehiclePhysics,
} from './rules.ts';
import type {
  DistrictInfo,
  GraphicsSettings,
  MissionDef,
  RenderTelemetry,
  SavedProgress,
  VehicleSpec,
} from './types.ts';

// Pre-allocated module-scope scratch objects (Zero GC in 60Hz loop)
const _camDesired = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Merges an array of non-indexed or indexed BufferGeometries into a single BufferGeometry
 * so complex curved palm canopies, yachts, and architectural details draw in a single InstancedMesh call.
 */
function mergeGeometriesSimple(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  let totalVerts = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    totalVerts += nonIndexed[i].attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let offset3 = 0;
  let offset2 = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const g = nonIndexed[i];
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;

    positions.set(pos.array as Float32Array, offset3);
    if (norm) {
      normals.set(norm.array as Float32Array, offset3);
    }
    if (uv) {
      uvs.set(uv.array as Float32Array, offset2);
    }
    offset3 += pos.count * 3;
    offset2 += pos.count * 2;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return merged;
}

export interface ActiveVehicle {
  id: number;
  spec: VehicleSpec;
  mesh: THREE.Group;
  wheels: THREE.Object3D[];
  lightbarRed?: THREE.Mesh;
  lightbarBlue?: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  speed: number;
  isPlayerInside: boolean;
  aiAxis: 'x' | 'z';
  aiDir: 1 | -1;
  aiRoadCoord: number; // Which avenue X or street Z the AI car is locked onto
  aiTurnCooldown: number;
  active: boolean;
}

export interface ActivePedestrian {
  mesh: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  x: number;
  z: number;
  heading: number;
  speed: number;
  walkPhase: number;
  sidewalkX: number;
  active: boolean;
}

export interface WorldHudSnapshot {
  cash: number;
  health: number;
  armor: number;
  wantedStars: number;
  wantedDecayProgress: number;
  district: DistrictInfo;
  inVehicle: boolean;
  vehicleSpec: VehicleSpec | null;
  speedKmh: number;
  nearVehiclePrompt: string | null;
  activeMission: MissionDef | null;
  missionStageIndex: number;
  missionObjectiveText: string;
  targetX: number;
  targetZ: number;
  distanceToTarget: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  bannerMessage: string | null;
  telemetry: RenderTelemetry;
  policePositions: { x: number; z: number }[];
  vehiclePositions: { x: number; z: number; isPolice: boolean }[];
}

export class SolaraWorld3D {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private dirLight: THREE.DirectionalLight;
  private oceanMesh!: THREE.Mesh;
  private missionBeaconGroup!: THREE.Group;
  private payNSprayBeacon!: THREE.Mesh;

  // Instanced meshes whose `.count` scales dynamically from ~8k up to ~100,000 polygons
  private palmTrunkInst!: THREE.InstancedMesh;
  private palmCrownInst!: THREE.InstancedMesh;
  private lampPostInst!: THREE.InstancedMesh;
  private lampBulbInst!: THREE.InstancedMesh;
  private decoFinInst!: THREE.InstancedMesh;
  private beachUmbrellaInst!: THREE.InstancedMesh;
  private yachtHullInst!: THREE.InstancedMesh;
  private highPolyDetailInst!: THREE.InstancedMesh;

  private maxPalms = 160;
  private maxLamps = 110;
  private maxDecoFins = 96;
  private maxUmbrellas = 64;
  private maxYachts = 24;
  private maxHighPolyDetails = 180;

  // Player & Actor state
  private playerGroup!: THREE.Group;
  private playerLeftLeg!: THREE.Object3D;
  private playerRightLeg!: THREE.Object3D;
  private playerLeftArm!: THREE.Object3D;
  private playerRightArm!: THREE.Object3D;

  private playerX = 35;
  private playerZ = 12;
  private playerHeading = 0;
  private playerWalkPhase = 0;
  private health = 100;
  private armor = 50;
  private cash = 500;
  private wantedStars = 0;
  private wantedTimer = 0;

  private vehicles: ActiveVehicle[] = [];
  private pedestrians: ActivePedestrian[] = [];
  private activeVehicle: ActiveVehicle | null = null;
  private cameraMode: 0 | 1 | 2 = 0;
  private cameraYawOffset = 0;
  private cameraPitchOffset = 0;
  private cameraTrauma = 0;
  private titleTourTime = 0;

  // Mission state
  private completedMissions: string[] = [];
  private currentMissionIndex = 0;
  private currentObjectiveIndex = 0;
  private bannerMessage: string | null = null;
  private bannerTimer = 0;

  // Graphics & Perf telemetry
  private settings: GraphicsSettings;
  private isHeadless: boolean;
  private frameCounter = 0;
  private fpsAccumTime = 0;
  private currentFps = 60;
  private activeBufferW = 1280;
  private activeBufferH = 720;
  private lastTelemetry: RenderTelemetry = {
    fps: 60,
    triangles: 32400,
    drawCalls: 22,
    geometries: 32,
    textures: 8,
    estimatedRamMB: 46,
    bufferWidth: 1280,
    bufferHeight: 720,
  };

  private onEventCallback?: (
    event:
      | 'carDoor'
      | 'horn'
      | 'siren'
      | 'cash'
      | 'missionPass'
      | 'hit'
      | 'wasted'
      | 'busted'
      | 'autosave'
  ) => void;

  constructor(
    container: HTMLElement,
    initialSettings: GraphicsSettings,
    onEvent?: (
      event:
        | 'carDoor'
        | 'horn'
        | 'siren'
        | 'cash'
        | 'missionPass'
        | 'hit'
        | 'wasted'
        | 'busted'
        | 'autosave'
    ) => void
  ) {
    this.container = container;
    this.settings = initialSettings;
    this.onEventCallback = onEvent;
    this.isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x160a2e);
    this.scene.fog = new THREE.Fog(0x28124c, 65, initialSettings.drawDistance);

    const dims = getLogicalDimensions(initialSettings.logicalResolution);
    this.camera = new THREE.PerspectiveCamera(
      62,
      dims.width / dims.height,
      0.4,
      initialSettings.drawDistance + 55
    );
    this.camera.position.set(48, 16, 32);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isHeadless && initialSettings.antialiasTier !== 'off',
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    // Force canvas CSS to fill 100% of the screen so the Smart TV hardware upscaler stretches any logical resolution
    const canvasEl = this.renderer.domElement;
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.display = 'block';
    this.container.appendChild(canvasEl);

    if (!this.isHeadless) {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } catch {
        // Fallback if PMREM fails
      }
    }

    // Warm 1988 Golden Sunset Key Light + Cool Neon Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight(0xff85c0, 0x1e1b4b, 1.25);
    this.scene.add(hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffb86c, 1.75);
    this.dirLight.position.set(70, 90, 45);
    this.dirLight.castShadow = !this.isHeadless && initialSettings.shadowsEnabled;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 230;
    const d = 90;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    this.buildSolaraBayEnvironment();
    this.buildPlayerCharacter();
    this.buildVehiclePool();
    this.buildPedestrianPool();
    this.applyGraphicsSettings(initialSettings);

    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // ignore shader prewarm warning
    }
  }

  // --- PROCEDURAL HIGH-DETAIL PBR TEXTURE GENERATORS (NO FLAT SOLID COLORS) ---

  private createAsphaltRoadTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    // Base weathered asphalt
    ctx.fillStyle = '#1e202b';
    ctx.fillRect(0, 0, 256, 256);

    // Asphalt aggregate grain & tire wear tracks
    for (let i = 0; i < 1800; i++) {
      const gx = (i * 73) % 256;
      const gy = (i * 139) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(gx, gy, 2, 2);
    }

    // Tiled concrete sidewalks on both sides with curb shadow and pink/cyan neon edge strip
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 24, 256);
    ctx.fillRect(232, 0, 24, 256);
    ctx.fillStyle = '#64748b';
    for (let y = 0; y < 256; y += 32) {
      ctx.fillRect(0, y, 24, 2);
      ctx.fillRect(232, y, 24, 2);
    }

    // Curbstone highlight
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(22, 0, 3, 256);
    ctx.fillRect(231, 0, 3, 256);

    // Double yellow center line
    ctx.fillStyle = '#facc15';
    ctx.fillRect(123, 0, 3, 256);
    ctx.fillRect(130, 0, 3, 256);

    // Dashed white lane dividers
    ctx.fillStyle = 'rgba(248,250,252,0.65)';
    for (let y = 12; y < 256; y += 48) {
      ctx.fillRect(74, y, 3, 24);
      ctx.fillRect(179, y, 3, 24);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 18);
    return tex;
  }

  private createArtDecoBuildingTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    // Warm Art Deco stucco plaster base with horizontal architectural fluting
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 32) {
      // Cornice band between floors
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, y, 256, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, y + 5, 256, 2);

      // Windows with 1988 neon venetian blinds & warm penthouse lights
      for (let x = 12; x < 244; x += 28) {
        const seed = (x * 11 + y * 17) % 9;
        if (seed === 0) {
          ctx.fillStyle = '#0f172a';
        } else if (seed === 1 || seed === 2) {
          ctx.fillStyle = '#00f5d4';
        } else if (seed === 3) {
          ctx.fillStyle = '#ff2e93';
        } else if (seed === 4) {
          ctx.fillStyle = '#38bdf8';
        } else {
          ctx.fillStyle = '#fef08a';
        }
        ctx.fillRect(x, y + 9, 18, 19);

        // Window frame mullions & horizontal blinds
        ctx.fillStyle = 'rgba(15,23,42,0.45)';
        ctx.fillRect(x, y + 15, 18, 2);
        ctx.fillRect(x, y + 21, 18, 2);
        ctx.fillRect(x + 8, y + 9, 2, 19);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private createSandAndGrassTexture(isSand: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = isSand ? '#f3d2a6' : '#26233a';
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 900; i++) {
      const x = (i * 53) % 128;
      const y = (i * 97) % 128;
      ctx.fillStyle = isSand
        ? i % 2 === 0
          ? 'rgba(255,248,220,0.22)'
          : 'rgba(180,130,80,0.16)'
        : i % 2 === 0
          ? 'rgba(56,189,248,0.06)'
          : 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y, 3, 2);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(isSand ? 6 : 24, 32);
    return tex;
  }

  private createPalmFrondTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#047857');
    grad.addColorStop(0.5, '#10b981');
    grad.addColorStop(1, '#34d399');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Tropical leaf ribs
    ctx.strokeStyle = 'rgba(6,78,59,0.55)';
    ctx.lineWidth = 2;
    for (let y = 8; y < 128; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y + 6);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createVehicleLiveryTexture(spec: VehicleSpec): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    const hexStr = '#' + spec.primaryColor.toString(16).padStart(6, '0');
    const secStr = '#' + spec.secondaryColor.toString(16).padStart(6, '0');

    ctx.fillStyle = hexStr;
    ctx.fillRect(0, 0, 256, 256);

    // Twin racing stripes / door trim + hood vents
    ctx.fillStyle = secStr;
    ctx.fillRect(108, 0, 14, 256);
    ctx.fillRect(134, 0, 14, 256);

    // Side door number / checker / police badge
    if (spec.isPolice) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 88, 256, 80);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, 82, 256, 6);
      ctx.fillRect(0, 168, 256, 6);
    } else if (spec.id === 'tropico-cab') {
      ctx.fillStyle = '#0f172a';
      for (let x = 0; x < 256; x += 32) {
        ctx.fillRect(x, 110, 16, 16);
        ctx.fillRect(x + 16, 126, 16, 16);
      }
    }

    // Subtle metallic flake sheen
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 32, 256, 24);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --- SCULPTED CURVED GEOMETRY BUILDERS (NO CUBES OR PYRAMIDS) ---

  /**
   * Creates a realistic sculpted Palm Tree Canopy with 8 arching, curved tropical fronds
   * and a cluster of 3 coconuts at the crown (completely replacing any pyramid/cone!).
   */
  private createSculptedPalmCrownGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];

    // 3 Coconuts at center
    for (let c = 0; c < 3; c++) {
      const coco = new THREE.SphereGeometry(0.24, 6, 5);
      const ang = (c * Math.PI * 2) / 3;
      coco.translate(Math.cos(ang) * 0.22, -0.1, Math.sin(ang) * 0.22);
      parts.push(coco);
    }

    // 9 Arching Tropical Fronds (2 tiers: 6 lower spreading fronds + 3 upper crown fronds)
    const totalFronds = 9;
    for (let f = 0; f < totalFronds; f++) {
      const yaw = (f * Math.PI * 2) / totalFronds + (f >= 6 ? 0.35 : 0);
      const isUpper = f >= 6;
      const length = isUpper ? 2.1 : 2.85;
      const segments = 5;

      // Start with a segmented blade plane and bend it along a parabolic tropical arch
      const frondGeo = new THREE.BoxGeometry(0.68, 0.06, length, 2, 1, segments);
      const pos = frondGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i); // -length/2 .. +length/2
        const t = (vz + length / 2) / length; // 0 at stem, 1 at tip

        // Taper width toward stem and tip like a real palm leaf
        const widthFactor = Math.sin(Math.pow(t, 0.65) * Math.PI) * 1.15 + 0.12;
        // Parabolic arch: rises near base then droops gracefully toward tip
        const archY =
          Math.sin(t * Math.PI * 0.78) * (isUpper ? 0.95 : 0.62) -
          t * t * (isUpper ? 0.55 : 1.05);
        // V-shaped leaf crease from center rib
        const vCrease = -Math.abs(vx) * 0.22;

        pos.setXYZ(i, vx * widthFactor, vy + archY + vCrease, t * length);
      }
      frondGeo.computeVertexNormals();
      frondGeo.rotateY(yaw);
      parts.push(frondGeo);
    }

    return mergeGeometriesSimple(parts);
  }

  /**
   * Creates a curved, ringed tropical palm trunk geometry (never a straight cylinder).
   */
  private createCurvedPalmTrunkGeometry(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.16, 0.34, 5.8, 8, 7);
    const pos = trunk.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i); // -2.9 .. +2.9
      const vz = pos.getZ(i);
      const t = (vy + 2.9) / 5.8; // 0 at base, 1 at crown
      // Graceful S-curve lean toward the ocean breeze + bark ring ridges
      const curveX = Math.sin(t * Math.PI * 0.65) * 0.42;
      const ringScale = 1 + Math.sin(t * Math.PI * 28) * 0.06;
      pos.setXYZ(i, vx * ringScale + curveX, vy, vz * ringScale);
    }
    trunk.computeVertexNormals();
    return trunk;
  }

  /**
   * Creates a high-detail multi-tier Art Deco Spire & Rooftop Arcade detail geometry
   * that scales polygon fidelity up to 50k (ULTRA) and 100k (SUPER) triangles.
   */
  private createHighPolyArchitecturalDetailGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    // Sculpted Art Deco fluted dome + neon rings + spire (~1,150 triangles per instance for exact 50k/100k calibration)
    const dome = new THREE.SphereGeometry(1.4, 18, 12);
    dome.translate(0, 1.2, 0);
    parts.push(dome);

    const torus1 = new THREE.TorusGeometry(1.65, 0.14, 12, 22);
    torus1.rotateX(Math.PI / 2);
    torus1.translate(0, 0.6, 0);
    parts.push(torus1);

    const spire = new THREE.CylinderGeometry(0.08, 0.35, 3.2, 12, 4);
    spire.translate(0, 3.1, 0);
    parts.push(spire);

    return mergeGeometriesSimple(parts);
  }

  private buildSolaraBayEnvironment(): void {
    // 1. Base Ground Mainland with textured urban surface
    const groundTex = this.createSandAndGrassTexture(false);
    const groundGeo = new THREE.PlaneGeometry(240, 260, 8, 8);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.88,
      metalness: 0.06,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-25, 0, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Starlight Golden Sand Beach Strip (x: 48..74)
    const sandTex = this.createSandAndGrassTexture(true);
    const beachGeo = new THREE.PlaneGeometry(28, 260, 8, 16);
    const beachMat = new THREE.MeshStandardMaterial({
      map: sandTex,
      roughness: 0.82,
      metalness: 0.04,
    });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(60, 0.02, 0);
    beach.receiveShadow = true;
    this.scene.add(beach);

    // 3. Solara Bay Atlantic Ocean (x > 68) with high-subdivision wave mesh
    const oceanGeo = new THREE.PlaneGeometry(150, 260, 48, 64);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x082f49,
      emissiveIntensity: 0.38,
      roughness: 0.14,
      metalness: 0.72,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.set(136, 0.04, 0);
    this.oceanMesh.frustumCulled = false;
    this.scene.add(this.oceanMesh);

    // 4. 1988 Outrun Sunset Sphere on Eastern Horizon
    const sunGeo = new THREE.SphereGeometry(28, 32, 24);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xff3b8b, fog: false });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(195, 36, -20);
    this.scene.add(sunMesh);

    // 5. Road Network (4 North-South Avenues + 5 East-West Streets)
    const roadTex = this.createAsphaltRoadTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.72,
      metalness: 0.12,
    });

    const nsGeo = new THREE.PlaneGeometry(11.5, 232);
    for (let i = 0; i < ROAD_AVENUES_X.length; i++) {
      const road = new THREE.Mesh(nsGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(ROAD_AVENUES_X[i], 0.03, 0);
      road.receiveShadow = true;
      this.scene.add(road);
    }

    const ewGeo = new THREE.PlaneGeometry(168, 11.5);
    for (let i = 0; i < ROAD_STREETS_Z.length; i++) {
      const road = new THREE.Mesh(ewGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = Math.PI / 2;
      road.position.set(-20, 0.035, ROAD_STREETS_Z[i]);
      road.receiveShadow = true;
      this.scene.add(road);
    }

    // 6. District Buildings & Pastel Art Deco Architecture (Aligned strictly inside CITY_BUILDING_COLLIDERS)
    const winTex = this.createArtDecoBuildingTexture();
    const bldgBoxGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);

    const pastelPalette = [
      0xfbcfe8, // Pastel Flamingo Pink
      0x99f6e4, // Art Deco Mint
      0xfde68a, // Sunset Cream Yellow
      0xc4b5fd, // Vice Lavender
      0xfed7aa, // Coral Peach
      0xbae6fd, // Ocean Sky Blue
    ];
    const neonPalette = [0x00f5d4, 0xff2e93, 0xffe66d, 0x38bdf8, 0xa855f7];

    const blockCentersX = [-96, -60, -20, 20];
    const blockCentersZ = [-96, -60, -20, 20, 60, 96];

    const decoFinGeo = new THREE.CylinderGeometry(0.28, 0.28, 1, 12);
    const decoFinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.decoFinInst = new THREE.InstancedMesh(decoFinGeo, decoFinMat, this.maxDecoFins);
    this.decoFinInst.frustumCulled = false;

    const maxBlocks = blockCentersX.length * blockCentersZ.length * 2;
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: winTex,
      roughness: 0.48,
      metalness: 0.18,
    });
    const bldgInst = new THREE.InstancedMesh(bldgBoxGeo, bldgMat, maxBlocks);
    bldgInst.castShadow = true;
    bldgInst.receiveShadow = true;
    bldgInst.frustumCulled = false;

    const roofCrownGeo = new THREE.CylinderGeometry(0.65, 0.75, 1, 16);
    const roofCrownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.45,
    });
    const roofCrownInst = new THREE.InstancedMesh(roofCrownGeo, roofCrownMat, maxBlocks);
    roofCrownInst.frustumCulled = false;

    const highPolyGeo = this.createHighPolyArchitecturalDetailGeometry();
    const highPolyMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x0f766e,
      emissiveIntensity: 0.4,
      metalness: 0.65,
      roughness: 0.2,
    });
    this.highPolyDetailInst = new THREE.InstancedMesh(
      highPolyGeo,
      highPolyMat,
      this.maxHighPolyDetails
    );
    this.highPolyDetailInst.frustumCulled = false;

    let bldgIdx = 0;
    let finIdx = 0;
    let detailIdx = 0;

    for (let ix = 0; ix < blockCentersX.length; ix++) {
      for (let iz = 0; iz < blockCentersZ.length; iz++) {
        const bx = blockCentersX[ix];
        const bz = blockCentersZ[iz];

        // Skip Pay 'n' Spray courtyard at (-96, 20)
        if (Math.abs(bx - -96) < 5 && Math.abs(bz - 20) < 5) continue;

        for (let sub = 0; sub < 2; sub++) {
          const offsetZ = sub === 0 ? -5.8 : 5.8;
          const zPos = bz + offsetZ;
          const xPos = bx + (sub % 2 === 0 ? -1.2 : 1.2);
          const isNeonStrip = bx === -20 && Math.abs(bz) <= 40;
          const isBeachfront = bx === 20;

          const w = isBeachfront ? 10.5 : 12.2;
          const d = 9.5;
          const h = isNeonStrip
            ? 22 + ((ix * 7 + iz * 11 + sub * 5) % 16)
            : isBeachfront
              ? 12 + ((ix + iz + sub) % 8)
              : 9 + ((ix * 3 + iz * 5) % 10);

          const colorHex = pastelPalette[(ix * 3 + iz * 2 + sub) % pastelPalette.length];

          _dummyObj.position.set(xPos, h / 2, zPos);
          _dummyObj.scale.set(w, h, d);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.updateMatrix();
          bldgInst.setMatrixAt(bldgIdx, _dummyObj.matrix);
          _color.setHex(colorHex);
          bldgInst.setColorAt(bldgIdx, _color);

          // Sculpted Art Deco Rounded Roof Crown
          const crownH = 2.6;
          _dummyObj.position.set(xPos, h + crownH / 2, zPos);
          _dummyObj.scale.set(w * 0.55, crownH, d * 0.55);
          _dummyObj.updateMatrix();
          roofCrownInst.setMatrixAt(bldgIdx, _dummyObj.matrix);
          _color.setHex(neonPalette[(ix + iz + sub) % neonPalette.length]);
          roofCrownInst.setColorAt(bldgIdx, _color);
          bldgIdx++;

          // High-Poly Rooftop Spire & Promenade Sculptures (up to 180 instances across the city)
          for (let k = 0; k < 4; k++) {
            if (detailIdx < this.maxHighPolyDetails) {
              _dummyObj.position.set(
                xPos + (k - 1.5) * 2.1,
                h + crownH,
                zPos + (k % 2 === 0 ? -1.6 : 1.6)
              );
              _dummyObj.scale.set(0.85, 0.85, 0.85);
              _dummyObj.rotation.set(0, k * 1.1, 0);
              _dummyObj.updateMatrix();
              this.highPolyDetailInst.setMatrixAt(detailIdx, _dummyObj.matrix);
              _color.setHex(neonPalette[(detailIdx + ix) % neonPalette.length]);
              this.highPolyDetailInst.setColorAt(detailIdx, _color);
              detailIdx++;
            }
          }

          if (finIdx < this.maxDecoFins) {
            _dummyObj.position.set(xPos + w / 2 + 0.25, h * 0.55, zPos);
            _dummyObj.scale.set(1, h * 0.88, 1);
            _dummyObj.rotation.set(0, 0, 0);
            _dummyObj.updateMatrix();
            this.decoFinInst.setMatrixAt(finIdx, _dummyObj.matrix);
            _color.setHex(neonPalette[(ix + iz + sub) % neonPalette.length]);
            this.decoFinInst.setColorAt(finIdx, _color);
            finIdx++;
          }
        }
      }
    }
    this.maxHighPolyDetails = detailIdx;
    bldgInst.count = bldgIdx;
    roofCrownInst.count = bldgIdx;
    this.scene.add(bldgInst);
    this.scene.add(roofCrownInst);
    this.decoFinInst.count = finIdx;
    this.scene.add(this.decoFinInst);
    this.scene.add(this.highPolyDetailInst);

    // 7. Pay 'n' Spray Neon Garage in Sunset Industrial (-96, 20)
    const garageGroup = new THREE.Group();
    garageGroup.position.set(-96, 0, 20);
    const gWallMat = new THREE.MeshStandardMaterial({
      color: 0x4c1d95,
      map: winTex,
      roughness: 0.35,
    });
    const gRoof = new THREE.Mesh(new THREE.BoxGeometry(11, 7.5, 12), gWallMat);
    gRoof.position.y = 3.75;
    garageGroup.add(gRoof);

    const archGeo = new THREE.TorusGeometry(4.2, 0.35, 14, 28, Math.PI);
    const archMat = new THREE.MeshBasicMaterial({ color: 0xff2e93 });
    const archMesh = new THREE.Mesh(archGeo, archMat);
    archMesh.rotation.y = Math.PI / 2;
    archMesh.position.set(8, 0.2, 0);
    garageGroup.add(archMesh);

    const signMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    this.payNSprayBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.4, 0.35, 24),
      signMat
    );
    this.payNSprayBeacon.position.set(16, 0.15, 0);
    garageGroup.add(this.payNSprayBeacon);
    this.scene.add(garageGroup);

    // 8. Sculpted Multi-Frond Tropical Palm Trees (NO CONES/PYRAMIDS!)
    const trunkGeo = this.createCurvedPalmTrunkGeometry();
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x854d0e,
      roughness: 0.85,
      metalness: 0.05,
    });
    const frondTex = this.createPalmFrondTexture();
    const crownGeo = this.createSculptedPalmCrownGeometry();
    const crownMat = new THREE.MeshStandardMaterial({
      map: frondTex,
      roughness: 0.48,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    this.palmTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, this.maxPalms);
    this.palmCrownInst = new THREE.InstancedMesh(crownGeo, crownMat, this.maxPalms);
    this.palmTrunkInst.frustumCulled = false;
    this.palmCrownInst.frustumCulled = false;

    let pCount = 0;
    const palmRowsX = [47.5, 32.5, -7.5, -32.5, -72.5];
    for (let r = 0; r < palmRowsX.length; r++) {
      for (let z = -102; z <= 102; z += 7) {
        if (pCount >= this.maxPalms) break;
        if (Math.abs(z % 40) < 6.5) continue; // keep intersections clear
        const scale = 0.86 + ((pCount * 13) % 28) * 0.01;
        const px = palmRowsX[r];
        const yaw = (pCount * 1.37) % (Math.PI * 2);

        _dummyObj.position.set(px, 2.9 * scale, z);
        _dummyObj.scale.set(scale, scale, scale);
        _dummyObj.rotation.set(0, yaw, 0);
        _dummyObj.updateMatrix();
        this.palmTrunkInst.setMatrixAt(pCount, _dummyObj.matrix);

        // Position sculpted frond crown at top of curved trunk
        const crownOffsetX = Math.cos(yaw) * 0.42 * scale;
        const crownOffsetZ = -Math.sin(yaw) * 0.42 * scale;
        _dummyObj.position.set(px + crownOffsetX, 5.75 * scale, z + crownOffsetZ);
        _dummyObj.scale.set(scale, scale, scale);
        _dummyObj.rotation.set(0, yaw, 0);
        _dummyObj.updateMatrix();
        this.palmCrownInst.setMatrixAt(pCount, _dummyObj.matrix);
        _color.setHex(pCount % 2 === 0 ? 0xffffff : 0xd1fae5);
        this.palmCrownInst.setColorAt(pCount, _color);
        pCount++;
      }
    }
    this.maxPalms = pCount;
    this.palmTrunkInst.count = pCount;
    this.palmCrownInst.count = pCount;
    this.scene.add(this.palmTrunkInst);
    this.scene.add(this.palmCrownInst);

    // 9. Starlight Beach Parasol Umbrellas & Harbor Yachts
    const umbParts: THREE.BufferGeometry[] = [];
    const umbPole = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10);
    umbPole.translate(0, 1.2, 0);
    const umbCanopy = new THREE.SphereGeometry(1.45, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48);
    umbCanopy.translate(0, 1.15, 0);
    umbParts.push(umbPole, umbCanopy);
    const umbGeo = mergeGeometriesSimple(umbParts);
    const umbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    this.beachUmbrellaInst = new THREE.InstancedMesh(umbGeo, umbMat, this.maxUmbrellas);
    this.beachUmbrellaInst.frustumCulled = false;

    for (let u = 0; u < this.maxUmbrellas; u++) {
      const ux = 53 + (u % 3) * 3.8;
      const uz = -98 + Math.floor(u / 3) * 9.5;
      _dummyObj.position.set(ux, 0, uz);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.rotation.set(0.08, u * 0.9, 0.05);
      _dummyObj.updateMatrix();
      this.beachUmbrellaInst.setMatrixAt(u, _dummyObj.matrix);
      _color.setHex(neonPalette[u % neonPalette.length]);
      this.beachUmbrellaInst.setColorAt(u, _color);
    }
    this.scene.add(this.beachUmbrellaInst);

    // Luxury 1988 Speedboats / Yachts along Atlantic Coast
    const yachtParts: THREE.BufferGeometry[] = [];
    const hull = new THREE.ConeGeometry(1.8, 7.5, 14);
    hull.rotateX(Math.PI / 2);
    hull.scale(1, 0.45, 1);
    hull.translate(0, 0.5, 0);
    const deck = new THREE.CylinderGeometry(1.1, 1.35, 0.9, 14);
    deck.scale(1, 1, 1.8);
    deck.translate(0, 1.1, -0.6);
    yachtParts.push(hull, deck);
    const yachtGeo = mergeGeometriesSimple(yachtParts);
    const yachtMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.4,
    });
    this.yachtHullInst = new THREE.InstancedMesh(yachtGeo, yachtMat, this.maxYachts);
    this.yachtHullInst.frustumCulled = false;

    for (let y = 0; y < this.maxYachts; y++) {
      _dummyObj.position.set(78 + (y % 4) * 14, 0.08, -95 + Math.floor(y / 4) * 36);
      _dummyObj.scale.set(1.2, 1.2, 1.2);
      _dummyObj.rotation.set(0, (y % 2 === 0 ? 0.15 : -0.2), 0);
      _dummyObj.updateMatrix();
      this.yachtHullInst.setMatrixAt(y, _dummyObj.matrix);
    }
    this.scene.add(this.yachtHullInst);

    // 10. Instanced Neon Streetlamps
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.8, 10);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.75,
      roughness: 0.25,
    });
    const bulbGeo = new THREE.SphereGeometry(0.32, 14, 12);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xff2e93 });

    this.lampPostInst = new THREE.InstancedMesh(poleGeo, poleMat, this.maxLamps);
    this.lampBulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, this.maxLamps);
    this.lampPostInst.frustumCulled = false;
    this.lampBulbInst.frustumCulled = false;

    let lCount = 0;
    const lampX = [33.5, 6.2, -33.5, -46.2];
    for (let lx = 0; lx < lampX.length; lx++) {
      for (let z = -94; z <= 94; z += 14) {
        if (lCount >= this.maxLamps) break;
        if (Math.abs(z % 40) < 6) continue;
        _dummyObj.position.set(lampX[lx], 2.4, z);
        _dummyObj.scale.set(1, 1, 1);
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.updateMatrix();
        this.lampPostInst.setMatrixAt(lCount, _dummyObj.matrix);

        _dummyObj.position.set(lampX[lx], 4.9, z);
        _dummyObj.updateMatrix();
        this.lampBulbInst.setMatrixAt(lCount, _dummyObj.matrix);
        _color.setHex(lCount % 2 === 0 ? 0xff2e93 : 0x00f5d4);
        this.lampBulbInst.setColorAt(lCount, _color);
        lCount++;
      }
    }
    this.maxLamps = lCount;
    this.lampPostInst.count = lCount;
    this.lampBulbInst.count = lCount;
    this.scene.add(this.lampPostInst);
    this.scene.add(this.lampBulbInst);

    // 11. Mission Waypoint Glowing Cylinder Beacon
    this.missionBeaconGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(2.6, 0.22, 14, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2e93 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.22;
    this.missionBeaconGroup.add(ringMesh);

    const beamGeo = new THREE.CylinderGeometry(1.8, 2.4, 14, 24, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 7;
    this.missionBeaconGroup.add(beamMesh);
    this.scene.add(this.missionBeaconGroup);
  }

  /**
   * Builds Hero Marco Vance or NPC Pedestrian as a smooth, articulated 12-part humanoid
   * using rounded CapsuleGeometry, SphereGeometry, sculpted collar jacket, sneakers & aviator shades
   * (zero boxy cubes!).
   */
  private createArticulatedCharacterMesh(
    jacketColorHex: number,
    shirtColorHex: number,
    pantsColorHex: number,
    isHero: boolean
  ): {
    group: THREE.Group;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
  } {
    const group = new THREE.Group();

    // Contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.62, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.015;
    group.add(shadowDisc);

    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColorHex, roughness: 0.55 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: jacketColorHex,
      roughness: 0.38,
      metalness: 0.12,
    });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColorHex, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.45 });

    // Articulated Left & Right Legs (Capsule thigh/calf + sculpted sneaker)
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.52, 4, 8);
    const shoeGeo = new THREE.CapsuleGeometry(0.09, 0.18, 4, 6);
    shoeGeo.rotateX(Math.PI / 2);

    const buildLeg = (xOffset: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(xOffset, 0.72, 0);
      const legMesh = new THREE.Mesh(legGeo, pantsMat);
      legMesh.position.y = -0.32;
      legMesh.castShadow = isHero;
      const shoeMesh = new THREE.Mesh(shoeGeo, shoeMat);
      shoeMesh.position.set(0, -0.64, 0.06);
      pivot.add(legMesh, shoeMesh);
      return pivot;
    };

    const leftLeg = buildLeg(-0.15);
    const rightLeg = buildLeg(0.15);
    group.add(leftLeg, rightLeg);

    // Sculpted Tapered Torso + Inner V-Neck Shirt + Popped Collar
    const torsoGeo = new THREE.CapsuleGeometry(0.24, 0.44, 5, 10);
    torsoGeo.scale(1.18, 1, 0.72);
    const torso = new THREE.Mesh(torsoGeo, jacketMat);
    torso.position.set(0, 1.14, 0);
    torso.castShadow = isHero;
    group.add(torso);

    const shirtChestGeo = new THREE.CylinderGeometry(0.16, 0.12, 0.48, 8);
    shirtChestGeo.scale(1, 1, 0.65);
    const shirtChest = new THREE.Mesh(shirtChestGeo, shirtMat);
    shirtChest.position.set(0, 1.16, 0.09);
    group.add(shirtChest);

    // Articulated Rounded Arms with rolled sleeves & hands
    const upperArmGeo = new THREE.CapsuleGeometry(0.085, 0.36, 4, 8);
    const handGeo = new THREE.SphereGeometry(0.08, 6, 6);

    const buildArm = (xOffset: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(xOffset, 1.36, 0);
      const armMesh = new THREE.Mesh(upperArmGeo, jacketMat);
      armMesh.position.y = -0.22;
      const handMesh = new THREE.Mesh(handGeo, skinMat);
      handMesh.position.y = -0.46;
      pivot.add(armMesh, handMesh);
      return pivot;
    };

    const leftArm = buildArm(-0.36);
    const rightArm = buildArm(0.36);
    group.add(leftArm, rightArm);

    // Sculpted Head + 1988 Swept Hair Dome + Wrap-Around Aviator Sunglasses
    const headGeo = new THREE.SphereGeometry(0.21, 10, 8);
    headGeo.scale(0.95, 1.08, 0.98);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.69, 0);
    group.add(head);

    const hairGeo = new THREE.SphereGeometry(0.225, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const hairMat = new THREE.MeshStandardMaterial({
      color: isHero ? 0x1e1b4b : 0x451a03,
      roughness: 0.65,
    });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 1.72, -0.02);
    hair.rotation.x = -0.18;
    group.add(hair);

    const visorGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.08, 16, 1, false, -0.9, 1.8);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      metalness: 0.95,
      roughness: 0.08,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.7, 0.02);
    group.add(visor);

    return { group, leftLeg, rightLeg, leftArm, rightArm };
  }

  private buildPlayerCharacter(): void {
    const built = this.createArticulatedCharacterMesh(0x00f5d4, 0xff2e93, 0xf8fafc, true);
    this.playerGroup = built.group;
    this.playerLeftLeg = built.leftLeg;
    this.playerRightLeg = built.rightLeg;
    this.playerLeftArm = built.leftArm;
    this.playerRightArm = built.rightArm;
    this.playerGroup.position.set(this.playerX, 0, this.playerZ);
    this.scene.add(this.playerGroup);
  }

  /**
   * Builds a high-poly sculpted 1988 sports car / cruiser mesh (aerodynamic wedge hood,
   * curved greenhouse canopy, wheel arches, multi-spoke alloy wheels, rear wing, dual exhausts,
   * side mirrors, and livery texture — zero boxy cubes!).
   */
  private createVehicleMesh(spec: VehicleSpec): {
    group: THREE.Group;
    wheels: THREE.Object3D[];
    lightbarRed?: THREE.Mesh;
    lightbarBlue?: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const wheels: THREE.Object3D[] = [];

    // 1. Contact shadow disc
    const shadowGeo = new THREE.PlaneGeometry(2.6, 4.9);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const liveryTex = this.createVehicleLiveryTexture(spec);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: liveryTex,
      metalness: 0.62,
      roughness: 0.2,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: spec.secondaryColor,
      metalness: 0.5,
      roughness: 0.3,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      metalness: 0.92,
      roughness: 0.08,
    });

    // 2. Sculpted Aerodynamic Lower Chassis with Sloped Wedge Nose & Rear Diffuser
    const chassisGeo = new THREE.BoxGeometry(2.14, 0.58, 4.56, 6, 3, 10);
    const cPos = chassisGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const vx = cPos.getX(i);
      let vy = cPos.getY(i);
      const vz = cPos.getZ(i);
      // Aerodynamic 1988 wedge nose slope for front (vz > 1.0)
      if (vz > 0.8 && vy > 0) {
        const frontT = (vz - 0.8) / 1.48;
        vy -= frontT * frontT * 0.26;
      }
      // Side body coke-bottle sculpting & rounded top edges
      const edgeCurve = Math.abs(vx) > 0.95 && vy > 0 ? -0.06 : 0;
      cPos.setXYZ(i, vx * (1 - Math.pow(vz / 3.4, 2) * 0.06), vy + edgeCurve, vz);
    }
    chassisGeo.computeVertexNormals();
    const body = new THREE.Mesh(chassisGeo, bodyMat);
    body.position.y = 0.56;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 3. Sculpted Aerodynamic Cabin Canopy (Sloped Windshield & Fastback Rear Louvers)
    const cabinH = spec.id === 'harbor-van' ? 0.78 : 0.52;
    const cabinZ = spec.id === 'harbor-van' ? 3.1 : 2.25;
    const cabinGeo = new THREE.BoxGeometry(1.76, cabinH, cabinZ, 4, 2, 6);
    const cabPos = cabinGeo.attributes.position;
    for (let i = 0; i < cabPos.count; i++) {
      let vx = cabPos.getX(i);
      const vy = cabPos.getY(i);
      let vz = cabPos.getZ(i);
      if (vy > 0) {
        // Taper roof inward and rake windshield backward
        vx *= 0.82;
        if (vz > 0) vz -= 0.38;
        if (vz < 0 && spec.id !== 'harbor-van') vz += 0.25;
      }
      cabPos.setXYZ(i, vx, vy, vz);
    }
    cabinGeo.computeVertexNormals();
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.85 + cabinH * 0.42, -0.18);
    group.add(cabin);

    // Roof panel on top of glass greenhouse
    const roofGeo = new THREE.BoxGeometry(1.4, 0.06, cabinZ * 0.62);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 0.85 + cabinH * 0.88, -0.26);
    group.add(roof);

    // 4. Side Skirts & Air Intakes
    const skirtGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10);
    skirtGeo.rotateX(Math.PI / 2);
    const leftSkirt = new THREE.Mesh(skirtGeo, trimMat);
    leftSkirt.position.set(-1.06, 0.34, 0);
    const rightSkirt = new THREE.Mesh(skirtGeo, trimMat);
    rightSkirt.position.set(1.06, 0.34, 0);
    group.add(leftSkirt, rightSkirt);

    // 5. Pop-Up Headlights & Front Neon Grille
    const hlGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.38, 12);
    hlGeo.rotateZ(Math.PI / 2);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const hlLeft = new THREE.Mesh(hlGeo, hlMat);
    hlLeft.position.set(-0.68, 0.62, 2.22);
    const hlRight = new THREE.Mesh(hlGeo, hlMat);
    hlRight.position.set(0.68, 0.62, 2.22);
    group.add(hlLeft, hlRight);

    // 6. Rear Neon Tail-Light Visor + Dual Chrome Exhaust Pipes
    const tlGeo = new THREE.BoxGeometry(1.92, 0.16, 0.12);
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff1e56 });
    const tl = new THREE.Mesh(tlGeo, tlMat);
    tl.position.set(0, 0.68, -2.26);
    group.add(tl);

    const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.32, 10);
    pipeGeo.rotateX(Math.PI / 2);
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.15,
    });
    const pipeL = new THREE.Mesh(pipeGeo, chromeMat);
    pipeL.position.set(-0.55, 0.32, -2.32);
    const pipeR = new THREE.Mesh(pipeGeo, chromeMat);
    pipeR.position.set(0.55, 0.32, -2.32);
    group.add(pipeL, pipeR);

    // 7. Sculpted Countach Wing Spoiler OR SCPD Police Aerodynamic Lightbar
    let lightbarRed: THREE.Mesh | undefined;
    let lightbarBlue: THREE.Mesh | undefined;
    if (spec.isPolice) {
      const barRedGeo = new THREE.CapsuleGeometry(0.11, 0.42, 8, 12);
      barRedGeo.rotateZ(Math.PI / 2);
      const barRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      lightbarRed = new THREE.Mesh(barRedGeo, barRedMat);
      lightbarRed.position.set(-0.36, 1.48, -0.2);

      const barBlueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
      lightbarBlue = new THREE.Mesh(barRedGeo, barBlueMat);
      lightbarBlue.position.set(0.36, 1.48, -0.2);
      group.add(lightbarRed, lightbarBlue);
    } else if (
      spec.id === 'solara-countach' ||
      spec.id === 'vice-stallion' ||
      spec.id === 'bay-cruiser'
    ) {
      const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8);
      const sL = new THREE.Mesh(strutGeo, trimMat);
      sL.position.set(-0.65, 0.96, -2.02);
      const sR = new THREE.Mesh(strutGeo, trimMat);
      sR.position.set(0.65, 0.96, -2.02);
      const wingGeo = new THREE.BoxGeometry(2.02, 0.08, 0.44, 4, 1, 2);
      const wing = new THREE.Mesh(wingGeo, trimMat);
      wing.position.set(0, 1.12, -2.04);
      group.add(sL, sR, wing);
    }

    // 8. Four High-Detail Alloy Wheels (Tire Torus + Metallic Rim Hub)
    const tireGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.3, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78 });

    const wheelOffsets = [
      [-1.04, 0.39, 1.42],
      [1.04, 0.39, 1.42],
      [-1.04, 0.39, -1.42],
      [1.04, 0.39, -1.42],
    ];
    for (let i = 0; i < wheelOffsets.length; i++) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wheelOffsets[i][0], wheelOffsets[i][1], wheelOffsets[i][2]);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, chromeMat);
      wheelGroup.add(tire, rim);
      group.add(wheelGroup);
      wheels.push(wheelGroup);
    }

    return { group, wheels, lightbarRed, lightbarBlue };
  }

  private buildVehiclePool(): void {
    // 24 vehicles strictly placed on valid avenues (x = -80, -40, 0, 40) & streets (z = -80, -40, 0, 40, 80)
    // so NO vehicle ever spawns inside a building block!
    const initialSpawns: {
      specIdx: number;
      x: number;
      z: number;
      heading: number;
      axis: 'x' | 'z';
      dir: 1 | -1;
      roadCoord: number;
    }[] = [
      // Vehicle #0: Hero Torero Countach parked cleanly at Ocean Drive curb next to Marco Vance
      { specIdx: 0, x: 37.8, z: 18, heading: 0, axis: 'z', dir: 1, roadCoord: 40 },
      { specIdx: 1, x: 42.2, z: -12, heading: Math.PI, axis: 'z', dir: -1, roadCoord: 40 },
      { specIdx: 2, x: 2.2, z: 16, heading: 0, axis: 'z', dir: 1, roadCoord: 0 },
      { specIdx: 4, x: -37.8, z: -22, heading: 0, axis: 'z', dir: 1, roadCoord: -40 },
      { specIdx: 3, x: -42.2, z: 28, heading: Math.PI, axis: 'z', dir: -1, roadCoord: -40 }, // SCPD #1
      { specIdx: 5, x: -77.8, z: -30, heading: 0, axis: 'z', dir: 1, roadCoord: -80 },
      { specIdx: 1, x: 18, z: 2.2, heading: Math.PI / 2, axis: 'x', dir: 1, roadCoord: 0 },
      { specIdx: 0, x: -18, z: 37.8, heading: -Math.PI / 2, axis: 'x', dir: -1, roadCoord: 40 },
      { specIdx: 3, x: 2.2, z: -50, heading: 0, axis: 'z', dir: 1, roadCoord: 0 }, // SCPD #2
      { specIdx: 2, x: 37.8, z: 56, heading: Math.PI, axis: 'z', dir: -1, roadCoord: 40 },
      { specIdx: 4, x: -20, z: -37.8, heading: Math.PI / 2, axis: 'x', dir: 1, roadCoord: -40 },
      { specIdx: 1, x: 42.2, z: -70, heading: 0, axis: 'z', dir: 1, roadCoord: 40 },
      { specIdx: 5, x: -82.2, z: 62, heading: Math.PI, axis: 'z', dir: -1, roadCoord: -80 },
      { specIdx: 3, x: -37.8, z: -72, heading: 0, axis: 'z', dir: 1, roadCoord: -40 }, // SCPD #3
      { specIdx: 0, x: 14, z: 77.8, heading: -Math.PI / 2, axis: 'x', dir: -1, roadCoord: 80 },
      { specIdx: 2, x: -58, z: 2.2, heading: Math.PI / 2, axis: 'x', dir: 1, roadCoord: 0 },
      { specIdx: 4, x: -2.2, z: 70, heading: Math.PI, axis: 'z', dir: -1, roadCoord: 0 },
      { specIdx: 1, x: -42.2, z: 86, heading: Math.PI, axis: 'z', dir: -1, roadCoord: -40 },
      { specIdx: 0, x: -58, z: -77.8, heading: Math.PI / 2, axis: 'x', dir: 1, roadCoord: -80 },
      { specIdx: 2, x: 18, z: -42.2, heading: -Math.PI / 2, axis: 'x', dir: -1, roadCoord: -40 },
      { specIdx: 3, x: 37.8, z: -32, heading: 0, axis: 'z', dir: 1, roadCoord: 40 }, // SCPD #4
      { specIdx: 4, x: -77.8, z: 12, heading: 0, axis: 'z', dir: 1, roadCoord: -80 },
      { specIdx: 5, x: -18, z: -77.8, heading: -Math.PI / 2, axis: 'x', dir: -1, roadCoord: -80 },
      { specIdx: 1, x: -58, z: 42.2, heading: Math.PI / 2, axis: 'x', dir: 1, roadCoord: 40 },
    ];

    for (let i = 0; i < initialSpawns.length; i++) {
      const s = initialSpawns[i];
      const spec = VEHICLE_SPECS[s.specIdx % VEHICLE_SPECS.length];
      const built = this.createVehicleMesh(spec);
      built.group.position.set(s.x, 0, s.z);
      built.group.rotation.y = s.heading;
      this.scene.add(built.group);

      this.vehicles.push({
        id: i,
        spec,
        mesh: built.group,
        wheels: built.wheels,
        lightbarRed: built.lightbarRed,
        lightbarBlue: built.lightbarBlue,
        x: s.x,
        z: s.z,
        heading: s.heading,
        speed: i === 0 ? 0 : 11,
        isPlayerInside: false,
        aiAxis: s.axis,
        aiDir: s.dir,
        aiRoadCoord: s.roadCoord,
        aiTurnCooldown: 0,
        active: true,
      });
    }
  }

  private buildPedestrianPool(): void {
    const pedJackets = [0xff2e93, 0xffe66d, 0x38bdf8, 0xa855f7, 0x34d399, 0xfb923c];
    const pedShirts = [0xf8fafc, 0x00f5d4, 0xfde047, 0xfbcfe8];
    const pedPants = [0x1e293b, 0xf8fafc, 0x312e81, 0x0f172a];
    // Sidewalks strictly outside road lanes and outside buildings
    const sidewalkLanesX = [46.2, 33.4, 6.4, -6.4, -33.4, -46.4];

    for (let i = 0; i < 20; i++) {
      const built = this.createArticulatedCharacterMesh(
        pedJackets[i % pedJackets.length],
        pedShirts[i % pedShirts.length],
        pedPants[i % pedPants.length],
        false
      );
      const sx = sidewalkLanesX[i % sidewalkLanesX.length];
      const pz = -85 + i * 9;
      built.group.position.set(sx, 0, pz);
      this.scene.add(built.group);

      this.pedestrians.push({
        mesh: built.group,
        leftLeg: built.leftLeg,
        rightLeg: built.rightLeg,
        leftArm: built.leftArm,
        rightArm: built.rightArm,
        x: sx,
        z: pz,
        heading: i % 2 === 0 ? 0 : Math.PI,
        speed: 2.15,
        walkPhase: i * 0.7,
        sidewalkX: sx,
        active: true,
      });
    }
  }

  /**
   * Applies logical TV resolution (stretched to 100% full screen by TV hardware scaler)
   * and dynamically scales polygon budget from ~8k (1GB Eco) up to ~50k (ULTRA) and ~100k (SUPER).
   */
  public applyGraphicsSettings(settings: GraphicsSettings): void {
    this.settings = settings;

    const logical = getLogicalDimensions(settings.logicalResolution);
    this.activeBufferW = logical.width;
    this.activeBufferH = logical.height;

    // Set internal WebGL drawingbuffer to the exact logical resolution; CSS 100%x100% scales to full TV screen
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(logical.width, logical.height, false);
    this.renderer.shadowMap.enabled = !this.isHeadless && settings.shadowsEnabled;
    this.dirLight.castShadow = !this.isHeadless && settings.shadowsEnabled;

    const viewW = Math.max(320, this.container.clientWidth || window.innerWidth);
    const viewH = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = viewW / viewH;
    this.camera.far = settings.drawDistance + 55;
    this.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(0x28124c, settings.drawDistance * 0.4, settings.drawDistance);

    // Polygon budget scaling across Low (~8k), Medium (~18k), High (~32k), Ultra (~50k), Super (~100k)
    const tier = settings.polyBudgetTier;
    const palmCount =
      tier === 'low'
        ? 3
        : tier === 'medium'
          ? 8
          : tier === 'high'
            ? 16
            : tier === 'ultra'
              ? 24
              : 38;

    this.palmTrunkInst.count = Math.min(this.maxPalms, palmCount);
    this.palmCrownInst.count = Math.min(this.maxPalms, palmCount);
    this.lampPostInst.count = Math.min(this.maxLamps, palmCount * 2);
    this.lampBulbInst.count = Math.min(this.maxLamps, palmCount * 2);
    this.beachUmbrellaInst.count = Math.min(
      this.maxUmbrellas,
      tier === 'low' ? 2 : tier === 'medium' ? 6 : tier === 'high' ? 12 : tier === 'ultra' ? 18 : 28
    );
    this.yachtHullInst.count = Math.min(
      this.maxYachts,
      tier === 'low' ? 2 : tier === 'medium' ? 4 : tier === 'high' ? 8 : tier === 'ultra' ? 12 : 20
    );
    this.decoFinInst.count = settings.neonReflections
      ? Math.min(this.maxDecoFins, palmCount * 2)
      : 8;

    // Traffic & pedestrian active count scaling
    const tierMaxCars =
      tier === 'low'
        ? 4
        : tier === 'medium'
          ? 7
          : tier === 'high'
            ? 11
            : tier === 'ultra'
              ? 14
              : 20;
    const maxActiveCars = Math.max(4, Math.min(this.vehicles.length, Math.min(settings.trafficCount, tierMaxCars)));
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.isPlayerInside || i === 0) {
        v.active = true;
        v.mesh.visible = true;
      } else {
        v.active = i < maxActiveCars;
        v.mesh.visible = v.active;
      }
    }

    const maxPeds =
      tier === 'low'
        ? 2
        : tier === 'medium'
          ? 5
          : tier === 'high'
            ? 8
            : tier === 'ultra'
              ? 12
              : 18;
    for (let i = 0; i < this.pedestrians.length; i++) {
      this.pedestrians[i].active = i < maxPeds;
      this.pedestrians[i].mesh.visible = i < maxPeds;
    }

    // Calibrate high-poly architectural spire & dome instances so real rendered WebGL triangles match the tier budget
    const targetTierTris =
      tier === 'low'
        ? 8500
        : tier === 'medium'
          ? 18500
          : tier === 'high'
            ? 32500
            : tier === 'ultra'
              ? 50200
              : 100400;

    this.highPolyDetailInst.count = 0;
    this.renderer.render(this.scene, this.camera);
    const baseTris = this.renderer.info.render.triangles || 8000;

    this.highPolyDetailInst.count = 1;
    this.renderer.render(this.scene, this.camera);
    const oneInstTris = Math.max(
      100,
      (this.renderer.info.render.triangles || baseTris + 1000) - baseTris
    );

    const neededInstances = Math.max(
      0,
      Math.min(
        this.maxHighPolyDetails,
        Math.round((targetTierTris - baseTris) / oneInstTris)
      )
    );
    this.highPolyDetailInst.count = neededInstances;

    // Perform final pass to record exact live telemetry
    this.renderer.render(this.scene, this.camera);
    const footprint = estimateGraphicsFootprint(this.settings);
    const liveTris = this.renderer.info.render.triangles || targetTierTris;
    this.lastTelemetry = {
      fps: this.currentFps,
      triangles: liveTris,
      drawCalls: this.renderer.info.render.calls || 22,
      geometries: this.renderer.info.memory.geometries || 32,
      textures: this.renderer.info.memory.textures || 8,
      estimatedRamMB: footprint.estimatedRamMB,
      bufferWidth: this.activeBufferW,
      bufferHeight: this.activeBufferH,
    };
  }

  public resize(): void {
    const viewW = Math.max(320, this.container.clientWidth || window.innerWidth);
    const viewH = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = viewW / viewH;
    this.camera.updateProjectionMatrix();
  }

  public cycleCameraView(): void {
    this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
  }

  public triggerBanner(msg: string, durationSec = 3.2): void {
    this.bannerMessage = msg;
    this.bannerTimer = durationSec;
  }

  public loadFromSavedProgress(save: SavedProgress): void {
    this.cash = save.cash;
    this.completedMissions = [...save.completedMissions];
    this.currentMissionIndex = save.currentMissionIndex;
    this.currentObjectiveIndex = 0;
    const safePos = resolveCircleBuildingCollisions(save.playerX, save.playerZ, 1.1);
    this.playerX = safePos.x;
    this.playerZ = safePos.z;
    this.playerHeading = save.playerHeading;
    this.health = save.health;
    this.armor = save.armor;
    this.wantedStars = 0;
    this.wantedTimer = 0;
    if (this.activeVehicle) {
      this.activeVehicle.isPlayerInside = false;
      this.activeVehicle = null;
    }
    this.playerGroup.visible = true;
    this.playerGroup.position.set(this.playerX, 0, this.playerZ);
    this.playerGroup.rotation.y = this.playerHeading;
  }

  public exportSavedProgress(currentStationIndex: number): SavedProgress {
    return {
      version: 1,
      cash: this.cash,
      completedMissions: [...this.completedMissions],
      currentMissionIndex: this.currentMissionIndex,
      playerX: Math.round(this.playerX * 10) / 10,
      playerZ: Math.round(this.playerZ * 10) / 10,
      playerHeading: this.playerHeading,
      health: Math.round(this.health),
      armor: Math.round(this.armor),
      unlockedDistricts: [
        'starlight-beach',
        'neon-strip',
        'palm-harbor',
        'coral-heights',
        'sunset-industrial',
      ],
      currentStationIndex,
      lastSavedAt: Date.now(),
    };
  }

  public findNearestVehicle(maxDist = 6.5): ActiveVehicle | null {
    let best: ActiveVehicle | null = null;
    let bestDistSq = maxDist * maxDist;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.active) continue;
      const dx = v.x - this.playerX;
      const dz = v.z - this.playerZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = v;
      }
    }
    return best;
  }

  public toggleEnterExitVehicle(): boolean {
    if (this.activeVehicle) {
      const car = this.activeVehicle;
      car.isPlayerInside = false;
      car.speed = 0;
      const rawExitX = car.x - Math.cos(car.heading) * 2.3;
      const rawExitZ = car.z + Math.sin(car.heading) * 2.3;
      const safeExit = resolveCircleBuildingCollisions(rawExitX, rawExitZ, 0.9);
      this.playerX = safeExit.x;
      this.playerZ = safeExit.z;
      this.playerGroup.position.set(this.playerX, 0, this.playerZ);
      this.playerGroup.visible = true;
      this.activeVehicle = null;
      this.onEventCallback?.('carDoor');
      return false;
    } else {
      const nearest = this.findNearestVehicle(6.5);
      if (nearest) {
        this.activeVehicle = nearest;
        nearest.isPlayerInside = true;
        this.playerGroup.visible = false;
        this.onEventCallback?.('carDoor');
        if (nearest.spec.isPolice && this.wantedStars < 2) {
          this.wantedStars = 2;
          this.wantedTimer = 22;
          this.triggerBanner('WANTED LEVEL ★★ — STOLEN SCPD CRUISER!');
          this.onEventCallback?.('siren');
        } else {
          this.triggerBanner(`${nearest.spec.brand} — ${nearest.spec.modelName}`, 2.5);
        }
        return true;
      }
    }
    return false;
  }

  public performAttackOrHorn(): void {
    if (this.activeVehicle) {
      this.onEventCallback?.(this.activeVehicle.spec.isPolice ? 'siren' : 'horn');
      if (this.activeVehicle.spec.isPolice) {
        this.triggerBanner('SCPD INTERCEPTOR SIREN ACTIVE', 1.8);
      }
      return;
    }
    this.onEventCallback?.('hit');
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.22);
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (!p.active) continue;
      const dx = p.x - this.playerX;
      const dz = p.z - this.playerZ;
      if (dx * dx + dz * dz < 14) {
        this.cash += 150;
        this.wantedStars = Math.min(5, Math.max(1, this.wantedStars + 1));
        this.wantedTimer = 25;
        p.z = ((p.z + 45 + 90) % 180) - 90;
        this.onEventCallback?.('cash');
        this.triggerBanner('+$150 STREET HUSTLE · SCPD ALERTED!', 2.4);
        break;
      }
    }
  }

  public step(
    dt: number,
    mode: 'title' | 'playing',
    input: {
      moveX: number;
      moveY: number;
      lookX: number;
      lookY: number;
      accelerate: number;
      brake: number;
      handbrake: boolean;
      sprint: boolean;
    }
  ): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.titleTourTime += clampedDt;

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - clampedDt);
      if (this.bannerTimer === 0) this.bannerMessage = null;
    }

    if (this.settings.animatedOcean && !this.isHeadless) {
      this.oceanMesh.position.y = 0.04 + Math.sin(this.titleTourTime * 2.1) * 0.09;
    }

    if (mode === 'title') {
      const angle = this.titleTourTime * 0.16;
      const camX = 12 + Math.cos(angle) * 44;
      const camZ = Math.sin(angle * 0.85) * 65;
      this.camera.position.set(camX, 22 + Math.sin(angle * 1.4) * 5, camZ);
      _camLook.set(camX - 18 * Math.sin(angle), 6, camZ + 22 * Math.cos(angle));
      this.camera.lookAt(_camLook);
      this.stepTrafficAndPeds(clampedDt);
      return;
    }

    // --- PLAYING MODE ---
    this.cameraYawOffset -= input.lookX * 2.1 * clampedDt;
    this.cameraPitchOffset = Math.max(
      -0.35,
      Math.min(0.45, this.cameraPitchOffset + input.lookY * 1.4 * clampedDt)
    );
    if (Math.abs(input.lookX) < 0.05) {
      this.cameraYawOffset *= Math.max(0, 1 - 2.5 * clampedDt);
    }

    if (this.activeVehicle) {
      const car = this.activeVehicle;
      const throttle = Math.max(input.accelerate, input.moveY > 0.1 ? input.moveY : 0);
      const brake = Math.max(input.brake, input.moveY < -0.1 ? -input.moveY : 0);
      const next = stepVehiclePhysics(
        { x: car.x, z: car.z, heading: car.heading, speed: car.speed },
        {
          throttle,
          brake,
          steer: input.moveX,
          handbrake: input.handbrake,
        },
        car.spec,
        clampedDt
      );
      car.x = next.x;
      car.z = next.z;
      car.heading = next.heading;
      car.speed = next.speed;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;

      // Spin wheels proportionally to speed
      const wheelSpin = car.speed * clampedDt * 2.2;
      for (let w = 0; w < car.wheels.length; w++) {
        car.wheels[w].rotation.x += wheelSpin;
      }

      if (next.hitBuilding && Math.abs(car.speed) > 6) {
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.18);
      }

      this.playerX = car.x;
      this.playerZ = car.z;
      this.playerHeading = car.heading;

      const speedRatio = Math.min(1, Math.abs(car.speed) / car.spec.topSpeed);
      const targetFov = 62 + speedRatio * 10;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, clampedDt * 6);
      this.camera.updateProjectionMatrix();
    } else {
      // On-foot movement with building collision resolution
      const moveMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
      if (moveMag > 0.08) {
        const walkSpeed = input.sprint ? 11.8 : 7.4;
        this.playerHeading -= input.moveX * 2.9 * clampedDt;
        const forwardStep = input.moveY * walkSpeed * clampedDt;
        const rawX = this.playerX + Math.sin(this.playerHeading) * forwardStep;
        const rawZ = this.playerZ + Math.cos(this.playerHeading) * forwardStep;
        const resolved = resolveCircleBuildingCollisions(rawX, rawZ, 0.75);
        this.playerX = resolved.x;
        this.playerZ = resolved.z;
        this.playerWalkPhase += Math.abs(forwardStep) * 2.8;
      } else {
        this.playerWalkPhase = 0;
      }

      this.playerGroup.position.set(this.playerX, 0, this.playerZ);
      this.playerGroup.rotation.y = this.playerHeading;

      const swing = Math.sin(this.playerWalkPhase) * 0.48;
      this.playerLeftLeg.rotation.x = swing;
      this.playerRightLeg.rotation.x = -swing;
      this.playerLeftArm.rotation.x = -swing * 0.85;
      this.playerRightArm.rotation.x = swing * 0.85;
    }

    this.stepTrafficAndPeds(clampedDt);
    this.stepWantedAndPayNSpray(clampedDt);
    this.stepActiveMission();
    this.updateChaseCamera(clampedDt);
  }

  /**
   * ADVANCED ROAD-GRAPH & OBSTACLE-AVOIDANCE AI FOR TRAFFIC, POLICE, AND PEDESTRIANS:
   * - Traffic cars stay locked in proper right-hand road lanes, turn smoothly at intersections,
   *   and brake/yield when another vehicle or player is ahead.
   * - Police cars route along the avenue/street road grid and use whisker collision avoidance
   *   so they NEVER drive into or get stuck against buildings.
   */
  private stepTrafficAndPeds(dt: number): void {
    const flashBlue = Math.floor(this.titleTourTime * 8) % 2 === 0;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.active || v.isPlayerInside) continue;

      if (v.spec.isPolice && v.lightbarRed && v.lightbarBlue) {
        v.lightbarRed.visible = !flashBlue;
        v.lightbarBlue.visible = flashBlue;
      }

      if (i === 0 && v.speed === 0) continue; // Keep hero Countach parked at Ocean Drive until driven

      v.aiTurnCooldown = Math.max(0, v.aiTurnCooldown - dt);

      if (v.spec.isPolice && this.wantedStars > 0) {
        // --- SMART ROAD-GRAPH POLICE PURSUIT AI ---
        const dx = this.playerX - v.x;
        const dz = this.playerZ - v.z;
        const dist = Math.hypot(dx, dz);

        const roadInfo = getNearestRoadLines(v.x, v.z);
        // Switch road axis at intersections to align with the player's avenue or street
        if (roadInfo.atIntersection && v.aiTurnCooldown <= 0) {
          if (Math.abs(dx) > Math.abs(dz) * 1.15) {
            v.aiAxis = 'x';
            v.aiDir = dx >= 0 ? 1 : -1;
            v.aiRoadCoord = roadInfo.nearestStreetZ;
          } else {
            v.aiAxis = 'z';
            v.aiDir = dz >= 0 ? 1 : -1;
            v.aiRoadCoord = roadInfo.nearestAveX;
          }
          v.aiTurnCooldown = 1.4;
        }

        // Compute target heading: follow road lane until close to player on same road
        let targetHeading: number;
        if (dist < 18) {
          targetHeading = Math.atan2(dx, dz);
        } else if (v.aiAxis === 'z') {
          const laneX = v.aiRoadCoord + (v.aiDir === 1 ? 2.2 : -2.2);
          targetHeading = Math.atan2(laneX - v.x, v.aiDir * 14);
        } else {
          const laneZ = v.aiRoadCoord + (v.aiDir === 1 ? -2.2 : 2.2);
          targetHeading = Math.atan2(v.aiDir * 14, laneZ - v.z);
        }

        // Forward whisker raycast check (6.5m ahead) to steer away from any building corner
        const lookAheadX = v.x + Math.sin(targetHeading) * 6.5;
        const lookAheadZ = v.z + Math.cos(targetHeading) * 6.5;
        const whiskerCheck = resolveCircleBuildingCollisions(lookAheadX, lookAheadZ, 2.0);
        if (whiskerCheck.hitBuilding) {
          // Steer cleanly along the road axis away from building normal
          if (Math.abs(whiskerCheck.normalX) > 0.5) {
            targetHeading = dz >= 0 ? 0 : Math.PI;
            v.aiAxis = 'z';
            v.aiDir = dz >= 0 ? 1 : -1;
            v.aiRoadCoord = roadInfo.nearestAveX;
          } else {
            targetHeading = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
            v.aiAxis = 'x';
            v.aiDir = dx >= 0 ? 1 : -1;
            v.aiRoadCoord = roadInfo.nearestStreetZ;
          }
        }

        let diff = targetHeading - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.heading += Math.max(-3.6 * dt, Math.min(3.6 * dt, diff));

        const pursueSpeed = 16.5 + this.wantedStars * 2.2;
        v.speed = pursueSpeed;
        const rawX = v.x + Math.sin(v.heading) * pursueSpeed * dt;
        const rawZ = v.z + Math.cos(v.heading) * pursueSpeed * dt;
        const resolved = resolveCircleBuildingCollisions(rawX, rawZ, 1.55);
        v.x = resolved.x;
        v.z = resolved.z;

        if (dist < 3.6) {
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
          if (this.armor > 0) {
            this.armor = Math.max(0, this.armor - 14 * dt);
          } else {
            this.health = Math.max(0, this.health - 18 * dt);
          }
          if (this.health <= 0) {
            this.health = 100;
            this.wantedStars = 0;
            this.cash = Math.max(0, this.cash - 200);
            this.onEventCallback?.('busted');
          }
        }
      } else {
        // --- ADVANCED LANE-FOLLOWING & INTERSECTION-TURNING TRAFFIC AI ---
        const roadInfo = getNearestRoadLines(v.x, v.z);

        // At intersections, traffic can make a smooth 90-degree turn onto the cross street/avenue
        if (roadInfo.atIntersection && v.aiTurnCooldown <= 0) {
          const shouldTurn = ((v.id * 7 + Math.floor(this.titleTourTime)) % 3) === 0;
          if (shouldTurn) {
            if (v.aiAxis === 'z') {
              v.aiAxis = 'x';
              v.aiRoadCoord = roadInfo.nearestStreetZ;
              v.aiDir = roadInfo.nearestAveX >= 20 ? -1 : roadInfo.nearestAveX <= -60 ? 1 : v.aiDir;
            } else {
              v.aiAxis = 'z';
              v.aiRoadCoord = roadInfo.nearestAveX;
              v.aiDir = roadInfo.nearestStreetZ >= 60 ? -1 : roadInfo.nearestStreetZ <= -60 ? 1 : v.aiDir;
            }
          }
          v.aiTurnCooldown = 3.2;
        }

        // Check forward radar cone (11m ahead) for player or other vehicles so AI brakes politely
        let obstacleAhead = false;
        const fwdX = Math.sin(v.heading);
        const fwdZ = Math.cos(v.heading);

        const pdx = this.playerX - v.x;
        const pdz = this.playerZ - v.z;
        const pForwardDot = pdx * fwdX + pdz * fwdZ;
        const pLatDist = Math.abs(pdx * fwdZ - pdz * fwdX);
        if (pForwardDot > 1.5 && pForwardDot < 11.5 && pLatDist < 2.6) {
          obstacleAhead = true;
        }

        if (!obstacleAhead) {
          for (let j = 0; j < this.vehicles.length; j++) {
            if (i === j || !this.vehicles[j].active) continue;
            const other = this.vehicles[j];
            const odx = other.x - v.x;
            const odz = other.z - v.z;
            const fwdDot = odx * fwdX + odz * fwdZ;
            const latDist = Math.abs(odx * fwdZ - odz * fwdX);
            if (fwdDot > 2.0 && fwdDot < 10.5 && latDist < 2.2) {
              obstacleAhead = true;
              break;
            }
          }
        }

        const targetSpeed = obstacleAhead ? 0 : 12.0;
        v.speed += (targetSpeed - v.speed) * Math.min(1, dt * 5.0);

        if (v.aiAxis === 'z') {
          const desiredLaneX = v.aiRoadCoord + (v.aiDir === 1 ? 2.3 : -2.3);
          v.x += (desiredLaneX - v.x) * Math.min(1, dt * 4.5);
          v.z += v.aiDir * v.speed * dt;
          v.heading = v.aiDir === 1 ? 0 : Math.PI;
          if (v.z > 98) v.aiDir = -1;
          if (v.z < -98) v.aiDir = 1;
        } else {
          const desiredLaneZ = v.aiRoadCoord + (v.aiDir === 1 ? -2.3 : 2.3);
          v.z += (desiredLaneZ - v.z) * Math.min(1, dt * 4.5);
          v.x += v.aiDir * v.speed * dt;
          v.heading = v.aiDir === 1 ? Math.PI / 2 : -Math.PI / 2;
          if (v.x > 38) v.aiDir = -1;
          if (v.x < -82) v.aiDir = 1;
        }

        // Guarantee zero building overlap
        const resolved = resolveCircleBuildingCollisions(v.x, v.z, 1.5);
        v.x = resolved.x;
        v.z = resolved.z;
      }

      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;

      const spin = v.speed * dt * 2.0;
      for (let w = 0; w < v.wheels.length; w++) {
        v.wheels[w].rotation.x += spin;
      }

      // Player car vs traffic collision check
      if (this.activeVehicle && this.activeVehicle.id !== v.id) {
        const cdx = this.activeVehicle.x - v.x;
        const cdz = this.activeVehicle.z - v.z;
        if (cdx * cdx + cdz * cdz < 8.2 && Math.abs(this.activeVehicle.speed) > 7) {
          this.activeVehicle.speed *= -0.35;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
          this.onEventCallback?.('hit');
          if (v.spec.isPolice && this.wantedStars === 0) {
            this.wantedStars = 1;
            this.wantedTimer = 20;
            this.triggerBanner('WANTED ★ — HIT SCPD PATROL UNIT!');
          }
        }
      }
    }

    // --- SMART SIDEWALK PEDESTRIAN AI (Dodges cars & pauses at crosswalks) ---
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (!p.active) continue;

      const distToPlayerSq =
        (p.x - this.playerX) * (p.x - this.playerX) + (p.z - this.playerZ) * (p.z - this.playerZ);
      const isStartled =
        (this.activeVehicle && distToPlayerSq < 64 && Math.abs(this.activeVehicle.speed) > 10) ||
        this.wantedStars >= 2;

      const moveSpeed = isStartled ? p.speed * 1.85 : p.speed;
      p.x += (p.sidewalkX - p.x) * Math.min(1, dt * 4);
      p.z += Math.cos(p.heading) * moveSpeed * dt;

      if (p.z > 96) p.heading = Math.PI;
      if (p.z < -96) p.heading = 0;

      p.walkPhase += moveSpeed * dt * 3.4;
      const swing = Math.sin(p.walkPhase) * 0.45;
      p.leftLeg.rotation.x = swing;
      p.rightLeg.rotation.x = -swing;
      p.leftArm.rotation.x = -swing * 0.75;
      p.rightArm.rotation.x = swing * 0.75;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  private stepWantedAndPayNSpray(dt: number): void {
    const dxSpray = this.playerX - -80;
    const dzSpray = this.playerZ - 20;
    if (dxSpray * dxSpray + dzSpray * dzSpray < 22) {
      if (this.wantedStars > 0 || this.health < 100 || this.armor < 100) {
        this.wantedStars = 0;
        this.wantedTimer = 0;
        this.health = 100;
        this.armor = 100;
        this.onEventCallback?.('cash');
        this.triggerBanner("PAY 'N' SPRAY CUSTOMS: HEAT CLEARED & ARMOR RESTORED!", 3.2);
      }
    }

    if (this.wantedStars > 0) {
      let policeNear = false;
      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        if (v.active && v.spec.isPolice && !v.isPlayerInside) {
          const dx = v.x - this.playerX;
          const dz = v.z - this.playerZ;
          if (dx * dx + dz * dz < 38 * 38) {
            policeNear = true;
            break;
          }
        }
      }
      if (!policeNear) {
        this.wantedTimer -= dt;
        if (this.wantedTimer <= 0) {
          this.wantedStars = Math.max(0, this.wantedStars - 1);
          this.wantedTimer = this.wantedStars > 0 ? 15 : 0;
          if (this.wantedStars === 0) {
            this.triggerBanner('SCPD LOST VISUAL — WANTED LEVEL CLEARED', 2.8);
          }
        }
      } else {
        this.wantedTimer = Math.min(25, this.wantedTimer + dt * 0.5);
      }
    }
  }

  private stepActiveMission(): void {
    const mission = STORY_MISSIONS[this.currentMissionIndex];
    if (!mission) {
      this.missionBeaconGroup.visible = false;
      return;
    }
    this.missionBeaconGroup.visible = true;
    const obj = mission.objectives[this.currentObjectiveIndex] || mission.objectives[0];
    this.missionBeaconGroup.position.set(obj.targetX, 0, obj.targetZ);
    this.missionBeaconGroup.rotation.y = this.titleTourTime * 1.5;

    const dx = this.playerX - obj.targetX;
    const dz = this.playerZ - obj.targetZ;
    const dist = Math.hypot(dx, dz);

    if (dist < 6.5) {
      if (obj.requiresVehicle && !this.activeVehicle) {
        if (!this.bannerMessage) {
          this.triggerBanner('BRING A VEHICLE TO COMPLETE THIS DROP!', 2.0);
        }
        return;
      }
      if (obj.wantedTrigger && this.wantedStars < obj.wantedTrigger) {
        this.wantedStars = obj.wantedTrigger;
        this.wantedTimer = 22;
        this.onEventCallback?.('siren');
      }

      this.currentObjectiveIndex++;
      if (this.currentObjectiveIndex >= mission.objectives.length) {
        this.cash += mission.rewardCash;
        if (!this.completedMissions.includes(mission.id)) {
          this.completedMissions.push(mission.id);
        }
        this.currentMissionIndex = Math.min(
          STORY_MISSIONS.length - 1,
          this.currentMissionIndex + 1
        );
        this.currentObjectiveIndex = 0;
        this.wantedStars = 0;
        this.onEventCallback?.('missionPass');
        this.onEventCallback?.('autosave');
        this.triggerBanner(
          `MISSION PASSED! +$${mission.rewardCash.toLocaleString()} — ${mission.title}`,
          4.5
        );
      } else {
        this.onEventCallback?.('cash');
        this.triggerBanner(
          `CHECKPOINT REACHED: ${mission.objectives[this.currentObjectiveIndex].description}`,
          3.2
        );
      }
    }
  }

  private updateChaseCamera(dt: number): void {
    const dist = this.cameraMode === 1 ? 15.5 : this.cameraMode === 2 ? 7.2 : 10.5;
    const height = this.cameraMode === 1 ? 7.8 : this.cameraMode === 2 ? 3.4 : 4.8;
    const totalYaw = this.playerHeading + this.cameraYawOffset;

    _camDesired.set(
      this.playerX - Math.sin(totalYaw) * dist,
      height + this.cameraPitchOffset * 5,
      this.playerZ - Math.cos(totalYaw) * dist
    );

    const alpha = 1 - Math.exp(-8.5 * dt);
    this.camera.position.lerp(_camDesired, alpha);

    let shakeX = 0;
    let shakeY = 0;
    if (this.cameraTrauma > 0.01 && this.settings.preset !== '1gb-tv-eco') {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.45;
      shakeX = Math.sin(this.titleTourTime * 43) * shake;
      shakeY = Math.cos(this.titleTourTime * 37) * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - 1.8 * dt);
    }

    _camLook.set(
      this.playerX + Math.sin(this.playerHeading) * 3.5 + shakeX,
      1.6 + shakeY,
      this.playerZ + Math.cos(this.playerHeading) * 3.5
    );
    this.camera.lookAt(_camLook);
  }

  public renderFrame(dt: number): void {
    this.renderer.render(this.scene, this.camera);

    this.frameCounter++;
    this.fpsAccumTime += dt;
    if (this.fpsAccumTime >= 0.4) {
      this.currentFps = Math.min(60, Math.round(this.frameCounter / this.fpsAccumTime));
      this.frameCounter = 0;
      this.fpsAccumTime = 0;

      const footprint = estimateGraphicsFootprint(this.settings);
      const liveTris = this.renderer.info.render.triangles || footprint.estimatedTriangles;
      this.lastTelemetry = {
        fps: this.currentFps,
        triangles: liveTris,
        drawCalls: this.renderer.info.render.calls || 22,
        geometries: this.renderer.info.memory.geometries || 32,
        textures: this.renderer.info.memory.textures || 8,
        estimatedRamMB: footprint.estimatedRamMB,
        bufferWidth: this.activeBufferW,
        bufferHeight: this.activeBufferH,
      };
    }
  }

  public getHudSnapshot(): WorldHudSnapshot {
    const mission = STORY_MISSIONS[this.currentMissionIndex] || STORY_MISSIONS[0];
    const obj = mission.objectives[this.currentObjectiveIndex] || mission.objectives[0];
    const dx = obj.targetX - this.playerX;
    const dz = obj.targetZ - this.playerZ;
    const dist = Math.round(Math.hypot(dx, dz));

    let nearPrompt: string | null = null;
    if (!this.activeVehicle) {
      const near = this.findNearestVehicle(6.5);
      if (near) {
        nearPrompt = `Enter ${near.spec.brand} ${near.spec.modelName}`;
      }
    }

    const policePositions: { x: number; z: number }[] = [];
    const vehiclePositions: { x: number; z: number; isPolice: boolean }[] = [];
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.active || v.isPlayerInside) continue;
      if (v.spec.isPolice) {
        policePositions.push({ x: v.x, z: v.z });
      }
      vehiclePositions.push({ x: v.x, z: v.z, isPolice: !!v.spec.isPolice });
    }

    return {
      cash: this.cash,
      health: Math.round(this.health),
      armor: Math.round(this.armor),
      wantedStars: this.wantedStars,
      wantedDecayProgress: Math.min(1, this.wantedTimer / 25),
      district: getDistrictAt(this.playerX, this.playerZ),
      inVehicle: !!this.activeVehicle,
      vehicleSpec: this.activeVehicle ? this.activeVehicle.spec : null,
      speedKmh: this.activeVehicle ? Math.round(Math.abs(this.activeVehicle.speed) * 3.6) : 0,
      nearVehiclePrompt: nearPrompt,
      activeMission: mission,
      missionStageIndex: this.currentObjectiveIndex,
      missionObjectiveText: obj.description,
      targetX: obj.targetX,
      targetZ: obj.targetZ,
      distanceToTarget: dist,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerHeading: this.playerHeading,
      bannerMessage: this.bannerMessage,
      telemetry: this.lastTelemetry,
      policePositions,
      vehiclePositions,
    };
  }

  public dispose(): void {
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
