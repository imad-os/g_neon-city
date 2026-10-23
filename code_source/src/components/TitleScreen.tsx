import React from 'react';
import { UI_TRANSLATIONS, getButtonLabel } from '../game/rules.ts';
import type {
  ControllerMapping,
  LanguageCode,
  MyPCGamepadPadInfo,
  RenderTelemetry,
  SavedProgress,
} from '../game/types.ts';

interface TitleScreenProps {
  lang: LanguageCode;
  savedProgress: SavedProgress | null;
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onOpenSettings: () => void;
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
  onOpenSettings,
  connectedPads,
  controllerMapping,
  telemetry,
}) => {
  const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;

  const menuItems = savedProgress
    ? [
        {
          id: 'continue',
          label: `${t.continueGame} ($${savedProgress.cash.toLocaleString()})`,
          sub: `Mission ${savedProgress.currentMissionIndex + 1} · Solara Bay '88`,
          action: onContinueGame,
          primary: true,
        },
        {
          id: 'new-game',
          label: t.newGame,
          sub: 'Start fresh on Ocean Drive with $500',
          action: onStartNewGame,
          primary: false,
        },
        {
          id: 'settings',
          label: t.settings,
          sub: 'Polygons (up to 100K), Full-Screen TV Resolution, Controller & Keyboard',
          action: onOpenSettings,
          primary: false,
        },
      ]
    : [
        {
          id: 'new-game',
          label: t.newGame,
          sub: 'Hit Ocean Drive in 1988 Solara Bay',
          action: onStartNewGame,
          primary: true,
        },
        {
          id: 'settings',
          label: t.settings,
          sub: 'Polygons (up to 100K), Full-Screen TV Resolution, Controller & Keyboard',
          action: onOpenSettings,
          primary: false,
        },
      ];

  const confirmLabel = getButtonLabel(0, controllerMapping.layoutStyle);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-10 pointer-events-auto bg-gradient-to-r from-[#070312]/90 via-[#070312]/55 to-transparent">
      {/* Top Status Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-[#120726]/90 border border-[#00f5d4]/50 shadow-[0_0_20px_rgba(0,245,212,0.25)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00f5d4] animate-pulse" />
          <span className="text-xs font-black tracking-widest uppercase text-[#00f5d4]">
            SOLARA BAY 1988 · LIVE 3D ENGINE ({telemetry.triangles.toLocaleString()} POLYS)
          </span>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#120726]/90 border border-[#ff2e93]/50 text-xs font-bold text-white">
          <span className="text-[#ffe66d]">
            {connectedPads.length > 0
              ? `CONTROLLER READY: ${connectedPads[0].name}`
              : 'KEYBOARD + CONTROLLER READY'}
          </span>
        </div>
      </header>

      {/* Main 1988 Vice-Style Left Blade Menu */}
      <div className="max-w-xl my-auto space-y-6">
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 bg-[#ff2e93] text-white text-xs font-black tracking-[0.25em] uppercase -skew-x-12 shadow-[0_0_20px_rgba(255,46,147,0.6)]">
            VICE EDITION · 1988 OPEN WORLD
          </div>
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-black italic uppercase tracking-tight text-white leading-none"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              textShadow: '4px 4px 0px #ff2e93, -2px -2px 0px #00f5d4',
            }}
          >
            NEON CITY
          </h1>
          <p className="text-xl sm:text-2xl font-black italic uppercase tracking-widest text-[#ffe66d]">
            SOLARA BAY &apos;88
          </p>
        </div>

        {/* Slanted Arcade Menu Blades */}
        <nav className="space-y-3" aria-label="Main Game Menu">
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
                className={`tv-focus-ring w-full p-4 rounded-xl text-left transition-all transform -skew-x-6 border-2 flex items-center justify-between ${
                  focused
                    ? 'bg-gradient-to-r from-[#ff2e93] to-[#db2777] border-[#ffe66d] text-white translate-x-2 shadow-[0_0_30px_rgba(255,46,147,0.6)]'
                    : 'bg-[#120726]/90 border-[#00f5d4]/40 text-slate-100 hover:border-[#00f5d4]'
                }`}
              >
                <div>
                  <div className="text-lg md:text-xl font-black uppercase tracking-wider flex items-center gap-2">
                    <span>{focused ? '►' : '•'}</span>
                    <span>{item.label}</span>
                  </div>
                  <div
                    className={`text-xs mt-0.5 font-semibold ${
                      focused ? 'text-[#ffe66d]' : 'text-slate-300'
                    }`}
                  >
                    {item.sub}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-black/40 text-[11px] font-black uppercase tracking-wider text-[#00f5d4]">
                  ENTER / {confirmLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls Legend */}
      <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/15 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-3 font-bold">
          <span className="px-2 py-1 rounded bg-white/10 text-[#00f5d4]">
            WASD / ARROWS / LEFT STICK: Drive &amp; Move
          </span>
          <span className="px-2 py-1 rounded bg-white/10 text-[#ffe66d]">
            F / ENTER / X: Enter or Exit Car
          </span>
          <span className="px-2 py-1 rounded bg-white/10 text-[#ff2e93]">
            R: 1988 Radio · C: Camera · ESC / +: Options
          </span>
        </div>
        <div className="text-[11px] font-bold text-slate-400 tabular-nums">
          TV Viewport: {telemetry.bufferWidth}×{telemetry.bufferHeight} → Auto Full-Screen
        </div>
      </footer>
    </div>
  );
};
