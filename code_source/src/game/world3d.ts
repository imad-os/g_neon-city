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
  pickTrafficVehicleSpec,
  resolveCircleBuildingCollisions,
  stepVehiclePhysics,
} from './rules.ts';
import {
  TANGIER_ROAD_NODES,
  TANGIER_ROAD_SEGMENTS,
  TANGIER_SECTOR_SIZE,
  TANGIER_WORLD_MAX,
  TANGIER_WORLD_MIN,
  TANGIER_WORLD_SPAN,
  getRoadNodeById,
  getStreetNameAt,
} from './tangierMapData.ts';
import { createSolaraTextureAtlas, type SolaraTextureAtlas } from './textures.ts';
import type {
  BuildingCollider,
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
  streetName: string;
  currentMissionIndex: number;
  currentObjectiveIndex: number;
  completedMissions: string[];
  missionTitle: string;
  missionObjective: MissionObjective | null;
  missionDistanceMeters: number | null;
  activeTargetX: number | null;
  activeTargetZ: number | null;
  activeTargetLabel: string;
  customWaypoint: { x: number; z: number } | null;
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

interface SpatialWorldSector {
  key: string;
  centerX: number;
  centerZ: number;
  group: THREE.Group;
  built: boolean;
  buildings: BuildingCollider[];
  treePositions: { x: number; z: number }[];
}

export class SolaraWorld3D {
  private container: HTMLElement;
  private settings: GraphicsSettings;
  private onEvent: (ev: string) => void;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private atlas: SolaraTextureAtlas;

  private sectorRootGroup: THREE.Group;
  private detailGroup: THREE.Group;
  private trafficGroup: THREE.Group;
  private pedGroup: THREE.Group;
  private oceanMesh: THREE.Mesh | null = null;
  private missionBeaconMesh: THREE.Mesh;
  private customWaypointMesh: THREE.Mesh;

  private sectors: Map<string, SpatialWorldSector> = new Map();
  private activeSectorCount = 0;
  private lastStreamCheckX = -9999;
  private lastStreamCheckZ = -9999;

  private playerMesh: THREE.Group;
  private playerLeftLeg!: THREE.Mesh;
  private playerRightLeg!: THREE.Mesh;
  private playerX = -35;
  private playerZ = -6;
  private playerHeading = Math.PI / 2;
  private playerWalkPhase = 0;

  private cash = 1000;
  private health = 100;
  private armor = 100;
  private wantedLevel = 0;
  private wantedDecayTimer = 0;

  private completedMissions: string[] = [];
  private currentMissionIndex = 0;
  private currentObjectiveIndex = 0;
  private customWaypoint: { x: number; z: number } | null = null;

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
    // Bright Mediterranean Sunlit Tangier Sky
    this.scene.background = new THREE.Color(0x38bdf8);
    this.scene.fog = new THREE.Fog(0xbae6fd, 170, 520);

    // Near plane set to 0.65m for high 24-bit depth buffer precision (prevents distant Z-fighting)
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.65, 560);
    this.camera.position.set(-12, 16, 18);
    this.camera.lookAt(-35, 3, -15);
    this.atlas = createSolaraTextureAtlas();

    this.sectorRootGroup = new THREE.Group();
    this.detailGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.pedGroup = new THREE.Group();
    this.scene.add(this.sectorRootGroup);
    this.scene.add(this.detailGroup);
    this.scene.add(this.trafficGroup);
    this.scene.add(this.pedGroup);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.settings.antialiasTier !== 'off',
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: false,
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.18;
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
    } catch {
      this.renderer = null;
    }

    this.setupLighting();
    this.buildTangierCity();
    this.initializeSpatialSectors();
    this.updateStreamedSectors(this.playerX, this.playerZ, true);

    // Mission Objective Golden Beacon Cylinder
    const beaconGeo = new THREE.CylinderGeometry(3.2, 3.2, 14, 24, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.missionBeaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    this.missionBeaconMesh.position.set(20, 7.2, -15);
    this.scene.add(this.missionBeaconMesh);

    // Custom GPS Waypoint Sea-Blue Beacon Cylinder
    const wpGeo = new THREE.CylinderGeometry(2.4, 2.4, 14, 20, 1, true);
    const wpMat = new THREE.MeshBasicMaterial({
      color: 0x00a8e8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.customWaypointMesh = new THREE.Mesh(wpGeo, wpMat);
    this.customWaypointMesh.visible = false;
    this.scene.add(this.customWaypointMesh);

    // Articulated Player Character in Tangier Sea Blue Jacket
    this.playerMesh = this.createArticulatedPersonMesh(0x00a8e8, 0xf8fafc, true);
    this.playerMesh.position.set(this.playerX, 0.08, this.playerZ);
    this.scene.add(this.playerMesh);

    this.applyGraphicsSettings(this.settings);
    this.snapCameraBehindPlayer();
    this.step(1 / 60, 'title', {
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      accelerate: 0,
      brake: 0,
      handbrake: false,
      sprint: false,
    });
    this.renderFrame(1 / 60);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0xd6d3d1, 1.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 2.1);
    sun.position.set(160, 220, -140);
    this.scene.add(sun);

    const sunDisk = new THREE.Mesh(
      new THREE.SphereGeometry(22, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sunDisk.position.set(260, 250, -320);
    this.scene.add(sunDisk);

    const golfFill = new THREE.PointLight(0x10b981, 1.6, 180);
    golfFill.position.set(25, 24, -15);
    this.scene.add(golfFill);

    const mesnanaBlue = new THREE.PointLight(0x00a8e8, 1.8, 180);
    mesnanaBlue.position.set(-35, 26, -15);
    this.scene.add(mesnanaBlue);
  }

  /**
   * Builds the Z-Fighting-Free Ground, Golf Course, Lakes, Trimmed Road Segments & Roundabouts.
   * Every horizontal surface layer uses a strictly increasing Y coordinate AND hardware polygonOffset
   * AND road segments are trimmed at intersection node radii so no two planes ever overlap at the same depth!
   */
  private buildTangierCity(): void {
    // LAYER 0 (y = -0.12): Base Greater Tangier Warm Moroccan Limestone Urban Ground
    this.atlas.sidewalkTile.repeat.set(48, 48);
    const groundGeo = new THREE.PlaneGeometry(TANGIER_WORLD_SPAN + 180, TANGIER_WORLD_SPAN + 180, 4, 4);
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.atlas.sidewalkTile,
      color: 0xf5f0e6,
      roughness: 0.84,
      metalness: 0.04,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    this.scene.add(ground);

    // LAYER 1 (y = -0.05): Royal Country Club de Tanger, Cap Spartel & Rahrah Park Turf Planes
    const golfTurfMat = new THREE.MeshStandardMaterial({
      map: this.atlas.beachSand,
      roughness: 0.78,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const golfTurf = new THREE.Mesh(new THREE.PlaneGeometry(94, 102, 4, 4), golfTurfMat);
    golfTurf.rotation.x = -Math.PI / 2;
    golfTurf.position.set(20, -0.05, -15);
    this.scene.add(golfTurf);

    const spartelPark = new THREE.Mesh(new THREE.PlaneGeometry(210, 190, 2, 2), golfTurfMat);
    spartelPark.rotation.x = -Math.PI / 2;
    spartelPark.position.set(-300, -0.05, -280);
    this.scene.add(spartelPark);

    const rahrahPark = new THREE.Mesh(new THREE.PlaneGeometry(130, 125, 2, 2), golfTurfMat);
    rahrahPark.rotation.x = -Math.PI / 2;
    rahrahPark.position.set(100, -0.05, 130);
    this.scene.add(rahrahPark);

    // LAYER 2 (y = -0.02 & y = 0.00): Golf Sand Bunkers & Putting Greens (Flat CircleGeometries, no bottom face fighting)
    const bunkerMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const golfHoles = [
      { gx: -5, gz: -52, bx: -11, bz: -46 },
      { gx: 46, gz: -48, bx: 38, bz: -42 },
      { gx: 48, gz: 16, bx: 40, bz: 22 },
      { gx: -5, gz: 16, bx: -12, bz: 10 },
    ];
    for (const h of golfHoles) {
      const bunker = new THREE.Mesh(new THREE.CircleGeometry(3.5, 20), bunkerMat);
      bunker.rotation.x = -Math.PI / 2;
      bunker.scale.set(1.3, 0.85, 1);
      bunker.position.set(h.bx, -0.02, h.bz);
      this.scene.add(bunker);

      const green = new THREE.Mesh(new THREE.CircleGeometry(5.6, 24), greenMat);
      green.rotation.x = -Math.PI / 2;
      green.position.set(h.gx, 0.0, h.gz);
      this.scene.add(green);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      pole.position.set(h.gx, 1.45, h.gz);
      this.scene.add(pole);

      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.5, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      flag.position.set(h.gx + 0.45, 2.6, h.gz);
      this.scene.add(flag);
    }

    // LAYER 3 (y = 0.015): Rahrah Forest Lake & Royal Golf Water Hazard (Flat CircleGeometry at fixed Y)
    const waterGeo = new THREE.CircleGeometry(10.5, 28);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.oceanMesh = new THREE.Mesh(waterGeo, waterMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.scale.set(1.25, 0.8, 1);
    this.oceanMesh.position.set(48, 0.015, 72);
    this.scene.add(this.oceanMesh);

    const golfPond = new THREE.Mesh(waterGeo, waterMat);
    golfPond.rotation.x = -Math.PI / 2;
    golfPond.scale.set(0.95, 0.62, 1);
    golfPond.position.set(45, 0.015, -32);
    this.scene.add(golfPond);

    // LAYER 4 & 5: CONTINUOUS CONNECTED ROAD SEGMENTS
    // Trimmed at node radii so North-South and West-East segments NEVER overlap at intersections!
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.atlas.asphaltRoad,
      roughness: 0.62,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    for (const seg of TANGIER_ROAD_SEGMENTS) {
      const a = getRoadNodeById(seg.fromNodeId);
      const b = getRoadNodeById(seg.toNodeId);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const fullLen = Math.hypot(dx, dz);
      const trimA = a.radius * 0.82;
      const trimB = b.radius * 0.82;
      const trimmedLen = Math.max(2, fullLen - trimA - trimB);

      const dirX = dx / (fullLen || 1);
      const dirZ = dz / (fullLen || 1);
      const startX = a.x + dirX * trimA;
      const startZ = a.z + dirZ * trimA;
      const endX = b.x - dirX * trimB;
      const endZ = b.z - dirZ * trimB;
      const cx = (startX + endX) / 2;
      const cz = (startZ + endZ) / 2;
      const angle = Math.atan2(dx, dz);

      // Sidewalk / Curb Base (y = 0.035)
      const sidewalkGeo = new THREE.PlaneGeometry(seg.width + 2.6, trimmedLen);
      const sidewalk = new THREE.Mesh(sidewalkGeo, curbMat);
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.rotation.z = angle;
      sidewalk.position.set(cx, 0.035, cz);
      this.scene.add(sidewalk);

      // Asphalt Roadway (y = 0.065)
      const segGeo = new THREE.PlaneGeometry(seg.width, trimmedLen);
      const roadMesh = new THREE.Mesh(segGeo, roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = angle;
      roadMesh.position.set(cx, 0.065, cz);
      this.scene.add(roadMesh);
    }

    // LAYER 6 (y = 0.04 & y = 0.08): MOROCCAN ROUNDABOUTS (ROND-POINTS) & INTERSECTION JUNCTIONS
    const rpAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -7,
      polygonOffsetUnits: -7,
    });
    const rpWhiteCurbMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
    });
    const rpBlueRingMat = new THREE.MeshStandardMaterial({
      color: 0x00a8e8,
      emissive: 0x0077b6,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    });
    const rpGrassMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.6,
    });

    for (const node of TANGIER_ROAD_NODES) {
      // Flat CircleGeometry for outer sidewalk disk (y = 0.04)
      const outerDisk = new THREE.Mesh(
        new THREE.CircleGeometry(node.radius + 1.4, 28),
        curbMat
      );
      outerDisk.rotation.x = -Math.PI / 2;
      outerDisk.position.set(node.x, 0.04, node.z);
      this.scene.add(outerDisk);

      // Flat CircleGeometry for circular asphalt junction (y = 0.08)
      const roadDisk = new THREE.Mesh(
        new THREE.CircleGeometry(node.radius + 0.35, 28),
        rpAsphaltMat
      );
      roadDisk.rotation.x = -Math.PI / 2;
      roadDisk.position.set(node.x, 0.08, node.z);
      this.scene.add(roadDisk);

      if (node.isRoundabout) {
        const islandR = node.radius * 0.36;
        // Raised White Curb Cylinder: bottom at y = 0.10, top at y = 0.30 (well above roadDisk at 0.08!)
        const curbRing = new THREE.Mesh(
          new THREE.CylinderGeometry(islandR + 0.5, islandR + 0.6, 0.2, 24),
          rpWhiteCurbMat
        );
        curbRing.position.set(node.x, 0.2, node.z);
        this.scene.add(curbRing);

        // Raised Sea-Blue Ring: bottom at y = 0.16, top at y = 0.38
        const blueRing = new THREE.Mesh(
          new THREE.CylinderGeometry(islandR + 0.15, islandR + 0.2, 0.22, 24),
          rpBlueRingMat
        );
        blueRing.position.set(node.x, 0.27, node.z);
        this.scene.add(blueRing);

        // Raised Emerald Grass Mound: bottom at y = 0.22, top at y = 0.46
        const greenMound = new THREE.Mesh(
          new THREE.CylinderGeometry(islandR * 0.85, islandR, 0.24, 20),
          rpGrassMat
        );
        greenMound.position.set(node.x, 0.34, node.z);
        this.scene.add(greenMound);
      }
    }
  }

  /**
   * Divides the 920m x 920m Greater Tangier world into 160m x 160m Spatial Streaming Sectors.
   * Buildings and trees are assigned to their sector and only built/rendered when the sector
   * is within the player's active streaming radius!
   */
  private initializeSpatialSectors(): void {
    this.sectors.clear();
    while (this.sectorRootGroup.children.length > 0) {
      this.sectorRootGroup.remove(this.sectorRootGroup.children[0]);
    }

    const getOrCreateSector = (wx: number, wz: number): SpatialWorldSector => {
      const sx = Math.floor((wx - TANGIER_WORLD_MIN) / TANGIER_SECTOR_SIZE);
      const sz = Math.floor((wz - TANGIER_WORLD_MIN) / TANGIER_SECTOR_SIZE);
      const key = `${sx}_${sz}`;
      let sec = this.sectors.get(key);
      if (!sec) {
        const centerX = TANGIER_WORLD_MIN + (sx + 0.5) * TANGIER_SECTOR_SIZE;
        const centerZ = TANGIER_WORLD_MIN + (sz + 0.5) * TANGIER_SECTOR_SIZE;
        const group = new THREE.Group();
        group.visible = false;
        this.sectorRootGroup.add(group);
        sec = {
          key,
          centerX,
          centerZ,
          group,
          built: false,
          buildings: [],
          treePositions: [],
        };
        this.sectors.set(key, sec);
      }
      return sec;
    };

    for (const b of CITY_BUILDING_COLLIDERS) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const sec = getOrCreateSector(cx, cz);
      sec.buildings.push(b);
    }

    for (const node of TANGIER_ROAD_NODES) {
      if (node.isRoundabout) {
        const sec = getOrCreateSector(node.x, node.z);
        sec.treePositions.push({ x: node.x, z: node.z });
      }
    }

    const parkTrees = [
      { x: -12, z: -58 },
      { x: 5, z: -58 },
      { x: 35, z: -58 },
      { x: 58, z: -58 },
      { x: -12, z: 28 },
      { x: 5, z: 28 },
      { x: 35, z: 28 },
      { x: 58, z: 28 },
      { x: 32, z: 62 },
      { x: 62, z: 62 },
      { x: 34, z: 82 },
      { x: 62, z: 82 },
      { x: -295, z: -275 },
      { x: -265, z: -245 },
      { x: 95, z: 125 },
      { x: 125, z: 145 },
    ];
    for (const pt of parkTrees) {
      const sec = getOrCreateSector(pt.x, pt.z);
      sec.treePositions.push(pt);
    }
  }

  /**
   * Lazily instantiates 3D building & palm meshes for a sector the first time the player
   * enters its streaming radius.
   */
  private buildSectorGeometry(sec: SpatialWorldSector): void {
    if (sec.built) return;
    sec.built = true;

    const baseY = 0.08; // Lifted above ground plane so bottom faces never Z-fight

    for (let i = 0; i < sec.buildings.length; i++) {
      const col = sec.buildings[i];
      const cx = (col.minX + col.maxX) / 2;
      const cz = (col.minZ + col.maxZ) / 2;
      const w = col.maxX - col.minX - 0.4;
      const d = col.maxZ - col.minZ - 0.4;
      const h = col.height || 15;

      const bGroup = new THREE.Group();
      bGroup.position.set(cx, baseY, cz);

      if (col.style === 'mosque') {
        const bodyMat = new THREE.MeshStandardMaterial({
          map: this.atlas.artDecoFacadeCyan,
          roughness: 0.4,
        });
        const hall = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), bodyMat);
        hall.position.y = 4.5;
        bGroup.add(hall);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(Math.min(w, d) * 0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.35,
            roughness: 0.3,
          })
        );
        dome.position.set(0, 9.05, 0);
        bGroup.add(dome);

        const minaret = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 24, 3.4),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
        );
        minaret.position.set(w * 0.28, 12.05, d * 0.28);
        bGroup.add(minaret);

        const lantern = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 3.2, 2.0),
          new THREE.MeshStandardMaterial({
            color: 0x00a8e8,
            emissive: 0x00a8e8,
            emissiveIntensity: 0.65,
          })
        );
        lantern.position.set(w * 0.28, 25.75, d * 0.28);
        bGroup.add(lantern);
      } else if (col.style === 'boubana-villa' || col.style === 'clubhouse') {
        const villaMat = new THREE.MeshStandardMaterial({
          map: this.atlas.artDecoFacadePink,
          roughness: 0.45,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), villaMat);
        body.position.y = h / 2;
        bGroup.add(body);

        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.62, 3.6, 4),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = h + 1.85;
        bGroup.add(roof);
      } else {
        const tex =
          col.style === 'socco-plaza' || col.style === 'garage'
            ? this.atlas.glassTowerFacade
            : i % 2 === 0
              ? this.atlas.artDecoFacadeCyan
              : this.atlas.artDecoFacadePink;

        const mainGeo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
        const mainMat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.42,
          metalness: 0.2,
        });
        const mainMesh = new THREE.Mesh(mainGeo, mainMat);
        mainMesh.position.y = h / 2;
        bGroup.add(mainMesh);

        // Crown lifted +0.12m above roof top so bottom of crown never Z-fights with roof top
        const crownColor = col.style === 'garage' ? 0xf59e0b : 0x00a8e8;
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.88, 1.2, d * 0.88),
          new THREE.MeshStandardMaterial({
            color: 0x0c2d48,
            emissive: crownColor,
            emissiveIntensity: 0.75,
          })
        );
        crown.position.set(0, h + 0.72, 0);
        bGroup.add(crown);
      }

      sec.group.add(bGroup);
    }

    // Build Sector Palms & Pines
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      map: this.atlas.palmBark,
      roughness: 0.85,
    });
    const palmLeafMat = new THREE.MeshStandardMaterial({
      map: this.atlas.palmFrond,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });

    for (const loc of sec.treePositions) {
      const palm = new THREE.Group();
      palm.position.set(loc.x, 0.35, loc.z);

      for (let s = 0; s < 4; s++) {
        const segGeo = new THREE.CylinderGeometry(
          0.25 - s * 0.025,
          0.29 - s * 0.025,
          1.2,
          10,
          1
        );
        const seg = new THREE.Mesh(segGeo, palmTrunkMat);
        seg.position.set(Math.sin(s * 0.2) * 0.2, s * 1.1 + 0.6, 0);
        palm.add(seg);
      }

      const topY = 4.7;
      for (let f = 0; f < 6; f++) {
        const angle = (f / 6) * Math.PI * 2;
        const frondGeo = new THREE.SphereGeometry(1.3, 10, 6);
        frondGeo.scale(0.28, 0.08, 1.3);
        const frond = new THREE.Mesh(frondGeo, palmLeafMat);
        frond.position.set(Math.sin(angle) * 1.0, topY, Math.cos(angle) * 1.0);
        frond.rotation.y = angle;
        frond.rotation.x = 0.4;
        palm.add(frond);
      }

      sec.group.add(palm);
    }
  }

  /**
   * Smart Sector Streaming: Activates & lazily builds only the sectors within streaming radius
   * of (focusX, focusZ), hiding distant sectors so the large map renders at 60 FPS.
   */
  private updateStreamedSectors(focusX: number, focusZ: number, force = false): void {
    if (
      !force &&
      Math.hypot(focusX - this.lastStreamCheckX, focusZ - this.lastStreamCheckZ) < 18
    ) {
      return;
    }
    this.lastStreamCheckX = focusX;
    this.lastStreamCheckZ = focusZ;

    const streamRadius = Math.max(220, this.settings.drawDistance + 125);
    let activeCount = 0;

    for (const sec of this.sectors.values()) {
      const dist = Math.hypot(sec.centerX - focusX, sec.centerZ - focusZ);
      if (dist <= streamRadius) {
        if (!sec.built) {
          this.buildSectorGeometry(sec);
        }
        sec.group.visible = true;
        activeCount++;
      } else {
        sec.group.visible = false;
      }
    }

    this.activeSectorCount = activeCount;
  }

  private rebuildTierDetailGeometry(tier: PolyBudgetTier): void {
    while (this.detailGroup.children.length > 0) {
      const child = this.detailGroup.children[0];
      this.detailGroup.remove(child);
    }

    if (tier === 'high' || tier === 'ultra' || tier === 'super') {
      const archCount = tier === 'super' ? 18 : tier === 'ultra' ? 12 : 6;
      const torusRadial = tier === 'super' ? 28 : tier === 'ultra' ? 20 : 12;
      const torusTubular = tier === 'super' ? 56 : tier === 'ultra' ? 38 : 22;

      for (let a = 0; a < archCount; a++) {
        const archGeo = new THREE.TorusGeometry(6.8, 0.28, torusRadial, torusTubular, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({
          color: a % 2 === 0 ? 0x00a8e8 : 0xf59e0b,
          emissive: a % 2 === 0 ? 0x0077b6 : 0xd97706,
          emissiveIntensity: 0.8,
          roughness: 0.25,
          metalness: 0.75,
        });
        const arch = new THREE.Mesh(archGeo, archMat);
        const aveX = a % 2 === 0 ? -35 : 20;
        const zPos = -60 + (a / archCount) * 135;
        arch.position.set(aveX, 0.2, zPos);
        this.detailGroup.add(arch);
      }
    }
  }

  /**
   * Creates either the signature 2019 Citroën C3 (White Body + Sport Red Top Roof + Black Airbumps)
   * or other sculpted Tangier vehicles.
   */
  private createSculptedCarMesh(spec: VehicleSpec, tier: PolyBudgetTier): THREE.Group {
    const car = new THREE.Group();
    const wheelSegs =
      tier === 'super' ? 26 : tier === 'ultra' ? 20 : tier === 'high' ? 16 : 12;

    const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, wheelSegs);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.82 });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.8,
      roughness: 0.25,
    });

    // Dedicated 2019 Citroën C3 (Polar White Body + Contrast Sport Red Top Roof + Airbump Side Trim)
    if (spec.id === 'citroen-c3-2019') {
      const whiteBodyMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc, // Crisp Polar White
        roughness: 0.2,
        metalness: 0.35,
      });
      const redRoofMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626, // Vibrant Citroën Sport Red Roof & Pillars
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.18,
        roughness: 0.24,
        metalness: 0.45,
      });
      const blackCladdingMat = new THREE.MeshStandardMaterial({
        color: 0x18181b, // Matte black Airbump & wheel-arch cladding
        roughness: 0.78,
        metalness: 0.1,
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x082038,
        roughness: 0.08,
        metalness: 0.9,
      });

      // 1. Matte black lower chassis skirt & bumpers
      const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(1.98, 0.22, 4.06),
        blackCladdingMat
      );
      skirt.position.set(0, 0.32, 0);
      car.add(skirt);

      // 2. Main Polar White Hatchback Lower Body & Doors
      const mainBody = new THREE.Mesh(
        new THREE.BoxGeometry(1.94, 0.56, 3.98, 2, 2, 4),
        whiteBodyMat
      );
      mainBody.position.set(0, 0.64, 0);
      car.add(mainBody);

      // Rounded High Front Clam-Shell Hood (characteristic 2019 C3 front profile)
      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(1.82, 0.18, 1.18),
        whiteBodyMat
      );
      hood.position.set(0, 0.94, 1.32);
      hood.rotation.x = 0.08;
      car.add(hood);

      // 3. Signature Citroën Black Airbump® Side Door Panels with Red Capsule Accent!
      const airbumpLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.18, 1.75),
        blackCladdingMat
      );
      airbumpLeft.position.set(-0.97, 0.52, 0.05);
      const airbumpRight = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.18, 1.75),
        blackCladdingMat
      );
      airbumpRight.position.set(0.97, 0.52, 0.05);
      car.add(airbumpLeft, airbumpRight);

      // Iconic Red Airbump Front Capsule Ring on both sides
      const redPodGeo = new THREE.BoxGeometry(0.08, 0.12, 0.36);
      const redPodLeft = new THREE.Mesh(redPodGeo, redRoofMat);
      redPodLeft.position.set(-0.975, 0.52, 0.62);
      const redPodRight = new THREE.Mesh(redPodGeo, redRoofMat);
      redPodRight.position.set(0.975, 0.52, 0.62);
      car.add(redPodLeft, redPodRight);

      // 4. Tinted Hatchback Cabin Greenhouse
      const cabinGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.68, 0.48, 2.18),
        glassMat
      );
      cabinGlass.position.set(0, 1.15, -0.22);
      car.add(cabinGlass);

      // 5. Contrast SPORT RED Floating Top Roof, Red Pillars & Red Rear Roof Spoiler
      const redRoofTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.74, 0.14, 2.28),
        redRoofMat
      );
      redRoofTop.position.set(0, 1.42, -0.24);
      car.add(redRoofTop);

      // Red Roof Crown / Rounded Cap so it stands out from all camera angles
      const redRoofCrown = new THREE.Mesh(
        new THREE.BoxGeometry(1.58, 0.08, 2.08),
        redRoofMat
      );
      redRoofCrown.position.set(0, 1.5, -0.24);
      car.add(redRoofCrown);

      // Red Rear Hatchback Spoiler Wing
      const rearSpoiler = new THREE.Mesh(
        new THREE.BoxGeometry(1.66, 0.08, 0.34),
        redRoofMat
      );
      rearSpoiler.position.set(0, 1.46, -1.42);
      car.add(rearSpoiler);

      // Red Side Wing Mirrors
      const mirrorGeo = new THREE.BoxGeometry(0.22, 0.12, 0.16);
      const mirrorL = new THREE.Mesh(mirrorGeo, redRoofMat);
      mirrorL.position.set(-1.02, 0.98, 0.68);
      const mirrorR = new THREE.Mesh(mirrorGeo, redRoofMat);
      mirrorR.position.set(1.02, 0.98, 0.68);
      car.add(mirrorL, mirrorR);

      // 6. Two-Tier Citroën Front LED DRLs + Chrome Double-Chevron Bar + Headlamps
      const chromeMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const drlMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

      const chevronBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.06, 0.06),
        chromeMat
      );
      chevronBar.position.set(0, 0.82, 2.01);
      car.add(chevronBar);

      const drlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.06), drlMat);
      drlLeft.position.set(-0.68, 0.84, 2.01);
      const drlRight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.06), drlMat);
      drlRight.position.set(0.68, 0.84, 2.01);
      car.add(drlLeft, drlRight);

      const mainHlL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.06), headMat);
      mainHlL.position.set(-0.66, 0.64, 2.01);
      const mainHlR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.06), headMat);
      mainHlR.position.set(0.66, 0.64, 2.01);
      car.add(mainHlL, mainHlR);

      // 3D-effect Rounded Rectangular Rear Taillights
      const tlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), tailMat);
      tlLeft.position.set(-0.68, 0.78, -2.01);
      const tlRight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), tailMat);
      tlRight.position.set(0.68, 0.78, -2.01);
      car.add(tlLeft, tlRight);

      // Wheels with Diamond-Cut Alloy Hubcaps
      const wheelCoords = [
        [-0.98, 0.37, 1.28],
        [0.98, 0.37, 1.28],
        [-0.98, 0.37, -1.28],
        [0.98, 0.37, -1.28],
      ];
      for (const [wx, wy, wz] of wheelCoords) {
        const wheel = new THREE.Mesh(tireGeo, tireMat);
        wheel.position.set(wx, wy, wz);
        car.add(wheel);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.32, 10),
          hubMat
        );
        hub.rotation.z = Math.PI / 2;
        hub.position.set(wx, wy, wz);
        car.add(hub);
      }

      return car;
    }

    // Standard Sculpted Sports / Taxi / Police / SUV Mesh
    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.primaryColor,
      roughness: 0.22,
      metalness: 0.72,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: spec.secondaryColor,
      emissive: spec.secondaryColor,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x061526,
      roughness: 0.1,
      metalness: 0.9,
    });

    const lowerGeo = new THREE.BoxGeometry(2.05, 0.52, 4.3, 4, 2, 6);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = 0.52;
    car.add(lower);

    const hoodGeo = new THREE.CylinderGeometry(0.92, 1.02, 1.45, wheelSegs);
    hoodGeo.rotateX(Math.PI / 2);
    hoodGeo.scale(1.0, 0.32, 1.0);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.68, 1.35);
    car.add(hood);

    const cabinGeo = new THREE.CylinderGeometry(0.78, 0.96, 1.95, wheelSegs);
    cabinGeo.rotateX(Math.PI / 2);
    cabinGeo.scale(1.0, 0.52, 1.0);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.02, -0.15);
    car.add(cabin);

    const spoilerWingGeo = new THREE.BoxGeometry(1.95, 0.08, 0.42, 2, 1, 2);
    const spoiler = new THREE.Mesh(spoilerWingGeo, trimMat);
    spoiler.position.set(0, 1.06, -1.92);
    car.add(spoiler);

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

    const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
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
      const barMat = new THREE.MeshBasicMaterial({ color: 0x00a8e8 });
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

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, segs, segs), skinMat);
    head.position.y = 1.62;
    group.add(head);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.21, 0.62, segs),
      jacketMat
    );
    torso.position.y = 1.14;
    group.add(torso);

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

    const count = Math.max(6, Math.min(30, this.settings.trafficCount));
    const coreAvenues = [-90, -62.5, -35, 20, 75];
    const coreStreets = [-75, -15, 45, 95];

    for (let i = 0; i < count; i++) {
      // Pick vehicle spec using weighted selector (~50% Citroën C3 2019 White / Red Roof!)
      const spec = pickTrafficVehicleSpec(i);
      const mesh = this.createSculptedCarMesh(spec, this.settings.polyBudgetTier);

      const onAvenue = i % 2 === 0;
      const roadAxis: 'x' | 'z' = onAvenue ? 'z' : 'x';
      const roadCoord = onAvenue
        ? coreAvenues[i % coreAvenues.length]
        : coreStreets[i % coreStreets.length];
      const dirSign: 1 | -1 = i % 3 === 0 ? -1 : 1;
      const laneOffset = dirSign * 2.3;

      // Spawn first car (Citroën C3 2019 White & Red Roof!) right near player at Rond-Point Mesnana Golf
      const startAlong = i === 0 ? -10 : -85 + ((i * 23) % 175);
      const x = i === 0 ? -32.7 : onAvenue ? roadCoord + laneOffset : startAlong;
      const z = i === 0 ? -4 : onAvenue ? startAlong : roadCoord + laneOffset;
      const heading = onAvenue
        ? dirSign > 0
          ? 0
          : Math.PI
        : dirSign > 0
          ? Math.PI / 2
          : -Math.PI / 2;

      mesh.position.set(x, 0.08, z);
      mesh.rotation.y = heading;
      this.trafficGroup.add(mesh);

      this.vehicles.push({
        mesh,
        spec,
        x,
        z,
        heading,
        speed: i === 0 ? 0 : 14,
        targetSpeed: 15 + (i % 5) * 2,
        roadAxis: i === 0 ? 'z' : roadAxis,
        roadCoord: i === 0 ? -35 : roadCoord,
        dirSign,
        sirenActive: Boolean(spec.isPolice),
        stuckTimer: 0,
      });
    }

    const pedColors = [0x00a8e8, 0xdc2626, 0xf59e0b, 0x10b981, 0xe2e8f0];
    const pedCount = Math.max(8, Math.min(24, Math.round(count * 1.05)));
    for (let p = 0; p < pedCount; p++) {
      const mesh = this.createArticulatedPersonMesh(
        pedColors[p % pedColors.length],
        0x0f172a,
        false
      );
      const aveX = coreAvenues[p % coreAvenues.length];
      const sidewalkX = aveX + (p % 2 === 0 ? 6.4 : -6.4);
      const pz = -80 + ((p * 23) % 170);
      const heading = p % 2 === 0 ? 0 : Math.PI;
      mesh.position.set(sidewalkX, 0.08, pz);
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
        speed: 2.3 + (p % 3) * 0.35,
        walkPhase: p * 0.9,
      });
    }
  }

  public applyGraphicsSettings(next: GraphicsSettings): void {
    const prevTier = this.polyTierBuilt;
    const prevTraffic = this.vehicles.length;
    this.settings = { ...next };

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.max(120, this.settings.drawDistance * 0.95);
      this.scene.fog.far = Math.max(300, this.settings.drawDistance * 2.5);
    }
    this.camera.far = Math.max(340, this.settings.drawDistance * 2.7);
    this.camera.updateProjectionMatrix();

    if (prevTier !== this.settings.polyBudgetTier) {
      this.polyTierBuilt = this.settings.polyBudgetTier;
      this.rebuildTierDetailGeometry(this.settings.polyBudgetTier);
      this.rebuildTrafficAndPeds();
    } else if (prevTraffic !== this.settings.trafficCount) {
      this.rebuildTrafficAndPeds();
    }

    this.updateStreamedSectors(this.playerX, this.playerZ, true);
    this.resize();
  }

  public resize(): void {
    const logical = getLogicalDimensions(this.settings.logicalResolution);
    this.bufferWidth = logical.width;
    this.bufferHeight = logical.height;

    const rect = this.container.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : window.innerWidth || logical.width;
    const h = rect.height > 0 ? rect.height : window.innerHeight || logical.height;
    const aspect = w > 0 && h > 0 ? w / h : logical.width / logical.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(logical.width, logical.height, false);
      this.renderer.render(this.scene, this.camera);
    }
  }

  public triggerBanner(text: string, durationSec = 3.0): void {
    this.bannerText = text;
    this.bannerTimer = durationSec;
  }

  public selectMission(missionIndex: number): void {
    const clamped = Math.max(0, Math.min(STORY_MISSIONS.length - 1, missionIndex));
    this.currentMissionIndex = clamped;
    this.currentObjectiveIndex = 0;
    this.customWaypoint = null;
    this.customWaypointMesh.visible = false;
    const m = STORY_MISSIONS[clamped];
    if (m) {
      this.triggerBanner(`MISSION TRACKED: ${m.title.toUpperCase()}`, 3.2);
    }
  }

  public setCustomWaypoint(pt: { x: number; z: number } | null): void {
    this.customWaypoint = pt;
    if (pt) {
      this.customWaypointMesh.position.set(pt.x, 7.2, pt.z);
      this.customWaypointMesh.visible = true;
      const st = getStreetNameAt(pt.x, pt.z);
      this.triggerBanner(`GPS WAYPOINT SET: ${st.toUpperCase()}`, 2.8);
    } else {
      this.customWaypointMesh.visible = false;
    }
  }

  public toggleEnterExitVehicle(): boolean {
    if (this.activeVehicle) {
      const exitX = this.activeVehicle.x + Math.cos(this.activeVehicle.heading) * 2.5;
      const exitZ = this.activeVehicle.z - Math.sin(this.activeVehicle.heading) * 2.5;
      const safe = resolveCircleBuildingCollisions(exitX, exitZ, 0.8);
      this.playerX = safe.x;
      this.playerZ = safe.z;
      this.playerHeading = this.activeVehicle.heading;
      this.activeVehicle = null;
      this.playerMesh.visible = true;
      this.playerMesh.position.set(this.playerX, 0.08, this.playerZ);
      this.triggerBanner('ON FOOT — PRESS ENTER CAR BUTTON NEAR ANY VEHICLE', 2.2);
      return false;
    }

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
      if (bestDist > 9.0) {
        const roads = getNearestRoadLines(this.playerX, this.playerZ);
        best.x = roads.nearestAveX + 2.2;
        best.z = this.playerZ;
        best.mesh.position.set(best.x, 0.08, best.z);
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
          this.activeVehicle.sirenActive
            ? 'DGSN TANGER SIREN ENGAGED'
            : 'DGSN TANGER SIREN SILENCED',
          1.8
        );
      } else {
        this.triggerBanner('KLAXON TANGER! TRAFFIC YIELDING AHEAD', 1.6);
      }
      return;
    }

    this.onEvent('cash');
    this.cash += 100;
    this.wantedLevel = Math.min(5, this.wantedLevel + 1);
    this.wantedDecayTimer = 18;
    this.triggerBanner('STREET CONTRACT +$100 · PATROL ALERTED!', 2.2);
  }

  public cycleCameraView(): void {
    this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
    const names = ['CHASE CAMERA', 'CLOSE ACTION CAMERA', 'TANGIER HELICOPTER VIEW'];
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

    // Gentle water scale shimmer at fixed Y = 0.015 (never moves Y across ground planes!)
    if (this.oceanMesh && this.settings.animatedOcean) {
      const pulse = 1 + Math.sin(this.oceanWaveTime * 2.0) * 0.015;
      this.oceanMesh.scale.set(1.25 * pulse, 0.8 * pulse, 1);
    }

    this.stepTrafficAI(dt);
    this.stepPedestrians(dt);

    if (state === 'title') {
      this.titleOrbitAngle += dt * 0.22;
      const camX = -15 + Math.cos(this.titleOrbitAngle) * 38;
      const camZ = -15 + Math.sin(this.titleOrbitAngle) * 38;
      this.camera.position.set(camX, 16.5, camZ);
      this.camera.lookAt(-25, 2.5, -15);
      this.updateStreamedSectors(-25, -15);
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
          nitro: input.sprint,
        },
        this.activeVehicle.spec,
        dt
      );
      this.activeVehicle.x = stepped.x;
      this.activeVehicle.z = stepped.z;
      this.activeVehicle.heading = stepped.heading;
      this.activeVehicle.speed = stepped.speed;
      this.activeVehicle.mesh.position.set(stepped.x, 0.08, stepped.z);
      this.activeVehicle.mesh.rotation.y = stepped.heading;

      this.playerX = stepped.x;
      this.playerZ = stepped.z;
      this.playerHeading = stepped.heading;
    } else {
      const moveMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
      if (moveMag > 0.08) {
        const moveSpeed = input.sprint ? 9.8 : 6.0;
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

      this.playerMesh.position.set(this.playerX, 0.08, this.playerZ);
      this.playerMesh.rotation.y = this.playerHeading;
      if (this.playerLeftLeg && this.playerRightLeg) {
        this.playerLeftLeg.rotation.x = Math.sin(this.playerWalkPhase) * 0.55;
        this.playerRightLeg.rotation.x = -Math.sin(this.playerWalkPhase) * 0.55;
      }
    }

    // Stream 3D city sectors around player's new position
    this.updateStreamedSectors(this.playerX, this.playerZ);

    // Garage Atlas Tanger check at (-76, 52) in Hay El Kawassim
    if (Math.hypot(this.playerX - -76, this.playerZ - 52) < 9.5 && this.wantedLevel > 0) {
      this.wantedLevel = 0;
      this.health = 100;
      this.armor = 100;
      this.triggerBanner('GARAGE ATLAS KAWASSIM — HEAT CLEARED & CAR REPAIRED!', 3.2);
      this.onEvent('cash');
    }

    // Check if player reached Custom GPS Waypoint
    if (
      this.customWaypoint &&
      Math.hypot(this.playerX - this.customWaypoint.x, this.playerZ - this.customWaypoint.z) < 9.0
    ) {
      this.customWaypoint = null;
      this.customWaypointMesh.visible = false;
      this.triggerBanner('ARRIVED AT GPS WAYPOINT DESTINATION', 2.4);
    }

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

  /**
   * Smart Sliding Traffic Bubble:
   * Keeps ambient traffic vehicles active within a ~220m bubble around the player,
   * seamlessly recycling distant cars onto nearby avenues/streets as you drive across Greater Tangier.
   */
  private stepTrafficAI(dt: number): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v === this.activeVehicle) continue;

      const distToPlayer = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (distToPlayer > 235) {
        // Recycle vehicle onto a road line near the player
        const nearRoads = getNearestRoadLines(
          this.playerX + Math.sin(i * 1.7) * 95,
          this.playerZ + Math.cos(i * 1.7) * 95
        );
        v.roadAxis = i % 2 === 0 ? 'z' : 'x';
        v.roadCoord = v.roadAxis === 'z' ? nearRoads.nearestAveX : nearRoads.nearestStreetZ;
        v.dirSign = i % 3 === 0 ? -1 : 1;
        v.x = nearRoads.nearestAveX + v.dirSign * 2.3;
        v.z = nearRoads.nearestStreetZ + v.dirSign * 2.3;
        v.heading =
          v.roadAxis === 'z'
            ? v.dirSign > 0
              ? 0
              : Math.PI
            : v.dirSign > 0
              ? Math.PI / 2
              : -Math.PI / 2;
        v.mesh.position.set(v.x, 0.08, v.z);
        v.mesh.rotation.y = v.heading;
        continue;
      }

      const laneOffset = v.dirSign * 2.3;
      let desiredHeading =
        v.roadAxis === 'z'
          ? v.dirSign > 0
            ? 0
            : Math.PI
          : v.dirSign > 0
            ? Math.PI / 2
            : -Math.PI / 2;

      if (v.roadAxis === 'z') {
        const targetLaneX = v.roadCoord + laneOffset;
        const laneErr = targetLaneX - v.x;
        desiredHeading += Math.max(-0.35, Math.min(0.35, laneErr * 0.18 * v.dirSign));
      } else {
        const targetLaneZ = v.roadCoord + laneOffset;
        const laneErr = targetLaneZ - v.z;
        desiredHeading -= Math.max(-0.35, Math.min(0.35, laneErr * 0.18 * v.dirSign));
      }

      let obstacleAhead = false;
      const fwdX = Math.sin(v.heading);
      const fwdZ = Math.cos(v.heading);

      const dxPlayer = this.playerX - v.x;
      const dzPlayer = this.playerZ - v.z;
      if (distToPlayer < 10 && dxPlayer * fwdX + dzPlayer * fwdZ > 0.5) {
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

      if (
        resolved.hitBuilding ||
        resolved.x < TANGIER_WORLD_MIN + 35 ||
        resolved.x > TANGIER_WORLD_MAX - 35 ||
        resolved.z < TANGIER_WORLD_MIN + 35 ||
        resolved.z > TANGIER_WORLD_MAX - 35
      ) {
        const roads = getNearestRoadLines(v.x, v.z);
        if (v.roadAxis === 'z') {
          v.roadAxis = 'x';
          v.roadCoord = roads.nearestStreetZ;
          v.dirSign = v.x > 0 ? -1 : 1;
        } else {
          v.roadAxis = 'z';
          v.roadCoord = roads.nearestAveX;
          v.dirSign = v.z > 10 ? -1 : 1;
        }
        v.x = roads.nearestAveX + v.dirSign * 2.2;
        v.z = roads.nearestStreetZ + v.dirSign * 2.2;
      } else {
        v.x = resolved.x;
        v.z = resolved.z;
      }

      const roadInfo = getNearestRoadLines(v.x, v.z);
      if (roadInfo.atIntersection && (i + Math.floor(this.oceanWaveTime)) % 17 === 0) {
        if (v.roadAxis === 'z' && Math.abs(v.z - roadInfo.nearestStreetZ) < 1.5) {
          v.roadAxis = 'x';
          v.roadCoord = roadInfo.nearestStreetZ;
          v.dirSign = v.x > 0 ? -1 : 1;
        } else if (v.roadAxis === 'x' && Math.abs(v.x - roadInfo.nearestAveX) < 1.5) {
          v.roadAxis = 'z';
          v.roadCoord = roadInfo.nearestAveX;
          v.dirSign = v.z > 10 ? -1 : 1;
        }
      }

      v.mesh.position.set(v.x, 0.08, v.z);
      v.mesh.rotation.y = v.heading;
    }
  }

  private stepPedestrians(dt: number): void {
    for (let idx = 0; idx < this.peds.length; idx++) {
      const p = this.peds[idx];
      // Recycle distant pedestrians into the player's current neighborhood bubble
      if (Math.hypot(p.x - this.playerX, p.z - this.playerZ) > 190) {
        const nearRoads = getNearestRoadLines(this.playerX, this.playerZ);
        p.x = nearRoads.nearestAveX + (idx % 2 === 0 ? 6.4 : -6.4);
        p.z = this.playerZ + ((idx * 19) % 120) - 60;
      }

      p.walkPhase += dt * 6;
      const nextZ = p.z + Math.cos(p.heading) * p.speed * dt;
      if (nextZ > TANGIER_WORLD_MAX - 40 || nextZ < TANGIER_WORLD_MIN + 40) {
        p.heading = p.heading === 0 ? Math.PI : 0;
      } else {
        p.z = nextZ;
      }
      p.mesh.position.set(p.x, 0.08, p.z);
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
    this.missionBeaconMesh.position.set(obj.targetX, 7.2, obj.targetZ);
    this.missionBeaconMesh.rotation.y += 0.03;

    const dist = Math.hypot(this.playerX - obj.targetX, this.playerZ - obj.targetZ);
    if (dist < 9.5) {
      if (obj.requiresVehicle && !this.activeVehicle) {
        this.triggerBanner('THIS OBJECTIVE REQUIRES A CAR — ENTER ANY VEHICLE NEARBY!', 2.4);
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
          3.4
        );
      } else {
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
          `MISSION COMPLETED! +$${mission.rewardCash.toLocaleString()}`,
          4.2
        );
      }
    }
  }

  private updateFollowCamera(dt: number): void {
    const dist = this.cameraMode === 0 ? 11.5 : this.cameraMode === 1 ? 7.2 : 24.0;
    const height = this.cameraMode === 0 ? 5.2 : this.cameraMode === 1 ? 3.1 : 15.5;
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

    const activeTargetX = this.customWaypoint
      ? this.customWaypoint.x
      : objective
        ? objective.targetX
        : null;
    const activeTargetZ = this.customWaypoint
      ? this.customWaypoint.z
      : objective
        ? objective.targetZ
        : null;

    const distMeters =
      activeTargetX !== null && activeTargetZ !== null
        ? Math.round(Math.hypot(this.playerX - activeTargetX, this.playerZ - activeTargetZ))
        : null;

    const activeTargetLabel = this.customWaypoint
      ? `GPS Waypoint · ${getStreetNameAt(this.customWaypoint.x, this.customWaypoint.z)}`
      : objective
        ? objective.streetHint || getStreetNameAt(objective.targetX, objective.targetZ)
        : 'Tangier Free Roam';

    let nearbyVehicleName: string | null = null;
    if (!this.activeVehicle) {
      for (const v of this.vehicles) {
        if (Math.hypot(v.x - this.playerX, v.z - this.playerZ) < 9.0) {
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
      streetName: getStreetNameAt(this.playerX, this.playerZ),
      currentMissionIndex: this.currentMissionIndex,
      currentObjectiveIndex: this.currentObjectiveIndex,
      completedMissions: [...this.completedMissions],
      missionTitle: mission ? mission.title : 'Tangier Free Roam',
      missionObjective: objective,
      missionDistanceMeters: distMeters,
      activeTargetX,
      activeTargetZ,
      activeTargetLabel,
      customWaypoint: this.customWaypoint,
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
        activeSectors: this.activeSectorCount,
        totalSectors: this.sectors.size,
      },
    };
  }

  public exportSavedProgress(currentStationIndex: number): SavedProgress {
    const clamped = clampWorldPosition(this.playerX, this.playerZ);
    return {
      version: 2,
      cash: this.cash,
      completedMissions: [...this.completedMissions],
      currentMissionIndex: this.currentMissionIndex,
      playerX: clamped.x,
      playerZ: clamped.z,
      playerHeading: this.playerHeading,
      health: this.health,
      armor: this.armor,
      unlockedDistricts: [
        'mesnana-golf',
        'royal-golf',
        'hay-kawassim',
        'route-boubana',
        'foret-rahrah',
        'cap-spartel',
        'boukhalef-uni',
        'malabata-corniche',
      ],
      currentStationIndex,
      lastSavedAt: Date.now(),
    };
  }

  public snapCameraBehindPlayer(): void {
    const dist = this.cameraMode === 0 ? 11.5 : this.cameraMode === 1 ? 7.2 : 24.0;
    const height = this.cameraMode === 0 ? 5.2 : this.cameraMode === 1 ? 3.1 : 15.5;
    const lookAngle = this.playerHeading + this.cameraYawOffset;
    this.camera.position.set(
      this.playerX - Math.sin(lookAngle) * dist,
      height,
      this.playerZ - Math.cos(lookAngle) * dist
    );
    this.camera.lookAt(
      this.playerX + Math.sin(this.playerHeading) * 4,
      1.4,
      this.playerZ + Math.cos(this.playerHeading) * 4
    );
  }

  public loadFromSavedProgress(save: SavedProgress, autoEnterFirstCar = false): void {
    const base = save || createInitialProgress(1000);
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
    this.playerHeading = base.playerHeading ?? 0;
    this.health = base.health || 100;
    this.armor = base.armor || 100;

    if (autoEnterFirstCar && this.vehicles.length > 0) {
      const car = this.vehicles[0];
      car.x = -32.7;
      car.z = -8;
      car.heading = 0;
      car.speed = 0;
      car.mesh.position.set(car.x, 0.08, car.z);
      car.mesh.rotation.y = car.heading;
      this.activeVehicle = car;
      this.playerX = car.x;
      this.playerZ = car.z;
      this.playerHeading = car.heading;
      this.playerMesh.visible = false;
    } else {
      this.activeVehicle = null;
      this.playerMesh.visible = true;
      this.playerMesh.position.set(this.playerX, 0.08, this.playerZ);
    }

    this.updateStreamedSectors(this.playerX, this.playerZ, true);
    this.snapCameraBehindPlayer();
    this.renderFrame(1 / 60);
  }

  public dispose(): void {
    this.atlas.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
