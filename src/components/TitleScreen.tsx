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
  const hasSave = !!savedProgress;

  const confirmLabel = getButtonLabel(0, controllerMapping.layoutStyle);
  const remapLabel = getButtonLabel(
    controllerMapping.buttons.enterExitCar,
    controllerMapping.layoutStyle
  );

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-11 pointer-events-none"
      style={{
        background:
          'linear-gradient(95deg, rgba(9,4,20,0.92) 0%, rgba(14,6,32,0.72) 40%, rgba(11,6,24,0.05) 100%)',
      }}
    >
      {/* Top Bar: Controller + Keyboard Status & Live Polygon / Resolution Telemetry */}
      <div className="flex items-center justify-between gap-4 pointer-events-auto">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#14082c]/92 border-2 border-[#00f5d4]/60 text-xs md:text-sm text-white -skew-x-6 shadow-[0_0_18px_rgba(0,245,212,0.28)]">
          <svg
            className="w-5 h-5 text-[#00f5d4] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4M8 10v4" />
            <circle cx="15" cy="11" r="1" fill="currentColor" />
            <circle cx="17" cy="13" r="1" fill="currentColor" />
          </svg>
          <span className="font-bold tracking-wide">
            {connectedPads.length > 0
              ? `PAD READY: ${connectedPads[0].name}`
              : 'SWITCH / GAMEPAD + KEYBOARD (WASD / ARROWS) ACTIVE'}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-lg bg-[#14082c]/92 border-2 border-[#ff2e93]/60 text-xs tabular-nums text-slate-200 -skew-x-6 shadow-[0_0_18px_rgba(255,46,147,0.28)]">
          <span className="text-[#00f5d4] font-black">
            {telemetry.triangles.toLocaleString()} POLYS
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-[#ffe66d] font-black">
            {telemetry.bufferWidth}×{telemetry.bufferHeight} FULL-TV
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-white font-bold">~{telemetry.estimatedRamMB} MB RAM</span>
        </div>
      </div>

      {/* Left-Third Focal Lockup: Bespoke 1988 Solara Bay SVG Emblem & Slanted Console Menu Blades */}
      <div className="max-w-lg my-auto pointer-events-auto">
        <svg
          viewBox="0 0 540 185"
          className="w-full max-w-[475px] h-auto mb-4 drop-shadow-[0_8px_22px_rgba(255,46,147,0.5)]"
          role="img"
          aria-label="Neon City: Solara Bay 1988"
        >
          <defs>
            <linearGradient id="titleChrome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="48%" stopColor="#00f5d4" />
              <stop offset="52%" stopColor="#170b2c" />
              <stop offset="100%" stopColor="#ff2e93" />
            </linearGradient>
            <linearGradient id="sunsetDisc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffe66d" />
              <stop offset="100%" stopColor="#ff2e93" />
            </linearGradient>
          </defs>
          {/* Retro 1988 Sliced Sun */}
          <circle cx="84" cy="86" r="56" fill="url(#sunsetDisc)" />
          <rect x="24" y="92" width="120" height="5" fill="#120726" />
          <rect x="24" y="104" width="120" height="7" fill="#120726" />
          <rect x="24" y="118" width="120" height="10" fill="#120726" />
          {/* Multi-Frond Palm Silhouette */}
          <path
            d="M68 142 Q74 96 64 62 M64 62 Q40 56 32 72 M64 62 Q48 42 34 48 M64 62 Q84 42 98 54 M64 62 Q90 60 100 76"
            stroke="#120726"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Main Display Title */}
          <text
            x="152"
            y="88"
            fontFamily="Impact, Arial Black, sans-serif"
            fontSize="66"
            fontStyle="italic"
            letterSpacing="2"
            fill="url(#titleChrome)"
            stroke="#120726"
            strokeWidth="5"
            paintOrder="stroke fill"
          >
            NEON CITY
          </text>
          {/* Subtitle Ribbon */}
          <rect x="154" y="104" width="356" height="36" rx="6" fill="#ff2e93" />
          <text
            x="332"
            y="129"
            textAnchor="middle"
            fontFamily="Trebuchet MS, Arial Black, sans-serif"
            fontWeight="900"
            fontSize="21"
            letterSpacing="4"
            fill="#ffffff"
          >
            SOLARA BAY · 1988
          </text>
          <text
            x="332"
            y="164"
            textAnchor="middle"
            fontFamily="Trebuchet MS, sans-serif"
            fontWeight="700"
            fontSize="13.5"
            letterSpacing="1.2"
            fill="#99f6e4"
          >
            FIVE COASTAL DISTRICTS · OPEN WORLD ACTION
          </text>
        </svg>

        {hasSave && savedProgress && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[#190d33]/92 border-l-4 border-[#00f5d4] text-xs text-slate-200 tabular-nums -skew-x-6">
            SAVE SLOT READY · CASH:{' '}
            <span className="text-[#ffe66d] font-black">${savedProgress.cash.toLocaleString()}</span>{' '}
            · MISSION {savedProgress.currentMissionIndex + 1} / 5
          </div>
        )}

        {/* Primary Arcade Menu Blades (<= 3 actions per game_title_and_hud.md) */}
        <div className="flex flex-col gap-3 w-full max-w-[430px]">
          {hasSave && (
            <button
              type="button"
              onClick={onContinueGame}
              onMouseEnter={() => setFocusedIndex(0)}
              className={`tv-focus-ring w-full py-3.5 px-6 rounded-xl font-black uppercase tracking-wider text-left flex items-center justify-between gap-4 transition-all whitespace-nowrap -skew-x-6 ${
                focusedIndex === 0
                  ? 'bg-[#00f5d4] text-[#090414] tv-focused shadow-[0_0_28px_rgba(0,245,212,0.6)]'
                  : 'bg-[#170930]/95 text-white border-2 border-white/15 hover:border-[#00f5d4]'
              }`}
            >
              <span className="text-base md:text-lg">&gt; {t.continueGame}</span>
              <span className="text-xs font-extrabold uppercase tracking-wider opacity-85">
                ${savedProgress?.cash.toLocaleString()}
              </span>
            </button>
          )}

          <button
            type="button"
            data-start="true"
            onClick={onStartNewGame}
            onMouseEnter={() => setFocusedIndex(hasSave ? 1 : 0)}
            className={`tv-focus-ring w-full py-3.5 px-6 rounded-xl font-black uppercase tracking-wider text-left flex items-center justify-between gap-4 transition-all whitespace-nowrap -skew-x-6 ${
              focusedIndex === (hasSave ? 1 : 0)
                ? 'bg-[#ff2e93] text-white tv-focused shadow-[0_0_28px_rgba(255,46,147,0.65)]'
                : 'bg-[#170930]/95 text-white border-2 border-white/15 hover:border-[#ff2e93]'
            }`}
          >
            <span className="text-base md:text-lg">&gt; {t.newGame}</span>
            <span className="text-xs font-extrabold uppercase tracking-wider opacity-90">
              SOLARA &apos;88
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            onMouseEnter={() => setFocusedIndex(hasSave ? 2 : 1)}
            className={`tv-focus-ring w-full py-3.5 px-6 rounded-xl font-black uppercase tracking-wider text-left flex items-center justify-between gap-4 transition-all whitespace-nowrap -skew-x-6 ${
              focusedIndex === (hasSave ? 2 : 1)
                ? 'bg-[#ffe66d] text-[#090414] tv-focused shadow-[0_0_28px_rgba(255,230,109,0.6)]'
                : 'bg-[#170930]/95 text-white border-2 border-white/15 hover:border-[#ffe66d]'
            }`}
          >
            <span className="text-base md:text-lg">&gt; {t.settings}</span>
            <span className="text-xs font-extrabold uppercase tracking-wider opacity-85">
              100K · PAD/KEY
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Safe-Margin Control Hint Line (Flat, borderless inline line) */}
      <div className="text-xs md:text-sm font-bold text-slate-200 tracking-wide">
        Gamepad Stick / WASD / Arrows: Move &amp; Drive · {confirmLabel} / Space: Confirm &amp; Drift ·{' '}
        {remapLabel} / F: Enter Car · R: Radio · Esc / +: Options Deck
      </div>
    </div>
  );
};
