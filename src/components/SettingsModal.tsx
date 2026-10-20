import React, { useState } from 'react';
import {
  GRAPHICS_PRESETS,
  LOGICAL_RESOLUTIONS,
  UI_TRANSLATIONS,
  createDefaultControllerMapping,
  estimateGraphicsFootprint,
  getButtonLabel,
  remapControllerAction,
} from '../game/rules.ts';
import type {
  ControllerLayoutStyle,
  ControllerMapping,
  GameActionId,
  GraphicsPresetId,
  GraphicsSettings,
  LanguageCode,
  LogicalResolutionId,
  MyPCGamepadPadInfo,
  PolyBudgetTier,
  RadioTrack,
  RenderTelemetry,
} from '../game/types.ts';

interface SettingsModalProps {
  lang: LanguageCode;
  isFromPause: boolean;
  graphics: GraphicsSettings;
  onChangeGraphics: (next: GraphicsSettings) => void;
  controllerMapping: ControllerMapping;
  onChangeControllerMapping: (next: ControllerMapping) => void;
  listeningAction: GameActionId | null;
  setListeningAction: (action: GameActionId | null) => void;
  lastDetectedButton: { index: number; name: string; dev: string } | null;
  liveAxes: number[];
  connectedPads: MyPCGamepadPadInfo[];
  radioTracks: RadioTrack[];
  currentStationIndex: number;
  onSelectStation: (index: number) => void;
  onAddCustomTrack: (title: string, artist: string, url: string) => void;
  telemetry: RenderTelemetry;
  onSaveProgress: () => void;
  onClose: () => void;
  onReturnToTitle?: () => void;
  onSimulateGamepadButton?: (buttonIndex: number) => void;
}

const ACTION_METADATA: { id: GameActionId; label: string; keyHint: string; desc: string }[] = [
  { id: 'accelerate', label: 'Accelerate / Gas', keyHint: 'W / Up Arrow', desc: 'Drive forward' },
  { id: 'brake', label: 'Brake / Reverse', keyHint: 'S / Down Arrow', desc: 'Brake or reverse' },
  { id: 'handbrake', label: 'Handbrake Drift', keyHint: 'Spacebar', desc: 'Power-slide corners' },
  { id: 'enterExitCar', label: 'Enter / Exit Car', keyHint: 'F / Enter', desc: 'Take or leave vehicle' },
  { id: 'sprint', label: 'Sprint / Confirm', keyHint: 'Shift / Space', desc: 'Fast run on foot' },
  { id: 'attackFire', label: 'Street Action / Horn', keyHint: 'E / H', desc: 'Hustle or sound horn' },
  { id: 'nextRadio', label: 'Next Radio Station', keyHint: 'R', desc: 'Cycle 1988 FM & user songs' },
  { id: 'cameraView', label: 'Camera Viewpoint', keyHint: 'C', desc: 'Close / Chase / Panoramic' },
  { id: 'radarZoom', label: 'Radar Map Zoom', keyHint: 'M / Tab', desc: 'Expand Solara Bay radar' },
  { id: 'hornSiren', label: 'Police Siren Toggle', keyHint: 'G / H', desc: 'SCPD cruiser lightbar' },
  { id: 'nextWeapon', label: 'Quick Save Game', keyHint: 'F5 / K', desc: 'Instant My PC profile save' },
  { id: 'pauseMenu', label: 'Pause / Game Menu', keyHint: 'Esc / P', desc: 'Open or close pause deck' },
];

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
    accent: '#00f5d4',
  },
  {
    id: 'tv-balanced',
    name: 'TV BALANCED',
    polys: '~18K POLYS',
    res: '960×540 → TV Full',
    accent: '#38bdf8',
  },
  {
    id: 'solara-high',
    name: 'SOLARA HIGH',
    polys: '~32K POLYS',
    res: '1280×720 → TV Full',
    accent: '#ffe66d',
  },
  {
    id: 'solara-ultra-50k',
    name: 'ULTRA 50K',
    polys: '50,000 POLYS',
    res: '1600×900 → TV Full',
    accent: '#ff2e93',
  },
  {
    id: 'solara-super-100k',
    name: 'SUPER 100K',
    polys: '100,000 POLYS',
    res: '1920×1080 → TV Full',
    accent: '#c084fc',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  isFromPause,
  graphics,
  onChangeGraphics,
  controllerMapping,
  onChangeControllerMapping,
  listeningAction,
  setListeningAction,
  lastDetectedButton,
  liveAxes,
  connectedPads,
  radioTracks,
  currentStationIndex,
  onSelectStation,
  onAddCustomTrack,
  telemetry,
  onSaveProgress,
  onClose,
  onReturnToTitle,
  onSimulateGamepadButton,
}) => {
  const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;
  const [activeTab, setActiveTab] = useState<'graphics' | 'controller' | 'radio'>('graphics');
  const [customSongTitle, setCustomSongTitle] = useState('');
  const [customSongUrl, setCustomSongUrl] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const footprint = estimateGraphicsFootprint(graphics);

  const applyPreset = (presetId: Exclude<GraphicsPresetId, 'custom'>) => {
    onChangeGraphics({ ...GRAPHICS_PRESETS[presetId] });
  };

  const updateCustomGraphics = (patch: Partial<GraphicsSettings>) => {
    const nextLogical = patch.logicalResolution || graphics.logicalResolution;
    const derivedScale = LOGICAL_RESOLUTIONS[nextLogical]?.scale ?? graphics.renderScale;
    onChangeGraphics({
      ...graphics,
      ...patch,
      renderScale: patch.renderScale !== undefined ? patch.renderScale : derivedScale,
      preset: 'custom',
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const objectUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      onAddCustomTrack(cleanName, 'Attached User Cassette', objectUrl);
    }
    e.target.value = '';
  };

  const handleAddUrlSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSongTitle.trim() || !customSongUrl.trim()) return;
    onAddCustomTrack(customSongTitle.trim(), 'Custom Tape Deck', customSongUrl.trim());
    setCustomSongTitle('');
    setCustomSongUrl('');
  };

  const triggerSave = () => {
    onSaveProgress();
    setSaveToast('SAVED TO MY PC PROFILE!');
    setTimeout(() => setSaveToast(null), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Solara Bay 1988 Pause and Options Deck"
      className="fixed inset-0 z-40 flex items-center justify-center p-2 md:p-5 bg-[#070312]/90 pointer-events-auto"
    >
      {/* 1988 Vice Arcade Pause Frame with angled neon chrome trim */}
      <div className="w-full max-w-6xl h-[92vh] max-h-[820px] flex flex-col md:flex-row rounded-xl bg-[#0e0620] border-2 border-[#ff2e93] shadow-[0_0_55px_rgba(255,46,147,0.45)] overflow-hidden">
        {/* LEFT COLUMN: 1988 CONSOLE PAUSE BLADE NAVIGATION */}
        <aside className="w-full md:w-72 shrink-0 bg-[#15082e] border-b md:border-b-0 md:border-r-2 border-[#00f5d4]/40 p-4 flex flex-col justify-between">
          <div>
            {/* Skewed Retro 1988 Title Header */}
            <div className="mb-4 pb-3 border-b border-white/15">
              <div className="inline-block px-2.5 py-0.5 mb-1 bg-[#ff2e93] text-white text-[10px] font-black tracking-[0.2em] uppercase -skew-x-12">
                {isFromPause ? 'GAME PAUSED' : 'SYSTEM DECK'}
              </div>
              <h2
                className="text-2xl md:text-3xl font-black italic tracking-wider text-white uppercase"
                style={{
                  fontFamily: 'Impact, "Arial Black", sans-serif',
                  textShadow: '2px 2px 0px #ff2e93, -1px -1px 0px #00f5d4',
                }}
              >
                SOLARA BAY &apos;88
              </h2>
              <p className="text-[11px] font-bold text-[#99f6e4] uppercase tracking-wider">
                Arcade Options &amp; Controls
              </p>
            </div>

            {/* Slanted Console Menu Blades */}
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('graphics')}
                className={`tv-focus-ring w-full py-3 px-4 rounded-lg font-black uppercase tracking-wider text-left flex items-center justify-between transition-all -skew-x-6 whitespace-nowrap ${
                  activeTab === 'graphics'
                    ? 'bg-[#00f5d4] text-[#090414] shadow-[0_0_20px_rgba(0,245,212,0.5)]'
                    : 'bg-[#1f0d40] text-white border border-white/10 hover:border-[#00f5d4]'
                }`}
              >
                <span className="text-xs md:text-sm">1. {t.graphicsTab}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('controller')}
                className={`tv-focus-ring w-full py-3 px-4 rounded-lg font-black uppercase tracking-wider text-left flex items-center justify-between transition-all -skew-x-6 whitespace-nowrap ${
                  activeTab === 'controller'
                    ? 'bg-[#ff2e93] text-white shadow-[0_0_20px_rgba(255,46,147,0.55)]'
                    : 'bg-[#1f0d40] text-white border border-white/10 hover:border-[#ff2e93]'
                }`}
              >
                <span className="text-xs md:text-sm">2. {t.controllerTab}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('radio')}
                className={`tv-focus-ring w-full py-3 px-4 rounded-lg font-black uppercase tracking-wider text-left flex items-center justify-between transition-all -skew-x-6 whitespace-nowrap ${
                  activeTab === 'radio'
                    ? 'bg-[#ffe66d] text-[#090414] shadow-[0_0_20px_rgba(255,230,109,0.5)]'
                    : 'bg-[#1f0d40] text-white border border-white/10 hover:border-[#ffe66d]'
                }`}
              >
                <span className="text-xs md:text-sm">3. {t.radioTab}</span>
              </button>
            </nav>
          </div>

          {/* Live 3D Hardware Telemetry Box inside Arcade Sidebar */}
          <div className="hidden md:block my-3 p-3 rounded-xl bg-[#090414] border border-[#00f5d4]/40 space-y-2 tabular-nums">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">LIVE POLYGONS</span>
              <span
                className="text-sm font-black text-[#00f5d4]"
                data-testid="rendered-polys-count"
              >
                {telemetry.triangles.toLocaleString()} TRIS
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">TV RESOLUTION</span>
              <span
                className="text-xs font-black text-[#ffe66d]"
                data-testid="active-resolution-readout"
              >
                {telemetry.bufferWidth}×{telemetry.bufferHeight} → FULL TV
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">1GB TV RAM</span>
              <span className="text-xs font-black text-[#ff2e93]">
                ~{footprint.estimatedRamMB} MB / 1024 MB
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">DRAW CALLS</span>
              <span className="text-xs font-black text-white">{telemetry.drawCalls} CALLS</span>
            </div>
          </div>

          {/* Bottom Console Action Buttons */}
          <div className="flex md:flex-col gap-2 pt-2 border-t border-white/15">
            {saveToast && (
              <div className="text-center py-1 px-2 rounded bg-emerald-500/20 border border-emerald-400 text-[11px] font-black text-emerald-300">
                {saveToast}
              </div>
            )}
            <button
              type="button"
              onClick={triggerSave}
              className="tv-focus-ring w-full py-2.5 px-4 rounded-lg font-black uppercase tracking-wider text-xs bg-emerald-400 text-[#090414] hover:bg-emerald-300 -skew-x-6"
            >
              {t.saveGame}
            </button>
            {isFromPause && onReturnToTitle && (
              <button
                type="button"
                onClick={onReturnToTitle}
                className="tv-focus-ring w-full py-2.5 px-4 rounded-lg font-black uppercase tracking-wider text-xs bg-[#26124d] text-slate-200 border border-white/20 hover:border-white -skew-x-6"
              >
                Quit to Title
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="tv-focus-ring w-full py-3 px-4 rounded-lg font-black uppercase tracking-wider text-xs md:text-sm bg-[#ff2e93] text-white hover:opacity-95 shadow-[0_0_16px_rgba(255,46,147,0.5)] -skew-x-6"
            >
              {isFromPause ? `> ${t.resume}` : '> RETURN TO GAME'}
            </button>
          </div>
        </aside>

        {/* RIGHT PANEL: ACTIVE ARCADE DECK CONTENT */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-5 bg-gradient-to-br from-[#120726] via-[#0d051d] to-[#190a36]">
          {/* Mobile Telemetry Strip */}
          <div className="flex md:hidden items-center justify-between px-3 py-2 rounded-lg bg-[#090414] border border-[#00f5d4]/40 text-xs tabular-nums">
            <span className="font-black text-[#00f5d4]">
              {telemetry.triangles.toLocaleString()} POLYS
            </span>
            <span className="font-bold text-[#ffe66d]">
              {telemetry.bufferWidth}×{telemetry.bufferHeight} FULL
            </span>
            <span className="font-bold text-[#ff2e93]">~{footprint.estimatedRamMB} MB</span>
          </div>

          {activeTab === 'graphics' && (
            <div className="space-y-5">
              {/* 1. FIVE QUALITY TIERS INCLUDING ULTRA (50K) & SUPER (100K) */}
              <div className="p-4 rounded-xl bg-[#160a30] border border-[#00f5d4]/35">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm md:text-base font-black uppercase tracking-wider text-[#00f5d4]">
                      GRAPHICS QUALITY &amp; POLYGON ENGINE PRESETS
                    </h3>
                    <p className="text-xs text-slate-300">
                      Scale from 1GB Smart TV Eco (~8k polys) up to ULTRA (50,000 polys) and SUPER (100,000 polys)
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-[#090414] border border-white/15 text-xs font-black text-[#ffe66d] uppercase">
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
                        className={`tv-focus-ring p-3 rounded-xl text-left transition-all border-2 ${
                          active
                            ? 'bg-[#261152] border-[#00f5d4] shadow-[0_0_20px_rgba(0,245,212,0.35)]'
                            : 'bg-[#0c051c] border-white/10 hover:border-white/35'
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
                        <div className="text-[11px] text-slate-300 mt-0.5">{card.res}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. FULL-GAME TV RESOLUTION SCALER + POLYGON BUDGET TIER */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Whole-Game Logical Resolution (Auto-Scaled to Full Screen by TV) */}
                <div className="p-4 rounded-xl bg-[#160a30] border border-white/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-black uppercase tracking-wider text-[#ffe66d]">
                      FULL-SCREEN TV LOGICAL RESOLUTION
                    </span>
                    <span className="text-xs font-bold text-[#00f5d4] tabular-nums">
                      {graphics.logicalResolution} → 100% TV
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Renders the entire 3D viewport at this internal resolution and automatically upscales it to fill your TV screen:
                  </p>
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
                          className={`tv-focus-ring py-2 px-3 rounded-lg text-xs font-black text-left flex items-center justify-between border ${
                            isSel
                              ? 'bg-[#ffe66d] text-[#090414] border-[#ffe66d]'
                              : 'bg-[#090414] text-slate-200 border-white/10 hover:border-[#ffe66d]'
                          }`}
                        >
                          <span>{resKey}</span>
                          <span className="text-[10px] opacity-80">Full-Screen Scale</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Polygon Mesh Budget Tier (Low 8k -> Ultra 50k -> Super 100k) */}
                <div className="p-4 rounded-xl bg-[#160a30] border border-white/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-black uppercase tracking-wider text-[#ff2e93]">
                      3D POLYGON GEOMETRY BUDGET
                    </span>
                    <span className="text-xs font-black text-white tabular-nums">
                      {telemetry.triangles.toLocaleString()} Active Polys
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Controls sculpted multi-frond palms, rooftop Art Deco spires, yachts &amp; aerodynamic car detail:
                  </p>
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
                              ? 'bg-[#ff2e93] text-white border-white font-black shadow-[0_0_14px_rgba(255,46,147,0.5)]'
                              : 'bg-[#090414] text-slate-200 border-white/10 hover:border-[#ff2e93]'
                          }`}
                        >
                          <div className="text-xs font-black">{tierItem.label}</div>
                          <div className="text-[10px] opacity-90">{tierItem.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. DRAW DISTANCE, TRAFFIC AI DENSITY & HARDWARE TOGGLES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#160a30] border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>HORIZON DRAW DISTANCE</span>
                    <span className="text-[#00f5d4]">{graphics.drawDistance}m</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[95, 150, 210, 320].map((dist) => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => updateCustomGraphics({ drawDistance: dist })}
                        className={`tv-focus-ring py-1.5 rounded text-xs font-bold ${
                          graphics.drawDistance === dist
                            ? 'bg-[#00f5d4] text-[#090414]'
                            : 'bg-[#090414] text-slate-300'
                        }`}
                      >
                        {dist}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#160a30] border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>SMART AI TRAFFIC CARS</span>
                    <span className="text-[#ffe66d]">{graphics.trafficCount} Cars</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[6, 12, 18, 24].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => updateCustomGraphics({ trafficCount: cnt })}
                        className={`tv-focus-ring py-1.5 rounded text-xs font-bold ${
                          graphics.trafficCount === cnt
                            ? 'bg-[#ffe66d] text-[#090414]'
                            : 'bg-[#090414] text-slate-300'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#160a30] border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>FRAME RATE &amp; SHADOWS</span>
                    <span className="text-[#ff2e93]">{graphics.fpsCap} FPS</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateCustomGraphics({ fpsCap: graphics.fpsCap === 60 ? 30 : 60 })
                      }
                      className="tv-focus-ring py-1.5 px-2 rounded text-xs font-bold bg-[#090414] text-[#00f5d4] border border-[#00f5d4]/40"
                    >
                      Target: {graphics.fpsCap} FPS
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateCustomGraphics({ shadowsEnabled: !graphics.shadowsEnabled })
                      }
                      className={`tv-focus-ring py-1.5 px-2 rounded text-xs font-bold ${
                        graphics.shadowsEnabled
                          ? 'bg-[#ff2e93] text-white'
                          : 'bg-[#090414] text-slate-300'
                      }`}
                    >
                      Shadows: {graphics.shadowsEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'controller' && (
            <div className="space-y-4">
              {/* Live Controller + Keyboard Detector Bar */}
              <div className="p-4 rounded-xl bg-[#160a30] border border-[#ff2e93]/45 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-[#00f5d4]">
                    NINTENDO SWITCH / GAMEPAD &amp; KEYBOARD MAPPER
                  </h3>
                  <p className="text-xs text-slate-300">
                    Click any action below, then press any button on your Controller to remap immediately. Keyboard controls are always active!
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(['switch', 'xbox', 'playstation'] as ControllerLayoutStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        onChangeControllerMapping({ ...controllerMapping, layoutStyle: style })
                      }
                      className={`tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                        controllerMapping.layoutStyle === style
                          ? 'bg-[#00f5d4] text-[#090414]'
                          : 'bg-[#090414] text-slate-300 border border-white/10'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onChangeControllerMapping(
                        createDefaultControllerMapping(controllerMapping.layoutStyle)
                      )
                    }
                    className="tv-focus-ring px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-200 border border-rose-500/40"
                  >
                    Reset Default
                  </button>
                </div>
              </div>

              {/* Live Hardware Input Readout + Test Trigger */}
              <div className="p-3.5 rounded-xl bg-[#090414] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
                <div>
                  <span className="text-slate-400 font-bold mr-2">CONNECTED PAD:</span>
                  <span className="text-[#00f5d4] font-black">
                    {connectedPads.length > 0
                      ? `${connectedPads[0].name} (${connectedPads[0].buttons} btns)`
                      : 'Switch / W3C Gamepad + Full PC Keyboard Active'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold mr-2">LAST INPUT:</span>
                  <span
                    className="text-[#ffe66d] font-black"
                    data-testid="last-detected-button"
                  >
                    {lastDetectedButton
                      ? `Btn #${lastDetectedButton.index} (${getButtonLabel(
                          lastDetectedButton.index,
                          controllerMapping.layoutStyle
                        )})`
                      : 'Press any controller button...'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold mr-2">STICKS:</span>
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
                        className="px-2 py-1 rounded bg-[#1f0d40] hover:bg-[#311566] text-[10px] font-bold text-[#00f5d4] border border-[#00f5d4]/30"
                      >
                        Test #{bIdx}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 12 Action Cards with Gamepad Remap + Keyboard Bindings */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {ACTION_METADATA.map((act) => {
                  const currentBtnIdx = controllerMapping.buttons[act.id];
                  const isListening = listeningAction === act.id;
                  return (
                    <div
                      key={act.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        isListening
                          ? 'bg-[#ff2e93]/25 border-[#ff2e93] shadow-[0_0_16px_rgba(255,46,147,0.45)]'
                          : 'bg-[#160a30] border-white/10'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white uppercase truncate">
                          {act.label}
                        </div>
                        <div className="text-[11px] font-bold text-[#99f6e4] mt-0.5">
                          Keyboard: <span className="text-[#ffe66d]">{act.keyHint}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{act.desc}</div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid={`remap-${act.id}`}
                          onClick={() => setListeningAction(isListening ? null : act.id)}
                          className={`tv-focus-ring px-2.5 py-1.5 rounded-lg text-xs font-black whitespace-nowrap ${
                            isListening
                              ? 'bg-[#ff2e93] text-white animate-pulse'
                              : 'bg-[#090414] text-[#00f5d4] border border-[#00f5d4]/40 hover:border-[#00f5d4]'
                          }`}
                        >
                          {isListening
                            ? 'PRESS BUTTON...'
                            : getButtonLabel(currentBtnIdx, controllerMapping.layoutStyle)}
                        </button>
                        <button
                          type="button"
                          aria-label={`Cycle button for ${act.label}`}
                          onClick={() =>
                            onChangeControllerMapping(
                              remapControllerAction(
                                controllerMapping,
                                act.id,
                                (currentBtnIdx + 1) % 17
                              )
                            )
                          }
                          className="tv-focus-ring px-2 py-1.5 rounded-lg bg-[#090414] text-slate-300 hover:text-white text-[10px] font-black border border-white/10"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'radio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#160a30] border border-[#ffe66d]/40">
                <h3 className="text-sm font-black uppercase tracking-wider text-[#ffe66d] mb-1">
                  SOLARA BAY 1988 FM &amp; CUSTOM CASSETTE DECK
                </h3>
                <p className="text-xs text-slate-300 mb-3">
                  Select any station or attach your own MP3 / OGG / WAV songs to play on the in-car stereo while cruising Ocean Drive:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {radioTracks.map((tr, idx) => {
                    const active = idx === currentStationIndex;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => onSelectStation(idx)}
                        className={`tv-focus-ring p-3 rounded-xl text-left flex items-center justify-between border ${
                          active
                            ? 'bg-[#ffe66d] text-[#090414] border-white font-black'
                            : 'bg-[#090414] text-white border-white/10 hover:border-[#ffe66d]'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-black uppercase tracking-wider truncate">
                            {tr.station}
                          </div>
                          <div className="text-xs truncate opacity-90">
                            &ldquo;{tr.title}&rdquo; · {tr.artist}
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-black/20">
                          {active ? 'ON AIR' : 'TUNE'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Attach Custom Audio Files or Stream URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#160a30] border border-white/15 space-y-2">
                  <div className="text-xs font-black uppercase text-[#00f5d4]">
                    ATTACH LOCAL SONG FILES (.MP3 / .OGG / .WAV)
                  </div>
                  <p className="text-xs text-slate-300">
                    Load audio files directly into the in-car radio cassette player:
                  </p>
                  <label className="tv-focus-ring inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-[#00f5d4] text-[#090414] font-black text-xs uppercase cursor-pointer hover:opacity-90">
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
                  className="p-4 rounded-xl bg-[#160a30] border border-white/15 space-y-2"
                >
                  <div className="text-xs font-black uppercase text-[#ff2e93]">
                    ADD STREAM / SONG URL
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Song Title"
                      value={customSongTitle}
                      onChange={(e) => setCustomSongTitle(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#090414] border border-white/15 text-xs text-white flex-1"
                    />
                    <input
                      type="url"
                      placeholder="https://example.com/song.mp3"
                      value={customSongUrl}
                      onChange={(e) => setCustomSongUrl(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#090414] border border-white/15 text-xs text-white flex-1"
                    />
                    <button
                      type="submit"
                      className="tv-focus-ring px-4 py-2 rounded-lg bg-[#ff2e93] text-white font-black text-xs uppercase"
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
