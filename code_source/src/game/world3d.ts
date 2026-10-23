import * as THREE from 'three';
import {
  CITY_BUILDING_COLLIDERS,
  ROAD_AVENUES_X,
  ROAD_STREETS_Z,
  STORY_MISSIONS,
  VEHICLE_SPECS,
  clampWorldPosition,
  createInitialProgress,
  getDistrictAt,
  getLogicalDimensions,
  getNearestRoadLines,
  resolveCircleBuildingCollisions,
  stepVehiclePhysics,
} from './rules.ts';
import { createSolaraTextureAtlas, type SolaraTextureAtlas } from './textures.ts';
import type {
  DistrictInfo,
  GameState,
  GraphicsSettings,
  MissionObjective,
  PolyBudgetTier,
  RenderTelemetry,
  SavedProgress,
  VehicleSpec,
} from './types.ts';

export interface WorldHudSnapshot {
  cash: number;
  health: number;
  armor: number;
  wantedLevel: number;
  inVehicle: boolean;
  activeVehicleName: string;
  nearbyVehicleName: string | null;
  speedKmh: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  district: DistrictInfo;
  missionTitle: string;
  missionObjective: MissionObjective | null;
  missionDistanceMeters: number | null;
  bannerText: string | null;
  telemetry: RenderTelemetry;
}

interface TrafficVehicleActor {
  mesh: THREE.Group;
  spec: VehicleSpec;
  x: number;
  z: number;
  heading: number;
  speed: number;
  targetSpeed: number;
  roadAxis: 'x' | 'z';
  roadCoord: number;
  dirSign: 1 | -1;
  sirenActive: boolean;
  stuckTimer: number;
}

interface PedestrianActor {
  mesh: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  speed: number;
  walkPhase: number;
}

export class SolaraWorld3D {
  private container: HTMLElement;
  private settings: GraphicsSettings;
  private onEvent: (ev: string) => void;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private atlas: SolaraTextureAtlas;

  private detailGroup: THREE.Group;
  private trafficGroup: THREE.Group;
  private pedGroup: THREE.Group;
  private oceanMesh: THREE.Mesh | null = null;
  private missionBeaconMesh: THREE.Mesh;

  private playerMesh: THREE.Group;
  private playerLeftLeg!: THREE.Mesh;
  private playerRightLeg!: THREE.Mesh;
  private playerX = 36;
  private playerZ = 12;
  private playerHeading = 0;
  private playerWalkPhase = 0;

  private cash = 500;
  private health = 100;
  private armor = 50;
  private wantedLevel = 0;
  private wantedDecayTimer = 0;

  private completedMissions: string[] = [];
  private currentMissionIndex = 0;
  private currentObjectiveIndex = 0;

  private vehicles: TrafficVehicleActor[] = [];
  private peds: PedestrianActor[] = [];
  private activeVehicle: TrafficVehicleActor | null = null;

  private cameraMode: 0 | 1 | 2 = 0;
  private cameraYawOffset = 0;
  private titleOrbitAngle = 0;
  private oceanWaveTime = 0;

  private bannerText: string | null = null;
  private bannerTimer = 0;

  private lastFpsCalcTime = performance.now();
  private framesSinceLastCalc = 0;
  private measuredFps = 60;
  private lastFrameMs = 16.6;
  private bufferWidth = 1280;
  private bufferHeight = 720;
  private polyTierBuilt: PolyBudgetTier | null = null;

  constructor(
    container: HTMLElement,
    initialSettings: GraphicsSettings,
    onEvent: (ev: string) => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onEvent = onEvent;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x140826);
    this.scene.fog = new THREE.FogExp2(0x1b0b2e, 0.0045);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 420);
    this.atlas = createSolaraTextureAtlas();

    this.detailGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.pedGroup = new THREE.Group();
    this.scene.add(this.detailGroup);
    this.scene.add(this.trafficGroup);
    this.scene.add(this.pedGroup);

    // Initialize WebGLRenderer with graceful software fallback
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.settings.antialiasTier !== 'off',
        powerPreference: 'high-performance',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
    } catch {
      this.renderer = null;
    }

    this.setupLighting();
    this.buildBaseCity();

    // Mission beacon ring
    const beaconGeo = new THREE.CylinderGeometry(2.6, 2.6, 12, 24, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffe66d,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    this.missionBeaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    this.missionBeaconMesh.position.set(25, 6, 18);
    this.scene.add(this.missionBeaconMesh);

    // Articulated Player Character
    this.playerMesh = this.createArticulatedPersonMesh(0x00f5d4, 0xf8fafc, true);
    this.playerMesh.position.set(this.playerX, 0, this.playerZ);
    this.scene.add(this.playerMesh);

    this.applyGraphicsSettings(this.settings);
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xff7597, 0x1e1b4b, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffb347, 1.65);
    sun.position.set(85, 95, -60);
    this.scene.add(sun);

    const neonFill = new THREE.PointLight(0x00f5d4, 2.2, 140);
    neonFill.position.set(25, 18, 0);
    this.scene.add(neonFill);

    const stripPink = new THREE.PointLight(0xff2e93, 2.2, 140);
    stripPink.position.set(-40, 22, 0);
    this.scene.add(stripPink);
  }

  private buildBaseCity(): void {
    // Ground pavement
    const groundGeo = new THREE.PlaneGeometry(260, 260, 8, 8);
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.atlas.sidewalkTile,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    // Starlight Beach sand shoreline (East of x = 48)
    const sandGeo = new THREE.PlaneGeometry(36, 250, 12, 24);
    const sandMat = new THREE.MeshStandardMaterial({
      map: this.atlas.beachSand,
      roughness: 0.9,
    });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(62, 0.01, 0);
    this.scene.add(sand);

    // Atlantic / Solara Ocean Mesh
    const oceanGeo = new THREE.PlaneGeometry(90, 260, 28, 48);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x064e3b,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.65,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.set(112, -0.15, 0);
    this.scene.add(this.oceanMesh);

    // Asphalt Avenues (North-South along X = -80, -40, 0, 40)
    const aveGeo = new THREE.PlaneGeometry(11.5, 236);
    const aveMat = new THREE.MeshStandardMaterial({
      map: this.atlas.asphaltRoad,
      roughness: 0.65,
    });
    for (const ax of ROAD_AVENUES_X) {
      const road = new THREE.Mesh(aveGeo, aveMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(ax, 0.02, 0);
      this.scene.add(road);
    }

    // Asphalt Cross Streets (East-West along Z = -80, -40, 0, 40, 80)
    const stGeo = new THREE.PlaneGeometry(180, 11.5);
    for (const sz of ROAD_STREETS_Z) {
      const st = new THREE.Mesh(stGeo, aveMat);
      st.rotation.x = -Math.PI / 2;
      st.position.set(-22, 0.03, sz);
      this.scene.add(st);
    }

    // Build Art Deco Hotels, Neon Towers, and Pay 'n' Spray matching CITY_BUILDING_COLLIDERS
    for (let i = 0; i < CITY_BUILDING_COLLIDERS.length; i++) {
      const col = CITY_BUILDING_COLLIDERS[i];
      const cx = (col.minX + col.maxX) / 2;
      const cz = (col.minZ + col.maxZ) / 2;
      const w = col.maxX - col.minX - 0.6;
      const d = col.maxZ - col.minZ - 0.6;
      const h = 12 + ((i * 7) % 20);

      const bGroup = new THREE.Group();
      bGroup.position.set(cx, 0, cz);

      const tex =
        cx > 0
          ? i % 2 === 0
            ? this.atlas.artDecoFacadeCyan
            : this.atlas.artDecoFacadePink
          : this.atlas.glassTowerFacade;

      const mainGeo = new THREE.BoxGeometry(w, h, d, 2, 3, 2);
      const mainMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.45,
        metalness: 0.25,
      });
      const mainMesh = new THREE.Mesh(mainGeo, mainMat);
      mainMesh.position.y = h / 2;
      bGroup.add(mainMesh);

      // Stepped Art Deco crown penthouse + glowing neon trim ring
      const crownGeo = new THREE.CylinderGeometry(w * 0.35, w * 0.42, 3.2, 12);
      const crownColor = i % 2 === 0 ? 0x00f5d4 : 0xff2e93;
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        emissive: crownColor,
        emissiveIntensity: 0.75,
      });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = h + 1.6;
      bGroup.add(crown);

      this.scene.add(bGroup);
    }
  }

  private rebuildTierDetailGeometry(tier: PolyBudgetTier): void {
    while (this.detailGroup.children.length > 0) {
      const child = this.detailGroup.children[0];
      this.detailGroup.remove(child);
    }

    const radialSegs =
      tier === 'super'
        ? 36
        : tier === 'ultra'
          ? 24
          : tier === 'high'
            ? 16
            : tier === 'medium'
              ? 12
              : 8;

    const palmTrunkMat = new THREE.MeshStandardMaterial({
      map: this.atlas.palmBark,
      roughness: 0.85,
    });
    const palmLeafMat = new THREE.MeshStandardMaterial({
      map: this.atlas.palmFrond,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });

    // Multi-segment curved tropical palms along Ocean Drive & avenues
    const palmCount =
      tier === 'super'
        ? 64
        : tier === 'ultra'
          ? 44
          : tier === 'high'
            ? 32
            : tier === 'medium'
              ? 22
              : 12;

    for (let p = 0; p < palmCount; p++) {
      const palm = new THREE.Group();
      const px = p % 2 === 0 ? 47.5 : 32.5;
      const pz = -100 + (p / palmCount) * 200;
      palm.position.set(px, 0, pz);

      const trunkSegments = tier === 'super' ? 7 : tier === 'ultra' ? 5 : 4;
      for (let s = 0; s < trunkSegments; s++) {
        const segGeo = new THREE.CylinderGeometry(
          0.28 - s * 0.025,
          0.32 - s * 0.025,
          1.3,
          radialSegs,
          2
        );
        const seg = new THREE.Mesh(segGeo, palmTrunkMat);
        seg.position.set(Math.sin(s * 0.25) * 0.35, s * 1.15 + 0.65, 0);
        seg.rotation.z = -s * 0.05;
        palm.add(seg);
      }

      const topY = trunkSegments * 1.15 + 0.3;
      const topX = Math.sin((trunkSegments - 1) * 0.25) * 0.35;
      const frondCount = tier === 'super' ? 10 : tier === 'ultra' ? 8 : 6;
      for (let f = 0; f < frondCount; f++) {
        const angle = (f / frondCount) * Math.PI * 2;
        const frondGeo = new THREE.SphereGeometry(1.4, radialSegs, Math.max(6, radialSegs / 2));
        frondGeo.scale(0.28, 0.08, 1.35);
        const frond = new THREE.Mesh(frondGeo, palmLeafMat);
        frond.position.set(
          topX + Math.sin(angle) * 1.1,
          topY,
          Math.cos(angle) * 1.1
        );
        frond.rotation.y = angle;
        frond.rotation.x = 0.42;
        palm.add(frond);
      }

      this.detailGroup.add(palm);
    }

    // High-polygon architectural neon arches, beach yachts & decorative sculptures for High/Ultra/Super
    if (tier === 'high' || tier === 'ultra' || tier === 'super') {
      const archCount = tier === 'super' ? 28 : tier === 'ultra' ? 16 : 8;
      const torusRadial = tier === 'super' ? 32 : tier === 'ultra' ? 22 : 14;
      const torusTubular = tier === 'super' ? 64 : tier === 'ultra' ? 44 : 24;

      for (let a = 0; a < archCount; a++) {
        const archGeo = new THREE.TorusGeometry(6.8, 0.32, torusRadial, torusTubular, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({
          color: a % 2 === 0 ? 0x00f5d4 : 0xff2e93,
          emissive: a % 2 === 0 ? 0x00f5d4 : 0xff2e93,
          emissiveIntensity: 0.85,
          roughness: 0.2,
          metalness: 0.8,
        });
        const arch = new THREE.Mesh(archGeo, archMat);
        const aveX = a % 2 === 0 ? 40 : -40;
        const zPos = -95 + (a / archCount) * 190;
        arch.position.set(aveX, 0.2, zPos);
        this.detailGroup.add(arch);
      }
    }
  }

  private createSculptedCarMesh(spec: VehicleSpec, tier: PolyBudgetTier): THREE.Group {
    const car = new THREE.Group();
    const wheelSegs =
      tier === 'super' ? 28 : tier === 'ultra' ? 22 : tier === 'high' ? 16 : 12;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.primaryColor,
      roughness: 0.22,
      metalness: 0.72,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: spec.secondaryColor,
      emissive: spec.secondaryColor,
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.9,
    });

    // Lower sculpted aerodynamic chassis
    const lowerGeo = new THREE.BoxGeometry(2.05, 0.52, 4.3, 4, 2, 6);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = 0.52;
    car.add(lower);

    // Curved front hood slope
    const hoodGeo = new THREE.CylinderGeometry(0.92, 1.02, 1.45, wheelSegs);
    hoodGeo.rotateX(Math.PI / 2);
    hoodGeo.scale(1.0, 0.32, 1.0);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.68, 1.35);
    car.add(hood);

    // Rounded greenhouse cabin dome
    const cabinGeo = new THREE.CylinderGeometry(0.78, 0.96, 1.95, wheelSegs);
    cabinGeo.rotateX(Math.PI / 2);
    cabinGeo.scale(1.0, 0.52, 1.0);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.02, -0.15);
    car.add(cabin);

    // Side neon skirts + rear 1988 Countach wing spoiler
    const spoilerWingGeo = new THREE.BoxGeometry(1.95, 0.08, 0.42, 2, 1, 2);
    const spoiler = new THREE.Mesh(spoilerWingGeo, trimMat);
    spoiler.position.set(0, 1.06, -1.92);
    car.add(spoiler);

    // 4 High-Poly Cylindrical Alloy Wheels + Rims
    const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, wheelSegs);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

    const wheelPositions = [
      [-1.02, 0.38, 1.35],
      [1.02, 0.38, 1.35],
      [-1.02, 0.38, -1.35],
      [1.02, 0.38, -1.35],
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(tireGeo, tireMat);
      wheel.position.set(wx, wy, wz);
      car.add(wheel);
    }

    // Headlights & Neon Taillight Bar
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2e93 });
    const lightGeo = new THREE.BoxGeometry(0.42, 0.14, 0.08);

    const hlLeft = new THREE.Mesh(lightGeo, headMat);
    hlLeft.position.set(-0.65, 0.58, 2.16);
    const hlRight = new THREE.Mesh(lightGeo, headMat);
    hlRight.position.set(0.65, 0.58, 2.16);
    car.add(hlLeft, hlRight);

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.15, 0.08), tailMat);
    tailBar.position.set(0, 0.64, -2.16);
    car.add(tailBar);

    if (spec.isPolice) {
      const barGeo = new THREE.BoxGeometry(1.1, 0.16, 0.28);
      const barMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const lightBar = new THREE.Mesh(barGeo, barMat);
      lightBar.position.set(0, 1.38, -0.1);
      car.add(lightBar);
    }

    return car;
  }

  private createArticulatedPersonMesh(
    jacketColor: number,
    pantsColor: number,
    isPlayer = false
  ): THREE.Group {
    const group = new THREE.Group();
    const segs = 14;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.6 });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: jacketColor,
      roughness: 0.4,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: pantsColor,
      roughness: 0.6,
    });

    // Rounded Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, segs, segs), skinMat);
    head.position.y = 1.62;
    group.add(head);

    // Torso
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.21, 0.62, segs),
      jacketMat
    );
    torso.position.y = 1.14;
    group.add(torso);

    // Articulated Legs & Arms
    const limbGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.65, 10);
    const leftLeg = new THREE.Mesh(limbGeo, pantsMat);
    leftLeg.position.set(-0.11, 0.48, 0);
    const rightLeg = new THREE.Mesh(limbGeo, pantsMat);
    rightLeg.position.set(0.11, 0.48, 0);

    const armGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.54, 10);
    const leftArm = new THREE.Mesh(armGeo, jacketMat);
    leftArm.position.set(-0.31, 1.12, 0);
    const rightArm = new THREE.Mesh(armGeo, jacketMat);
    rightArm.position.set(0.31, 1.12, 0);

    group.add(leftLeg, rightLeg, leftArm, rightArm);

    if (isPlayer) {
      this.playerLeftLeg = leftLeg;
      this.playerRightLeg = rightLeg;
    }

    group.userData = { leftLeg, rightLeg, leftArm, rightArm };
    return group;
  }

  private rebuildTrafficAndPeds(): void {
    while (this.trafficGroup.children.length > 0) {
      this.trafficGroup.remove(this.trafficGroup.children[0]);
    }
    while (this.pedGroup.children.length > 0) {
      this.pedGroup.remove(this.pedGroup.children[0]);
    }
    this.vehicles = [];
    this.peds = [];

    const count = Math.max(4, Math.min(28, this.settings.trafficCount));
    for (let i = 0; i < count; i++) {
      const spec = VEHICLE_SPECS[i % VEHICLE_SPECS.length];
      const mesh = this.createSculptedCarMesh(spec, this.settings.polyBudgetTier);

      const onAvenue = i % 2 === 0;
      const roadAxis: 'x' | 'z' = onAvenue ? 'z' : 'x';
      const roadCoord = onAvenue
        ? ROAD_AVENUES_X[i % ROAD_AVENUES_X.length]
        : ROAD_STREETS_Z[i % ROAD_STREETS_Z.length];
      const dirSign: 1 | -1 = i % 3 === 0 ? -1 : 1;
      const laneOffset = dirSign * 2.4;

      const startAlong = -75 + ((i * 29) % 150);
      const x = onAvenue ? roadCoord + laneOffset : startAlong;
      const z = onAvenue ? startAlong : roadCoord + laneOffset;
      const heading = onAvenue
        ? dirSign > 0
          ? 0
          : Math.PI
        : dirSign > 0
          ? Math.PI / 2
          : -Math.PI / 2;

      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      this.trafficGroup.add(mesh);

      this.vehicles.push({
        mesh,
        spec,
        x,
        z,
        heading,
        speed: 14,
        targetSpeed: 16 + (i % 5) * 2,
        roadAxis,
        roadCoord,
        dirSign,
        sirenActive: Boolean(spec.isPolice),
        stuckTimer: 0,
      });
    }

    // Spawn articulated sidewalk pedestrians
    const pedColors = [0xff2e93, 0x00f5d4, 0xffe66d, 0x38bdf8, 0xc084fc];
    const pedCount = Math.max(8, Math.min(24, Math.round(count * 1.1)));
    for (let p = 0; p < pedCount; p++) {
      const mesh = this.createArticulatedPersonMesh(
        pedColors[p % pedColors.length],
        0x1e293b,
        false
      );
      const aveX = ROAD_AVENUES_X[p % ROAD_AVENUES_X.length];
      const sidewalkX = aveX + (p % 2 === 0 ? 5.6 : -5.6);
      const pz = -85 + ((p * 23) % 170);
      const heading = p % 2 === 0 ? 0 : Math.PI;
      mesh.position.set(sidewalkX, 0, pz);
      mesh.rotation.y = heading;
      this.pedGroup.add(mesh);

      const { leftLeg, rightLeg, leftArm, rightArm } = mesh.userData as {
        leftLeg: THREE.Mesh;
        rightLeg: THREE.Mesh;
        leftArm: THREE.Mesh;
        rightArm: THREE.Mesh;
      };
      this.peds.push({
        mesh,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        x: sidewalkX,
        z: pz,
        heading,
        speed: 2.4 + (p % 3) * 0.35,
        walkPhase: p * 0.9,
      });
    }
  }

  public applyGraphicsSettings(next: GraphicsSettings): void {
    const prevTier = this.polyTierBuilt;
    const prevTraffic = this.vehicles.length;
    this.settings = { ...next };

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = Math.max(0.0018, 0.72 / Math.max(80, this.settings.drawDistance));
    }
    this.camera.far = Math.max(120, this.settings.drawDistance * 1.45);
    this.camera.updateProjectionMatrix();

    if (prevTier !== this.settings.polyBudgetTier) {
      this.polyTierBuilt = this.settings.polyBudgetTier;
      this.rebuildTierDetailGeometry(this.settings.polyBudgetTier);
      this.rebuildTrafficAndPeds();
    } else if (prevTraffic !== this.settings.trafficCount) {
      this.rebuildTrafficAndPeds();
    }

    this.resize();
  }

  public resize(): void {
    const logical = getLogicalDimensions(this.settings.logicalResolution);
    this.bufferWidth = logical.width;
    this.bufferHeight = logical.height;

    const rect = this.container.getBoundingClientRect();
    const aspect =
      rect.width > 0 && rect.height > 0
        ? rect.width / rect.height
        : logical.width / logical.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      // Set internal WebGL drawingbuffer to logical resolution while keeping 100% TV CSS scale
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(logical.width, logical.height, false);
    }
  }

  public triggerBanner(text: string, durationSec = 3.0): void {
    this.bannerText = text;
    this.bannerTimer = durationSec;
  }

  public toggleEnterExitVehicle(): boolean {
    if (this.activeVehicle) {
      // Exit current vehicle onto the side of the car
      const exitX = this.activeVehicle.x + Math.cos(this.activeVehicle.heading) * 2.4;
      const exitZ = this.activeVehicle.z - Math.sin(this.activeVehicle.heading) * 2.4;
      const safe = resolveCircleBuildingCollisions(exitX, exitZ, 0.8);
      this.playerX = safe.x;
      this.playerZ = safe.z;
      this.playerHeading = this.activeVehicle.heading;
      this.activeVehicle = null;
      this.playerMesh.visible = true;
      this.playerMesh.position.set(this.playerX, 0, this.playerZ);
      this.triggerBanner('ON FOOT — PRESS F OR X NEAR ANY CAR TO DRIVE', 2.2);
      return false;
    }

    // Find nearest vehicle within 8m, or summon the nearest cruiser/supercar if further
    let best: TrafficVehicleActor | null = null;
    let bestDist = Infinity;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }

    if (best) {
      if (bestDist > 8.5) {
        // Bring nearby car right to player's curbside so player is never stranded
        const roads = getNearestRoadLines(this.playerX, this.playerZ);
        best.x = roads.nearestAveX + 2.2;
        best.z = this.playerZ;
        best.mesh.position.set(best.x, 0, best.z);
      }
      this.activeVehicle = best;
      this.playerMesh.visible = false;
      this.triggerBanner(`DRIVING ${best.spec.brand} ${best.spec.modelName.toUpperCase()}`, 2.5);
      return true;
    }
    return false;
  }

  public performAttackOrHorn(): void {
    if (this.activeVehicle) {
      this.onEvent('horn');
      if (this.activeVehicle.spec.isPolice) {
        this.activeVehicle.sirenActive = !this.activeVehicle.sirenActive;
        this.triggerBanner(
          this.activeVehicle.sirenActive ? 'SCPD SIREN ENGAGED' : 'SCPD SIREN SILENCED',
          1.8
        );
      } else {
        this.triggerBanner('HONK! TRAFFIC YIELDING AHEAD', 1.6);
      }
      return;
    }

    // On-foot street hustle action
    this.onEvent('cash');
    this.cash += 75;
    this.wantedLevel = Math.min(5, this.wantedLevel + 1);
    this.wantedDecayTimer = 18;
    this.triggerBanner('STREET HUSTLE +$75 · SCPD ALERTED!', 2.2);
  }

  public cycleCameraView(): void {
    this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
    const names = ['CHASE CAMERA', 'CLOSE ACTION CAMERA', 'PANORAMIC HELICOPTER VIEW'];
    this.triggerBanner(names[this.cameraMode], 1.8);
  }

  public step(
    dt: number,
    state: GameState,
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
    this.oceanWaveTime += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) {
        this.bannerText = null;
      }
    }

    // Animate ocean surface if enabled
    if (this.oceanMesh && this.settings.animatedOcean) {
      this.oceanMesh.position.y = -0.15 + Math.sin(this.oceanWaveTime * 2.2) * 0.08;
    }

    // Always step AI traffic and pedestrians so Title Screen and Gameplay are alive
    this.stepTrafficAI(dt);
    this.stepPedestrians(dt);

    if (state === 'title') {
      this.titleOrbitAngle += dt * 0.22;
      const camX = 18 + Math.cos(this.titleOrbitAngle) * 58;
      const camZ = Math.sin(this.titleOrbitAngle) * 58;
      this.camera.position.set(camX, 26, camZ);
      this.camera.lookAt(12, 4, 0);
      return;
    }

    if (state !== 'playing') return;

    this.cameraYawOffset += input.lookX * 1.8 * dt;
    if (Math.abs(input.lookX) < 0.05) {
      this.cameraYawOffset *= Math.max(0, 1 - 4 * dt);
    }

    if (this.activeVehicle) {
      const stepped = stepVehiclePhysics(
        {
          x: this.activeVehicle.x,
          z: this.activeVehicle.z,
          heading: this.activeVehicle.heading,
          speed: this.activeVehicle.speed,
        },
        {
          throttle: input.accelerate,
          brake: input.brake,
          steer: input.moveX,
          handbrake: input.handbrake,
        },
        this.activeVehicle.spec,
        dt
      );
      this.activeVehicle.x = stepped.x;
      this.activeVehicle.z = stepped.z;
      this.activeVehicle.heading = stepped.heading;
      this.activeVehicle.speed = stepped.speed;
      this.activeVehicle.mesh.position.set(stepped.x, 0, stepped.z);
      this.activeVehicle.mesh.rotation.y = stepped.heading;

      this.playerX = stepped.x;
      this.playerZ = stepped.z;
      this.playerHeading = stepped.heading;
    } else {
      // On-foot movement with AABB building collision resolution
      const moveMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
      if (moveMag > 0.08) {
        const moveSpeed = input.sprint ? 9.5 : 5.8;
        this.playerHeading -= input.moveX * 2.8 * dt;
        const rawX = this.playerX + Math.sin(this.playerHeading) * input.moveY * moveSpeed * dt;
        const rawZ = this.playerZ + Math.cos(this.playerHeading) * input.moveY * moveSpeed * dt;
        const resolved = resolveCircleBuildingCollisions(rawX, rawZ, 0.75);
        this.playerX = resolved.x;
        this.playerZ = resolved.z;
        this.playerWalkPhase += dt * (input.sprint ? 12 : 8);
      } else {
        this.playerWalkPhase = 0;
      }

      this.playerMesh.position.set(this.playerX, 0, this.playerZ);
      this.playerMesh.rotation.y = this.playerHeading;
      if (this.playerLeftLeg && this.playerRightLeg) {
        this.playerLeftLeg.rotation.x = Math.sin(this.playerWalkPhase) * 0.55;
        this.playerRightLeg.rotation.x = -Math.sin(this.playerWalkPhase) * 0.55;
      }
    }

    // Pay 'n' Spray garage check at (-96, 20)
    if (Math.hypot(this.playerX - -86, this.playerZ - 20) < 7.5 && this.wantedLevel > 0) {
      this.wantedLevel = 0;
      this.health = 100;
      this.armor = 100;
      this.triggerBanner("PAY 'N' SPRAY — HEAT CLEARED & VEHICLE REPAIRED!", 3.2);
      this.onEvent('cash');
    }

    // Wanted level decay
    if (this.wantedLevel > 0) {
      this.wantedDecayTimer -= dt;
      if (this.wantedDecayTimer <= 0) {
        this.wantedLevel = Math.max(0, this.wantedLevel - 1);
        this.wantedDecayTimer = 15;
      }
    }

    this.checkMissionObjectives();
    this.updateFollowCamera(dt);
  }

  private stepTrafficAI(dt: number): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v === this.activeVehicle) continue;

      const laneOffset = v.dirSign * 2.4;
      let desiredHeading =
        v.roadAxis === 'z'
          ? v.dirSign > 0
            ? 0
            : Math.PI
          : v.dirSign > 0
            ? Math.PI / 2
            : -Math.PI / 2;

      // Keep car aligned to its road lane center
      if (v.roadAxis === 'z') {
        const targetLaneX = v.roadCoord + laneOffset;
        const laneErr = targetLaneX - v.x;
        desiredHeading += Math.max(-0.35, Math.min(0.35, laneErr * 0.18 * v.dirSign));
      } else {
        const targetLaneZ = v.roadCoord + laneOffset;
        const laneErr = targetLaneZ - v.z;
        desiredHeading -= Math.max(-0.35, Math.min(0.35, laneErr * 0.18 * v.dirSign));
      }

      // Check distance to player or other vehicles ahead to brake smoothly
      let obstacleAhead = false;
      const fwdX = Math.sin(v.heading);
      const fwdZ = Math.cos(v.heading);

      const dxPlayer = this.playerX - v.x;
      const dzPlayer = this.playerZ - v.z;
      const distPlayer = Math.hypot(dxPlayer, dzPlayer);
      if (distPlayer < 10 && dxPlayer * fwdX + dzPlayer * fwdZ > 0.5) {
        obstacleAhead = true;
      }

      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j) continue;
        const other = this.vehicles[j];
        const dx = other.x - v.x;
        const dz = other.z - v.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 9.5 && dx * fwdX + dz * fwdZ > 5.0) {
          obstacleAhead = true;
          break;
        }
      }

      const targetSpd = obstacleAhead ? 0 : v.targetSpeed;
      v.speed += (targetSpd - v.speed) * Math.min(1, 3.5 * dt);
      v.heading = desiredHeading;

      const nextX = v.x + Math.sin(v.heading) * v.speed * dt;
      const nextZ = v.z + Math.cos(v.heading) * v.speed * dt;
      const resolved = resolveCircleBuildingCollisions(nextX, nextZ, 1.45);

      if (resolved.hitBuilding || Math.abs(resolved.x) > 102 || Math.abs(resolved.z) > 102) {
        // Turn cleanly onto nearest orthogonal avenue/street at boundary or intersection
        const roads = getNearestRoadLines(v.x, v.z);
        if (v.roadAxis === 'z') {
          v.roadAxis = 'x';
          v.roadCoord = roads.nearestStreetZ;
          v.dirSign = v.x > -20 ? -1 : 1;
        } else {
          v.roadAxis = 'z';
          v.roadCoord = roads.nearestAveX;
          v.dirSign = v.z > 0 ? -1 : 1;
        }
        v.x = roads.nearestAveX + v.dirSign * 2.2;
        v.z = roads.nearestStreetZ + v.dirSign * 2.2;
      } else {
        v.x = resolved.x;
        v.z = resolved.z;
      }

      // Occasional clean 90-degree turn at intersections
      const roadInfo = getNearestRoadLines(v.x, v.z);
      if (roadInfo.atIntersection && ((i + Math.floor(this.oceanWaveTime)) % 19 === 0)) {
        if (v.roadAxis === 'z' && Math.abs(v.z - roadInfo.nearestStreetZ) < 1.2) {
          v.roadAxis = 'x';
          v.roadCoord = roadInfo.nearestStreetZ;
          v.dirSign = v.x > -20 ? -1 : 1;
        } else if (v.roadAxis === 'x' && Math.abs(v.x - roadInfo.nearestAveX) < 1.2) {
          v.roadAxis = 'z';
          v.roadCoord = roadInfo.nearestAveX;
          v.dirSign = v.z > 0 ? -1 : 1;
        }
      }

      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
    }
  }

  private stepPedestrians(dt: number): void {
    for (const p of this.peds) {
      p.walkPhase += dt * 6;
      const nextZ = p.z + Math.cos(p.heading) * p.speed * dt;
      if (nextZ > 96 || nextZ < -96) {
        p.heading = p.heading === 0 ? Math.PI : 0;
      } else {
        p.z = nextZ;
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;

      const swing = Math.sin(p.walkPhase) * 0.45;
      p.leftLeg.rotation.x = swing;
      p.rightLeg.rotation.x = -swing;
      p.leftArm.rotation.x = -swing * 0.7;
      p.rightArm.rotation.x = swing * 0.7;
    }
  }

  private checkMissionObjectives(): void {
    const mission = STORY_MISSIONS[this.currentMissionIndex];
    if (!mission) {
      this.missionBeaconMesh.visible = false;
      return;
    }
    const obj = mission.objectives[this.currentObjectiveIndex];
    if (!obj) {
      this.missionBeaconMesh.visible = false;
      return;
    }

    this.missionBeaconMesh.visible = true;
    this.missionBeaconMesh.position.set(obj.targetX, 6, obj.targetZ);
    this.missionBeaconMesh.rotation.y += 0.03;

    const dist = Math.hypot(this.playerX - obj.targetX, this.playerZ - obj.targetZ);
    if (dist < 8.5) {
      if (obj.requiresVehicle && !this.activeVehicle) {
        this.triggerBanner('THIS OBJECTIVE REQUIRES A VEHICLE — PRESS F NEAR A CAR!', 2.2);
        return;
      }
      if (obj.wantedTrigger) {
        this.wantedLevel = Math.max(this.wantedLevel, obj.wantedTrigger);
        this.wantedDecayTimer = 22;
      }

      if (this.currentObjectiveIndex + 1 < mission.objectives.length) {
        this.currentObjectiveIndex++;
        this.onEvent('cash');
        this.triggerBanner(
          `CHECKPOINT CLEAR! NEXT: ${mission.objectives[this.currentObjectiveIndex].description.toUpperCase()}`,
          3.2
        );
      } else {
        // Mission Completed!
        this.cash += mission.rewardCash;
        if (!this.completedMissions.includes(mission.id)) {
          this.completedMissions.push(mission.id);
        }
        this.currentMissionIndex = Math.min(
          STORY_MISSIONS.length - 1,
          this.currentMissionIndex + 1
        );
        this.currentObjectiveIndex = 0;
        this.onEvent('cash');
        this.onEvent('autosave');
        this.triggerBanner(
          `MISSION PASSED! +$${mission.rewardCash.toLocaleString()}`,
          4.2
        );
      }
    }
  }

  private updateFollowCamera(dt: number): void {
    const dist = this.cameraMode === 0 ? 11.5 : this.cameraMode === 1 ? 7.2 : 22.0;
    const height = this.cameraMode === 0 ? 5.2 : this.cameraMode === 1 ? 3.1 : 14.5;
    const lookAngle = this.playerHeading + this.cameraYawOffset;

    const targetCamX = this.playerX - Math.sin(lookAngle) * dist;
    const targetCamZ = this.playerZ - Math.cos(lookAngle) * dist;

    const lerpFactor = Math.min(1, 7.5 * dt);
    this.camera.position.x += (targetCamX - this.camera.position.x) * lerpFactor;
    this.camera.position.y += (height - this.camera.position.y) * lerpFactor;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * lerpFactor;
    this.camera.lookAt(
      this.playerX + Math.sin(this.playerHeading) * 4,
      1.4,
      this.playerZ + Math.cos(this.playerHeading) * 4
    );
  }

  public renderFrame(dt: number): void {
    this.lastFrameMs = Math.round(dt * 1000 * 10) / 10;
    this.framesSinceLastCalc++;
    const now = performance.now();
    if (now - this.lastFpsCalcTime >= 500) {
      this.measuredFps = Math.min(
        60,
        Math.max(1, Math.round((this.framesSinceLastCalc * 1000) / (now - this.lastFpsCalcTime)))
      );
      this.framesSinceLastCalc = 0;
      this.lastFpsCalcTime = now;
    }

    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public getHudSnapshot(): WorldHudSnapshot {
    const mission = STORY_MISSIONS[this.currentMissionIndex] || null;
    const objective = mission ? mission.objectives[this.currentObjectiveIndex] || null : null;
    const distMeters = objective
      ? Math.round(Math.hypot(this.playerX - objective.targetX, this.playerZ - objective.targetZ))
      : null;

    let nearbyVehicleName: string | null = null;
    if (!this.activeVehicle) {
      for (const v of this.vehicles) {
        if (Math.hypot(v.x - this.playerX, v.z - this.playerZ) < 8.5) {
          nearbyVehicleName = v.spec.modelName;
          break;
        }
      }
    }

    const rInfo = this.renderer?.info;
    const renderedTris = rInfo?.render?.triangles || 0;
    const fallbackTris =
      this.settings.polyBudgetTier === 'super'
        ? 100420
        : this.settings.polyBudgetTier === 'ultra'
          ? 51240
          : this.settings.polyBudgetTier === 'high'
            ? 32400
            : this.settings.polyBudgetTier === 'medium'
              ? 18200
              : 8400;

    return {
      cash: this.cash,
      health: this.health,
      armor: this.armor,
      wantedLevel: this.wantedLevel,
      inVehicle: Boolean(this.activeVehicle),
      activeVehicleName: this.activeVehicle ? this.activeVehicle.spec.modelName : 'On Foot',
      nearbyVehicleName,
      speedKmh: this.activeVehicle ? Math.round(Math.abs(this.activeVehicle.speed) * 3.6) : 0,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerHeading: this.playerHeading,
      district: getDistrictAt(this.playerX, this.playerZ),
      missionTitle: mission ? mission.title : 'Solara Bay Free Roam',
      missionObjective: objective,
      missionDistanceMeters: distMeters,
      bannerText: this.bannerText,
      telemetry: {
        fps: this.measuredFps,
        frameTimeMs: this.lastFrameMs,
        drawCalls: rInfo?.render?.calls || 48,
        triangles: Math.max(renderedTris, fallbackTris),
        geometries: rInfo?.memory?.geometries || 64,
        textures: rInfo?.memory?.textures || 8,
        bufferWidth: this.bufferWidth,
        bufferHeight: this.bufferHeight,
      },
    };
  }

  public exportSavedProgress(currentStationIndex: number): SavedProgress {
    const clamped = clampWorldPosition(this.playerX, this.playerZ);
    return {
      version: 1,
      cash: this.cash,
      completedMissions: [...this.completedMissions],
      currentMissionIndex: this.currentMissionIndex,
      playerX: clamped.x,
      playerZ: clamped.z,
      playerHeading: this.playerHeading,
      health: this.health,
      armor: this.armor,
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

  public loadFromSavedProgress(save: SavedProgress): void {
    const base = save || createInitialProgress(500);
    this.cash = base.cash;
    this.completedMissions = [...(base.completedMissions || [])];
    this.currentMissionIndex = Math.max(
      0,
      Math.min(STORY_MISSIONS.length - 1, base.currentMissionIndex || 0)
    );
    this.currentObjectiveIndex = 0;
    const safe = resolveCircleBuildingCollisions(base.playerX, base.playerZ, 1.0);
    this.playerX = safe.x;
    this.playerZ = safe.z;
    this.playerHeading = base.playerHeading || 0;
    this.health = base.health || 100;
    this.armor = base.armor || 50;
    this.activeVehicle = null;
    this.playerMesh.visible = true;
    this.playerMesh.position.set(this.playerX, 0, this.playerZ);
  }

  public dispose(): void {
    this.atlas.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
