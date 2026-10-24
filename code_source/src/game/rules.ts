import {
  TANGIER_AVENUES_X,
  TANGIER_BUILDING_COLLIDERS,
  TANGIER_DISTRICTS,
  TANGIER_STREETS_Z,
  TANGIER_WORLD_MAX,
  TANGIER_WORLD_MIN,
  getBuildingsNearPoint,
} from './tangierMapData.ts';
import type {
  BuildingCollider,
  ControlContextTab,
  ControllerLayoutStyle,
  ControllerMapping,
  DistrictInfo,
  GameActionId,
  GraphicsPresetId,
  GraphicsSettings,
  HudVisibilitySettings,
  LanguageCode,
  LogicalResolutionId,
  MissionDef,
  RadioTrack,
  SavedProgress,
  VehicleSpec,
} from './types.ts';

export const ROAD_AVENUES_X = TANGIER_AVENUES_X;
export const ROAD_STREETS_Z = TANGIER_STREETS_Z;
export const SOLARA_DISTRICTS: DistrictInfo[] = TANGIER_DISTRICTS;
export const CITY_BUILDING_COLLIDERS: BuildingCollider[] = TANGIER_BUILDING_COLLIDERS;

export const DEFAULT_HUD_VISIBILITY: HudVisibilitySettings = {
  masterHud: true,
  minimap: true,
  missionCard: true,
  perfOverlay: true,
  gpsArrowBar: true,
  cashHealthBox: true,
  quickButtons: true,
  wantedStars: true,
  centerBanners: true,
  radioWidget: true,
  actionPrompts: true,
  speedometer: true,
};

export function getResolvedHudVisibility(settings: GraphicsSettings): HudVisibilitySettings {
  return {
    ...DEFAULT_HUD_VISIBILITY,
    ...(settings.hudVisibility || {}),
    perfOverlay:
      settings.hudVisibility?.perfOverlay !== undefined
        ? settings.hudVisibility.perfOverlay
        : settings.showPerfOverlay,
  };
}

export const VEHICLE_SPECS: VehicleSpec[] = [
  {
    id: 'citroen-c3-2019',
    brand: 'CITROËN',
    modelName: 'Citroën C3 2019 (White / Red Roof)',
    topSpeed: 38,
    acceleration: 26,
    handling: 3.18,
    primaryColor: 0xf8fafc, // Crisp Polar White body
    secondaryColor: 0xdc2626, // Sport Red Top Roof & Mirror Caps
    spawnWeight: 6,
  },
  {
    id: 'petit-taxi-tanger',
    brand: 'TAXI TANGER',
    modelName: 'Petit Taxi Bleu Tanger',
    topSpeed: 34,
    acceleration: 23,
    handling: 3.0,
    primaryColor: 0x38bdf8,
    secondaryColor: 0xfacc15,
    spawnWeight: 2,
  },
  {
    id: 'tangier-gt-azur',
    brand: 'ATLAS GT',
    modelName: 'Boughaz V12 Azur',
    topSpeed: 43,
    acceleration: 29,
    handling: 3.2,
    primaryColor: 0x00a8e8,
    secondaryColor: 0xf8fafc,
    spawnWeight: 1,
  },
  {
    id: 'boubana-spider',
    brand: 'MEDITERRANEO',
    modelName: 'Boubana Spider S',
    topSpeed: 39,
    acceleration: 26,
    handling: 3.0,
    primaryColor: 0xf8fafc,
    secondaryColor: 0x0077b6,
    spawnWeight: 1,
  },
  {
    id: 'royal-golf-coupe',
    brand: 'COUNTRY CLUB',
    modelName: 'Mesnana Touring GT',
    topSpeed: 36,
    acceleration: 25,
    handling: 2.9,
    primaryColor: 0x10b981,
    secondaryColor: 0xfef08a,
    spawnWeight: 1,
  },
  {
    id: 'tangier-police',
    brand: 'SÛRETÉ TANGER',
    modelName: 'DGSN Tanger Interceptor',
    topSpeed: 40,
    acceleration: 28,
    handling: 3.1,
    primaryColor: 0xf8fafc,
    secondaryColor: 0x0077b6,
    isPolice: true,
    spawnWeight: 1,
  },
  {
    id: 'rahrah-suv',
    brand: 'RIF MOTORS',
    modelName: 'Kawassim 4x4 Executive',
    topSpeed: 32,
    acceleration: 22,
    handling: 2.7,
    primaryColor: 0x0f172a,
    secondaryColor: 0xf59e0b,
    spawnWeight: 1,
  },
];

/**
 * Weighted traffic vehicle selector that makes the 2019 Citroën C3 (White body + Red roof)
 * very common (~50% of ambient Tangier traffic).
 */
export function pickTrafficVehicleSpec(slotIndex: number): VehicleSpec {
  // Every even slot (0, 2, 4, 6...) is guaranteed to be the 2019 Citroën C3 White/Red Roof
  if (slotIndex % 2 === 0) {
    return VEHICLE_SPECS[0];
  }
  const otherIdx = 1 + (Math.floor(slotIndex / 2) % (VEHICLE_SPECS.length - 1));
  return VEHICLE_SPECS[otherIdx];
}

export const STORY_MISSIONS: MissionDef[] = [
  {
    id: 'm1-mesnana-golf-welcome',
    index: 0,
    title: '1. Arrival at Rond-Point Mesnana Golf',
    giver: 'Karim (Café Mesnana Golf)',
    district: 'mesnana-golf',
    briefing:
      'Take a Petit Taxi or sports coupe at Rond-Point Mesnana Golf, drive along Boulevard Mesnana Golf past the Royal Country Club gate, and deliver the VIP passes to Golf Gardens.',
    startX: -35,
    startZ: -15,
    objectives: [
      {
        description: 'Drive east along Boulevard Mesnana Golf to the Royal Golf Gate roundabout',
        streetHint: 'Boulevard Mesnana Golf → Porte Royal Golf',
        targetX: 20,
        targetZ: -15,
        requiresVehicle: true,
      },
      {
        description: 'Deliver the VIP passes south along Allée des Fairways to Rond-Point Golf Gardens',
        streetHint: 'Allée des Fairways → Golf Gardens Sud',
        targetX: 20,
        targetZ: 45,
        requiresVehicle: true,
      },
    ],
    rewardCash: 1500,
  },
  {
    id: 'm2-kawassim-courier',
    index: 1,
    title: '2. Hay El Kawassim Express Courier',
    giver: 'Youssef (Place Al Kawassim)',
    district: 'hay-kawassim',
    briefing:
      'Pick up the urgent documents near Mosquée Al-Kawassim, navigate through Rue Hay El Kawassim, and reach the Route de Rahrah junction.',
    startX: -35,
    startZ: 45,
    objectives: [
      {
        description: 'Collect the neighborhood parcel at Carrefour Mosquée Al-Kawassim',
        streetHint: 'Avenue Hay El Kawassim (X = -62.5)',
        targetX: -62.5,
        targetZ: 45,
      },
      {
        description: 'Drive south through Rue Hay El Kawassim to Croisement Kawassim - Rahrah',
        streetHint: 'Rue Hay El Kawassim → Route de Rahrah',
        targetX: -62.5,
        targetZ: 95,
        requiresVehicle: true,
      },
      {
        description: 'Complete the handoff at Place Hay El Kawassim Ouest',
        streetHint: 'Boulevard Kawassim Ouest',
        targetX: -90,
        targetZ: 45,
        requiresVehicle: true,
      },
    ],
    rewardCash: 2800,
  },
  {
    id: 'm3-boubana-socco-alto',
    index: 2,
    title: '3. Route de Boubana & Socco Alto VIP',
    giver: 'Nadia (Domaine Boubana)',
    district: 'route-boubana',
    briefing:
      'Race up Route de Boubana past the diplomatic villas to Centre Socco Alto, then lose the patrol tail by reaching Garage Atlas in Hay El Kawassim.',
    startX: -35,
    startZ: -75,
    objectives: [
      {
        description: 'Cruise east along Route de Boubana to Rond-Point Socco Alto',
        streetHint: 'Route de Boubana → Place Socco Alto',
        targetX: 75,
        targetZ: -75,
        requiresVehicle: true,
      },
      {
        description: 'Sweep south down Boulevard Socco Alto to Belvédère Colline de Boubana',
        streetHint: 'Boulevard Socco Alto',
        targetX: 75,
        targetZ: -15,
        requiresVehicle: true,
        wantedTrigger: 2,
      },
      {
        description: 'Clear police heat at Garage Atlas Tanger near Place Kawassim Ouest',
        streetHint: 'Avenue Hay El Kawassim Ouest',
        targetX: -76,
        targetZ: 52,
        requiresVehicle: true,
      },
    ],
    rewardCash: 4500,
  },
  {
    id: 'm4-royal-golf-circuit',
    index: 3,
    title: '4. Royal Country Club Grand Tour',
    giver: 'Director Tariq (Royal Golf 1914)',
    district: 'royal-golf',
    briefing:
      'Complete a high-speed showcase tour around the perimeter avenues of the Royal Golf de Tanger and finish at Rond-Point Mesnana Golf.',
    startX: 20,
    startZ: -15,
    objectives: [
      {
        description: 'Pass the northern clubhouse gate at Rond-Point Country Club Boubana',
        streetHint: 'Allée du Royal Country Club',
        targetX: 20,
        targetZ: -75,
        requiresVehicle: true,
      },
      {
        description: 'Corner the eastern greens at Carrefour Corniche du Golf',
        streetHint: 'Corniche du Golf Est',
        targetX: 75,
        targetZ: 45,
        requiresVehicle: true,
      },
      {
        description: 'Sprint across Boulevard Mesnana Golf to Rond-Point Mesnana Golf',
        streetHint: 'Allée Centrale du Golf → Mesnana Golf',
        targetX: -35,
        targetZ: -15,
        requiresVehicle: true,
      },
    ],
    rewardCash: 6500,
  },
  {
    id: 'm5-rahrah-forest-pursuit',
    index: 4,
    title: '5. Route de Rahrah Forest Intercept',
    giver: 'Captain Mehdi (Forêt de Rahrah)',
    district: 'foret-rahrah',
    briefing:
      'Meet the contact at Entrée Forêt de Rahrah, speed down Boulevard du Grand Stade under 3-star pursuit, and escape to Porte de Mesnana Ouest.',
    startX: 20,
    startZ: 95,
    objectives: [
      {
        description: 'Reach Rond-Point Route du Grand Stade on the southeastern edge',
        streetHint: 'Boulevard du Grand Stade',
        targetX: 75,
        targetZ: 95,
        requiresVehicle: true,
        wantedTrigger: 3,
      },
      {
        description: 'Cross Route de Rahrah through Kawassim to Rond-Point Route de Rahrah',
        streetHint: 'Route de Rahrah',
        targetX: -35,
        targetZ: 95,
        requiresVehicle: true,
      },
      {
        description: 'Reach the safe drop at Porte de Mesnana Ouest',
        streetHint: 'Boulevard de Mesnana Ouest',
        targetX: -90,
        targetZ: -15,
        requiresVehicle: true,
      },
    ],
    rewardCash: 9500,
  },
  {
    id: 'm6-legend-of-tangier',
    index: 5,
    title: '6. Legend of Tangier: Mesnana to Kawassim',
    giver: 'Karim, Youssef & Nadia',
    district: 'mesnana-golf',
    briefing:
      'The ultimate Tangier championship run! Connect Carrefour Bassatine, Socco Alto, Forêt de Rahrah, Hay El Kawassim, and the Royal Golf Gate.',
    startX: -90,
    startZ: -75,
    objectives: [
      {
        description: 'Checkpoint 1: Rond-Point Socco Alto (North-East)',
        streetHint: 'Route de Boubana → Avenue Socco Alto',
        targetX: 75,
        targetZ: -75,
        requiresVehicle: true,
        wantedTrigger: 3,
      },
      {
        description: 'Checkpoint 2: Entrée Forêt de Rahrah (South-East)',
        streetHint: 'Corniche du Golf Est → Route de Rahrah',
        targetX: 20,
        targetZ: 95,
        requiresVehicle: true,
      },
      {
        description: 'Checkpoint 3: Porte Kawassim Sud (South-West)',
        streetHint: 'Route de Rahrah Ouest',
        targetX: -90,
        targetZ: 95,
        requiresVehicle: true,
      },
      {
        description: 'Finish Line: Rond-Point Mesnana Golf',
        streetHint: 'Avenue Principale de Mesnana',
        targetX: -35,
        targetZ: -15,
        requiresVehicle: true,
      },
    ],
    rewardCash: 18000,
  },
  {
    id: 'm7-greater-tangier-odyssey',
    index: 6,
    title: '7. Greater Tangier Odyssey: Cap Spartel to Malabata',
    giver: 'Commissioner Bennis (Tanger Métropole)',
    district: 'cap-spartel',
    briefing:
      'Drive a Citroën C3 2019 (White & Red Roof) or GT across the expanded Greater Tangier highways — from Phare du Cap Spartel down to Grand Stade Ibn Batouta in Boukhalef and across to Malabata Corniche.',
    startX: -35,
    startZ: -15,
    objectives: [
      {
        description: 'Head northwest to the Cap Spartel & Achakar Promontory',
        streetHint: 'Boulevard Diplomatique Jbel Kbir → Cap Spartel',
        targetX: -280,
        targetZ: -260,
        requiresVehicle: true,
      },
      {
        description: 'Speed south down Avenue Moulay Rachid to Grand Stade Ibn Batouta (Boukhalef)',
        streetHint: 'Boulevard Ibn Batouta (Z = +320)',
        targetX: -175,
        targetZ: 320,
        requiresVehicle: true,
        wantedTrigger: 2,
      },
      {
        description: 'Cross Greater Tangier east to Corniche de Malabata & Marina Bay',
        streetHint: 'Boulevard Mohammed V → Corniche de Malabata',
        targetX: 310,
        targetZ: -160,
        requiresVehicle: true,
      },
    ],
    rewardCash: 25000,
  },
];

export const DEFAULT_RADIO_TRACKS: RadioTrack[] = [
  {
    id: 'tanger-med-1',
    title: 'Brise du Détroit (Mesnana Nights)',
    artist: 'Orchestre Boughaz Tanger',
    station: 'RADIO TANGER MED 95.4',
    bpm: 118,
    style: 'synthwave',
  },
  {
    id: 'cap-spartel-1',
    title: 'Corniche & Boubana Groove',
    artist: 'DJ Kasbah Azur',
    station: 'CAP SPARTEL ELECTRO 98.8',
    bpm: 126,
    style: 'electro',
  },
  {
    id: 'andalus-1',
    title: 'Soleil sur Hay El Kawassim',
    artist: 'Ensemble Perle du Nord',
    station: 'PERLE DU NORD 101.2 FM',
    bpm: 122,
    style: 'freestyle',
  },
  {
    id: 'rahrah-drive-1',
    title: 'Midnight V12 on Route de Rahrah',
    artist: 'Atlas Highway',
    station: 'TANGER ROCK 104.5',
    bpm: 132,
    style: 'rock',
  },
  {
    id: 'talk-tanger-1',
    title: 'Café Hafa & Mesnana Golf Live',
    artist: 'Voix de Tanger',
    station: 'TANGER INFOS 107.1',
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
    drawDistance: 150,
    trafficCount: 8,
    shadowsEnabled: false,
    neonReflections: false,
    animatedOcean: false,
    fpsCap: 30,
    antialiasTier: 'off',
    showPerfOverlay: true,
    textSize: 'normal',
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
  },
  'tv-balanced': {
    preset: 'tv-balanced',
    logicalResolution: '960x540',
    renderScale: 0.68,
    polyBudgetTier: 'medium',
    drawDistance: 210,
    trafficCount: 14,
    shadowsEnabled: false,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '2x',
    showPerfOverlay: true,
    textSize: 'normal',
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
  },
  'solara-high': {
    preset: 'solara-high',
    logicalResolution: '1280x720',
    renderScale: 0.82,
    polyBudgetTier: 'high',
    drawDistance: 260,
    trafficCount: 18,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '2x',
    showPerfOverlay: true,
    textSize: 'normal',
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
  },
  'solara-ultra-50k': {
    preset: 'solara-ultra-50k',
    logicalResolution: '1600x900',
    renderScale: 0.92,
    polyBudgetTier: 'ultra',
    drawDistance: 320,
    trafficCount: 22,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '4x',
    showPerfOverlay: true,
    textSize: 'normal',
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
  },
  'solara-super-100k': {
    preset: 'solara-super-100k',
    logicalResolution: '1920x1080',
    renderScale: 1.0,
    polyBudgetTier: 'super',
    drawDistance: 380,
    trafficCount: 26,
    shadowsEnabled: true,
    neonReflections: true,
    animatedOcean: true,
    fpsCap: 60,
    antialiasTier: '4x',
    showPerfOverlay: true,
    textSize: 'normal',
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
  },
};

export function getPresetForMyPCTier(tier?: 'low' | 'mid' | 'high'): GraphicsSettings {
  if (tier === 'low') return { ...GRAPHICS_PRESETS['1gb-tv-eco'], hudVisibility: { ...DEFAULT_HUD_VISIBILITY } };
  if (tier === 'high') return { ...GRAPHICS_PRESETS['solara-ultra-50k'], hudVisibility: { ...DEFAULT_HUD_VISIBILITY } };
  return { ...GRAPHICS_PRESETS['solara-high'], hudVisibility: { ...DEFAULT_HUD_VISIBILITY } };
}

export function getLogicalDimensions(resId: LogicalResolutionId): {
  width: number;
  height: number;
} {
  return LOGICAL_RESOLUTIONS[resId] || LOGICAL_RESOLUTIONS['1280x720'];
}

export function estimateGraphicsFootprint(settings: GraphicsSettings): {
  estimatedTriangles: number;
  estimatedRamMB: number;
  budgetStatus: 'ultra-safe' | 'optimal' | 'heavy';
} {
  const baseWorldTris =
    settings.polyBudgetTier === 'low'
      ? 6200
      : settings.polyBudgetTier === 'medium'
        ? 15800
        : settings.polyBudgetTier === 'high'
          ? 29500
          : settings.polyBudgetTier === 'ultra'
            ? 48500
            : 96000;

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

/**
 * Complete Context-Tabbed Action Definitions for In Car, On Foot, and Menus & UI.
 */
export interface ContextActionMeta {
  id: GameActionId;
  context: ControlContextTab;
  label: string;
  desc: string;
  defaultPadBtn: number;
  defaultKeyCode: string;
}

export const CONTEXT_ACTION_DEFINITIONS: ContextActionMeta[] = [
  // --- SUB-TAB 1: IN CAR (DRIVING) ---
  {
    id: 'carAccelerate',
    context: 'inCar',
    label: 'Accelerate / Gas',
    desc: 'Drive vehicle forward',
    defaultPadBtn: 7, // ZR / RT
    defaultKeyCode: 'KeyW',
  },
  {
    id: 'carBrakeReverse',
    context: 'inCar',
    label: 'Brake / Reverse',
    desc: 'Slow down or reverse vehicle',
    defaultPadBtn: 6, // ZL / LT
    defaultKeyCode: 'KeyS',
  },
  {
    id: 'carSteerLeft',
    context: 'inCar',
    label: 'Steer Left',
    desc: 'Turn wheels left (or Left Stick)',
    defaultPadBtn: 14, // D-Pad Left
    defaultKeyCode: 'KeyA',
  },
  {
    id: 'carSteerRight',
    context: 'inCar',
    label: 'Steer Right',
    desc: 'Turn wheels right (or Left Stick)',
    defaultPadBtn: 15, // D-Pad Right
    defaultKeyCode: 'KeyD',
  },
  {
    id: 'carHandbrake',
    context: 'inCar',
    label: 'Handbrake / Drift',
    desc: 'Power-slide around Tangier roundabouts',
    defaultPadBtn: 5, // R / RB
    defaultKeyCode: 'Space',
  },
  {
    id: 'carNitroBoost',
    context: 'inCar',
    label: 'Turbo / Speed Boost',
    desc: 'Engage high-torque acceleration surge',
    defaultPadBtn: 0, // B / Cross
    defaultKeyCode: 'ShiftLeft',
  },
  {
    id: 'carExitVehicle',
    context: 'inCar',
    label: 'Exit Vehicle',
    desc: 'Step out of current car onto sidewalk',
    defaultPadBtn: 3, // X / Triangle
    defaultKeyCode: 'KeyF',
  },
  {
    id: 'carHornSiren',
    context: 'inCar',
    label: 'Horn / Police Siren',
    desc: 'Sound horn or toggle DGSN police siren',
    defaultPadBtn: 2, // Y / Square
    defaultKeyCode: 'KeyH',
  },
  {
    id: 'carCameraView',
    context: 'inCar',
    label: 'Switch Camera View',
    desc: 'Cycle Chase, Close & Helicopter views',
    defaultPadBtn: 11, // R3
    defaultKeyCode: 'KeyC',
  },
  {
    id: 'carNextRadio',
    context: 'inCar',
    label: 'Next Radio Station',
    desc: 'Switch Tangier FM station or user track',
    defaultPadBtn: 12, // D-Pad Up
    defaultKeyCode: 'KeyR',
  },

  // --- SUB-TAB 2: ON FOOT (WITHOUT CAR) ---
  {
    id: 'footMoveForward',
    context: 'onFoot',
    label: 'Walk / Run Forward',
    desc: 'Move character forward (or Left Stick)',
    defaultPadBtn: 12, // D-Pad Up
    defaultKeyCode: 'KeyW',
  },
  {
    id: 'footMoveBackward',
    context: 'onFoot',
    label: 'Walk Backward',
    desc: 'Move character backward (or Left Stick)',
    defaultPadBtn: 13, // D-Pad Down
    defaultKeyCode: 'KeyS',
  },
  {
    id: 'footMoveLeft',
    context: 'onFoot',
    label: 'Turn / Strafe Left',
    desc: 'Turn character left (or Left Stick)',
    defaultPadBtn: 14, // D-Pad Left
    defaultKeyCode: 'KeyA',
  },
  {
    id: 'footMoveRight',
    context: 'onFoot',
    label: 'Turn / Strafe Right',
    desc: 'Turn character right (or Left Stick)',
    defaultPadBtn: 15, // D-Pad Right
    defaultKeyCode: 'KeyD',
  },
  {
    id: 'footSprint',
    context: 'onFoot',
    label: 'Sprint / Fast Run',
    desc: 'Hold to sprint along sidewalks & fairways',
    defaultPadBtn: 0, // B / Cross
    defaultKeyCode: 'ShiftLeft',
  },
  {
    id: 'footEnterCar',
    context: 'onFoot',
    label: 'Enter Nearest Car',
    desc: 'Enter nearby car or summon curbside ride',
    defaultPadBtn: 3, // X / Triangle
    defaultKeyCode: 'KeyF',
  },
  {
    id: 'footInteractHustle',
    context: 'onFoot',
    label: 'Street Action / Interact',
    desc: 'Perform street action or interact',
    defaultPadBtn: 2, // Y / Square
    defaultKeyCode: 'KeyE',
  },
  {
    id: 'footCameraView',
    context: 'onFoot',
    label: 'Switch Camera View',
    desc: 'Cycle camera distance while on foot',
    defaultPadBtn: 11, // R3
    defaultKeyCode: 'KeyC',
  },

  // --- SUB-TAB 3: MENUS, MAP & MISSIONS ---
  {
    id: 'uiOpenWorldMap',
    context: 'menuUi',
    label: 'Open Tangier World Map',
    desc: 'Open full-screen Mesnana Golf & Kawassim map',
    defaultPadBtn: 8, // Minus / Select
    defaultKeyCode: 'KeyM',
  },
  {
    id: 'uiOpenMissions',
    context: 'menuUi',
    label: 'Open Missions Screen',
    desc: 'View & select Tangier missions & briefings',
    defaultPadBtn: 4, // L / LB
    defaultKeyCode: 'KeyJ',
  },
  {
    id: 'uiPauseMenu',
    context: 'menuUi',
    label: 'Command Hub / Options',
    desc: 'Open or close Pause & Settings Hub',
    defaultPadBtn: 9, // Plus / Start
    defaultKeyCode: 'Escape',
  },
  {
    id: 'uiRadarZoom',
    context: 'menuUi',
    label: 'Toggle Top Mini-Map Zoom',
    desc: 'Expand or compact the top rotating mini-map',
    defaultPadBtn: 10, // L3
    defaultKeyCode: 'Tab',
  },
  {
    id: 'uiQuickSave',
    context: 'menuUi',
    label: 'Quick Save Game',
    desc: 'Save progress immediately to profile',
    defaultPadBtn: 1, // A / Circle
    defaultKeyCode: 'KeyK',
  },
];

export function createDefaultControllerMapping(
  layoutStyle: ControllerLayoutStyle = 'switch'
): ControllerMapping {
  const buttons: Record<GameActionId, number> = {
    carAccelerate: 7,
    carBrakeReverse: 6,
    carSteerLeft: 14,
    carSteerRight: 15,
    carHandbrake: 5,
    carNitroBoost: 0,
    carExitVehicle: 3,
    carHornSiren: 2,
    carCameraView: 11,
    carNextRadio: 12,
    footMoveForward: 12,
    footMoveBackward: 13,
    footMoveLeft: 14,
    footMoveRight: 15,
    footSprint: 0,
    footEnterCar: 3,
    footInteractHustle: 2,
    footCameraView: 11,
    uiOpenWorldMap: 8,
    uiOpenMissions: 4,
    uiPauseMenu: 9,
    uiRadarZoom: 10,
    uiQuickSave: 1,
    // Legacy aliases synchronized
    accelerate: 7,
    brake: 6,
    handbrake: 5,
    enterExitCar: 3,
    attackFire: 2,
    nextWeapon: 1,
    nextRadio: 12,
    hornSiren: 2,
    sprint: 0,
    cameraView: 11,
    radarZoom: 10,
    pauseMenu: 9,
  };

  const keys: Record<GameActionId, string> = {
    carAccelerate: 'KeyW',
    carBrakeReverse: 'KeyS',
    carSteerLeft: 'KeyA',
    carSteerRight: 'KeyD',
    carHandbrake: 'Space',
    carNitroBoost: 'ShiftLeft',
    carExitVehicle: 'KeyF',
    carHornSiren: 'KeyH',
    carCameraView: 'KeyC',
    carNextRadio: 'KeyR',
    footMoveForward: 'KeyW',
    footMoveBackward: 'KeyS',
    footMoveLeft: 'KeyA',
    footMoveRight: 'KeyD',
    footSprint: 'ShiftLeft',
    footEnterCar: 'KeyF',
    footInteractHustle: 'KeyE',
    footCameraView: 'KeyC',
    uiOpenWorldMap: 'KeyM',
    uiOpenMissions: 'KeyJ',
    uiPauseMenu: 'Escape',
    uiRadarZoom: 'Tab',
    uiQuickSave: 'KeyK',
    // Legacy aliases
    accelerate: 'KeyW',
    brake: 'KeyS',
    handbrake: 'Space',
    enterExitCar: 'KeyF',
    attackFire: 'KeyE',
    nextWeapon: 'KeyK',
    nextRadio: 'KeyR',
    hornSiren: 'KeyH',
    sprint: 'ShiftLeft',
    cameraView: 'KeyC',
    radarZoom: 'Tab',
    pauseMenu: 'Escape',
  };

  return {
    layoutStyle,
    deadzone: 0.15,
    invertLookY: false,
    steerSensitivity: 1.0,
    buttons,
    keys,
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
  8: 'View / Map',
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
  8: 'Share / Map',
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

export function getKeyboardCodeLabel(code: string): string {
  if (!code) return 'Unbound';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'ArrowUp') return 'UP ↑';
  if (code === 'ArrowDown') return 'DOWN ↓';
  if (code === 'ArrowLeft') return 'LEFT ←';
  if (code === 'ArrowRight') return 'RIGHT →';
  if (code === 'Escape') return 'ESC';
  if (code === 'Enter') return 'ENTER';
  if (code === 'Tab') return 'TAB';
  return code.toUpperCase();
}

export function remapControllerAction(
  mapping: ControllerMapping,
  action: GameActionId,
  newButtonIndex: number
): ControllerMapping {
  const clamped = Math.max(0, Math.min(31, Math.floor(newButtonIndex)));
  const nextButtons = {
    ...mapping.buttons,
    [action]: clamped,
  };
  // Keep legacy aliases in sync
  if (action === 'carAccelerate' || action === 'accelerate') {
    nextButtons.carAccelerate = clamped;
    nextButtons.accelerate = clamped;
  }
  if (action === 'carBrakeReverse' || action === 'brake') {
    nextButtons.carBrakeReverse = clamped;
    nextButtons.brake = clamped;
  }
  if (action === 'carHandbrake' || action === 'handbrake') {
    nextButtons.carHandbrake = clamped;
    nextButtons.handbrake = clamped;
  }
  if (action === 'carExitVehicle' || action === 'footEnterCar' || action === 'enterExitCar') {
    if (action === 'enterExitCar') {
      nextButtons.carExitVehicle = clamped;
      nextButtons.footEnterCar = clamped;
    }
    nextButtons.enterExitCar = clamped;
  }
  return {
    ...mapping,
    buttons: nextButtons,
  };
}

export function remapKeyboardAction(
  mapping: ControllerMapping,
  action: GameActionId,
  newKeyCode: string
): ControllerMapping {
  const normalized = normalizeKeyboardCode(newKeyCode, newKeyCode);
  return {
    ...mapping,
    keys: {
      ...(mapping.keys || createDefaultControllerMapping(mapping.layoutStyle).keys),
      [action]: normalized,
    },
  };
}

export function resetContextSubTabMapping(
  mapping: ControllerMapping,
  context: ControlContextTab
): ControllerMapping {
  const defaults = createDefaultControllerMapping(mapping.layoutStyle);
  const nextButtons = { ...mapping.buttons };
  const nextKeys = { ...(mapping.keys || defaults.keys) };

  for (const def of CONTEXT_ACTION_DEFINITIONS) {
    if (def.context === context) {
      nextButtons[def.id] = def.defaultPadBtn;
      nextKeys[def.id] = def.defaultKeyCode;
    }
  }
  return {
    ...mapping,
    buttons: nextButtons,
    keys: nextKeys,
  };
}

export function applyStickDeadzone(rawValue: number, deadzone: number): number {
  const dz = Math.max(0.02, Math.min(0.45, deadzone));
  if (Math.abs(rawValue) < dz) return 0;
  const sign = rawValue < 0 ? -1 : 1;
  return sign * ((Math.abs(rawValue) - dz) / (1 - dz));
}

export function normalizeKeyboardCode(code: string, key = ''): string {
  if (code) {
    if (code === 'NumpadEnter') return 'Enter';
    if (code === 'Numpad8') return 'ArrowUp';
    if (code === 'Numpad2') return 'ArrowDown';
    if (code === 'Numpad4') return 'ArrowLeft';
    if (code === 'Numpad6') return 'ArrowRight';
    if (code === 'KeyZ') return 'KeyW';
    if (code === 'KeyQ') return 'KeyA';
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
  if (k === 'tab') return 'Tab';
  if (k.length === 1 && k >= 'a' && k <= 'z') return `Key${k.toUpperCase()}`;
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
  const clampedX = Math.max(TANGIER_WORLD_MIN + 22, Math.min(TANGIER_WORLD_MAX - 22, x));
  const clampedZ = Math.max(TANGIER_WORLD_MIN + 22, Math.min(TANGIER_WORLD_MAX - 22, z));
  return { x: clampedX, z: clampedZ };
}

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

  // Smart O(1) Spatial Hash Lookup: only check buildings in the entity's 80m x 80m spatial cell
  const nearbyBuildings = getBuildingsNearPoint(curX, curZ);

  for (let i = 0; i < nearbyBuildings.length; i++) {
    const b = nearbyBuildings[i];
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
    atIntersection: bestDx < 5.5 && bestDz < 5.5,
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
    throttle: number;
    brake: number;
    steer: number;
    handbrake: boolean;
    nitro?: boolean;
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
  const boostMult = input.nitro ? 1.32 : 1.0;

  if (input.throttle > 0) {
    speed += input.throttle * spec.acceleration * boostMult * clampedDt;
  }
  if (input.brake > 0) {
    if (speed > 0.5) {
      speed -= input.brake * spec.acceleration * 1.55 * clampedDt;
    } else {
      speed -= input.brake * (spec.acceleration * 0.65) * clampedDt;
    }
  }

  const drag = input.handbrake ? 4.0 : 1.1;
  speed *= Math.max(0, 1 - drag * clampedDt);

  const maxSpd = spec.topSpeed * (input.nitro ? 1.22 : 1.0);
  speed = Math.max(-spec.topSpeed * 0.38, Math.min(maxSpd, speed));
  if (Math.abs(speed) < 0.04 && input.throttle === 0 && input.brake === 0) {
    speed = 0;
  }

  const speedFactor = Math.min(1, Math.abs(speed) / 5.5);
  const reverseSign = speed >= 0 ? 1 : -1;
  const driftBoost = input.handbrake ? 1.38 : 1.0;
  let heading =
    state.heading -
    input.steer * spec.handling * driftBoost * speedFactor * reverseSign * clampedDt;

  const rawX = state.x + Math.sin(heading) * speed * clampedDt;
  const rawZ = state.z + Math.cos(heading) * speed * clampedDt;

  const resolved = resolveCircleBuildingCollisions(rawX, rawZ, 1.5);
  if (resolved.hitBuilding) {
    speed *= 0.68;
    if (Math.abs(resolved.normalX) > 0.5) {
      heading = Math.cos(heading) >= 0 ? 0 : Math.PI;
    } else if (Math.abs(resolved.normalZ) > 0.5) {
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

export function createInitialProgress(startingCash = 1000): SavedProgress {
  return {
    version: 2,
    cash: startingCash,
    completedMissions: [],
    currentMissionIndex: 0,
    playerX: -35,
    playerZ: -6,
    playerHeading: Math.PI / 2,
    health: 100,
    armor: 100,
    unlockedDistricts: [
      'mesnana-golf',
      'royal-golf',
      'hay-kawassim',
      'route-boubana',
      'foret-rahrah',
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
    typeof r.playerX === 'number' ? r.playerX : -35,
    typeof r.playerZ === 'number' ? r.playerZ : -6,
    1.2
  );
  return {
    version: 2,
    cash: Math.max(0, Math.floor(r.cash)),
    completedMissions: Array.isArray(r.completedMissions)
      ? r.completedMissions.filter((m): m is string => typeof m === 'string')
      : [],
    currentMissionIndex: Math.max(
      0,
      Math.min(STORY_MISSIONS.length - 1, Math.floor(r.currentMissionIndex))
    ),
    playerX: resolvedPos.x,
    playerZ: resolvedPos.z,
    playerHeading: typeof r.playerHeading === 'number' ? r.playerHeading : Math.PI / 2,
    health: typeof r.health === 'number' ? Math.max(10, Math.min(100, r.health)) : 100,
    armor: typeof r.armor === 'number' ? Math.max(0, Math.min(100, r.armor)) : 100,
    unlockedDistricts: [
      'mesnana-golf',
      'royal-golf',
      'hay-kawassim',
      'route-boubana',
      'foret-rahrah',
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
    mapTab: string;
    missionsTab: string;
    graphicsTab: string;
    controllerTab: string;
    radioTab: string;
    missionComplete: string;
    wasted: string;
    busted: string;
  }
> = {
  en: {
    newGame: 'New Game in Tangier',
    continueGame: 'Continue Story',
    settings: 'Command Hub: Map, Missions & Controls',
    resume: 'Resume Game',
    saveGame: 'Save Progress',
    mapTab: 'World Map',
    missionsTab: 'Missions',
    graphicsTab: 'Display & Text Size',
    controllerTab: 'Controls Mapping',
    radioTab: 'Tangier FM Radio',
    missionComplete: 'MISSION COMPLETED!',
    wasted: 'INJURED',
    busted: 'INTERCEPTED BY POLICE',
  },
  fr: {
    newGame: 'Nouvelle Partie à Tanger',
    continueGame: 'Continuer',
    settings: 'Carte, Missions & Commandes',
    resume: 'Reprendre',
    saveGame: 'Sauvegarder',
    mapTab: 'Carte de Tanger',
    missionsTab: 'Missions',
    graphicsTab: 'Affichage & Texte',
    controllerTab: 'Touches & Manette',
    radioTab: 'Radio Tanger FM',
    missionComplete: 'MISSION RÉUSSIE !',
    wasted: 'BLESSÉ',
    busted: 'ARRÊTÉ PAR LA POLICE',
  },
  es: {
    newGame: 'Nueva Partida en Tánger',
    continueGame: 'Continuar Historia',
    settings: 'Mapa, Misiones y Controles',
    resume: 'Reanudar',
    saveGame: 'Guardar Partida',
    mapTab: 'Mapa de Tánger',
    missionsTab: 'Misiones',
    graphicsTab: 'Pantalla y Texto',
    controllerTab: 'Mapeo de Controles',
    radioTab: 'Radio Tánger FM',
    missionComplete: '¡MISIÓN SUPERADA!',
    wasted: 'HERIDO',
    busted: 'INTERCEPTADO',
  },
  ar: {
    newGame: 'لعبة جديدة في طنجة',
    continueGame: 'متابعة القصة',
    settings: 'الخريطة والمهام والتحكم',
    resume: 'استئناف اللعب',
    saveGame: 'حفظ التقدم',
    mapTab: 'خريطة طنجة',
    missionsTab: 'المهام',
    graphicsTab: 'العرض وحجم النص',
    controllerTab: 'تخصيص الأزرار',
    radioTab: 'راديو طنجة',
    missionComplete: 'تمت المهمة بنجاح!',
    wasted: 'أصبت',
    busted: 'تم توقيفك',
  },
};
