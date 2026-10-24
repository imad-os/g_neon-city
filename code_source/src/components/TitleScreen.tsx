import React, { useState } from 'react';
import { UI_TRANSLATIONS, getButtonLabel, getKeyboardCodeLabel } from '../game/rules.ts';
import type {
  CommandHubTab,
  ControllerMapping,
  GraphicsSettings,
  LanguageCode,
  MyPCGamepadPadInfo,
  RenderTelemetry,
  SavedProgress,
  TextSizeScale,
} from '../game/types.ts';

interface TitleScreenProps {
  lang: LanguageCode;
  savedProgress: SavedProgress | null;
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onOpenHub: (initialTab?: CommandHubTab) => void;
  graphics: GraphicsSettings;
  onChangeTextSize: (size: TextSizeScale) => void;
  connectedPads: MyPCGamepadPadInfo[];
  controllerMapping: ControllerMapping;
  telemetry: RenderTelemetry;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  lang,
  savedProgress,
  focusedIndex,
  setFocusedIndex,
  onStartNewGame,
  onContinueGame,
  onOpenHub,
  graphics,
  onChangeTextSize,
  connectedPads,
  controllerMapping,
  telemetry,
}) => {
  const [previewOnly, setPreviewOnly] = useState(false);
  const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;

  const menuItems = savedProgress
    ? [
        {
          id: 'continue',
          label: `${t.continueGame} ($${savedProgress.cash.toLocaleString()})`,
          sub: `Mission ${savedProgress.currentMissionIndex + 1} · Mesnana Golf & Hay El Kawassim`,
          action: onContinueGame,
        },
        {
          id: 'new-game',
          label: `${t.newGame} (Drive Now)`,
          sub: 'Start driving at Rond-Point Mesnana Golf with $1,000',
          action: onStartNewGame,
        },
        {
          id: 'map-missions',
          label: 'Tangier World Map & Missions',
          sub: 'Inspect connected streets, Royal Golf, Kawassim & select missions',
          action: () => onOpenHub('map'),
        },
        {
          id: 'settings',
          label: 'Controls Mapping, Display & Text Size',
          sub: 'Remap In-Car & On-Foot buttons/keys, adjust TV resolution & text scale',
          action: () => onOpenHub('controls'),
        },
      ]
    : [
        {
          id: 'new-game',
          label: `${t.newGame} (Drive Now)`,
          sub: 'Start driving immediately at Rond-Point Mesnana Golf in 3D',
          action: onStartNewGame,
        },
        {
          id: 'map-missions',
          label: 'Tangier World Map & Missions',
          sub: 'Inspect connected streets, Royal Golf, Kawassim & mission routes',
          action: () => onOpenHub('map'),
        },
        {
          id: 'settings',
          label: 'Controls Mapping, Display & Text Size',
          sub: 'Remap In-Car & On-Foot buttons/keys, adjust TV resolution & text scale',
          action: () => onOpenHub('controls'),
        },
      ];

  const confirmPad = getButtonLabel(0, controllerMapping.layoutStyle);
  const enterCarKey = getKeyboardCodeLabel(controllerMapping.keys?.footEnterCar || 'KeyF');

  if (previewOnly) {
    return (
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="px-4 py-2 rounded-xl bg-[#04101e]/85 border border-sky-400/50 text-sm font-black text-sky-200">
            LIVE 3D TANGIER VIEWPORT · ROND-POINT MESNANA GOLF &amp; ROYAL COUNTRY CLUB
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={onStartNewGame}
              className="tv-focus-ring px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#04101e] font-black text-sm uppercase tracking-wider shadow-lg"
            >
              ► Drive in 3D City Now
            </button>
            <button
              type="button"
              onClick={() => setPreviewOnly(false)}
              className="tv-focus-ring px-4 py-2.5 rounded-xl bg-[#0077b6] hover:bg-[#00a8e8] text-white font-black text-sm uppercase tracking-wider border border-sky-200/50 shadow-lg"
            >
              Show Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-7 pointer-events-none">
      {/* Top Bar: Clean 3-Zone Header */}
      <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#04101e]/80 backdrop-blur-md border border-sky-400/35 shadow-lg">
        <div className="text-sm sm:text-base font-extrabold tracking-tight text-sky-300 whitespace-nowrap shrink-0">
          TANGIER 3D · MESNANA GOLF &amp; KAWASSIM
        </div>

        {/* Quick Text Size Selector right on Title Screen */}
        <div className="flex flex-wrap items-center gap-1 bg-[#071c33]/90 border border-sky-400/35 rounded-xl p-1">
          <span className="text-xs font-bold text-sky-200 px-2 whitespace-nowrap">
            Text Size:
          </span>
          {(
            [
              { id: 'tiny', label: 'Tiny' },
              { id: 'small', label: 'Small' },
              { id: 'normal', label: 'Normal' },
              { id: 'large', label: 'Large' },
              { id: 'xl', label: 'XL' },
            ] as { id: TextSizeScale; label: string }[]
          ).map((sz) => (
            <button
              key={sz.id}
              type="button"
              onClick={() => onChangeTextSize(sz.id)}
              className={`tv-focus-ring px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                graphics.textSize === sz.id
                  ? 'bg-[#00a8e8] text-[#04101e]'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {sz.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOnly(true)}
            className="tv-focus-ring px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-xs font-extrabold text-emerald-300 whitespace-nowrap"
          >
            Hide Menu (3D View)
          </button>
          <span className="hidden xl:inline text-xs font-bold text-amber-300 whitespace-nowrap shrink-0">
            {connectedPads.length > 0
              ? `Controller: ${connectedPads[0].name}`
              : 'Keyboard + Controller Ready'}
          </span>
        </div>
      </header>

      {/* Middle Split: Compact Left Menu Card + Unobstructed Right 3D City Viewport */}
      <div className="my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-6 xl:col-span-5 pointer-events-auto p-5 sm:p-6 rounded-2xl bg-[#04101e]/82 backdrop-blur-md border-2 border-sky-400/40 shadow-[0_12px_40px_rgba(4,16,30,0.65)] space-y-5">
          <div className="space-y-1.5">
            <div className="text-xs sm:text-sm font-extrabold tracking-widest uppercase text-sky-400">
              MOROCCO 3D OPEN WORLD · ROYAL GOLF · KAWASSIM
            </div>
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-white leading-none"
              style={{
                textShadow: '0 4px 20px rgba(0, 168, 232, 0.5)',
              }}
            >
              TANGIER CITY
            </h1>
            <p className="text-base sm:text-lg font-extrabold uppercase tracking-wider text-amber-400">
              MESNANA GOLF &amp; KAWASSIM EDITION
            </p>
          </div>

          {/* High-Contrast Clear Menu Buttons */}
          <nav className="space-y-2.5" aria-label="Main Game Menu">
            {menuItems.map((item, idx) => {
              const focused = focusedIndex === idx;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`title-btn-${item.id}`}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onFocus={() => setFocusedIndex(idx)}
                  onClick={item.action}
                  className={`tv-focus-ring w-full p-3.5 sm:p-4 rounded-xl text-left transition-all border-2 flex items-center justify-between gap-3 ${
                    focused
                      ? 'bg-gradient-to-r from-[#0077b6] to-[#00a8e8] border-amber-300 text-white shadow-[0_6px_24px_rgba(0,168,232,0.45)]'
                      : 'bg-[#071c33]/88 border-sky-400/35 text-slate-100 hover:border-sky-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-black tracking-wide flex items-center gap-2">
                      <span className={focused ? 'text-amber-300' : 'text-sky-400'}>
                        {focused ? '►' : '•'}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div
                      className={`text-xs sm:text-sm mt-0.5 font-medium ${
                        focused ? 'text-sky-50' : 'text-slate-300'
                      }`}
                    >
                      {item.sub}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#04101e]/80 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 whitespace-nowrap shrink-0">
                    ENTER / {confirmPad}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Side: Interactive Click-to-Drive 3D Viewport Callout */}
        <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col items-end justify-end h-full pointer-events-none">
          <button
            type="button"
            onClick={onStartNewGame}
            className="pointer-events-auto tv-focus-ring px-5 py-3 rounded-2xl bg-[#04101e]/75 hover:bg-[#0077b6] backdrop-blur-md border-2 border-amber-400/80 text-right shadow-xl transition-all group"
          >
            <div className="text-xs font-extrabold uppercase tracking-widest text-amber-300">
              LIVE 3D TANGIER SCENE · CLICK HERE OR PRESS ENTER
            </div>
            <div className="text-base font-black text-white group-hover:text-amber-200">
              ► Jump Straight Into Driving at Rond-Point Mesnana Golf
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Controls Summary */}
      <footer className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#04101e]/80 backdrop-blur-md border border-sky-400/30 text-xs sm:text-sm text-slate-200">
        <div className="flex flex-wrap items-center gap-3 font-semibold">
          <span>
            <strong className="text-sky-300">Drive / Walk:</strong> WASD / Arrows / Left Stick
          </span>
          <span>·</span>
          <span>
            <strong className="text-amber-300">Enter / Exit Car:</strong> {enterCarKey} /{' '}
            {getButtonLabel(controllerMapping.buttons.footEnterCar, controllerMapping.layoutStyle)}
          </span>
          <span>·</span>
          <span>
            <strong className="text-emerald-300">World Map:</strong> M ·{' '}
            <strong className="text-emerald-300">Missions:</strong> J ·{' '}
            <strong className="text-emerald-300">Hub:</strong> ESC / +
          </span>
        </div>
        <div className="text-xs font-bold text-sky-300/90 tabular-nums">
          {telemetry.triangles.toLocaleString()} Polys · {telemetry.bufferWidth}×
          {telemetry.bufferHeight}
        </div>
      </footer>
    </div>
  );
};
