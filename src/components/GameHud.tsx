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
  const radioBtnLabel = getButtonLabel(
    controllerMapping.buttons.nextRadio,
    controllerMapping.layoutStyle
  );
  const pauseBtnLabel = getButtonLabel(
    controllerMapping.buttons.pauseMenu,
    controllerMapping.layoutStyle
  );

  // Convert world coordinates (-115..115) into 136x136 radar SVG space
  const radarRange = radarZoomed ? 130 : 75;
  const toRadarX = (wx: number) =>
    Math.max(8, Math.min(128, 68 + ((wx - snapshot.playerX) / radarRange) * 58));
  const toRadarY = (wz: number) =>
    Math.max(8, Math.min(128, 68 + ((wz - snapshot.playerZ) / radarRange) * 58));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 md:p-6">
      {/* Top Perimeter Row: Left Radar Cluster & Right Wanted/Cash/Vitals Cluster */}
      <div className="flex items-start justify-between gap-4">
        {/* Cluster 1 (Top-Left): Solara Bay Radar Minimap + District Sign */}
        <div className="flex items-start gap-3">
          <div
            className="relative w-[124px] h-[124px] md:w-[140px] md:h-[140px] rounded-full bg-[#0e0720]/92 border-[3px] border-[#00f5d4] shadow-[0_6px_20px_rgba(0,0,0,0.75)] overflow-hidden shrink-0"
            data-testid="solara-minimap"
          >
            <svg viewBox="0 0 136 136" className="w-full h-full">
              {/* Ocean Shoreline East of x=65 */}
              <rect
                x={toRadarX(65)}
                y="0"
                width="136"
                height="136"
                fill="#0284c7"
                opacity="0.45"
              />
              {/* North-South Avenues (-80, -40, 0, 40) */}
              {[-80, -40, 0, 40].map((rx) => (
                <line
                  key={`ns-${rx}`}
                  x1={toRadarX(rx)}
                  y1="0"
                  x2={toRadarX(rx)}
                  y2="136"
                  stroke="#475569"
                  strokeWidth="4"
                />
              ))}
              {/* East-West Cross Streets (-80, -40, 0, 40, 80) */}
              {[-80, -40, 0, 40, 80].map((rz) => (
                <line
                  key={`ew-${rz}`}
                  x1="0"
                  y1={toRadarY(rz)}
                  x2="136"
                  y2={toRadarY(rz)}
                  stroke="#475569"
                  strokeWidth="3.5"
                />
              ))}
              {/* Pay 'n' Spray Garage Marker (-80, 20) */}
              <rect
                x={toRadarX(-80) - 4}
                y={toRadarY(20) - 4}
                width="8"
                height="8"
                rx="2"
                fill="#10b981"
              />
              {/* Nearby Vehicles */}
              {snapshot.vehiclePositions.map((vp, idx) => (
                <circle
                  key={idx}
                  cx={toRadarX(vp.x)}
                  cy={toRadarY(vp.z)}
                  r={vp.isPolice ? 3.5 : 2.3}
                  fill={vp.isPolice ? '#ef4444' : '#cbd5e1'}
                />
              ))}
              {/* Active Mission Target Beacon */}
              <circle
                cx={toRadarX(snapshot.targetX)}
                cy={toRadarY(snapshot.targetZ)}
                r="5.5"
                fill="#ff2e93"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
              {/* Player Center Arrow */}
              <g
                transform={`translate(68, 68) rotate(${
                  (-snapshot.playerHeading * 180) / Math.PI + 180
                })`}
              >
                <polygon
                  points="0,-7 5.5,6 0,3.5 -5.5,6"
                  fill="#00f5d4"
                  stroke="#0b0618"
                  strokeWidth="1.5"
                />
              </g>
            </svg>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest uppercase text-[#00f5d4] bg-[#090414]/85 px-1.5 rounded">
              N
            </span>
          </div>

          <div className="bg-[#120826]/90 border border-white/15 rounded-xl px-3.5 py-2.5 shadow-lg">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              SOLARA BAY · 1988
            </div>
            <div
              className="text-sm md:text-base font-black tracking-wide"
              style={{ color: snapshot.district.color }}
              data-testid="hud-district-name"
            >
              {snapshot.district.name}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5 max-w-[210px] truncate">
              {snapshot.district.tagline}
            </div>
          </div>
        </div>

        {/* Cluster 2 (Top-Right): Wanted Level, Cash, Vitality & Utility Controls */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 bg-[#120826]/92 border border-white/15 rounded-xl px-4 py-2.5 shadow-lg">
            {/* 5 Wanted Stars */}
            <div className="flex items-center gap-1" aria-label={`Wanted level ${snapshot.wantedStars} of 5`}>
              {[1, 2, 3, 4, 5].map((starIdx) => {
                const active = starIdx <= snapshot.wantedStars;
                return (
                  <svg
                    key={starIdx}
                    viewBox="0 0 24 24"
                    className={`w-5 h-5 ${
                      active ? 'text-[#ffe66d] drop-shadow-[0_0_6px_rgba(255,230,109,0.8)]' : 'text-slate-700'
                    }`}
                    fill="currentColor"
                  >
                    <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                  </svg>
                );
              })}
            </div>

            <div className="h-6 w-px bg-white/15" />

            {/* Cash Counter (Hero 2.5:1 Scale Tabular Numerals) */}
            <div className="text-right">
              <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                CASH
              </span>
              <span
                className="text-lg md:text-2xl font-black text-[#34d399] tabular-nums leading-none"
                style={{ textShadow: '0 2px 0 #000' }}
                data-testid="hud-cash"
              >
                ${snapshot.cash.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Health & Armor Bars + Quick Buttons */}
          <div className="flex items-center gap-2.5 bg-[#120826]/90 border border-white/15 rounded-xl px-3.5 py-2 shadow-lg pointer-events-auto">
            <div className="w-24">
              <div className="flex justify-between text-[10px] font-bold text-[#ff2e93] tabular-nums">
                <span>HP</span>
                <span>{snapshot.health}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-[#ff2e93] transition-all duration-150"
                  style={{ width: `${snapshot.health}%` }}
                />
              </div>
            </div>

            <div className="w-20">
              <div className="flex justify-between text-[10px] font-bold text-[#00f5d4] tabular-nums">
                <span>ARMOR</span>
                <span>{snapshot.armor}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-[#00f5d4] transition-all duration-150"
                  style={{ width: `${snapshot.armor}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={snapshot.inVehicle ? 'Exit Vehicle' : 'Enter Nearby Vehicle'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleEnterExitCar();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#00f5d4] text-[#0b0618] text-xs font-black hover:opacity-90 whitespace-nowrap"
            >
              {snapshot.inVehicle ? 'Exit Car' : 'Enter Car'}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open Settings and Controller Mapping"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenSettings();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#ff2e93] text-white text-xs font-black hover:opacity-90 whitespace-nowrap"
            >
              Menu [{pauseBtnLabel.split(' ')[0]} / Esc]
            </button>
          </div>

          {/* 1GB TV Live Polygon, Resolution & RAM Counter */}
          {graphics.showPerfOverlay && (
            <div
              className="px-3 py-1 rounded-lg bg-[#090414]/90 border border-white/10 text-[11px] text-slate-300 tabular-nums"
              data-testid="hud-poly-counter"
            >
              <span className="text-[#00f5d4] font-bold">{snapshot.telemetry.fps} FPS</span> ·{' '}
              <span className="text-[#ffe66d] font-bold">
                {snapshot.telemetry.triangles.toLocaleString()} Polys
              </span>{' '}
              ·{' '}
              <span className="text-white font-semibold">
                {snapshot.telemetry.bufferWidth}×{snapshot.telemetry.bufferHeight}
              </span>{' '}
              · ~{snapshot.telemetry.estimatedRamMB} MB RAM
            </div>
          )}
        </div>
      </div>

      {/* Center Dynamic Event Banner (Mission Passed / Vehicle Entered / Wanted Alert) */}
      {snapshot.bannerMessage && (
        <div className="mx-auto my-auto px-6 py-3 rounded-2xl bg-[#14092b]/95 border-2 border-[#ffe66d] shadow-[0_0_30px_rgba(255,230,109,0.45)] text-center max-w-xl">
          <div className="text-base md:text-xl font-black tracking-wider text-[#ffe66d] uppercase">
            {snapshot.bannerMessage}
          </div>
        </div>
      )}

      {/* Bottom Dock: Mission Objective + Vehicle Speedometer & 1988 In-Car Radio Tuner */}
      <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-3">
        {/* Left/Center Mission Directive Card */}
        <div className="bg-[#120826]/92 border border-[#ff2e93]/50 rounded-xl px-4 py-2.5 shadow-lg max-w-xl pointer-events-auto">
          <div className="flex items-center justify-between gap-3 text-[11px] font-extrabold uppercase tracking-wider text-[#ff2e93]">
            <span>{snapshot.activeMission?.title || 'FREE ROAM · SOLARA BAY'}</span>
            <span className="text-[#ffe66d] tabular-nums">{snapshot.distanceToTarget}m to Beacon</span>
          </div>
          <div className="text-xs md:text-sm font-bold text-white mt-0.5">
            {snapshot.missionObjectiveText}
          </div>
          {snapshot.nearVehiclePrompt && !snapshot.inVehicle && (
            <div className="mt-1.5 flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
              <span className="text-xs font-extrabold text-[#00f5d4]">
                {snapshot.nearVehiclePrompt} — Press [{enterCarBtnLabel}]
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleEnterExitCar();
                }}
                className="px-2.5 py-1 rounded bg-[#00f5d4] text-[#0b0618] text-xs font-black"
              >
                Take Car
              </button>
            </div>
          )}
        </div>

        {/* Right: Vehicle Dashboard (Speedometer + 1988 In-Car Radio) OR On-Foot Action Bar */}
        {snapshot.inVehicle && snapshot.vehicleSpec ? (
          <div
            className="flex items-center gap-4 bg-[#120826]/94 border-2 border-[#00f5d4]/60 rounded-xl px-4 py-2.5 shadow-lg pointer-events-auto"
            data-testid="vehicle-dashboard"
          >
            {/* Digital 1988 Speedometer */}
            <div className="text-center pr-3 border-r border-white/15">
              <span
                className="block text-2xl md:text-3xl font-black text-[#00f5d4] tabular-nums leading-none"
                style={{ textShadow: '0 2px 0 #000' }}
                data-testid="hud-speed-kmh"
              >
                {snapshot.speedKmh}
              </span>
              <span className="text-[10px] font-extrabold tracking-widest text-slate-400">
                KM/H
              </span>
            </div>

            {/* In-Car Radio Deck */}
            <div className="min-w-[180px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#ffe66d]">
                  {currentTrack.station}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  {snapshot.vehicleSpec.modelName}
                </span>
              </div>
              <div
                className="text-xs md:text-sm font-bold text-white truncate max-w-[230px]"
                data-testid="hud-radio-track"
              >
                ♫ {currentTrack.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onNextRadioStation();
                  }}
                  className="px-2.5 py-1 rounded bg-[#ffe66d] text-[#0b0618] text-[11px] font-black hover:opacity-90 whitespace-nowrap"
                >
                  Next Station [{radioBtnLabel.split(' ')[0]}]
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onTriggerAction();
                  }}
                  className="px-2.5 py-1 rounded bg-[#1b0d36] text-slate-200 border border-white/15 text-[11px] font-bold hover:bg-[#27144d] whitespace-nowrap"
                >
                  {snapshot.vehicleSpec.isPolice ? 'Siren' : 'Horn'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#120826]/90 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-slate-300 pointer-events-auto">
            <span>On Foot · [{enterCarBtnLabel}] Enter Car</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerAction();
              }}
              className="px-2.5 py-1 rounded bg-[#ff2e93] text-white font-bold hover:opacity-90"
            >
              Street Hustle
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
