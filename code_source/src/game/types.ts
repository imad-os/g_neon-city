export type LanguageCode = 'en' | 'fr' | 'es' | 'ar';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type DistrictId =
  | 'starlight-beach'
  | 'neon-strip'
  | 'coral-heights'
  | 'palm-harbor'
  | 'sunset-industrial';

export interface DistrictInfo {
  id: DistrictId;
  name: string;
  tagline: string;
  color: string;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

export interface BuildingCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface VehicleSpec {
  id: string;
  brand: string;
  modelName: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
  primaryColor: number;
  secondaryColor: number;
  isPolice?: boolean;
}

export interface MissionObjective {
  description: string;
  targetX: number;
  targetZ: number;
  requiresVehicle?: boolean;
  wantedTrigger?: number;
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
  objectives: MissionObjective[];
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
  logicalResolution: LogicalResolutionId;
  renderScale: number;
  polyBudgetTier: PolyBudgetTier;
  drawDistance: number;
  trafficCount: number;
  shadowsEnabled: boolean;
  neonReflections: boolean;
  animatedOcean: boolean;
  fpsCap: 30 | 60;
  antialiasTier: 'off' | '2x' | '4x';
  showPerfOverlay: boolean;
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
  buttons: Record<GameActionId, number>;
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

export interface RenderTelemetry {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  bufferWidth: number;
  bufferHeight: number;
}

export interface MyPCGamepadPadInfo {
  dev: string;
  name: string;
  axes: number;
  buttons: number;
  standard?: boolean;
}

export type MyPCInputAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'cancel'
  | 'menu'
  | 'jump'
  | 'run'
  | string;

export interface MyPCVolumeState {
  master?: number;
  music?: number;
  sfx?: number;
  muted?: boolean;
}

export interface MyPCInfoPayload {
  lang: string;
  volume?: MyPCVolumeState;
  quality?: {
    tier?: 'low' | 'mid' | 'high';
  };
}

export interface MyPCSdk {
  app_config?: Record<string, unknown>;
  init: (opts: {
    ownMenu?: boolean;
    onInit?: (info: MyPCInfoPayload) => void;
    onStart?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onDestroy?: () => void;
    onVolume?: (vol: MyPCVolumeState) => void;
    onMenu?: (id: string) => void;
    onInput?: (action: MyPCInputAction, pressed: boolean, repeat: boolean) => void;
  }) => void;
  progress: (value: number) => void;
  ready: () => void;
  info: () => MyPCInfoPayload | undefined;
  isDown: (action: string) => boolean;
  save: (key: string, value: unknown) => void;
  load: <T>(key: string, fallback: T) => T;
  submitScore: (score: number) => void;
  setMenu: (items: { id: string; label: string }[]) => void;
  gamepad?: {
    pads: () => MyPCGamepadPadInfo[];
    axis: (index: number, padIndex?: number) => number;
    pressed: (index: number, padIndex?: number) => boolean;
    value: (index: number, padIndex?: number) => number;
    name: (index: number) => string;
    on: {
      (
        event: 'button',
        cb: (index: number, pressed: boolean, value: number, dev: string, name: string) => void
      ): () => void;
      (event: 'axes', cb: (axes: ArrayLike<number>, dev: string) => void): () => void;
      (event: 'pads', cb: (pads: MyPCGamepadPadInfo[]) => void): () => void;
    };
  };
}

declare global {
  interface Window {
    MyPC?: MyPCSdk;
  }
}
