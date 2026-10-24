import React, { useEffect, useRef } from 'react';
import { renderTopRotatingMiniMap } from '../game/mapRenderer.ts';
import {
  getButtonLabel,
  getKeyboardCodeLabel,
  getResolvedHudVisibility,
} from '../game/rules.ts';
import type {
  CommandHubTab,
  ControllerMapping,
  GraphicsSettings,
  RadioTrack,
} from '../game/types.ts';
import type { WorldHudSnapshot } from '../game/world3d.ts';

interface GameHudProps {
  snapshot: WorldHudSnapshot;
  currentTrack: RadioTrack;
  controllerMapping: ControllerMapping;
  graphics: GraphicsSettings;
  radarZoomed: boolean;
  onToggleRadarZoom: () => void;
  onToggleEnterExitCar: () => void;
  onNextRadioStation: () => void;
  onTriggerAction: () => void;
  onOpenHub: (tab: CommandHubTab) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  snapshot,
  currentTrack,
  controllerMapping,
  graphics,
  radarZoomed,
  onToggleRadarZoom,
  onToggleEnterExitCar,
  onNextRadioStation,
  onTriggerAction,
  onOpenHub,
}) => {
  const miniMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hud = getResolvedHudVisibility(graphics);

  useEffect(() => {
    if (!hud.masterHud || !hud.minimap) return;
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    renderTopRotatingMiniMap(canvas, {
      playerX: snapshot.playerX,
      playerZ: snapshot.playerZ,
      playerHeading: snapshot.playerHeading,
      targetX: snapshot.activeTargetX,
      targetZ: snapshot.activeTargetZ,
      zoomedOut: radarZoomed,
    });
  }, [
    hud.masterHud,
    hud.minimap,
    snapshot.playerX,
    snapshot.playerZ,
    snapshot.playerHeading,
    snapshot.activeTargetX,
    snapshot.activeTargetZ,
    radarZoomed,
  ]);

  // If Master HUD is turned off in Settings, render a clean unobstructed 3D screen
  // with only a subtle corner hover button so touch/mouse users can still reopen Options
  if (!hud.masterHud) {
    return (
      <div className="fixed top-3 right-3 z-10 pointer-events-auto">
        <button
          type="button"
          data-testid="hud-open-settings-btn"
          onClick={() => onOpenHub('settings')}
          className="tv-focus-ring px-2.5 py-1 rounded-lg bg-[#04101e]/45 hover:bg-[#0077b6] text-white/75 hover:text-white font-bold text-[10px] uppercase tracking-wider border border-white/15 transition-all"
        >
          OPTIONS (ESC)
        </button>
      </div>
    );
  }

  const enterExitPadBtn = snapshot.inVehicle
    ? controllerMapping.buttons.carExitVehicle
    : controllerMapping.buttons.footEnterCar;
  const enterExitKey = snapshot.inVehicle
    ? controllerMapping.keys?.carExitVehicle || 'KeyF'
    : controllerMapping.keys?.footEnterCar || 'KeyF';

  const enterCarPadLabel = getButtonLabel(enterExitPadBtn, controllerMapping.layoutStyle);
  const enterCarKeyLabel = getKeyboardCodeLabel(enterExitKey);

  const actionPadBtn = snapshot.inVehicle
    ? controllerMapping.buttons.carHornSiren
    : controllerMapping.buttons.footInteractHustle;
  const actionKey = snapshot.inVehicle
    ? controllerMapping.keys?.carHornSiren || 'KeyH'
    : controllerMapping.keys?.footInteractHustle || 'KeyE';

  const mapKeyLabel = getKeyboardCodeLabel(controllerMapping.keys?.uiOpenWorldMap || 'KeyM');
  const missionsKeyLabel = getKeyboardCodeLabel(controllerMapping.keys?.uiOpenMissions || 'KeyJ');

  let relTargetAngleRad = 0;
  let turnHint = 'ON ROUTE';
  if (snapshot.activeTargetX !== null && snapshot.activeTargetZ !== null) {
    const dx = snapshot.activeTargetX - snapshot.playerX;
    const dz = snapshot.activeTargetZ - snapshot.playerZ;
    const worldAngle = Math.atan2(dx, dz);
    let diff = worldAngle - snapshot.playerHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    relTargetAngleRad = diff;

    const deg = (diff * 180) / Math.PI;
    if (Math.abs(deg) <= 22) turnHint = 'STRAIGHT AHEAD ↑';
    else if (deg > 22 && deg <= 65) turnHint = 'BEAR LEFT ↖';
    else if (deg > 65 && deg <= 135) turnHint = 'TURN LEFT ←';
    else if (deg < -22 && deg >= -65) turnHint = 'BEAR RIGHT ↗';
    else if (deg < -65 && deg >= -135) turnHint = 'TURN RIGHT →';
    else turnHint = 'TURN AROUND ↓';
  }

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* TOP BAR: ROTATING ROAD MINI-MAP + TOP COMPASS ARROW + CASH/HUB BUTTONS */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* TOP-LEFT: Rotating Tangier Road Mini-Map, Active Mission Card & Telemetry */}
        <div className="flex flex-col gap-2 max-w-md">
          {(hud.minimap || hud.missionCard) && (
            <div className="flex items-start gap-3">
              {/* 1. Interactive Rotating Mini-Map with GPS Route & Arrow */}
              {hud.minimap && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenHub('map')}
                    title="Click to open Full Tangier World Map"
                    className={`tv-focus-ring pointer-events-auto relative rounded-2xl bg-[#04101e]/95 border-2 border-[#00a8e8] shadow-[0_6px_24px_rgba(0,168,232,0.35)] overflow-hidden transition-all ${
                      radarZoomed ? 'w-44 h-44 sm:w-52 sm:h-52' : 'w-32 h-32 sm:w-36 sm:h-36'
                    }`}
                  >
                    <canvas
                      ref={miniMapCanvasRef}
                      width={220}
                      height={220}
                      className="w-full h-full block"
                    />
                    <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[10px] font-extrabold uppercase text-sky-200 bg-[#04101e]/85 px-1.5 py-0.5 rounded">
                      <span className="truncate">{snapshot.district.name}</span>
                      <span className="text-amber-300 ml-1">{mapKeyLabel}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleRadarZoom}
                    className="pointer-events-auto text-[11px] font-bold text-sky-300 hover:text-white bg-[#04101e]/85 px-2.5 py-0.5 rounded border border-sky-400/30"
                  >
                    {radarZoomed ? 'Compact Radar' : 'Zoom Radar'}
                  </button>
                </div>
              )}

              {/* 2. Active Mission & Street Card */}
              {hud.missionCard && (
                <div className="p-3 rounded-xl bg-[#06182c]/95 border border-sky-400/45 shadow-lg space-y-1.5 min-w-[210px] max-w-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-sky-300 truncate">
                      {snapshot.missionTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenHub('missions')}
                      className="pointer-events-auto px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/50 text-[11px] font-extrabold text-amber-300 hover:bg-amber-400/30 whitespace-nowrap shrink-0"
                    >
                      Missions ({missionsKeyLabel})
                    </button>
                  </div>
                  <div className="text-sm font-bold text-white leading-snug">
                    {snapshot.missionObjective
                      ? snapshot.missionObjective.description
                      : 'Explore Mesnana Golf, Royal Country Club & Hay El Kawassim'}
                  </div>
                  <div className="text-xs font-semibold text-sky-200 flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                    <span className="truncate">{snapshot.streetName}</span>
                    {snapshot.missionDistanceMeters !== null && (
                      <span className="font-black text-amber-300 tabular-nums shrink-0">
                        {snapshot.missionDistanceMeters}m
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Live Telemetry & Sector Streaming Readout */}
          {hud.perfOverlay && (
            <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1 rounded-lg bg-[#04101e]/85 border border-sky-400/25 text-xs font-bold text-slate-200 tabular-nums">
              <span className="text-sky-300">
                {snapshot.telemetry.triangles.toLocaleString()} POLYS
              </span>
              <span>·</span>
              <span className="text-amber-300">
                {snapshot.telemetry.bufferWidth}×{snapshot.telemetry.bufferHeight}
              </span>
              <span>·</span>
              <span>{snapshot.telemetry.fps} FPS</span>
              {snapshot.telemetry.activeSectors !== undefined && (
                <>
                  <span>·</span>
                  <span className="text-emerald-300">
                    {snapshot.telemetry.activeSectors}/{snapshot.telemetry.totalSectors} SECTORS
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 4. TOP-CENTER: DIRECTIONAL NAVIGATION ARROW & GPS ROUTE BAR */}
        {hud.gpsArrowBar && snapshot.missionDistanceMeters !== null && (
          <div className="hidden lg:flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#04101e]/95 border-2 border-amber-400/80 shadow-[0_6px_26px_rgba(245,158,11,0.3)]">
            <div
              className="w-11 h-11 rounded-xl bg-amber-400/20 border border-amber-400 flex items-center justify-center shrink-0"
              aria-label="Objective Direction Arrow"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-amber-300 transition-transform duration-75"
                style={{
                  transform: `rotate(${-relTargetAngleRad}rad)`,
                }}
              >
                <path
                  fill="currentColor"
                  d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  {turnHint}
                </span>
                <span className="text-sm font-black text-white tabular-nums">
                  {snapshot.missionDistanceMeters}m
                </span>
              </div>
              <div className="text-xs font-bold text-sky-200 truncate max-w-[240px]">
                {snapshot.activeTargetLabel}
              </div>
            </div>
          </div>
        )}

        {/* TOP-RIGHT: Cash, Health/Armor, Command Hub Buttons & Wanted Stars */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* 5. Cash, Health & Armor Box */}
            {hud.cashHealthBox && (
              <div className="px-4 py-1.5 rounded-xl bg-[#06182c]/95 border-2 border-[#00a8e8] text-right shadow-lg">
                <div className="text-lg sm:text-2xl font-black text-emerald-400 tabular-nums tracking-wider">
                  ${snapshot.cash.toLocaleString()}
                </div>
                <div className="flex items-center justify-end gap-2.5 text-xs font-extrabold uppercase">
                  <span className="text-rose-300">HP {Math.round(snapshot.health)}%</span>
                  <span className="text-sky-300">ARM {Math.round(snapshot.armor)}%</span>
                </div>
              </div>
            )}

            {/* 6. Top-Right Quick Action Buttons */}
            {hud.quickButtons ? (
              <div className="flex items-center gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  data-testid="hud-open-map-btn"
                  onClick={() => onOpenHub('map')}
                  className="tv-focus-ring px-3 py-2.5 rounded-xl bg-[#07223d] hover:bg-[#0c3156] text-sky-200 font-black text-xs uppercase tracking-wider border border-sky-400/50 whitespace-nowrap shrink-0"
                >
                  MAP ({mapKeyLabel})
                </button>
                <button
                  type="button"
                  data-testid="hud-open-missions-btn"
                  onClick={() => onOpenHub('missions')}
                  className="tv-focus-ring px-3 py-2.5 rounded-xl bg-[#07223d] hover:bg-[#0c3156] text-amber-300 font-black text-xs uppercase tracking-wider border border-amber-400/50 whitespace-nowrap shrink-0"
                >
                  MISSIONS ({missionsKeyLabel})
                </button>
                <button
                  type="button"
                  data-testid="hud-open-settings-btn"
                  onClick={() => onOpenHub('settings')}
                  className="tv-focus-ring px-3.5 py-2.5 rounded-xl bg-[#0077b6] hover:bg-[#00a8e8] text-white font-black text-xs uppercase tracking-wider border border-sky-200/50 shadow-lg whitespace-nowrap shrink-0"
                >
                  OPTIONS (ESC)
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="hud-open-settings-btn"
                onClick={() => onOpenHub('settings')}
                className="pointer-events-auto tv-focus-ring px-2 py-1 rounded-lg bg-[#04101e]/40 hover:bg-[#0077b6] text-white/70 hover:text-white font-bold text-[10px] uppercase border border-white/15"
              >
                ESC
              </button>
            )}
          </div>

          {/* 7. Wanted Stars */}
          {hud.wantedStars && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#04101e]/90 border border-sky-400/25"
              aria-label={`Wanted Level ${snapshot.wantedLevel} of 5`}
            >
              <span className="text-[11px] font-bold text-slate-300 mr-1">DGSN:</span>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`text-base sm:text-lg leading-none ${
                    star <= snapshot.wantedLevel ? 'text-amber-400' : 'text-slate-700'
                  }`}
                >
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. CENTER BANNER NOTIFICATION */}
      {hud.centerBanners && snapshot.bannerText && (
        <div className="my-auto mx-auto max-w-2xl px-6 py-3.5 rounded-2xl bg-[#04101e]/95 border-2 border-amber-400 text-center shadow-[0_8px_35px_rgba(0,168,232,0.45)]">
          <div className="text-base sm:text-xl font-black uppercase tracking-wider text-amber-300">
            {snapshot.bannerText}
          </div>
        </div>
      )}

      {/* BOTTOM BAR: RADIO + CONTEXT-AWARE VEHICLE/FOOT ACTIONS + SPEEDOMETER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* 9. Bottom-Left Radio Widget */}
          {hud.radioWidget && (
            <button
              type="button"
              onClick={onNextRadioStation}
              className="tv-focus-ring px-3.5 py-2 rounded-xl bg-[#06182c]/95 border border-sky-400/50 text-left hover:border-sky-300"
            >
              <div className="text-xs font-extrabold uppercase text-sky-300">
                {currentTrack.station} ({getKeyboardCodeLabel(controllerMapping.keys?.carNextRadio || 'KeyR')})
              </div>
              <div className="text-xs font-bold text-white truncate max-w-[210px]">
                ♫ {currentTrack.title}
              </div>
            </button>
          )}

          {/* 10. Bottom Action Prompts (Enter/Exit Car & Horn/Siren/Interact) */}
          {hud.actionPrompts && (
            <>
              <button
                type="button"
                data-testid="hud-enter-exit-car-btn"
                onClick={onToggleEnterExitCar}
                className="tv-focus-ring px-4 py-2.5 rounded-xl bg-[#00a8e8] hover:bg-[#38bdf8] text-[#04101e] font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg whitespace-nowrap shrink-0"
              >
                {snapshot.inVehicle
                  ? `EXIT CAR (${enterCarKeyLabel} / ${enterCarPadLabel})`
                  : snapshot.nearbyVehicleName
                    ? `ENTER ${snapshot.nearbyVehicleName} (${enterCarKeyLabel} / ${enterCarPadLabel})`
                    : `SUMMON CAR (${enterCarKeyLabel} / ${enterCarPadLabel})`}
              </button>

              <button
                type="button"
                onClick={onTriggerAction}
                className="tv-focus-ring px-3.5 py-2.5 rounded-xl bg-[#06182c]/95 border border-sky-400/40 text-white font-black text-xs sm:text-sm uppercase whitespace-nowrap shrink-0"
              >
                {snapshot.inVehicle
                  ? `HORN / SIREN (${getKeyboardCodeLabel(actionKey)} / ${getButtonLabel(
                      actionPadBtn,
                      controllerMapping.layoutStyle
                    )})`
                  : `INTERACT (${getKeyboardCodeLabel(actionKey)} / ${getButtonLabel(
                      actionPadBtn,
                      controllerMapping.layoutStyle
                    )})`}
              </button>
            </>
          )}
        </div>

        {/* 11. Bottom-Right: Tangier Sea Blue Digital Speedometer */}
        {hud.speedometer && (
          <div className="px-4 py-2.5 rounded-xl bg-[#06182c]/95 border-2 border-[#00a8e8] text-right shadow-lg tabular-nums ml-auto">
            <div className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
              {snapshot.inVehicle ? snapshot.activeVehicleName : `ON FOOT · ${snapshot.district.name.toUpperCase()}`}
            </div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {snapshot.speedKmh}
              </span>
              <span className="text-xs font-black text-amber-300">KM/H</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
