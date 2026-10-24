import React, { useEffect, useRef, useState } from 'react';
import { mapUvToWorld, renderFullWorldMap } from '../game/mapRenderer.ts';
import {
  CONTEXT_ACTION_DEFINITIONS,
  DEFAULT_HUD_VISIBILITY,
  GRAPHICS_PRESETS,
  LOGICAL_RESOLUTIONS,
  STORY_MISSIONS,
  UI_TRANSLATIONS,
  createDefaultControllerMapping,
  estimateGraphicsFootprint,
  getButtonLabel,
  getKeyboardCodeLabel,
  getResolvedHudVisibility,
  remapControllerAction,
  resetContextSubTabMapping,
} from '../game/rules.ts';
import {
  TANGIER_LANDMARKS,
  TANGIER_WORLD_SPAN,
  TANGIER_WORLD_ZONES,
} from '../game/tangierMapData.ts';
import type {
  CommandHubTab,
  ControlContextTab,
  ControllerLayoutStyle,
  ControllerMapping,
  GameActionId,
  GraphicsPresetId,
  GraphicsSettings,
  HudVisibilitySettings,
  LanguageCode,
  LogicalResolutionId,
  MyPCGamepadPadInfo,
  PolyBudgetTier,
  RadioTrack,
  RenderTelemetry,
  TextSizeScale,
  WorldZoneId,
} from '../game/types.ts';
import type { WorldHudSnapshot } from '../game/world3d.ts';

interface SettingsModalProps {
  lang: LanguageCode;
  initialTab?: CommandHubTab;
  isFromPause: boolean;
  snapshot: WorldHudSnapshot;
  graphics: GraphicsSettings;
  onChangeGraphics: (next: GraphicsSettings) => void;
  controllerMapping: ControllerMapping;
  onChangeControllerMapping: (next: ControllerMapping) => void;
  listeningAction: GameActionId | null;
  setListeningAction: (action: GameActionId | null) => void;
  listeningKeyAction: GameActionId | null;
  setListeningKeyAction: (action: GameActionId | null) => void;
  lastDetectedButton: { index: number; name: string; dev: string } | null;
  liveAxes: number[];
  connectedPads: MyPCGamepadPadInfo[];
  radioTracks: RadioTrack[];
  currentStationIndex: number;
  onSelectStation: (index: number) => void;
  onAddCustomTrack: (title: string, artist: string, url: string) => void;
  onSelectMission: (missionIndex: number) => void;
  onSetCustomWaypoint: (pt: { x: number; z: number } | null) => void;
  onFastTravelToZone?: (zoneId: WorldZoneId) => void;
  telemetry: RenderTelemetry;
  onSaveProgress: () => void;
  onClose: () => void;
  onReturnToTitle?: () => void;
  onSimulateGamepadButton?: (buttonIndex: number) => void;
}

const PRESET_CARDS: {
  id: Exclude<GraphicsPresetId, 'custom'>;
  name: string;
  polys: string;
  res: string;
  accent: string;
}[] = [
  {
    id: '1gb-tv-eco',
    name: '1GB TV ECO',
    polys: '~8K POLYS',
    res: '640×360 → TV Full',
    accent: '#38bdf8',
  },
  {
    id: 'tv-balanced',
    name: 'TV BALANCED',
    polys: '~18K POLYS',
    res: '960×540 → TV Full',
    accent: '#00a8e8',
  },
  {
    id: 'solara-high',
    name: 'TANGIER HIGH',
    polys: '~32K POLYS',
    res: '1280×720 → TV Full',
    accent: '#10b981',
  },
  {
    id: 'solara-ultra-50k',
    name: 'ULTRA 50K',
    polys: '50,000 POLYS',
    res: '1600×900 → TV Full',
    accent: '#f59e0b',
  },
  {
    id: 'solara-super-100k',
    name: 'SUPER 100K',
    polys: '100,000 POLYS',
    res: '1920×1080 → TV Full',
    accent: '#fcd34d',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  initialTab = 'map',
  isFromPause,
  snapshot,
  graphics,
  onChangeGraphics,
  controllerMapping,
  onChangeControllerMapping,
  listeningAction,
  setListeningAction,
  listeningKeyAction,
  setListeningKeyAction,
  lastDetectedButton,
  liveAxes,
  connectedPads,
  radioTracks,
  currentStationIndex,
  onSelectStation,
  onAddCustomTrack,
  onSelectMission,
  onSetCustomWaypoint,
  onFastTravelToZone,
  telemetry,
  onSaveProgress,
  onClose,
  onReturnToTitle,
  onSimulateGamepadButton,
}) => {
  const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;
  const [activeTab, setActiveTab] = useState<CommandHubTab>(initialTab);
  const [controlSubTab, setControlSubTab] = useState<ControlContextTab>('inCar');
  const [mapZoom, setMapZoom] = useState<number>(1.0);
  const [mapPan, setMapPan] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [customSongTitle, setCustomSongTitle] = useState('');
  const [customSongUrl, setCustomSongUrl] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const fullMapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const footprint = estimateGraphicsFootprint(graphics);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Draw the full-screen Tangier - Mesnana Golf & Kawassim World Map whenever on the 'map' tab
  useEffect(() => {
    if (activeTab !== 'map') return;
    const canvas = fullMapCanvasRef.current;
    if (!canvas) return;
    renderFullWorldMap(canvas, {
      playerX: snapshot.playerX,
      playerZ: snapshot.playerZ,
      playerHeading: snapshot.playerHeading,
      activeTargetX: snapshot.activeTargetX,
      activeTargetZ: snapshot.activeTargetZ,
      customWaypoint: snapshot.customWaypoint,
      missions: STORY_MISSIONS,
      currentMissionIndex: snapshot.currentMissionIndex,
      completedMissionIds: snapshot.completedMissions,
      zoom: mapZoom,
      panX: mapPan.x,
      panZ: mapPan.z,
    });
  }, [
    activeTab,
    snapshot.playerX,
    snapshot.playerZ,
    snapshot.playerHeading,
    snapshot.activeTargetX,
    snapshot.activeTargetZ,
    snapshot.customWaypoint,
    snapshot.currentMissionIndex,
    snapshot.completedMissions,
    mapZoom,
    mapPan,
  ]);

  useEffect(() => {
    const onModalKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (listeningAction || listeningKeyAction) return;

      if (e.code === 'Digit1') {
        e.preventDefault();
        setActiveTab('map');
        return;
      }
      if (e.code === 'Digit2') {
        e.preventDefault();
        setActiveTab('missions');
        return;
      }
      if (e.code === 'Digit3') {
        e.preventDefault();
        setActiveTab('controls');
        return;
      }
      if (e.code === 'Digit4') {
        e.preventDefault();
        setActiveTab('settings');
        return;
      }
      if (e.code === 'Digit5') {
        e.preventDefault();
        setActiveTab('radio');
        return;
      }
    };

    window.addEventListener('keydown', onModalKeyDown);
    return () => window.removeEventListener('keydown', onModalKeyDown);
  }, [listeningAction, listeningKeyAction]);

  const hudVis = getResolvedHudVisibility(graphics);

  const updateHudVisibility = (patch: Partial<HudVisibilitySettings>) => {
    const nextHud: HudVisibilitySettings = {
      ...hudVis,
      ...patch,
    };
    onChangeGraphics({
      ...graphics,
      showPerfOverlay: nextHud.perfOverlay,
      hudVisibility: nextHud,
    });
  };

  const setAllHudElements = (visible: boolean) => {
    const nextHud: HudVisibilitySettings = {
      masterHud: visible,
      minimap: visible,
      missionCard: visible,
      perfOverlay: visible,
      gpsArrowBar: visible,
      cashHealthBox: visible,
      quickButtons: visible,
      wantedStars: visible,
      centerBanners: visible,
      radioWidget: visible,
      actionPrompts: visible,
      speedometer: visible,
    };
    onChangeGraphics({
      ...graphics,
      showPerfOverlay: visible,
      hudVisibility: nextHud,
    });
  };

  const applyPreset = (presetId: Exclude<GraphicsPresetId, 'custom'>) => {
    onChangeGraphics({
      ...GRAPHICS_PRESETS[presetId],
      textSize: graphics.textSize || 'normal',
      hudVisibility: graphics.hudVisibility || { ...DEFAULT_HUD_VISIBILITY },
    });
  };

  const updateCustomGraphics = (patch: Partial<GraphicsSettings>) => {
    const nextLogical = patch.logicalResolution || graphics.logicalResolution;
    const derivedScale = LOGICAL_RESOLUTIONS[nextLogical]?.scale ?? graphics.renderScale;
    onChangeGraphics({
      ...graphics,
      ...patch,
      renderScale: patch.renderScale !== undefined ? patch.renderScale : derivedScale,
      preset: patch.preset || 'custom',
    });
  };

  const handleMapCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = fullMapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const mapDrawSize = Math.min(canvas.width, canvas.height) * 0.92;
    const relX = (clickX - canvas.width / 2) / mapZoom;
    const relY = (clickY - canvas.height / 2) / mapZoom;

    const u = (relX + mapDrawSize / 2) / mapDrawSize + mapPan.x / TANGIER_WORLD_SPAN;
    const v = (relY + mapDrawSize / 2) / mapDrawSize + mapPan.z / TANGIER_WORLD_SPAN;
    const worldPt = mapUvToWorld(Math.max(0.03, Math.min(0.97, u)), Math.max(0.03, Math.min(0.97, v)));
    onSetCustomWaypoint({
      x: Math.round(worldPt.x),
      z: Math.round(worldPt.z),
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const objectUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      onAddCustomTrack(cleanName, 'Attached User Track', objectUrl);
    }
    e.target.value = '';
  };

  const handleAddUrlSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSongTitle.trim() || !customSongUrl.trim()) return;
    onAddCustomTrack(customSongTitle.trim(), 'Custom Stream', customSongUrl.trim());
    setCustomSongTitle('');
    setCustomSongUrl('');
  };

  const triggerSave = () => {
    onSaveProgress();
    setSaveToast('PROGRESS SAVED!');
    setTimeout(() => setSaveToast(null), 2500);
  };

  const filteredActions = CONTEXT_ACTION_DEFINITIONS.filter(
    (act) => act.context === controlSubTab
  );

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Tangier City Command Hub: Map, Missions, Controls and Options"
      className="fixed inset-0 z-40 flex items-center justify-center p-2 md:p-5 bg-[#030b16]/90 pointer-events-auto"
    >
      <div className="w-full max-w-7xl h-[94vh] max-h-[880px] flex flex-col md:flex-row rounded-2xl bg-[#061526] border-2 border-[#00a8e8] shadow-[0_12px_60px_rgba(0,168,232,0.4)] overflow-hidden">
        {/* LEFT SIDEBAR: TANGIER SEA BLUE COMMAND HUB NAVIGATION */}
        <aside className="w-full md:w-72 shrink-0 bg-[#04101e] border-b md:border-b-0 md:border-r border-sky-400/30 p-4 flex flex-col justify-between">
          <div>
            <div className="mb-4 pb-3 border-b border-sky-400/20">
              <div className="text-xs font-extrabold tracking-widest uppercase text-amber-400">
                {isFromPause ? 'GAME PAUSED · COMMAND HUB' : 'TANGIER COMMAND HUB'}
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white uppercase mt-0.5">
                TANGIER CITY
              </h2>
              <p className="text-xs font-semibold text-sky-300">
                Mesnana Golf · Kawassim · Boubana
              </p>
            </div>

            {/* 5 Primary Command Hub Tabs */}
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
              {(
                [
                  { id: 'map', label: `1. ${t.mapTab}`, badge: 'M' },
                  { id: 'missions', label: `2. ${t.missionsTab}`, badge: 'J' },
                  { id: 'controls', label: `3. ${t.controllerTab}`, badge: 'PAD/KEY' },
                  { id: 'settings', label: `4. ${t.graphicsTab}`, badge: 'TV' },
                  { id: 'radio', label: `5. ${t.radioTab}`, badge: 'FM' },
                ] as { id: CommandHubTab; label: string; badge: string }[]
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-modal-tab={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`tv-focus-ring w-full py-3 px-3.5 rounded-xl font-black uppercase tracking-wide text-left flex items-center justify-between transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#00a8e8] text-[#04101e] shadow-[0_4px_20px_rgba(0,168,232,0.45)]'
                        : 'bg-[#082038] text-slate-100 border border-sky-400/20 hover:border-sky-300'
                    }`}
                  >
                    <span className="text-xs md:text-sm">{tab.label}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                        isActive ? 'bg-[#04101e]/25 text-[#04101e]' : 'bg-black/30 text-sky-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Live Hardware & Location Summary */}
          <div className="hidden md:block my-3 p-3.5 rounded-xl bg-[#071a30] border border-sky-400/30 space-y-2 tabular-nums">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">DISTRICT</span>
              <span className="text-xs font-black text-sky-300 truncate max-w-[130px]">
                {snapshot.district.name}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">POLYGONS</span>
              <span
                className="text-sm font-black text-emerald-400"
                data-testid="rendered-polys-count"
              >
                {telemetry.triangles.toLocaleString()} TRIS
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">RESOLUTION</span>
              <span
                className="text-xs font-black text-amber-300"
                data-testid="active-resolution-readout"
              >
                {telemetry.bufferWidth}×{telemetry.bufferHeight}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">TEXT SIZE</span>
              <span className="text-xs font-black text-white uppercase">
                {graphics.textSize || 'large'}
              </span>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex md:flex-col gap-2 pt-2 border-t border-sky-400/20">
            {saveToast && (
              <div className="text-center py-1.5 px-2 rounded-lg bg-emerald-500/20 border border-emerald-400 text-xs font-black text-emerald-300">
                {saveToast}
              </div>
            )}
            <button
              type="button"
              onClick={triggerSave}
              className="tv-focus-ring w-full py-2.5 px-4 rounded-xl font-black uppercase tracking-wider text-xs bg-emerald-400 text-[#04101e] hover:bg-emerald-300"
            >
              {t.saveGame}
            </button>
            {isFromPause && onReturnToTitle && (
              <button
                type="button"
                onClick={onReturnToTitle}
                className="tv-focus-ring w-full py-2.5 px-4 rounded-xl font-black uppercase tracking-wider text-xs bg-[#0c2744] text-slate-200 border border-sky-400/30 hover:border-white"
              >
                Return to Title Screen
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="tv-focus-ring w-full py-3 px-4 rounded-xl font-black uppercase tracking-wider text-sm bg-[#0077b6] hover:bg-[#00a8e8] text-white shadow-lg"
            >
              {isFromPause ? `► ${t.resume}` : '► RETURN TO TANGIER'}
            </button>
          </div>
        </aside>

        {/* RIGHT PANEL: ACTIVE COMMAND HUB VIEW */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-5 bg-gradient-to-br from-[#06182c] via-[#071d35] to-[#041222]">
          {/* TAB 1: FULL-SCREEN TANGIER - MESNANA GOLF & KAWASSIM WORLD MAP */}
          {activeTab === 'map' && (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#04101e]/90 p-3.5 rounded-xl border border-sky-400/35">
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-wide text-sky-300">
                    GREATER TANGIER OPEN WORLD MAP (920M × 920M · SMART SECTOR STREAMING)
                  </h3>
                  <p className="text-xs md:text-sm text-slate-300">
                    Click anywhere across Mesnana Golf, Royal Golf, Kawassim, Cap Spartel, Boukhalef, or Malabata to plot a connected GPS route.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMapZoom((z) => Math.min(3.5, +(z + 0.4).toFixed(2)))}
                    className="tv-focus-ring px-3 py-1.5 rounded-lg bg-[#08223e] border border-sky-400/40 text-xs font-black text-sky-200 hover:bg-[#0c3158]"
                  >
                    Zoom In +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMapZoom(2.4);
                      setMapPan({ x: -10, z: 10 });
                    }}
                    className="tv-focus-ring px-3 py-1.5 rounded-lg bg-[#08223e] border border-emerald-400/40 text-xs font-black text-emerald-300 hover:bg-[#0c3158]"
                  >
                    Mesnana &amp; Kawassim Core (2.4×)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMapZoom(2.2);
                      setMapPan({ x: snapshot.playerX, z: snapshot.playerZ });
                    }}
                    className="tv-focus-ring px-3 py-1.5 rounded-lg bg-[#08223e] border border-sky-400/40 text-xs font-black text-sky-200 hover:bg-[#0c3158]"
                  >
                    Center Player
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMapZoom(1.0);
                      setMapPan({ x: 0, z: 0 });
                    }}
                    className="tv-focus-ring px-3 py-1.5 rounded-lg bg-[#08223e] border border-sky-400/40 text-xs font-black text-sky-200 hover:bg-[#0c3158]"
                  >
                    Full Map ({mapZoom.toFixed(1)}×)
                  </button>
                  {snapshot.customWaypoint && (
                    <button
                      type="button"
                      onClick={() => onSetCustomWaypoint(null)}
                      className="tv-focus-ring px-3 py-1.5 rounded-lg bg-amber-400 text-[#04101e] text-xs font-black"
                    >
                      Clear Waypoint
                    </button>
                  )}
                </div>
              </div>

              {/* 5-PART WORLD STREAMING ZONES & INSTANT ZONE LOADER */}
              <div className="p-3 rounded-xl bg-[#04101e]/90 border border-emerald-400/35 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-black uppercase tracking-wider text-emerald-300">
                    5-PART SMART WORLD STREAMING — ONLY ACTIVE PART LOADED IN 3D ({telemetry.activeSectors}/{telemetry.totalSectors} SECTORS MOUNTED)
                  </span>
                  <span className="font-bold text-sky-300">
                    Click any Part below to load &amp; fast-travel directly, or drive across boundaries to auto-stream!
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TANGIER_WORLD_ZONES.map((zone) => {
                    const isCurrentZone = snapshot.currentZone.id === zone.id;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        data-testid={`fast-travel-${zone.id}`}
                        onClick={() => onFastTravelToZone?.(zone.id)}
                        className={`tv-focus-ring p-2.5 rounded-xl border text-left transition-all ${
                          isCurrentZone
                            ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                            : 'bg-[#082038] border-sky-400/25 hover:border-sky-300 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-black uppercase text-sky-300">
                            PART {zone.partNumber}/5
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                              isCurrentZone
                                ? 'bg-emerald-400 text-[#04101e]'
                                : 'bg-sky-400/20 text-sky-200'
                            }`}
                          >
                            {isCurrentZone ? 'LOADED' : 'LOAD →'}
                          </span>
                        </div>
                        <div className="text-xs font-extrabold text-white truncate mt-1">
                          {zone.shortLabel.replace(/^PART \d · /, '')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[430px]">
                {/* Interactive High-Resolution Cartographic Canvas */}
                <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border-2 border-[#00a8e8] bg-[#04101e] flex items-center justify-center">
                  <canvas
                    ref={fullMapCanvasRef}
                    width={760}
                    height={760}
                    onClick={handleMapCanvasClick}
                    className="w-full h-full max-h-[600px] object-contain cursor-crosshair block"
                  />
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#04101e]/92 border border-sky-400/35 text-xs font-bold">
                    <span className="text-sky-300">
                      Current Street: <strong className="text-white">{snapshot.streetName}</strong>
                    </span>
                    <span className="text-amber-300">
                      Active Route: <strong>{snapshot.activeTargetLabel}</strong>
                      {snapshot.missionDistanceMeters !== null
                        ? ` (${snapshot.missionDistanceMeters}m)`
                        : ''}
                    </span>
                  </div>
                </div>

                {/* Tangier Landmarks & Roundabouts Quick-GPS List */}
                <div className="p-4 rounded-2xl bg-[#04101e]/90 border border-sky-400/30 flex flex-col justify-between space-y-3 overflow-y-auto max-h-[600px]">
                  <div className="space-y-2.5">
                    <div className="text-sm font-black uppercase tracking-wider text-amber-300">
                      TANGIER LANDMARKS &amp; GPS PINS
                    </div>
                    <p className="text-xs text-slate-300">
                      Select any destination in Mesnana Golf, Royal Golf, Kawassim, Boubana, or Rahrah to set your top navigation arrow:
                    </p>
                    <div className="space-y-2">
                      {TANGIER_LANDMARKS.map((lm) => (
                        <button
                          key={lm.id}
                          type="button"
                          onClick={() => onSetCustomWaypoint({ x: lm.x, z: lm.z })}
                          className="tv-focus-ring w-full p-3 rounded-xl bg-[#082038] hover:bg-[#0c2d4e] border border-sky-400/25 hover:border-sky-300 text-left transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs md:text-sm font-black text-white">
                              {lm.name}
                            </span>
                            <span className="text-[11px] font-extrabold text-sky-300 uppercase shrink-0">
                              Set GPS →
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-1 leading-snug">
                            {lm.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Map Legend */}
                  <div className="pt-3 border-t border-sky-400/20 grid grid-cols-2 gap-2 text-xs font-bold text-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#00a8e8] inline-block" />
                      <span>Player &amp; GPS Route</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#f59e0b] inline-block" />
                      <span>Mission Target</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#10b981] inline-block" />
                      <span>Royal Golf &amp; Parks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#f8fafc] inline-block" />
                      <span>Rond-Point (Roundabout)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEDICATED MISSIONS SCREEN */}
          {activeTab === 'missions' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/35 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-wide text-amber-300">
                    TANGIER MISSIONS &amp; STREET CONTRACTS
                  </h3>
                  <p className="text-xs md:text-sm text-slate-300">
                    Select any mission below to track its objectives on the Top Compass Arrow and Rotating Road Mini-Map.
                  </p>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-[#082038] border border-sky-400/35 text-xs font-black text-sky-200 tabular-nums">
                  Completed: {snapshot.completedMissions.length} / {STORY_MISSIONS.length} Missions
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {STORY_MISSIONS.map((m) => {
                  const isCurrent = m.index === snapshot.currentMissionIndex;
                  const isCompleted = snapshot.completedMissions.includes(m.id);

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-3 transition-all ${
                        isCurrent
                          ? 'bg-[#082442] border-amber-400 shadow-[0_6px_28px_rgba(245,158,11,0.25)]'
                          : 'bg-[#041222]/90 border-sky-400/25'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                            {m.giver} · {m.district.replace('-', ' ').toUpperCase()}
                          </span>
                          <span className="text-sm font-black text-emerald-400 tabular-nums">
                            +${m.rewardCash.toLocaleString()}
                          </span>
                        </div>

                        <h4 className="text-base md:text-lg font-black text-white">
                          {m.title}
                        </h4>

                        <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
                          {m.briefing}
                        </p>

                        {/* Step-by-Step Mission Objectives */}
                        <div className="pt-2 space-y-1.5 border-t border-white/10">
                          {m.objectives.map((obj, oIdx) => {
                            const isObjActive =
                              isCurrent && oIdx === snapshot.currentObjectiveIndex;
                            return (
                              <div
                                key={oIdx}
                                className={`text-xs font-semibold flex items-start gap-2 ${
                                  isObjActive ? 'text-amber-300 font-bold' : 'text-slate-300'
                                }`}
                              >
                                <span>{isObjActive ? '►' : `${oIdx + 1}.`}</span>
                                <div>
                                  <div>{obj.description}</div>
                                  {obj.streetHint && (
                                    <div className="text-[11px] text-sky-300">
                                      Route: {obj.streetHint}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-sky-400/20">
                        <span className="text-xs font-extrabold uppercase text-slate-300">
                          {isCurrent
                            ? 'ACTIVE TRACKED MISSION'
                            : isCompleted
                              ? 'COMPLETED (REPLAYABLE)'
                              : 'AVAILABLE CONTRACT'}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectMission(m.index);
                              setActiveTab('map');
                            }}
                            className="tv-focus-ring px-3 py-2 rounded-xl bg-[#082038] hover:bg-[#0d3156] text-sky-200 border border-sky-400/40 text-xs font-black uppercase"
                          >
                            View on Map
                          </button>
                          <button
                            type="button"
                            data-testid={`start-mission-${m.index}`}
                            onClick={() => {
                              onSelectMission(m.index);
                              onClose();
                            }}
                            className={`tv-focus-ring px-4 py-2 rounded-xl text-xs font-black uppercase ${
                              isCurrent
                                ? 'bg-amber-400 text-[#04101e]'
                                : 'bg-[#00a8e8] text-[#04101e] hover:bg-[#38bdf8]'
                            }`}
                          >
                            {isCurrent ? 'Continue Mission' : 'Track Mission'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: COMPLETE CONTEXT-TABBED CONTROLS MAPPING (IN CAR / ON FOOT / MENUS & UI) */}
          {activeTab === 'controls' && (
            <div className="space-y-4">
              {/* Top Header + Controller Layout Style Selector */}
              <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/35 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-wide text-sky-300">
                    COMPLETE CONTROLLER &amp; KEYBOARD MAPPING BY CONTEXT
                  </h3>
                  <p className="text-xs md:text-sm text-slate-300">
                    Choose a context sub-tab below (<strong>In Car</strong>, <strong>On Foot</strong>, or <strong>Menus &amp; Map</strong>) and remap any Controller Button or Keyboard Key.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(['switch', 'xbox', 'playstation'] as ControllerLayoutStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        onChangeControllerMapping({ ...controllerMapping, layoutStyle: style })
                      }
                      className={`tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                        controllerMapping.layoutStyle === style
                          ? 'bg-[#00a8e8] text-[#04101e]'
                          : 'bg-[#082038] text-slate-200 border border-sky-400/25'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onChangeControllerMapping(
                        resetContextSubTabMapping(controllerMapping, controlSubTab)
                      )
                    }
                    className="tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/50 hover:bg-amber-400/30"
                  >
                    Reset Sub-Tab
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeControllerMapping(
                        createDefaultControllerMapping(controllerMapping.layoutStyle)
                      )
                    }
                    className="tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black bg-rose-500/20 text-rose-200 border border-rose-400/40 hover:bg-rose-500/30"
                  >
                    Reset All
                  </button>
                </div>
              </div>

              {/* 3 Context Sub-Tabs: IN CAR (DRIVING) | ON FOOT (WITHOUT CAR) | MENUS & MAP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-[#04101e] p-2 rounded-2xl border border-sky-400/30">
                {(
                  [
                    {
                      id: 'inCar',
                      title: '1. In Car (Driving)',
                      sub: 'Gas, Brake, Steer, Drift, Nitro, Exit, Horn & Radio',
                    },
                    {
                      id: 'onFoot',
                      title: '2. On Foot (Without Car)',
                      sub: 'Walk, Turn, Sprint, Enter Car, Interact & Camera',
                    },
                    {
                      id: 'menuUi',
                      title: '3. World Map, Missions & UI',
                      sub: 'Open Map, Missions, Command Hub, Radar & Quick Save',
                    },
                  ] as { id: ControlContextTab; title: string; sub: string }[]
                ).map((st) => {
                  const active = controlSubTab === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      data-testid={`controls-subtab-${st.id}`}
                      onClick={() => {
                        setListeningAction(null);
                        setListeningKeyAction(null);
                        setControlSubTab(st.id);
                      }}
                      className={`tv-focus-ring p-3 rounded-xl text-left transition-all border ${
                        active
                          ? 'bg-[#0077b6] border-amber-300 text-white shadow-lg'
                          : 'bg-[#082038] border-sky-400/20 text-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <div className="text-sm font-black uppercase tracking-wide">
                        {st.title}
                      </div>
                      <div className="text-xs text-sky-100/90 mt-0.5">{st.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* Live Hardware Status Bar */}
              <div className="p-3.5 rounded-xl bg-[#04101e] border border-sky-400/25 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
                <div>
                  <span className="text-slate-400 font-bold mr-2">ACTIVE CONTROLLER:</span>
                  <span className="text-sky-300 font-black">
                    {connectedPads.length > 0
                      ? `${connectedPads[0].name} (${connectedPads[0].buttons} Btns)`
                      : 'Gamepad + Full Keyboard Active'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold mr-2">LAST DETECTED PAD INPUT:</span>
                  <span
                    className="text-amber-300 font-black"
                    data-testid="last-detected-button"
                  >
                    {lastDetectedButton
                      ? `Btn #${lastDetectedButton.index} (${getButtonLabel(
                          lastDetectedButton.index,
                          controllerMapping.layoutStyle
                        )})`
                      : 'Press any button...'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold mr-2">ANALOG STICK:</span>
                  <span className="text-slate-200">
                    L({(liveAxes[0] || 0).toFixed(2)}, {(liveAxes[1] || 0).toFixed(2)})
                  </span>
                </div>
                {onSimulateGamepadButton && (
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3, 6, 7].map((bIdx) => (
                      <button
                        key={bIdx}
                        type="button"
                        data-testid={`sim-pad-btn-${bIdx}`}
                        onClick={() => onSimulateGamepadButton(bIdx)}
                        className="px-2 py-1 rounded bg-[#082038] hover:bg-[#0d3359] text-[11px] font-bold text-sky-300 border border-sky-400/30"
                      >
                        Test #{bIdx}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Cards for Selected Context Sub-Tab (Both Gamepad & Keyboard Mappable!) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredActions.map((act) => {
                  const currentBtnIdx =
                    controllerMapping.buttons[act.id] ?? act.defaultPadBtn;
                  const currentKeyCode =
                    controllerMapping.keys?.[act.id] ?? act.defaultKeyCode;
                  const isListeningPad = listeningAction === act.id;
                  const isListeningKey = listeningKeyAction === act.id;

                  return (
                    <div
                      key={act.id}
                      className={`p-4 rounded-xl border-2 flex flex-col justify-between gap-3 ${
                        isListeningPad || isListeningKey
                          ? 'bg-[#0c3158] border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                          : 'bg-[#041222]/95 border-sky-400/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm md:text-base font-black text-white uppercase tracking-wide">
                            {act.label}
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">{act.desc}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-sky-400/15 text-[11px] font-extrabold uppercase text-sky-300 shrink-0">
                          {act.context === 'inCar'
                            ? 'In Car'
                            : act.context === 'onFoot'
                              ? 'On Foot'
                              : 'Menus & UI'}
                        </span>
                      </div>

                      {/* Dual Remap Row: Controller Button + Keyboard Key */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/10">
                        {/* Gamepad Button Binding */}
                        <div className="flex items-center justify-between gap-1.5 bg-[#082038] p-2 rounded-lg border border-sky-400/25">
                          <span className="text-xs font-bold text-sky-200">Pad Btn:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`remap-${act.id}`}
                              onClick={() => {
                                setListeningKeyAction(null);
                                setListeningAction(isListeningPad ? null : act.id);
                              }}
                              className={`tv-focus-ring px-2.5 py-1 rounded text-xs font-black whitespace-nowrap ${
                                isListeningPad
                                  ? 'bg-amber-400 text-[#04101e]'
                                  : 'bg-[#04101e] text-sky-300 border border-sky-400/40 hover:border-sky-300'
                              }`}
                            >
                              {isListeningPad
                                ? 'PRESS PAD BTN...'
                                : getButtonLabel(currentBtnIdx, controllerMapping.layoutStyle)}
                            </button>
                            <button
                              type="button"
                              title="Cycle Controller Button"
                              onClick={() =>
                                onChangeControllerMapping(
                                  remapControllerAction(
                                    controllerMapping,
                                    act.id,
                                    (currentBtnIdx + 1) % 16
                                  )
                                )
                              }
                              className="tv-focus-ring px-2 py-1 rounded bg-[#04101e] text-slate-300 hover:text-white text-xs font-black border border-white/15"
                            >
                              +1
                            </button>
                          </div>
                        </div>

                        {/* Keyboard Key Binding */}
                        <div className="flex items-center justify-between gap-1.5 bg-[#082038] p-2 rounded-lg border border-sky-400/25">
                          <span className="text-xs font-bold text-amber-200">Key:</span>
                          <button
                            type="button"
                            data-testid={`remap-key-${act.id}`}
                            onClick={() => {
                              setListeningAction(null);
                              setListeningKeyAction(isListeningKey ? null : act.id);
                            }}
                            className={`tv-focus-ring px-3 py-1 rounded text-xs font-black whitespace-nowrap ${
                              isListeningKey
                                ? 'bg-amber-400 text-[#04101e]'
                                : 'bg-[#04101e] text-amber-300 border border-amber-400/40 hover:border-amber-300'
                            }`}
                          >
                            {isListeningKey
                              ? 'PRESS ANY KEY...'
                              : getKeyboardCodeLabel(currentKeyCode)}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: DISPLAY, TEXT SIZE & POLYGON SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              {/* 1. DEDICATED TEXT SIZE SCALE SETTING (Tiny / Small / Normal / Large TV / Extra Large) */}
              <div className="p-4 rounded-xl bg-[#04101e]/95 border-2 border-[#00a8e8] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-wide text-sky-300">
                    UI &amp; MENU TEXT SIZE SCALE (5 OPTIONS: TINY TO EXTRA LARGE)
                  </h3>
                  <p className="text-xs md:text-sm text-slate-300">
                    Adjust the global text size across all menus, mission briefings, map labels, and HUD readouts:
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'tiny', label: 'Tiny (70%)' },
                      { id: 'small', label: 'Small (85%)' },
                      { id: 'normal', label: 'Normal (100%)' },
                      { id: 'large', label: 'Large TV (115%)' },
                      { id: 'xl', label: 'Extra Large (130%)' },
                    ] as { id: TextSizeScale; label: string }[]
                  ).map((sz) => {
                    const active = (graphics.textSize || 'normal') === sz.id;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        data-testid={`text-size-${sz.id}`}
                        onClick={() =>
                          onChangeGraphics({
                            ...graphics,
                            textSize: sz.id,
                          })
                        }
                        className={`tv-focus-ring px-3.5 py-2 rounded-xl text-xs md:text-sm font-black uppercase transition-all ${
                          active
                            ? 'bg-[#00a8e8] text-[#04101e] shadow-lg'
                            : 'bg-[#082038] text-slate-200 border border-sky-400/30 hover:border-sky-300'
                        }`}
                      >
                        {sz.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1B. COMPLETE HUD ELEMENTS VISIBILITY CUSTOMIZER (HIDE ANY OR ALL HUD ITEMS) */}
              <div className="p-4 rounded-xl bg-[#04101e]/95 border-2 border-amber-400/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm md:text-base font-black uppercase tracking-wider text-amber-300">
                      HUD ELEMENTS VISIBILITY (SHOW / HIDE EVERY SCREEN WIDGET)
                    </h3>
                    <p className="text-xs text-slate-300">
                      Toggle any individual HUD element on or off, or hide the entire HUD for a clean 3D driving screen:
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="hud-show-all-btn"
                      onClick={() => setAllHudElements(true)}
                      className={`tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                        hudVis.masterHud
                          ? 'bg-emerald-400 text-[#04101e]'
                          : 'bg-[#082038] text-emerald-300 border border-emerald-400/40'
                      }`}
                    >
                      Show All HUD
                    </button>
                    <button
                      type="button"
                      data-testid="hud-hide-all-btn"
                      onClick={() => setAllHudElements(false)}
                      className={`tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                        !hudVis.masterHud
                          ? 'bg-amber-400 text-[#04101e]'
                          : 'bg-[#082038] text-amber-300 border border-amber-400/40'
                      }`}
                    >
                      Hide All HUD (Clean 3D)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'masterHud', label: 'Master HUD Display', pos: 'All Screen Overlays' },
                      { key: 'minimap', label: 'Rotating Mini-Map & Zoom Btn', pos: 'Top-Left' },
                      { key: 'missionCard', label: 'Mission & Street Card', pos: 'Top-Left' },
                      { key: 'perfOverlay', label: 'Polys, Resolution & FPS Bar', pos: 'Top-Left' },
                      { key: 'gpsArrowBar', label: 'GPS Turn Arrow & Distance', pos: 'Top-Center' },
                      { key: 'cashHealthBox', label: 'Cash ($), HP & Armor Box', pos: 'Top-Right' },
                      { key: 'quickButtons', label: 'Map / Missions / Options Btns', pos: 'Top-Right' },
                      { key: 'wantedStars', label: 'DGSN Police Wanted Stars', pos: 'Top-Right' },
                      { key: 'centerBanners', label: 'Center Alert Banners', pos: 'Center' },
                      { key: 'radioWidget', label: 'Tangier FM Radio Widget', pos: 'Bottom-Left' },
                      { key: 'actionPrompts', label: 'Exit Car & Horn / Siren Btns', pos: 'Bottom-Left' },
                      { key: 'speedometer', label: 'Digital Speedometer & Car Name', pos: 'Bottom-Right' },
                    ] as { key: keyof HudVisibilitySettings; label: string; pos: string }[]
                  ).map((item) => {
                    const isOn = hudVis[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid={`hud-toggle-${item.key}`}
                        onClick={() =>
                          updateHudVisibility({
                            [item.key]: !isOn,
                            ...(item.key !== 'masterHud' && !isOn ? { masterHud: true } : {}),
                          })
                        }
                        className={`tv-focus-ring p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                          isOn
                            ? 'bg-[#082442] border-sky-400/60 text-white'
                            : 'bg-[#04101e] border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black truncate">{item.label}</div>
                          <div className="text-[10px] font-semibold text-sky-300/80 uppercase">
                            {item.pos}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${
                            isOn
                              ? 'bg-emerald-400 text-[#04101e]'
                              : 'bg-rose-500/25 text-rose-300 border border-rose-400/30'
                          }`}
                        >
                          {isOn ? 'SHOWN' : 'HIDDEN'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. FIVE QUALITY TIERS INCLUDING ULTRA (50K) & SUPER (100K) */}
              <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/30">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm md:text-base font-black uppercase tracking-wider text-sky-300">
                      GRAPHICS QUALITY &amp; POLYGON ENGINE PRESETS
                    </h3>
                    <p className="text-xs text-slate-300">
                      Scale from 1GB Smart TV Eco (~8k polys) up to ULTRA (50,000 polys) and SUPER (100,000 polys)
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-lg bg-[#082038] border border-sky-400/30 text-xs font-black text-amber-300 uppercase">
                    Active: {graphics.preset.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {PRESET_CARDS.map((card) => {
                    const active = graphics.preset === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        data-testid={`preset-${card.id}`}
                        onClick={() => applyPreset(card.id)}
                        className={`tv-focus-ring p-3.5 rounded-xl text-left transition-all border-2 ${
                          active
                            ? 'bg-[#08294b] border-[#00a8e8] shadow-[0_0_20px_rgba(0,168,232,0.35)]'
                            : 'bg-[#082038] border-white/10 hover:border-sky-400/50'
                        }`}
                      >
                        <div
                          className="text-xs font-black uppercase tracking-wider"
                          style={{ color: card.accent }}
                        >
                          {card.name}
                        </div>
                        <div className="text-sm font-black text-white mt-1 tabular-nums">
                          {card.polys}
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">{card.res}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. LOGICAL RESOLUTION + POLYGON BUDGET */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-black uppercase tracking-wider text-amber-300">
                      FULL-SCREEN TV LOGICAL RESOLUTION
                    </span>
                    <span className="text-xs font-bold text-sky-300 tabular-nums">
                      {graphics.logicalResolution} → 100% TV
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(LOGICAL_RESOLUTIONS) as LogicalResolutionId[]).map((resKey) => {
                      const info = LOGICAL_RESOLUTIONS[resKey];
                      const isSel = graphics.logicalResolution === resKey;
                      return (
                        <button
                          key={resKey}
                          type="button"
                          onClick={() =>
                            updateCustomGraphics({
                              logicalResolution: resKey,
                              renderScale: info.scale,
                            })
                          }
                          className={`tv-focus-ring py-2.5 px-3 rounded-lg text-xs font-black text-left flex items-center justify-between border ${
                            isSel
                              ? 'bg-amber-400 text-[#04101e] border-amber-300'
                              : 'bg-[#082038] text-slate-200 border-white/10 hover:border-amber-300'
                          }`}
                        >
                          <span>{resKey}</span>
                          <span className="text-[11px] opacity-85">Full-Screen</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-black uppercase tracking-wider text-sky-300">
                      3D POLYGON GEOMETRY BUDGET
                    </span>
                    <span className="text-xs font-black text-white tabular-nums">
                      {telemetry.triangles.toLocaleString()} Active Polys
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(
                      [
                        { id: 'low', label: 'LOW', sub: '~8K' },
                        { id: 'medium', label: 'MED', sub: '~18K' },
                        { id: 'high', label: 'HIGH', sub: '~32K' },
                        { id: 'ultra', label: 'ULTRA', sub: '50K' },
                        { id: 'super', label: 'SUPER', sub: '100K' },
                      ] as { id: PolyBudgetTier; label: string; sub: string }[]
                    ).map((tierItem) => {
                      const active = graphics.polyBudgetTier === tierItem.id;
                      return (
                        <button
                          key={tierItem.id}
                          type="button"
                          data-testid={`poly-tier-${tierItem.id}`}
                          onClick={() => updateCustomGraphics({ polyBudgetTier: tierItem.id })}
                          className={`tv-focus-ring py-2.5 px-2 rounded-lg text-center border transition-all ${
                            active
                              ? 'bg-[#00a8e8] text-[#04101e] border-white font-black'
                              : 'bg-[#082038] text-slate-200 border-white/10 hover:border-sky-300'
                          }`}
                        >
                          <div className="text-xs font-black">{tierItem.label}</div>
                          <div className="text-[11px] opacity-90">{tierItem.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 4. DRAW DISTANCE, TRAFFIC & FPS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>HORIZON DRAW DISTANCE</span>
                    <span className="text-sky-300">{graphics.drawDistance}m</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[110, 165, 220, 330].map((dist) => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => updateCustomGraphics({ drawDistance: dist })}
                        className={`tv-focus-ring py-1.5 rounded text-xs font-bold ${
                          graphics.drawDistance === dist
                            ? 'bg-[#00a8e8] text-[#04101e]'
                            : 'bg-[#082038] text-slate-300'
                        }`}
                      >
                        {dist}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>TANGIER TRAFFIC DENSITY</span>
                    <span className="text-amber-300">{graphics.trafficCount} Cars</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[6, 12, 18, 24].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => updateCustomGraphics({ trafficCount: cnt })}
                        className={`tv-focus-ring py-1.5 rounded text-xs font-bold ${
                          graphics.trafficCount === cnt
                            ? 'bg-amber-400 text-[#04101e]'
                            : 'bg-[#082038] text-slate-300'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>FRAME RATE &amp; TELEMETRY</span>
                    <span className="text-emerald-300">~{footprint.estimatedRamMB} MB RAM</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateCustomGraphics({ fpsCap: graphics.fpsCap === 60 ? 30 : 60 })
                      }
                      className="tv-focus-ring py-1.5 px-2 rounded text-xs font-bold bg-[#082038] text-sky-300 border border-sky-400/40"
                    >
                      Target: {graphics.fpsCap} FPS
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateCustomGraphics({ showPerfOverlay: !graphics.showPerfOverlay })
                      }
                      className={`tv-focus-ring py-1.5 px-2 rounded text-xs font-bold ${
                        graphics.showPerfOverlay
                          ? 'bg-[#00a8e8] text-[#04101e]'
                          : 'bg-[#082038] text-slate-300'
                      }`}
                    >
                      HUD Stats: {graphics.showPerfOverlay ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TANGIER FM RADIO & CUSTOM TRACK DECK */}
          {activeTab === 'radio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/35">
                <h3 className="text-base font-black uppercase tracking-wider text-amber-300 mb-1">
                  TANGIER MEDITERRANEAN FM &amp; CUSTOM AUDIO DECK
                </h3>
                <p className="text-xs md:text-sm text-slate-300 mb-3">
                  Select any station or attach your own MP3 / OGG / WAV songs while cruising Mesnana Golf and Hay El Kawassim:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {radioTracks.map((tr, idx) => {
                    const active = idx === currentStationIndex;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => onSelectStation(idx)}
                        className={`tv-focus-ring p-3.5 rounded-xl text-left flex items-center justify-between border ${
                          active
                            ? 'bg-[#00a8e8] text-[#04101e] border-white font-black'
                            : 'bg-[#082038] text-white border-sky-400/20 hover:border-sky-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-black uppercase tracking-wider truncate">
                            {tr.station}
                          </div>
                          <div className="text-xs truncate opacity-95">
                            &ldquo;{tr.title}&rdquo; · {tr.artist}
                          </div>
                        </div>
                        <span className="text-[11px] font-extrabold uppercase px-2.5 py-1 rounded bg-black/25">
                          {active ? 'ON AIR' : 'TUNE'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-2">
                  <div className="text-xs font-black uppercase text-sky-300">
                    ATTACH LOCAL SONG FILES (.MP3 / .OGG / .WAV)
                  </div>
                  <p className="text-xs text-slate-300">
                    Load audio files directly into the in-car stereo:
                  </p>
                  <label className="tv-focus-ring inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-[#00a8e8] text-[#04101e] font-black text-xs uppercase cursor-pointer hover:bg-[#38bdf8]">
                    <span>+ SELECT AUDIO FILES</span>
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <form
                  onSubmit={handleAddUrlSong}
                  className="p-4 rounded-xl bg-[#04101e]/90 border border-sky-400/25 space-y-2"
                >
                  <div className="text-xs font-black uppercase text-amber-300">
                    ADD STREAM / SONG URL
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Song Title"
                      value={customSongTitle}
                      onChange={(e) => setCustomSongTitle(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#082038] border border-sky-400/30 text-xs text-white flex-1"
                    />
                    <input
                      type="url"
                      placeholder="https://example.com/song.mp3"
                      value={customSongUrl}
                      onChange={(e) => setCustomSongUrl(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#082038] border border-sky-400/30 text-xs text-white flex-1"
                    />
                    <button
                      type="submit"
                      className="tv-focus-ring px-4 py-2 rounded-lg bg-amber-400 text-[#04101e] font-black text-xs uppercase"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
