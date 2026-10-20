export type LanguageCode = 'en' | 'fr' | 'es' | 'ar';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type GraphicsPresetId =
  | '1gb-tv-eco'
  | 'tv-balanced'
  | 'solara-high'
  | 'solara-ultra-50k'
  | 'solara-super-100k'
  | 'custom';

export type LogicalResolutionId =
  | '640x360'
  | '960x540'
  | '1280x720'
  | '1600x900'
  | '1920x1080';

export type PolyBudgetTier = 'low' | 'medium' | 'high' | 'ultra' | 'super';

export interface GraphicsSettings {
  preset: GraphicsPresetId;
  logicalResolution: LogicalResolutionId; // Fixed internal buffer scaled to 100vw x 100vh by TV
  renderScale: number; // Derived or custom scale factor
  polyBudgetTier: PolyBudgetTier; // low (~8k), medium (~18k), high (~32k), ultra (~50k), super (~100k)
  drawDistance: number; // 95, 150, 230, 320
  trafficCount: number; // 6, 12, 18, 24
  shadowsEnabled: boolean;
  neonReflections: boolean;
  animatedOcean: boolean;
  fpsCap: 30 | 60;
  antialiasTier: 'off' | '2x' | '4x';
  showPerfOverlay: boolean;
}

export interface RenderTelemetry {
  fps: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  estimatedRamMB: number;
  bufferWidth: number;
  bufferHeight: number;
}

export type ControllerLayoutStyle = 'switch' | 'xbox' | 'playstation';

export type GameActionId =
  | 'accelerate'
  | 'brake'
  | 'handbrake'
  | 'enterExitCar'
  | 'attackFire'
  | 'nextWeapon'
  | 'nextRadio'
  | 'hornSiren'
  | 'sprint'
  | 'cameraView'
  | 'radarZoom'
  | 'pauseMenu';

export interface ControllerMapping {
  layoutStyle: ControllerLayoutStyle;
  deadzone: number;
  invertLookY: boolean;
  steerSensitivity: number;
  buttons: Record<GameActionId, number>; // W3C button index 0..31
}

export type DistrictId =
  | 'starlight-beach'
  | 'neon-strip'
  | 'palm-harbor'
  | 'coral-heights'
  | 'sunset-industrial';

export interface DistrictInfo {
  id: DistrictId;
  name: string;
  tagline: string;
  color: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type VehicleBrandId =
  | 'solara-countach'
  | 'bay-cruiser'
  | 'vice-stallion'
  | 'scpd-interceptor'
  | 'tropico-cab'
  | 'harbor-van';

export interface VehicleSpec {
  id: VehicleBrandId;
  brand: string;
  modelName: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
  primaryColor: number;
  secondaryColor: number;
  isPolice?: boolean;
}

export interface BuildingCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MissionDef {
  id: string;
  index: number;
  title: string;
  giver: string;
  district: DistrictId;
  briefing: string;
  startX: number;
  startZ: number;
  objectives: {
    description: string;
    targetX: number;
    targetZ: number;
    requiresVehicle?: boolean;
    wantedTrigger?: number;
    timeLimitSec?: number;
  }[];
  rewardCash: number;
}

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  station: string;
  bpm: number;
  style: 'synthwave' | 'electro' | 'freestyle' | 'rock' | 'talk' | 'custom';
  customUrl?: string;
}

export interface SavedProgress {
  version: number;
  cash: number;
  completedMissions: string[];
  currentMissionIndex: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  health: number;
  armor: number;
  unlockedDistricts: DistrictId[];
  currentStationIndex: number;
  lastSavedAt: number;
}

export interface MyPCGamepadPadInfo {
  dev: string;
  name: string;
  standard: boolean;
  buttons: number;
  axes: number;
}

export interface MyPCInfo {
  standalone: boolean;
  lang: string;
  rtl: boolean;
  volume: { music: number; sfx: number };
  profile: { id: string; name: string };
  quality: { tier: 'low' | 'mid' | 'high' };
  app: { id?: string };
}

export interface MyPCSDK {
  version: number;
  apiLevel: number;
  app_config: Record<string, unknown>;
  init: (handlers: {
    onInit: (info: MyPCInfo) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onDestroy: () => void;
    onInput?: (action: string, pressed: boolean, repeat: boolean, dev: string) => void;
    onMenu?: (id: string) => void;
    onVolume?: (v: { music: number; sfx: number }) => void;
    ownMenu?: boolean;
    pad?: boolean | Record<string, unknown>;
  }) => void;
  ready: () => void;
  progress: (p: number) => void;
  info: () => MyPCInfo | null;
  isDown: (action: string) => boolean;
  save: (key: string, value: unknown) => void;
  load: <T>(key: string, def: T) => T;
  submitScore: (score: number, opts?: { player?: number; players?: number }) => void;
  announce: (text: string) => void;
  setMenu: (items: { id: string; label: string }[]) => void;
  pause: () => void;
  exit: () => void;
  gamepad?: {
    supported: boolean;
    on: (
      event: 'button' | 'axes' | 'pads',
      fn: (...args: any[]) => void
    ) => () => void;
    pressed: (index: number, dev?: string) => boolean;
    value: (index: number, dev?: string) => number;
    axis: (index: number, dev?: string) => number;
    pads: () => MyPCGamepadPadInfo[];
    name: (index: number, dev?: string) => string;
  };
}

declare global {
  interface Window {
    MyPC?: MyPCSDK;
  }
}
