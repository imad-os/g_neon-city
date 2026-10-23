import React from 'react';
import { getButtonLabel } from '../game/rules.ts';
import type { ControllerMapping, GraphicsSettings, RadioTrack } from '../game/types.ts';
import type { WorldHudSnapshot } from '../game/world3d.ts';

interface GameHudProps {
  snapshot: WorldHudSnapshot;
  currentTrack: RadioTrack;
  controllerMapping: ControllerMapping;
  graphics: GraphicsSettings;
  radarZoomed: boolean;
  onToggleEnterExitCar: () => void;
  onNextRadioStation: () => void;
  onTriggerAction: () => void;
  onOpenSettings: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  snapshot,
  currentTrack,
  controllerMapping,
  graphics,
  radarZoomed,
  onToggleEnterExitCar,
  onNextRadioStation,
  onTriggerAction,
  onOpenSettings,
}) => {
  const enterCarBtnLabel = getButtonLabel(
    controllerMapping.buttons.enterExitCar,
    controllerMapping.layoutStyle
  );

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* TOP BAR: RADAR MINIMAP + MISSION BRIEF + CASH/WANTED/STATS */}
      <div className="flex items-start justify-between gap-3">
        {/* TOP-LEFT: Circular/Square Solara Bay Radar & Mission Objective */}
        <div className="flex flex-col gap-2 max-w-xs sm:max-w-sm">
          <div className="flex items-center gap-3">
            {/* Radar Minimap */}
            <div
              className={`relative rounded-xl bg-[#090414]/90 border-2 border-[#00f5d4] shadow-[0_0_20px_rgba(0,245,212,0.3)] overflow-hidden transition-all ${
                radarZoomed ? 'w-44 h-44 sm:w-52 sm:h-52' : 'w-28 h-28 sm:w-32 sm:h-32'
              }`}
            >
              {/* Ocean Strip on East side */}
              <div className="absolute top-0 bottom-0 right-0 w-1/4 bg-[#0284c7]/45 border-l border-[#38bdf8]/50" />
              {/* Grid Roads */}
              <div className="absolute inset-0 opacity-35">
                <div className="absolute left-1/4 top-0 bottom-0 w-0.5 bg-slate-300" />
                <div className="absolute left-2/4 top-0 bottom-0 w-0.5 bg-slate-300" />
                <div className="absolute left-3/4 top-0 bottom-0 w-0.5 bg-slate-300" />
                <div className="absolute top-1/4 left-0 right-0 h-0.5 bg-slate-300" />
                <div className="absolute top-2/4 left-0 right-0 h-0.5 bg-slate-300" />
                <div className="absolute top-3/4 left-0 right-0 h-0.5 bg-slate-300" />
              </div>

              {/* Objective Beacon Dot */}
              {snapshot.missionObjective && (
                <div
                  className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-[#ffe66d] border border-black animate-ping"
                  style={{
                    left: `${Math.max(8, Math.min(92, 50 + (snapshot.missionObjective.targetX - snapshot.playerX) * 0.42))}%`,
                    top: `${Math.max(8, Math.min(92, 50 + (snapshot.missionObjective.targetZ - snapshot.playerZ) * 0.42))}%`,
                  }}
                />
              )}

              {/* Player Center Arrow */}
              <div
                className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full bg-[#ff2e93] border-2 border-white shadow"
                style={{
                  transform: `rotate(${snapshot.playerHeading}rad)`,
                }}
              />

              <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[9px] font-black uppercase text-[#00f5d4]">
                <span>{snapshot.district.name}</span>
                <span>M</span>
              </div>
            </div>

            {/* Active Mission Card */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#0e0620]/90 border border-[#ff2e93]/60 shadow-lg space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#ff2e93]">
                {snapshot.missionTitle}
              </div>
              <div className="text-xs sm:text-sm font-bold text-white leading-snug">
                {snapshot.missionObjective
                  ? snapshot.missionObjective.description
                  : 'Free Roam: Explore Solara Bay & Ocean Drive'}
              </div>
              {snapshot.missionDistanceMeters !== null && (
                <div className="text-[11px] font-black text-[#ffe66d] tabular-nums">
                  TARGET: {snapshot.missionDistanceMeters}m
                </div>
              )}
            </div>
          </div>

          {/* Live Telemetry Pill */}
          {graphics.showPerfOverlay && (
            <div className="inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-[10px] font-bold text-slate-200 tabular-nums">
              <span className="text-[#00f5d4]">
                {snapshot.telemetry.triangles.toLocaleString()} POLYS
              </span>
              <span>•</span>
              <span className="text-[#ffe66d]">
                {snapshot.telemetry.bufferWidth}×{snapshot.telemetry.bufferHeight}
              </span>
              <span>•</span>
              <span>{snapshot.telemetry.fps} FPS</span>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Cash, Wanted Stars, Health/Armor & Pause Button */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-xl bg-[#0e0620]/90 border-2 border-[#00f5d4] text-right shadow-lg">
              <div className="text-lg sm:text-2xl font-black text-emerald-400 tabular-nums tracking-wider">
                ${snapshot.cash.toLocaleString()}
              </div>
              <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase">
                <span className="text-rose-400">HP {Math.round(snapshot.health)}%</span>
                <span className="text-sky-400">ARM {Math.round(snapshot.armor)}%</span>
              </div>
            </div>

            <button
              type="button"
              data-testid="hud-open-settings-btn"
              onClick={onOpenSettings}
              className="tv-focus-ring pointer-events-auto px-3.5 py-2.5 rounded-xl bg-[#ff2e93] hover:bg-[#e11d74] text-white font-black text-xs uppercase tracking-wider border border-white/30 shadow-[0_0_16px_rgba(255,46,147,0.5)]"
            >
              OPTIONS (ESC / +)
            </button>
          </div>

          {/* Wanted Stars */}
          <div
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#090414]/85 border border-white/15"
            aria-label={`Wanted Level ${snapshot.wantedLevel} of 5`}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`text-base sm:text-lg leading-none ${
                  star <= snapshot.wantedLevel
                    ? 'text-[#ffe66d] animate-pulse'
                    : 'text-slate-700'
                }`}
              >
                ★
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER BANNER TOAST */}
      {snapshot.bannerText && (
        <div className="my-auto mx-auto max-w-xl px-6 py-3 rounded-xl bg-[#0e0620]/95 border-2 border-[#ffe66d] text-center shadow-[0_0_35px_rgba(255,230,109,0.45)]">
          <div
            className="text-base sm:text-xl font-black italic uppercase tracking-wider text-[#ffe66d]"
            style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}
          >
            {snapshot.bannerText}
          </div>
        </div>
      )}

      {/* BOTTOM BAR: VEHICLE SPEEDOMETER + RADIO STATION + QUICK CONTROLS */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Bottom-Left: 1988 FM Radio & Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onNextRadioStation}
            className="tv-focus-ring px-3 py-2 rounded-xl bg-[#0e0620]/90 border border-[#00f5d4]/60 text-left hover:border-[#00f5d4]"
          >
            <div className="text-[10px] font-black uppercase text-[#00f5d4]">
              {currentTrack.station} (PRESS R)
            </div>
            <div className="text-xs font-bold text-white truncate max-w-[200px]">
              ♫ {currentTrack.title}
            </div>
          </button>

          <button
            type="button"
            data-testid="hud-enter-exit-car-btn"
            onClick={onToggleEnterExitCar}
            className="tv-focus-ring px-3.5 py-2.5 rounded-xl bg-[#00f5d4] text-[#090414] font-black text-xs uppercase tracking-wider shadow"
          >
            {snapshot.inVehicle
              ? `EXIT CAR (F / ${enterCarBtnLabel})`
              : snapshot.nearbyVehicleName
                ? `ENTER ${snapshot.nearbyVehicleName} (F / ${enterCarBtnLabel})`
                : `FIND CAR (F / ${enterCarBtnLabel})`}
          </button>

          <button
            type="button"
            onClick={onTriggerAction}
            className="tv-focus-ring px-3 py-2.5 rounded-xl bg-[#1e103a]/90 border border-white/20 text-white font-black text-xs uppercase"
          >
            {snapshot.inVehicle ? 'HORN / SIREN (E / H)' : 'STREET HUSTLE (E)'}
          </button>
        </div>

        {/* Bottom-Right: Digital 1988 Synth Speedometer */}
        <div className="px-4 py-2.5 rounded-xl bg-[#0e0620]/90 border-2 border-[#ff2e93] text-right shadow-lg tabular-nums">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#00f5d4]">
            {snapshot.inVehicle ? snapshot.activeVehicleName : 'ON FOOT · SOLARA PROMENADE'}
          </div>
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="text-2xl sm:text-3xl font-black italic text-white">
              {snapshot.speedKmh}
            </span>
            <span className="text-xs font-black text-[#ffe66d]">KM/H</span>
          </div>
        </div>
      </div>
    </div>
  );
};
