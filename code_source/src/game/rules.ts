import type {
  BuildingCollider,
  ControllerLayoutStyle,
  ControllerMapping,
  DistrictId,
  DistrictInfo,
  GameActionId,
  GraphicsPresetId,
  GraphicsSettings,
  LanguageCode,
  LogicalResolutionId,
  MissionDef,
  RadioTrack,
  SavedProgress,
  VehicleSpec,
} from './types.ts';

export const ROAD_AVENUES_X = [-80, -40, 0, 40] as const;
export const ROAD_STREETS_Z = [-80, -40, 0, 40, 80] as const;

export const SOLARA_DISTRICTS: DistrictInfo[] = [
  {
    id: 'starlight-beach',
    name: 'Starlight Beach',
    tagline: 'Pastel Art Deco hotels, palm promenade & golden shoreline',
    color: '#00f5d4',
    bounds: { minX: -15, maxX: 110, minZ: -110, maxZ: 110 },
  },
  {
    id: 'neon-strip',
    name: 'The Neon Strip',
    tagline: 'High-rise synth clubs, arcades & midnight boulevards',
    color: '#ff2e93',
    bounds: { minX: -65, maxX: -15, minZ: -60, maxZ: 60 },
  },
  {
    id: 'coral-heights',
    name: 'Coral Heights',
    tagline: 'Sunset villas, bayside plazas & palm estates',
    color: '#ffb347',
    bounds: { minX: -115, maxX: -15, minZ: -115, maxZ: -60 },
  },
  {
    id: 'palm-harbor',
    name: 'Palm Harbor',
    tagline: 'Yacht slips, speedboats & coastal cargo piers',
    color: '#38bdf8',
    bounds: { minX: -65, maxX: -15, minZ: 60, maxZ: 115 },
  },
  {
    id: 'sunset-industrial',
    name: 'Sunset Industrial',
    tagline: 'Warehouses, Pay-n-Spray customs & freight yards',
    color: '#a855f7',
    bounds: { minX: -115, maxX: -65, minZ: -60, maxZ: 115 },
  },
];

/**
 * Exact AABB colliders for all city building blocks between avenues (-80, -40, 0, 40)
 * and cross streets (-80, -40, 0, 40, 80). Roads have a 12m clear corridor (+/-6m from center).
 */
export const CITY_BUILDING_COLLIDERS: BuildingCollider[] = (() => {
  const list: BuildingCollider[] = [];
  const blockCentersX = [-96, -60, -20, 20];
  const blockCentersZ = [-96, -60, -20, 20, 60, 96];

  for (let ix = 0; ix < blockCentersX.length; ix++) {
    for (let iz = 0; iz < blockCentersZ.length; iz++) {
      const bx = blockCentersX[ix];
      const bz = blockCentersZ[iz];
      // Leave Pay 'n' Spray drive-thru courtyard at (-96, 20) open on its eastern entrance
      if (Math.abs(bx - -96) < 4 && Math.abs(bz - 20) < 4) {
        list.push({
          minX: -104,
          maxX: -90,
          minZ: 13,
          maxZ: 27,
        });
        continue;
      }
      const halfW = bx === 20 ? 7.2 : 8.5;
      const halfD = 12.2;
      list.push({
        minX: bx - halfW,
        maxX: bx + halfW,
        minZ: bz - halfD,
        maxZ: bz + halfD,
      });
    }
  }
  return list;
})();

export const VEHICLE_SPECS: VehicleSpec[] = [
  {
    id: 'solara-countach',
    brand: 'TORERO',
    modelName: "Torero V12 Mirage '88",
    topSpeed: 42,
    acceleration: 28,
    handling: 3.1,
    primaryColor: 0xf8fafc,
    secondaryColor: 0x00f5d4,
  },
  {
    id: 'bay-cruiser',
    brand: 'VERCINI',
    modelName: 'Bay Cruiser Spider',
    topSpeed: 37,
    acceleration: 24,
    handling: 2.9,
    primaryColor: 0xff2e93,
    secondaryColor: 0xffe66d,
  },
  {
    id: 'vice-stallion',
    brand: 'SABRE',
    modelName: 'Vice Stallion GT',
    topSpeed: 35,
    acceleration: 25,
    handling: 2.7,
    primaryColor: 0x00f5d4,
    secondaryColor: 0x1e293b,
  },
  {
    id: 'scpd-interceptor',
    brand: 'SOLARA PD',
    modelName: 'SCPD Pursuit Interceptor',
    topSpeed: 39,
    acceleration: 27,
    handling: 3.0,
    primaryColor: 0x0f172a,
    secondaryColor: 0xf8fafc,
    isPolice: true,
  },
  {
    id: 'tropico-cab',
    brand: 'SOLARA CAB',
    modelName: 'Tropico Checker V8',
    topSpeed: 31,
    acceleration: 21,
    handling: 2.8,
    primaryColor: 0xfacc15,
    secondaryColor: 0x0f172a,
  },
  {
    id: 'harbor-van',
    brand: 'BRUTE',
    modelName: 'Palm Harbor Custom GT',
    topSpeed: 29,
    acceleration: 19,
    handling: 2.4,
    primaryColor: 0x38bdf8,
    secondaryColor: 0xfef08a,
  },
];

export const STORY_MISSIONS: MissionDef[] = [
  {
    id: 'm1-ocean-drive-pickup',
    index: 0,
    title: '1. Pastel Welcome on Ocean Drive',
    giver: 'Rico (Starlight Hotel)',
    district: 'starlight-beach',
    briefing:
      'Grab a sports car on Ocean Drive and deliver the synth-tape briefcase to Club Mirage on the Neon Strip.',
    startX: 25,
    startZ: 18,
    objectives: [
      {
        description: 'Enter any car and drive to Club Mirage on The Neon Strip',
        targetX: -40,
        targetZ: 0,
        requiresVehicle: true,
      },
      {
        description: 'Park at the Starlight Beach Promenade drop-off',
        targetX: 40,
        targetZ: -40,
        requiresVehicle: true,
      },
    ],
    rewardCash: 1500,
  },
  {
    id: 'm2-neon-strip-heat',
    index: 1,
    title: '2. Midnight Run Through Neon Strip',
    giver: 'Valerie (Club Mirage)',
    district: 'neon-strip',
    briefing:
      "Collect the VIP receipts from Coral Heights and outrun the SCPD patrol back to the Pay 'n' Spray in Sunset Industrial.",
    startX: -40,
    startZ: -10,
    objectives: [
      {
        description: 'Race to the Coral Heights Villa overlook',
        targetX: -40,
        targetZ: -80,
        requiresVehicle: true,
      },
      {
        description: "Evade SCPD cruisers and reach Sunset Industrial Pay 'n' Spray",
        targetX: -80,
        targetZ: 20,
        wantedTrigger: 2,
      },
    ],
    rewardCash: 3000,
  },
  {
    id: 'm3-palm-harbor-drop',
    index: 2,
    title: '3. Contraband at Palm Harbor',
    giver: 'Captain Diaz (Harbor Pier)',
    district: 'palm-harbor',
    briefing:
      'Intercept the courier at Palm Harbor docks and speed across the coastal road before the harbor lockdown.',
    startX: -40,
    startZ: 75,
    objectives: [
      {
        description: 'Secure the shipment at Palm Harbor South Pier',
        targetX: -40,
        targetZ: 80,
      },
      {
        description: 'Deliver the cargo to Starlight North Beach',
        targetX: 40,
        targetZ: -80,
        requiresVehicle: true,
        wantedTrigger: 2,
      },
    ],
    rewardCash: 4500,
  },
  {
    id: 'm4-coral-heights-heist',
    index: 3,
    title: '4. High Rollers of Coral Heights',
    giver: 'Rico & Valerie',
    district: 'coral-heights',
    briefing:
      'Pick up the high-roller syndicate vault code in Coral Heights and race across all districts to the industrial safehouse.',
    startX: -80,
    startZ: -80,
    objectives: [
      {
        description: 'Infiltrate the Coral Heights Plaza',
        targetX: -40,
        targetZ: -80,
      },
      {
        description: 'Cross the Neon Strip checkpoint at high speed',
        targetX: -40,
        targetZ: 40,
        requiresVehicle: true,
        wantedTrigger: 3,
      },
      {
        description: 'Reach the Sunset Industrial Safehouse',
        targetX: -80,
        targetZ: 80,
      },
    ],
    rewardCash: 7500,
  },
  {
    id: 'm5-solara-kingpin',
    index: 4,
    title: "5. Kingpin of Solara Bay '88",
    giver: 'Marco Vance',
    district: 'sunset-industrial',
    briefing:
      'The final showdown! Take the Torero V12 from Sunset Industrial, sweep the Bay checkpoints under 4-star police heat, and claim Starlight Crown.',
    startX: -80,
    startZ: 40,
    objectives: [
      {
        description: 'Hit the Palm Harbor dockside beacon',
        targetX: -40,
        targetZ: 80,
        requiresVehicle: true,
        wantedTrigger: 3,
      },
      {
        description: 'Blast down Ocean Drive to the Starlight Crown Hotel',
        targetX: 40,
        targetZ: 0,
        requiresVehicle: true,
      },
    ],
    rewardCash: 15000,
  },
];

export const DEFAULT_RADIO_TRACKS: RadioTrack[] = [
  {
    id: 'flash-1',
    title: "Sunset Over Ocean Drive '88",
    artist: 'Solara Synth Orchestra',
    station: 'FLASH 88.5 FM',
    bpm: 118,
    style: 'synthwave',
  },
  {
    id: 'electro-1',
    title: 'Bay Boogie 808',
    artist: 'DJ Cyber Palm',
    station: 'SOLARA ELECTRO 92.1',
    bpm: 126,
    style: 'electro',
  },
  {
    id: 'caliente-1',
    title: 'Brisa de Coral Heights',
    artist: 'Estrella Tropical',
    station: 'CALIENTE 96.9 FM',
    bpm: 122,
    style: 'freestyle',
  },
  {
    id: 'rock-1',
    title: 'Chrome & Countach',
    artist: 'Midnight V8',
    station: 'VICE ROCK 101.7',
    bpm: 132,
    style: 'rock',
  },
  {
    id: 'talk-1',
    title: 'Solara Bay Nightline & Scanner',
    artist: 'Host Lazlow Vance',
    station: 'KBAY TALK 104.3',
    bpm: 100,
    style: 'talk',
  },
];

export const LOGICAL_RESOLUTIONS: Record<
  LogicalResolutionId,
  { width: number; height: number; label: string; scale: number }
> = {
  '640x360': { width: 640, height: 360, label: '640×360 (360p TV Fast)', scale: 0.5 },
  '960x540': { width: 960, height: 540, label: '960×540 (540p TV Native 2x)', scale: 0.68 },
  '1280x720': { width: 1280, height: 720, label: '1280×720 (720p HD Ready)', scale: 0.82 },
  '1600x900': { width: 1600, height: 900, label: '1600×900 (900p Sharp)', scale: 0.92 },
  '1920x1080': { width: 1920, height: 1080, label: '1920×1080 (1080p Full HD)', scale: 1.0 },
};

export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPresetId, 'custom'>, GraphicsSettings> = {
  '1gb-tv-eco': {
    preset: '1gb-tv-eco',
    logicalResolution: '640x360',
    renderScale: 0.5,
    polyBudgetTier: 'low',
    drawDistance: 95,
    trafficCount: 6,
    shadowsEnabled: false,
    neonReflections: false,
    animatedOcean: false,
    fpsCap: 30,
    antialiasTier: 'off',
    showPerfOverlay: true,
  },
  'tv-balanced': {
    preset: 'tv-balanced',
    logicalResolution: '960x540',
    renderScale: 0.68,
    polyBudgetTier: 'medium',
    drawDistance: 150,
    trafficCount: 12,
    shadowsEnabled: false,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '2x',
    showPerfOverlay: true,
  },
  'solara-high': {
    preset: 'solara-high',
    logicalResolution: '1280x720',
    renderScale: 0.82,
    polyBudgetTier: 'high',
    drawDistance: 210,
    trafficCount: 16,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '2x',
    showPerfOverlay: true,
  },
  'solara-ultra-50k': {
    preset: 'solara-ultra-50k',
    logicalResolution: '1600x900',
    renderScale: 0.92,
    polyBudgetTier: 'ultra',
    drawDistance: 260,
    trafficCount: 20,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '4x',
    showPerfOverlay: true,
  },
  'solara-super-100k': {
    preset: 'solara-super-100k',
    logicalResolution: '1920x1080',
    renderScale: 1.0,
    polyBudgetTier: 'super',
    drawDistance: 320,
    trafficCount: 24,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '4x',
    showPerfOverlay: true,
  },
};

export function getPresetForMyPCTier(tier?: 'low' | 'mid' | 'high'): GraphicsSettings {
  if (tier === 'low') return { ...GRAPHICS_PRESETS['1gb-tv-eco'] };
  if (tier === 'high') return { ...GRAPHICS_PRESETS['solara-ultra-50k'] };
  return { ...GRAPHICS_PRESETS['solara-high'] };
}

export function getLogicalDimensions(resId: LogicalResolutionId): {
  width: number;
  height: number;
} {
  return LOGICAL_RESOLUTIONS[resId] || LOGICAL_RESOLUTIONS['1280x720'];
}

/**
 * Calculates estimated triangle count (from ~6k up to ~100,000+ polys) and RAM/VRAM footprint in MB.
 */
export function estimateGraphicsFootprint(settings: GraphicsSettings): {
  estimatedTriangles: number;
  estimatedRamMB: number;
  budgetStatus: 'ultra-safe' | 'optimal' | 'heavy';
} {
  const baseWorldTris =
    settings.polyBudgetTier === 'low'
      ? 5200
      : settings.polyBudgetTier === 'medium'
        ? 14500
        : settings.polyBudgetTier === 'high'
          ? 28000
          : settings.polyBudgetTier === 'ultra'
            ? 46500
            : 94000;

  const perVehicleTris =
    settings.polyBudgetTier === 'super'
      ? 420
      : settings.polyBudgetTier === 'ultra'
        ? 340
        : 260;
  const vehicleTris = (settings.trafficCount + 1) * perVehicleTris;
  const oceanTris = settings.animatedOcean ? 1200 : 128;
  const estimatedTriangles = Math.round(baseWorldTris + vehicleTris + oceanTris);

  const dims = getLogicalDimensions(settings.logicalResolution);
  const pixelRatioCost = (dims.width * dims.height) / (1920 * 1080);
  const aaFactor =
    settings.antialiasTier === '4x' ? 1.5 : settings.antialiasTier === '2x' ? 1.2 : 1.0;
  const framebufferMB = Math.round(16 * pixelRatioCost * aaFactor);
  const shadowMB = settings.shadowsEnabled ? 8 : 0;
  const geomMB =
    settings.polyBudgetTier === 'low'
      ? 6
      : settings.polyBudgetTier === 'medium'
        ? 11
        : settings.polyBudgetTier === 'high'
          ? 18
          : settings.polyBudgetTier === 'ultra'
            ? 28
            : 46;
  const estimatedRamMB = 20 + framebufferMB + shadowMB + geomMB;

  const budgetStatus =
    estimatedRamMB <= 42 ? 'ultra-safe' : estimatedRamMB <= 68 ? 'optimal' : 'heavy';

  return { estimatedTriangles, estimatedRamMB, budgetStatus };
}

export function createDefaultControllerMapping(
  layoutStyle: ControllerLayoutStyle = 'switch'
): ControllerMapping {
  return {
    layoutStyle,
    deadzone: 0.15,
    invertLookY: false,
    steerSensitivity: 1.0,
    buttons: {
      accelerate: 7, // ZR / RT
      brake: 6, // ZL / LT
      handbrake: 5, // R / RB
      enterExitCar: 3, // Switch X (top)
      attackFire: 2, // Switch Y (left)
      nextWeapon: 4, // L / LB
      nextRadio: 12, // D-Pad Up
      hornSiren: 10, // L-Stick click (L3)
      sprint: 0, // Switch B (bottom)
      cameraView: 11, // R-Stick click (R3)
      radarZoom: 13, // D-Pad Down
      pauseMenu: 9, // Switch + (Start)
    },
  };
}

const SWITCH_BUTTON_LABELS: Record<number, string> = {
  0: 'B (Bottom)',
  1: 'A (Right)',
  2: 'Y (Left)',
  3: 'X (Top)',
  4: 'L Shoulder',
  5: 'R Shoulder',
  6: 'ZL Trigger',
  7: 'ZR Trigger',
  8: '− (Minus)',
  9: '+ (Plus / Start)',
  10: 'L-Stick Press',
  11: 'R-Stick Press',
  12: 'D-Pad Up',
  13: 'D-Pad Down',
  14: 'D-Pad Left',
  15: 'D-Pad Right',
  16: 'HOME',
  17: 'Capture',
};

const XBOX_BUTTON_LABELS: Record<number, string> = {
  0: 'A (Bottom)',
  1: 'B (Right)',
  2: 'X (Left)',
  3: 'Y (Top)',
  4: 'LB',
  5: 'RB',
  6: 'LT Trigger',
  7: 'RT Trigger',
  8: 'View / Select',
  9: 'Menu / Start',
  10: 'L3',
  11: 'R3',
  12: 'D-Pad Up',
  13: 'D-Pad Down',
  14: 'D-Pad Left',
  15: 'D-Pad Right',
  16: 'Guide',
};

const PS_BUTTON_LABELS: Record<number, string> = {
  0: 'Cross (Bottom)',
  1: 'Circle (Right)',
  2: 'Square (Left)',
  3: 'Triangle (Top)',
  4: 'L1',
  5: 'R1',
  6: 'L2 Trigger',
  7: 'R2 Trigger',
  8: 'Share',
  9: 'Options',
  10: 'L3',
  11: 'R3',
  12: 'D-Pad Up',
  13: 'D-Pad Down',
  14: 'D-Pad Left',
  15: 'D-Pad Right',
  16: 'PS Button',
};

export function getButtonLabel(index: number, style: ControllerLayoutStyle): string {
  if (style === 'switch') return SWITCH_BUTTON_LABELS[index] || `Button ${index}`;
  if (style === 'playstation') return PS_BUTTON_LABELS[index] || `Button ${index}`;
  return XBOX_BUTTON_LABELS[index] || `Button ${index}`;
}

export function remapControllerAction(
  mapping: ControllerMapping,
  action: GameActionId,
  newButtonIndex: number
): ControllerMapping {
  const clamped = Math.max(0, Math.min(31, Math.floor(newButtonIndex)));
  return {
    ...mapping,
    buttons: {
      ...mapping.buttons,
      [action]: clamped,
    },
  };
}

export function applyStickDeadzone(rawValue: number, deadzone: number): number {
  const dz = Math.max(0.02, Math.min(0.45, deadzone));
  if (Math.abs(rawValue) < dz) return 0;
  const sign = rawValue < 0 ? -1 : 1;
  return sign * ((Math.abs(rawValue) - dz) / (1 - dz));
}

/**
 * Normalizes KeyboardEvent.code and KeyboardEvent.key into canonical action tokens
 * so QWERTY (WASD), AZERTY (ZQSD), Arrow keys, and TV remotes all work seamlessly.
 */
export function normalizeKeyboardCode(code: string, key = ''): string {
  if (code) {
    if (code === 'NumpadEnter') return 'Enter';
    if (code === 'Numpad8') return 'ArrowUp';
    if (code === 'Numpad2') return 'ArrowDown';
    if (code === 'Numpad4') return 'ArrowLeft';
    if (code === 'Numpad6') return 'ArrowRight';
    if (code === 'KeyZ') return 'KeyW'; // AZERTY forward support
    if (code === 'KeyQ') return 'KeyA'; // AZERTY left support
    return code;
  }
  const k = key.toLowerCase();
  if (k === 'w' || k === 'z') return 'KeyW';
  if (k === 's') return 'KeyS';
  if (k === 'a' || k === 'q') return 'KeyA';
  if (k === 'd') return 'KeyD';
  if (k === 'arrowup' || k === 'up') return 'ArrowUp';
  if (k === 'arrowdown' || k === 'down') return 'ArrowDown';
  if (k === 'arrowleft' || k === 'left') return 'ArrowLeft';
  if (k === 'arrowright' || k === 'right') return 'ArrowRight';
  if (k === ' ' || k === 'spacebar') return 'Space';
  if (k === 'enter') return 'Enter';
  if (k === 'escape' || k === 'esc' || k === 'backspace') return 'Escape';
  if (k === 'shift') return 'ShiftLeft';
  if (k === 'f') return 'KeyF';
  if (k === 'r') return 'KeyR';
  if (k === 'c') return 'KeyC';
  if (k === 'e') return 'KeyE';
  if (k === 'h') return 'KeyH';
  if (k === 'g') return 'KeyG';
  if (k === 'm') return 'KeyM';
  if (k === 'p') return 'KeyP';
  if (k === 'k') return 'KeyK';
  return code || key;
}


export function getDistrictAt(x: number, z: number): DistrictInfo {
  for (let i = 0; i < SOLARA_DISTRICTS.length; i++) {
    const d = SOLARA_DISTRICTS[i];
    if (
      x >= d.bounds.minX &&
      x <= d.bounds.maxX &&
      z >= d.bounds.minZ &&
      z <= d.bounds.maxZ
    ) {
      return d;
    }
  }
  return SOLARA_DISTRICTS[0];
}

export function clampWorldPosition(x: number, z: number): { x: number; z: number } {
  // East of x = 64 is the Atlantic / Solara Ocean shoreline
  const clampedX = Math.max(-108, Math.min(64, x));
  const clampedZ = Math.max(-108, Math.min(108, z));
  return { x: clampedX, z: clampedZ };
}

/**
 * Resolves circle-vs-AABB collisions against all Solara Bay city building blocks.
 * Guarantees cars, police cruisers, and players never enter or get stuck inside buildings.
 */
export function resolveCircleBuildingCollisions(
  x: number,
  z: number,
  radius: number
): { x: number; z: number; hitBuilding: boolean; normalX: number; normalZ: number } {
  let curX = x;
  let curZ = z;
  let hitBuilding = false;
  let normalX = 0;
  let normalZ = 0;

  for (let i = 0; i < CITY_BUILDING_COLLIDERS.length; i++) {
    const b = CITY_BUILDING_COLLIDERS[i];
    // Expand AABB by actor radius
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;

    if (curX > minX && curX < maxX && curZ > minZ && curZ < maxZ) {
      hitBuilding = true;
      const penLeft = curX - minX;
      const penRight = maxX - curX;
      const penTop = curZ - minZ;
      const penBottom = maxZ - curZ;

      const minPen = Math.min(penLeft, penRight, penTop, penBottom);
      if (minPen === penLeft) {
        curX = minX;
        normalX = -1;
        normalZ = 0;
      } else if (minPen === penRight) {
        curX = maxX;
        normalX = 1;
        normalZ = 0;
      } else if (minPen === penTop) {
        curZ = minZ;
        normalX = 0;
        normalZ = -1;
      } else {
        curZ = maxZ;
        normalX = 0;
        normalZ = 1;
      }
    }
  }

  const worldClamped = clampWorldPosition(curX, curZ);
  return {
    x: worldClamped.x,
    z: worldClamped.z,
    hitBuilding,
    normalX,
    normalZ,
  };
}

/**
 * Smart Road-Graph AI helper: finds nearest avenue (x) and cross street (z),
 * and computes the next road-following direction at intersections so AI vehicles
 * never try to drive diagonally through city buildings.
 */
export function getNearestRoadLines(x: number, z: number): {
  nearestAveX: number;
  nearestStreetZ: number;
  atIntersection: boolean;
} {
  let nearestAveX: number = ROAD_AVENUES_X[0];
  let bestDx = Math.abs(x - nearestAveX);
  for (let i = 1; i < ROAD_AVENUES_X.length; i++) {
    const dx = Math.abs(x - ROAD_AVENUES_X[i]);
    if (dx < bestDx) {
      bestDx = dx;
      nearestAveX = ROAD_AVENUES_X[i];
    }
  }

  let nearestStreetZ: number = ROAD_STREETS_Z[0];
  let bestDz = Math.abs(z - nearestStreetZ);
  for (let i = 1; i < ROAD_STREETS_Z.length; i++) {
    const dz = Math.abs(z - ROAD_STREETS_Z[i]);
    if (dz < bestDz) {
      bestDz = dz;
      nearestStreetZ = ROAD_STREETS_Z[i];
    }
  }

  return {
    nearestAveX,
    nearestStreetZ,
    atIntersection: bestDx < 4.2 && bestDz < 4.2,
  };
}

export function stepVehiclePhysics(
  state: {
    x: number;
    z: number;
    heading: number;
    speed: number;
  },
  input: {
    throttle: number; // 0..1
    brake: number; // 0..1
    steer: number; // -1..1
    handbrake: boolean;
  },
  spec: VehicleSpec,
  dt: number
): {
  x: number;
  z: number;
  heading: number;
  speed: number;
  kmh: number;
  hitBuilding: boolean;
} {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  let speed = state.speed;

  if (input.throttle > 0) {
    speed += input.throttle * spec.acceleration * clampedDt;
  }
  if (input.brake > 0) {
    if (speed > 0.5) {
      speed -= input.brake * spec.acceleration * 1.45 * clampedDt;
    } else {
      speed -= input.brake * (spec.acceleration * 0.65) * clampedDt;
    }
  }

  // Natural road drag & handbrake friction
  const drag = input.handbrake ? 4.2 : 1.15;
  speed *= Math.max(0, 1 - drag * clampedDt);

  // Clamp speed between reverse max and topSpeed
  speed = Math.max(-spec.topSpeed * 0.38, Math.min(spec.topSpeed, speed));
  if (Math.abs(speed) < 0.04 && input.throttle === 0 && input.brake === 0) {
    speed = 0;
  }

  // Turn rate scales with movement
  const speedFactor = Math.min(1, Math.abs(speed) / 6);
  const reverseSign = speed >= 0 ? 1 : -1;
  const driftBoost = input.handbrake ? 1.35 : 1.0;
  let heading =
    state.heading -
    input.steer * spec.handling * driftBoost * speedFactor * reverseSign * clampedDt;

  const rawX = state.x + Math.sin(heading) * speed * clampedDt;
  const rawZ = state.z + Math.cos(heading) * speed * clampedDt;

  // Resolve building AABB collisions with sliding deflection
  const resolved = resolveCircleBuildingCollisions(rawX, rawZ, 1.55);
  if (resolved.hitBuilding) {
    speed *= 0.62; // Scrub speed on curb/wall impact and slide along road
    if (Math.abs(resolved.normalX) > 0.5) {
      // Hit North-South wall -> align heading toward Z road axis
      heading = Math.cos(heading) >= 0 ? 0 : Math.PI;
    } else if (Math.abs(resolved.normalZ) > 0.5) {
      // Hit East-West wall -> align heading toward X street axis
      heading = Math.sin(heading) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  return {
    x: resolved.x,
    z: resolved.z,
    heading,
    speed,
    kmh: Math.round(Math.abs(speed) * 3.6),
    hitBuilding: resolved.hitBuilding,
  };
}

export function createInitialProgress(startingCash = 500): SavedProgress {
  return {
    version: 1,
    cash: startingCash,
    completedMissions: [],
    currentMissionIndex: 0,
    playerX: 36,
    playerZ: 12,
    playerHeading: 0,
    health: 100,
    armor: 50,
    unlockedDistricts: [
      'starlight-beach',
      'neon-strip',
      'palm-harbor',
      'coral-heights',
      'sunset-industrial',
    ],
    currentStationIndex: 0,
    lastSavedAt: Date.now(),
  };
}

export function validateSavedProgress(raw: unknown): SavedProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.cash !== 'number' || typeof r.currentMissionIndex !== 'number') {
    return null;
  }
  const resolvedPos = resolveCircleBuildingCollisions(
    typeof r.playerX === 'number' ? r.playerX : 36,
    typeof r.playerZ === 'number' ? r.playerZ : 12,
    1.2
  );
  return {
    version: 1,
    cash: Math.max(0, Math.floor(r.cash)),
    completedMissions: Array.isArray(r.completedMissions)
      ? r.completedMissions.filter((m): m is string => typeof m === 'string')
      : [],
    currentMissionIndex: Math.max(
      0,
      Math.min(STORY_MISSIONS.length, Math.floor(r.currentMissionIndex))
    ),
    playerX: resolvedPos.x,
    playerZ: resolvedPos.z,
    playerHeading: typeof r.playerHeading === 'number' ? r.playerHeading : 0,
    health: typeof r.health === 'number' ? Math.max(10, Math.min(100, r.health)) : 100,
    armor: typeof r.armor === 'number' ? Math.max(0, Math.min(100, r.armor)) : 50,
    unlockedDistricts: [
      'starlight-beach',
      'neon-strip',
      'palm-harbor',
      'coral-heights',
      'sunset-industrial',
    ],
    currentStationIndex:
      typeof r.currentStationIndex === 'number' ? Math.max(0, r.currentStationIndex) : 0,
    lastSavedAt: typeof r.lastSavedAt === 'number' ? r.lastSavedAt : Date.now(),
  };
}

export const UI_TRANSLATIONS: Record<
  LanguageCode,
  {
    newGame: string;
    continueGame: string;
    settings: string;
    resume: string;
    saveGame: string;
    graphicsTab: string;
    controllerTab: string;
    radioTab: string;
    missionComplete: string;
    wasted: string;
    busted: string;
  }
> = {
  en: {
    newGame: 'New Game',
    continueGame: 'Continue Story',
    settings: 'Options & Controls',
    resume: 'Resume Game',
    saveGame: 'Save Game',
    graphicsTab: 'Display & Polygons',
    controllerTab: 'Controller & Keyboard',
    radioTab: '1988 Radio Deck',
    missionComplete: 'MISSION PASSED!',
    wasted: 'WASTED',
    busted: 'BUSTED BY SCPD',
  },
  fr: {
    newGame: 'Nouvelle Partie',
    continueGame: 'Continuer',
    settings: 'Options & Commandes',
    resume: 'Reprendre',
    saveGame: 'Sauvegarder',
    graphicsTab: 'Affichage & Polygones',
    controllerTab: 'Manette & Clavier',
    radioTab: 'Radio 1988',
    missionComplete: 'MISSION RÉUSSIE !',
    wasted: 'ÉLIMINÉ',
    busted: 'ARRÊTÉ PAR LA POLICE',
  },
  es: {
    newGame: 'Nueva Partida',
    continueGame: 'Continuar Historia',
    settings: 'Opciones y Controles',
    resume: 'Reanudar',
    saveGame: 'Guardar Partida',
    graphicsTab: 'Pantalla y Polígonos',
    controllerTab: 'Mando y Teclado',
    radioTab: 'Radio 1988',
    missionComplete: '¡MISIÓN SUPERADA!',
    wasted: 'ABATIDO',
    busted: 'ARRESTADO',
  },
  ar: {
    newGame: 'لعبة جديدة',
    continueGame: 'متابعة القصة',
    settings: 'الخيارات والتحكم',
    resume: 'استئناف اللعب',
    saveGame: 'حفظ اللعبة',
    graphicsTab: 'العرض والمضلعات',
    controllerTab: 'يد التحكم ولوحة المفاتيح',
    radioTab: 'راديو 1988',
    missionComplete: 'تمت المهمة بنجاح!',
    wasted: 'سقطت',
    busted: 'تم القبض عليك',
  },
};
