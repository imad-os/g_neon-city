/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { TitleScreen } from './components/TitleScreen.tsx';
import { SolaraAudioEngine } from './game/audio.ts';
import {
  DEFAULT_RADIO_TRACKS,
  applyStickDeadzone,
  createDefaultControllerMapping,
  createInitialProgress,
  getPresetForMyPCTier,
  getResolvedHudVisibility,
  normalizeKeyboardCode,
  remapControllerAction,
  remapKeyboardAction,
  validateSavedProgress,
} from './game/rules.ts';
import type {
  CommandHubTab,
  ControllerMapping,
  GameActionId,
  GameState,
  GraphicsSettings,
  LanguageCode,
  MyPCGamepadPadInfo,
  RadioTrack,
  SavedProgress,
  TextSizeScale,
  WorldZoneId,
} from './game/types.ts';
import { SolaraWorld3D, type WorldHudSnapshot } from './game/world3d.ts';

const SAVE_KEY_PROGRESS = 'tangier_city_save_v2';
const SAVE_KEY_GRAPHICS = 'tangier_city_graphics_v3';
const SAVE_KEY_CONTROLLER = 'tangier_city_controller_v3';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<SolaraWorld3D | null>(null);
  const audioRef = useRef<SolaraAudioEngine>(new SolaraAudioEngine());

  // Mutable refs for 60Hz loop
  const gameStateRef = useRef<GameState>('title');
  const settingsOpenRef = useRef<boolean>(false);
  const graphicsRef = useRef<GraphicsSettings>(getPresetForMyPCTier('mid'));
  const mappingRef = useRef<ControllerMapping>(createDefaultControllerMapping('switch'));
  const listeningActionRef = useRef<GameActionId | null>(null);
  const listeningKeyActionRef = useRef<GameActionId | null>(null);
  const menuFocusIdxRef = useRef<number>(0);
  const savedProgressRef = useRef<SavedProgress | null>(null);
  const keysDownRef = useRef<Set<string>>(new Set());
  const prevButtonsRef = useRef<boolean[]>(new Array(20).fill(false));
  const prevStickDirRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const lastBtnEdgeTsRef = useRef<Record<number, number>>({});
  const lastMenuNavTsRef = useRef<number>(0);

  // React UI state
  const [lang, setLang] = useState<LanguageCode>('en');
  const [gameState, setGameState] = useState<GameState>('title');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [hubInitialTab, setHubInitialTab] = useState<CommandHubTab>('map');
  const [menuFocusIdx, setMenuFocusIdx] = useState<number>(0);
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);
  const [graphics, setGraphics] = useState<GraphicsSettings>(() => getPresetForMyPCTier('mid'));
  const [controllerMapping, setControllerMapping] = useState<ControllerMapping>(() =>
    createDefaultControllerMapping('switch')
  );
  const [listeningAction, setListeningActionState] = useState<GameActionId | null>(null);
  const [listeningKeyAction, setListeningKeyActionState] = useState<GameActionId | null>(null);
  const [lastDetectedButton, setLastDetectedButton] = useState<{
    index: number;
    name: string;
    dev: string;
  } | null>(null);
  const [liveAxes, setLiveAxes] = useState<number[]>([0, 0, 0, 0]);
  const [connectedPads, setConnectedPads] = useState<MyPCGamepadPadInfo[]>([]);
  const [radioTracks, setRadioTracks] = useState<RadioTrack[]>(DEFAULT_RADIO_TRACKS);
  const [currentStationIdx, setCurrentStationIdx] = useState<number>(0);
  const [radarZoomed, setRadarZoomed] = useState<boolean>(false);
  const [hudSnapshot, setHudSnapshot] = useState<WorldHudSnapshot | null>(null);

  // Sync Text Size Scale onto <html> element immediately
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.textSize = graphics.textSize || 'normal';
    }
  }, [graphics.textSize]);

  const setListeningAction = (act: GameActionId | null) => {
    listeningActionRef.current = act;
    setListeningActionState(act);
  };

  const setListeningKeyAction = (act: GameActionId | null) => {
    listeningKeyActionRef.current = act;
    setListeningKeyActionState(act);
  };

  const syncBodyState = (nextState: GameState, isModalOpen: boolean) => {
    const effective = isModalOpen && nextState === 'playing' ? 'paused' : nextState;
    gameStateRef.current = effective;
    setGameState(effective);
    if (typeof document !== 'undefined') {
      document.body.dataset.state = effective;
    }
  };

  const persistProgressNow = () => {
    const world = worldRef.current;
    if (!world) return;
    const snap = world.exportSavedProgress(audioRef.current.getCurrentStationIndex());
    savedProgressRef.current = snap;
    setSavedProgress(snap);
    window.MyPC?.save(SAVE_KEY_PROGRESS, snap);
    window.MyPC?.submitScore(snap.cash);
  };

  const handleUpdateGraphics = (next: GraphicsSettings) => {
    graphicsRef.current = next;
    setGraphics(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.textSize = next.textSize || 'normal';
    }
    worldRef.current?.applyGraphicsSettings(next);
    window.MyPC?.save(SAVE_KEY_GRAPHICS, next);
    if (worldRef.current) {
      setHudSnapshot(worldRef.current.getHudSnapshot());
    }
  };

  const handleChangeTextSize = (size: TextSizeScale) => {
    handleUpdateGraphics({
      ...graphicsRef.current,
      textSize: size,
    });
  };

  const handleUpdateControllerMapping = (next: ControllerMapping) => {
    mappingRef.current = next;
    setControllerMapping(next);
    window.MyPC?.save(SAVE_KEY_CONTROLLER, next);
  };

  const handleStartNewGame = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.focus();
    }
    const startingCash =
      typeof window.MyPC?.app_config?.startingCash === 'number'
        ? (window.MyPC.app_config.startingCash as number)
        : 1000;
    const fresh = createInitialProgress(startingCash);
    worldRef.current?.loadFromSavedProgress(fresh, true);
    audioRef.current.start(window.MyPC?.info()?.volume);
    audioRef.current.setInCar(true);
    audioRef.current.playSfx('menuSelect');
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    syncBodyState('playing', false);
    if (worldRef.current) {
      worldRef.current.triggerBanner(
        'DRIVING IN TANGIER: MESNANA GOLF — USE WASD / ARROWS / STICK (F TO EXIT CAR)',
        4.0
      );
      setHudSnapshot(worldRef.current.getHudSnapshot());
    }
    persistProgressNow();
  };

  const handleContinueGame = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.focus();
    }
    const existing = savedProgressRef.current;
    if (existing && worldRef.current) {
      worldRef.current.loadFromSavedProgress(existing);
      audioRef.current.start(window.MyPC?.info()?.volume);
      audioRef.current.setStationIndex(existing.currentStationIndex || 0);
      setCurrentStationIdx(audioRef.current.getCurrentStationIndex());
      audioRef.current.playSfx('menuSelect');
      settingsOpenRef.current = false;
      setSettingsOpen(false);
      syncBodyState('playing', false);
      worldRef.current.triggerBanner(
        `TANGIER PROGRESS RESTORED · $${existing.cash.toLocaleString()} · MISSION ${existing.currentMissionIndex + 1}`,
        3.5
      );
      setHudSnapshot(worldRef.current.getHudSnapshot());
    } else {
      handleStartNewGame();
    }
  };

  const handleOpenHub = (tab: CommandHubTab = 'map') => {
    audioRef.current.playSfx('menuSelect');
    setHubInitialTab(tab);
    settingsOpenRef.current = true;
    setSettingsOpen(true);
    if (gameStateRef.current === 'playing') {
      syncBodyState('paused', true);
    }
  };

  const handleCloseSettings = () => {
    audioRef.current.playSfx('menuSelect');
    setListeningAction(null);
    setListeningKeyAction(null);
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    if (gameStateRef.current === 'paused') {
      syncBodyState('playing', false);
    }
    if (typeof window !== 'undefined') {
      window.focus();
    }
  };

  const handleReturnToTitle = () => {
    persistProgressNow();
    audioRef.current.setInCar(false);
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    syncBodyState('title', false);
  };

  const handleToggleEnterExitCar = () => {
    const world = worldRef.current;
    if (!world) return;
    const entered = world.toggleEnterExitVehicle();
    audioRef.current.setInCar(entered);
    setHudSnapshot(world.getHudSnapshot());
  };

  const handleNextRadioStation = () => {
    const track = audioRef.current.nextStation();
    setCurrentStationIdx(audioRef.current.getCurrentStationIndex());
    worldRef.current?.triggerBanner(`RADIO: ${track.station} — "${track.title}"`, 2.5);
  };

  const handleSelectStation = (idx: number) => {
    audioRef.current.setStationIndex(idx);
    setCurrentStationIdx(audioRef.current.getCurrentStationIndex());
  };

  const handleAddCustomTrack = (title: string, artist: string, url: string) => {
    const newIdx = audioRef.current.addCustomTrack(title, artist, url);
    setRadioTracks([...audioRef.current.getTracks()]);
    setCurrentStationIdx(newIdx);
  };

  const handleSelectMission = (missionIdx: number) => {
    worldRef.current?.selectMission(missionIdx);
    if (worldRef.current) {
      setHudSnapshot(worldRef.current.getHudSnapshot());
    }
  };

  const handleSetCustomWaypoint = (pt: { x: number; z: number } | null) => {
    worldRef.current?.setCustomWaypoint(pt);
    if (worldRef.current) {
      setHudSnapshot(worldRef.current.getHudSnapshot());
    }
  };

  const handleFastTravelToZone = (zoneId: WorldZoneId) => {
    const world = worldRef.current;
    if (!world) return;
    world.fastTravelToZone(zoneId);
    audioRef.current.playSfx('menuSelect');
    setHudSnapshot(world.getHudSnapshot());
    if (settingsOpenRef.current) {
      handleCloseSettings();
    }
  };

  const navigateTitleOrModal = (dir: 'up' | 'down' | 'left' | 'right' | 'confirm') => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastMenuNavTsRef.current < 90) return;
    lastMenuNavTsRef.current = now;

    if (settingsOpenRef.current) {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([type="hidden"]):not(.hidden)'
        )
      );
      if (focusables.length === 0) return;
      const currentIdx = focusables.indexOf(document.activeElement as HTMLElement);

      if (dir === 'confirm') {
        const target =
          currentIdx >= 0 ? focusables[currentIdx] : focusables[focusables.length - 1];
        target?.click();
        return;
      }

      const delta = dir === 'down' || dir === 'right' ? 1 : -1;
      const nextIdx =
        currentIdx < 0
          ? 0
          : (currentIdx + delta + focusables.length) % focusables.length;
      focusables[nextIdx]?.focus();
      focusables[nextIdx]?.scrollIntoView({ block: 'nearest' });
      audioRef.current.playSfx('menuMove');
      return;
    }

    if (gameStateRef.current === 'title') {
      const count = savedProgressRef.current ? 4 : 3;
      if (dir === 'up' || dir === 'left') {
        menuFocusIdxRef.current = (menuFocusIdxRef.current - 1 + count) % count;
        setMenuFocusIdx(menuFocusIdxRef.current);
        audioRef.current.playSfx('menuMove');
      } else if (dir === 'down' || dir === 'right') {
        menuFocusIdxRef.current = (menuFocusIdxRef.current + 1) % count;
        setMenuFocusIdx(menuFocusIdxRef.current);
        audioRef.current.playSfx('menuMove');
      } else if (dir === 'confirm') {
        const idx = menuFocusIdxRef.current;
        if (savedProgressRef.current) {
          if (idx === 0) handleContinueGame();
          else if (idx === 1) handleStartNewGame();
          else if (idx === 2) handleOpenHub('map');
          else handleOpenHub('controls');
        } else {
          if (idx === 0) handleStartNewGame();
          else if (idx === 1) handleOpenHub('map');
          else handleOpenHub('controls');
        }
      }
    }
  };

  const handleGamepadButtonEvent = (
    index: number,
    pressed: boolean,
    _value: number,
    dev: string,
    name: string
  ) => {
    if (!pressed) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - (lastBtnEdgeTsRef.current[index] || 0) < 75) return;
    lastBtnEdgeTsRef.current[index] = now;

    setLastDetectedButton({ index, name, dev });

    if (listeningActionRef.current) {
      const updated = remapControllerAction(
        mappingRef.current,
        listeningActionRef.current,
        index
      );
      handleUpdateControllerMapping(updated);
      setListeningAction(null);
      audioRef.current.playSfx('menuSelect');
      return;
    }

    const btns = mappingRef.current.buttons;

    // 1. Command Hub Modal Navigation via Controller
    if (settingsOpenRef.current) {
      if (index === btns.uiPauseMenu || index === 9) {
        handleCloseSettings();
      } else if (index === 4 || index === 5) {
        const tabs = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-modal-tab]')
        );
        if (tabs.length > 0) {
          const activeIdx = tabs.findIndex((el) =>
            el.className.includes('bg-[#00a8e8]')
          );
          const nextTabIdx =
            index === 5
              ? (activeIdx + 1) % tabs.length
              : (activeIdx - 1 + tabs.length) % tabs.length;
          tabs[nextTabIdx]?.click();
          audioRef.current.playSfx('menuMove');
        }
      } else if (index === 12) {
        navigateTitleOrModal('up');
      } else if (index === 13) {
        navigateTitleOrModal('down');
      } else if (index === 14) {
        navigateTitleOrModal('left');
      } else if (index === 15) {
        navigateTitleOrModal('right');
      } else if (index === 0 || index === 1) {
        navigateTitleOrModal('confirm');
      }
      return;
    }

    // 2. Title Screen Navigation via Controller
    if (gameStateRef.current === 'title') {
      if (index === 12) {
        navigateTitleOrModal('up');
      } else if (index === 13) {
        navigateTitleOrModal('down');
      } else if (index === 0 || index === 1 || index === 9 || index === btns.footEnterCar) {
        navigateTitleOrModal('confirm');
      } else if (index === btns.uiOpenWorldMap) {
        handleOpenHub('map');
      } else if (index === btns.uiPauseMenu) {
        handleOpenHub('controls');
      }
      return;
    }

    // 3. Context-Aware Active Gameplay Actions (In Car vs On Foot + System UI)
    if (gameStateRef.current === 'playing') {
      const inCar = Boolean(worldRef.current?.isInVehicle());

      // System UI bindings work in both contexts
      if (index === btns.uiOpenWorldMap) {
        handleOpenHub('map');
        return;
      }
      if (index === btns.uiOpenMissions) {
        handleOpenHub('missions');
        return;
      }
      if (index === btns.uiPauseMenu || index === 9) {
        handleOpenHub('settings');
        return;
      }
      if (index === btns.uiRadarZoom) {
        setRadarZoomed((z) => !z);
        return;
      }
      if (index === btns.uiQuickSave) {
        persistProgressNow();
        worldRef.current?.triggerBanner('PROGRESS SAVED TO PROFILE', 2.2);
        return;
      }

      if (inCar) {
        if (index === btns.carExitVehicle) {
          handleToggleEnterExitCar();
        } else if (index === btns.carNextRadio) {
          handleNextRadioStation();
        } else if (index === btns.carHornSiren) {
          worldRef.current?.performAttackOrHorn();
        } else if (index === btns.carCameraView) {
          worldRef.current?.cycleCameraView();
        }
      } else {
        if (index === btns.footEnterCar) {
          handleToggleEnterExitCar();
        } else if (index === btns.footInteractHustle) {
          worldRef.current?.performAttackOrHorn();
        } else if (index === btns.footCameraView) {
          worldRef.current?.cycleCameraView();
        }
      }
    }
  };

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    window.focus();
    const onPointerDown = () => {
      if (
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        window.focus();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    const world = new SolaraWorld3D(container, graphicsRef.current, (ev) => {
      if (ev === 'autosave') {
        persistProgressNow();
      } else if (ev === 'busted') {
        world.triggerBanner('INTERCEPTED BY DGSN TANGER! -$200 BAIL', 4.0);
        audioRef.current.playSfx('siren');
        persistProgressNow();
      } else if (ev === 'wasted') {
        world.triggerBanner('PATCHED UP AT CLINIQUE MESNANA GOLF', 4.0);
        audioRef.current.playSfx('hit');
      } else {
        audioRef.current.playSfx(ev);
      }
    });
    worldRef.current = world;
    setHudSnapshot(world.getHudSnapshot());

    const onResize = () => world.resize();
    window.addEventListener('resize', onResize);

    const refreshConnectedPads = () => {
      const list: MyPCGamepadPadInfo[] = [];
      const sdkPads = window.MyPC?.gamepad?.pads?.() || [];
      for (let i = 0; i < sdkPads.length; i++) {
        list.push(sdkPads[i]);
      }
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        try {
          const rawPads = navigator.getGamepads();
          for (let i = 0; i < rawPads.length; i++) {
            const p = rawPads[i];
            if (p && p.connected) {
              const devId = `pad${p.index}`;
              if (!list.some((existing) => existing.dev === devId)) {
                list.push({
                  dev: devId,
                  name: p.id || `Controller ${p.index + 1}`,
                  axes: p.axes.length,
                  buttons: p.buttons.length,
                  standard: p.mapping === 'standard',
                });
              }
            }
          }
        } catch {
          // Ignore
        }
      }
      setConnectedPads(list);
    };

    window.addEventListener('gamepadconnected', refreshConnectedPads);
    window.addEventListener('gamepaddisconnected', refreshConnectedPads);
    refreshConnectedPads();

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const normCode = normalizeKeyboardCode(e.code, e.key);
      keysDownRef.current.add(normCode);
      if (e.code) keysDownRef.current.add(e.code);

      if (
        normCode === 'ArrowUp' ||
        normCode === 'ArrowDown' ||
        normCode === 'ArrowLeft' ||
        normCode === 'ArrowRight' ||
        normCode === 'Space' ||
        normCode === 'Tab'
      ) {
        if (!(e.target instanceof HTMLButtonElement && normCode === 'Space' && settingsOpenRef.current)) {
          e.preventDefault();
        }
      }

      if (e.repeat) return;

      // Handle interactive Keyboard Key Remapping capture
      if (listeningKeyActionRef.current) {
        e.preventDefault();
        if (normCode === 'Escape') {
          setListeningKeyAction(null);
          return;
        }
        const updated = remapKeyboardAction(
          mappingRef.current,
          listeningKeyActionRef.current,
          normCode
        );
        handleUpdateControllerMapping(updated);
        setListeningKeyAction(null);
        audioRef.current.playSfx('menuSelect');
        return;
      }

      if (normCode === 'Escape' && listeningActionRef.current) {
        e.preventDefault();
        setListeningAction(null);
        return;
      }

      const keyMap = mappingRef.current.keys || createDefaultControllerMapping().keys;

      // Global Command Hub / Map / Missions hotkeys
      if (normCode === (keyMap.uiPauseMenu || 'Escape') || normCode === 'Escape') {
        e.preventDefault();
        if (settingsOpenRef.current) {
          handleCloseSettings();
        } else {
          handleOpenHub('settings');
        }
        return;
      }

      if (gameStateRef.current === 'title' && !settingsOpenRef.current) {
        if (normCode === 'ArrowUp' || normCode === 'KeyW') {
          e.preventDefault();
          navigateTitleOrModal('up');
        } else if (normCode === 'ArrowDown' || normCode === 'KeyS') {
          e.preventDefault();
          navigateTitleOrModal('down');
        } else if (normCode === 'Enter' || normCode === 'Space' || normCode === 'KeyF') {
          e.preventDefault();
          navigateTitleOrModal('confirm');
        } else if (normCode === (keyMap.uiOpenWorldMap || 'KeyM')) {
          e.preventDefault();
          handleOpenHub('map');
        } else if (normCode === (keyMap.uiOpenMissions || 'KeyJ')) {
          e.preventDefault();
          handleOpenHub('missions');
        }
        return;
      }

      if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
        const inCar = Boolean(world.isInVehicle());

        // System UI Keys
        if (normCode === (keyMap.uiOpenWorldMap || 'KeyM')) {
          e.preventDefault();
          handleOpenHub('map');
          return;
        }
        if (normCode === (keyMap.uiOpenMissions || 'KeyJ')) {
          e.preventDefault();
          handleOpenHub('missions');
          return;
        }
        if (normCode === (keyMap.uiRadarZoom || 'Tab')) {
          e.preventDefault();
          setRadarZoomed((z) => !z);
          return;
        }
        if (normCode === (keyMap.uiQuickSave || 'KeyK') || normCode === 'F5') {
          e.preventDefault();
          persistProgressNow();
          world.triggerBanner('PROGRESS SAVED TO PROFILE', 2.2);
          return;
        }

        // Context-Specific Keys: In Car vs On Foot
        if (inCar) {
          if (normCode === (keyMap.carExitVehicle || 'KeyF') || normCode === 'Enter') {
            e.preventDefault();
            handleToggleEnterExitCar();
          } else if (normCode === (keyMap.carNextRadio || 'KeyR')) {
            e.preventDefault();
            handleNextRadioStation();
          } else if (normCode === (keyMap.carCameraView || 'KeyC')) {
            e.preventDefault();
            world.cycleCameraView();
          } else if (normCode === (keyMap.carHornSiren || 'KeyH')) {
            e.preventDefault();
            world.performAttackOrHorn();
          }
        } else {
          if (normCode === (keyMap.footEnterCar || 'KeyF') || normCode === 'Enter') {
            e.preventDefault();
            handleToggleEnterExitCar();
          } else if (normCode === (keyMap.footInteractHustle || 'KeyE')) {
            e.preventDefault();
            world.performAttackOrHorn();
          } else if (normCode === (keyMap.footCameraView || 'KeyC')) {
            e.preventDefault();
            world.cycleCameraView();
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const normCode = normalizeKeyboardCode(e.code, e.key);
      keysDownRef.current.delete(normCode);
      if (e.code) keysDownRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysDownRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    let rafId = 0;
    let lastTs = 0;
    let accumMs = 0;
    let hudSyncAccum = 0;
    let lastRenderTs = 0;
    const STEP_MS = 1000 / 60;
    const stepInput = {
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      accelerate: 0,
      brake: 0,
      handbrake: false,
      sprint: false,
    };

    const pollGamepadsAndKeyboard = () => {
      const mypc = window.MyPC;
      const gp = mypc?.gamepad;
      const map = mappingRef.current;
      const keyMap = map.keys || createDefaultControllerMapping(map.layoutStyle).keys;
      const dz = map.deadzone;
      const keys = keysDownRef.current;

      let rawPad: Gamepad | null = null;
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        try {
          const pads = navigator.getGamepads();
          for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i]!.connected) {
              rawPad = pads[i];
              break;
            }
          }
        } catch {
          rawPad = null;
        }
      }

      const readAxis = (idx: number): number => {
        const sdkVal = gp ? gp.axis(idx) : 0;
        const w3cVal = rawPad && rawPad.axes[idx] !== undefined ? rawPad.axes[idx] : 0;
        return Math.abs(w3cVal) > Math.abs(sdkVal) ? w3cVal : sdkVal;
      };

      const isBtnPressed = (idx: number): boolean => {
        const sdkPressed = gp ? gp.pressed(idx) : false;
        const w3cBtn = rawPad && rawPad.buttons[idx];
        const w3cPressed = w3cBtn
          ? typeof w3cBtn === 'object'
            ? w3cBtn.pressed || w3cBtn.value > 0.5
            : Boolean(w3cBtn)
          : false;
        return sdkPressed || w3cPressed;
      };

      const readBtnValue = (idx: number): number => {
        const sdkVal = gp ? gp.value(idx) : 0;
        const w3cBtn = rawPad && rawPad.buttons[idx];
        const w3cVal = w3cBtn && typeof w3cBtn === 'object' ? w3cBtn.value : 0;
        return Math.max(sdkVal, w3cVal, isBtnPressed(idx) ? 1 : 0);
      };

      for (let b = 0; b < 18; b++) {
        const pressedNow = isBtnPressed(b);
        const wasPressed = prevButtonsRef.current[b];
        prevButtonsRef.current[b] = pressedNow;
        if (pressedNow && !wasPressed) {
          handleGamepadButtonEvent(
            b,
            true,
            readBtnValue(b),
            rawPad ? `pad${rawPad.index}` : 'pad0',
            gp?.name?.(b) || `Button${b}`
          );
        }
      }

      const rawAx0 = readAxis(0);
      const rawAx1 = readAxis(1);
      const rawAx2 = readAxis(2);
      const rawAx3 = readAxis(3);

      const stickUp = rawAx1 < -0.58;
      const stickDown = rawAx1 > 0.58;
      const stickLeft = rawAx0 < -0.58;
      const stickRight = rawAx0 > 0.58;

      if (gameStateRef.current === 'title' || settingsOpenRef.current) {
        if (stickUp && !prevStickDirRef.current.up) navigateTitleOrModal('up');
        if (stickDown && !prevStickDirRef.current.down) navigateTitleOrModal('down');
        if (stickLeft && !prevStickDirRef.current.left) navigateTitleOrModal('left');
        if (stickRight && !prevStickDirRef.current.right) navigateTitleOrModal('right');
      }
      prevStickDirRef.current.up = stickUp;
      prevStickDirRef.current.down = stickDown;
      prevStickDirRef.current.left = stickLeft;
      prevStickDirRef.current.right = stickRight;

      let sx = applyStickDeadzone(rawAx0, dz);
      let sy = -applyStickDeadzone(rawAx1, dz);
      let rx = applyStickDeadzone(rawAx2, dz);
      const ry = (map.invertLookY ? 1 : -1) * applyStickDeadzone(rawAx3, dz);

      const inCar = Boolean(worldRef.current?.isInVehicle());

      if (inCar) {
        const steerLeftKey = keys.has(keyMap.carSteerLeft || 'KeyA') || keys.has('ArrowLeft');
        const steerRightKey = keys.has(keyMap.carSteerRight || 'KeyD') || keys.has('ArrowRight');
        const gasKey = keys.has(keyMap.carAccelerate || 'KeyW') || keys.has('ArrowUp');
        const brakeKey = keys.has(keyMap.carBrakeReverse || 'KeyS') || keys.has('ArrowDown');

        if (mypc?.isDown('left') || isBtnPressed(map.buttons.carSteerLeft) || steerLeftKey) sx = -1;
        if (mypc?.isDown('right') || isBtnPressed(map.buttons.carSteerRight) || steerRightKey) sx = 1;
        if (mypc?.isDown('up') || gasKey) sy = 1;
        if (mypc?.isDown('down') || brakeKey) sy = -1;

        stepInput.moveX = sx * map.steerSensitivity;
        stepInput.moveY = sy;
        stepInput.lookX = rx;
        stepInput.lookY = ry;

        stepInput.accelerate = Math.max(
          readBtnValue(map.buttons.carAccelerate),
          mypc?.isDown('up') || mypc?.isDown('jump') || gasKey ? 1 : 0,
          sy > 0.15 ? sy : 0
        );
        stepInput.brake = Math.max(
          readBtnValue(map.buttons.carBrakeReverse),
          mypc?.isDown('down') || brakeKey ? 1 : 0,
          sy < -0.15 ? -sy : 0
        );
        stepInput.handbrake = !!(
          isBtnPressed(map.buttons.carHandbrake) ||
          mypc?.isDown('run') ||
          keys.has(keyMap.carHandbrake || 'Space')
        );
        stepInput.sprint = !!(
          isBtnPressed(map.buttons.carNitroBoost) ||
          keys.has(keyMap.carNitroBoost || 'ShiftLeft') ||
          keys.has('ShiftRight')
        );
      } else {
        const leftKey = keys.has(keyMap.footMoveLeft || 'KeyA') || keys.has('ArrowLeft');
        const rightKey = keys.has(keyMap.footMoveRight || 'KeyD') || keys.has('ArrowRight');
        const fwdKey = keys.has(keyMap.footMoveForward || 'KeyW') || keys.has('ArrowUp');
        const backKey = keys.has(keyMap.footMoveBackward || 'KeyS') || keys.has('ArrowDown');

        if (mypc?.isDown('left') || isBtnPressed(map.buttons.footMoveLeft) || leftKey) sx = -1;
        if (mypc?.isDown('right') || isBtnPressed(map.buttons.footMoveRight) || rightKey) sx = 1;
        if (mypc?.isDown('up') || isBtnPressed(map.buttons.footMoveForward) || fwdKey) sy = 1;
        if (mypc?.isDown('down') || isBtnPressed(map.buttons.footMoveBackward) || backKey) sy = -1;

        stepInput.moveX = sx * map.steerSensitivity;
        stepInput.moveY = sy;
        stepInput.lookX = rx;
        stepInput.lookY = ry;
        stepInput.accelerate = 0;
        stepInput.brake = 0;
        stepInput.handbrake = false;
        stepInput.sprint = !!(
          isBtnPressed(map.buttons.footSprint) ||
          mypc?.isDown('run') ||
          keys.has(keyMap.footSprint || 'ShiftLeft') ||
          keys.has('ShiftRight')
        );
      }
    };

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      if (!lastTs) lastTs = ts;
      const rawDeltaMs = Math.min(35, ts - lastTs);
      lastTs = ts;
      accumMs = Math.min(STEP_MS * 2, accumMs + rawDeltaMs);

      pollGamepadsAndKeyboard();
      while (accumMs >= STEP_MS) {
        if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
          world.step(1 / 60, 'playing', stepInput);
          audioRef.current.tickRadio();
        } else if (gameStateRef.current === 'title') {
          world.step(1 / 60, 'title', stepInput);
        }
        accumMs -= STEP_MS;
      }

      const minFrameInterval = graphicsRef.current.fpsCap === 30 ? 31 : 0;
      if (ts - lastRenderTs >= minFrameInterval) {
        const renderDt = Math.max(0.001, (ts - lastRenderTs) / 1000);
        lastRenderTs = ts;
        world.renderFrame(renderDt);
      }

      hudSyncAccum += rawDeltaMs;
      if (hudSyncAccum >= 165) {
        hudSyncAccum = 0;
        setHudSnapshot(world.getHudSnapshot());
        if (
          settingsOpenRef.current &&
          typeof navigator !== 'undefined' &&
          typeof navigator.getGamepads === 'function'
        ) {
          try {
            const p = navigator.getGamepads()[0];
            if (p && p.connected) {
              setLiveAxes([p.axes[0] || 0, p.axes[1] || 0, p.axes[2] || 0, p.axes[3] || 0]);
            }
          } catch {
            // Ignore
          }
        }
      }
    };

    const startLoop = () => {
      if (!rafId) {
        lastTs = 0;
        accumMs = 0;
        rafId = requestAnimationFrame(frame);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    let unsubBtn: (() => void) | undefined;
    let unsubAxes: (() => void) | undefined;
    let unsubPads: (() => void) | undefined;

    if (window.MyPC?.gamepad) {
      unsubBtn = window.MyPC.gamepad.on('button', handleGamepadButtonEvent);
      unsubAxes = window.MyPC.gamepad.on('axes', (axes: ArrayLike<number>) => {
        setLiveAxes([axes[0] || 0, axes[1] || 0, axes[2] || 0, axes[3] || 0]);
      });
      unsubPads = window.MyPC.gamepad.on('pads', () => {
        refreshConnectedPads();
      });
      refreshConnectedPads();
    }

    // Always start the 60Hz 3D WebGL render loop immediately so the 3D Tangier world renders right away
    startLoop();

    if (window.MyPC) {
      window.MyPC.init({
        ownMenu: true,
        onInit: (info) => {
          window.MyPC?.progress(0.4);
          const detectedLang = (
            ['en', 'fr', 'es', 'ar'].includes(info.lang) ? info.lang : 'en'
          ) as LanguageCode;
          setLang(detectedLang);

          const savedGfx = window.MyPC?.load<GraphicsSettings | null>(SAVE_KEY_GRAPHICS, null);
          const initialGfx =
            savedGfx &&
            typeof savedGfx.renderScale === 'number' &&
            typeof savedGfx.logicalResolution === 'string'
              ? {
                  ...savedGfx,
                  textSize: savedGfx.textSize || 'normal',
                  hudVisibility: getResolvedHudVisibility(savedGfx),
                }
              : getPresetForMyPCTier(info.quality?.tier);
          graphicsRef.current = initialGfx;
          setGraphics(initialGfx);
          world.applyGraphicsSettings(initialGfx);

          const savedCtrl = window.MyPC?.load<ControllerMapping | null>(SAVE_KEY_CONTROLLER, null);
          if (savedCtrl && savedCtrl.buttons) {
            const defCtrl = createDefaultControllerMapping(savedCtrl.layoutStyle);
            const merged: ControllerMapping = {
              ...defCtrl,
              ...savedCtrl,
              buttons: { ...defCtrl.buttons, ...savedCtrl.buttons },
              keys: { ...defCtrl.keys, ...(savedCtrl.keys || {}) },
            };
            mappingRef.current = merged;
            setControllerMapping(merged);
          }

          const rawSave = window.MyPC?.load<unknown>(SAVE_KEY_PROGRESS, null);
          const validSave = validateSavedProgress(rawSave);
          if (validSave) {
            savedProgressRef.current = validSave;
            setSavedProgress(validSave);
          }

          const cfgTracks = window.MyPC?.app_config?.radioTracks;
          if (Array.isArray(cfgTracks)) {
            for (let i = 0; i < cfgTracks.length; i++) {
              const item = cfgTracks[i] as { title?: string; artist?: string; url?: string };
              if (item && typeof item.url === 'string') {
                audioRef.current.addCustomTrack(
                  item.title || `Track ${i + 1}`,
                  item.artist || 'Tangier FM',
                  item.url
                );
              }
            }
            setRadioTracks([...audioRef.current.getTracks()]);
          }

          window.MyPC?.setMenu([
            { id: 'map', label: 'Tangier World Map' },
            { id: 'missions', label: 'Missions Screen' },
            { id: 'controls', label: 'Controls Mapping' },
            { id: 'save', label: 'Save Progress' },
            { id: 'title', label: 'Return to Title Screen' },
          ]);

          window.MyPC?.progress(1.0);
          window.MyPC?.ready();
          startLoop();
        },
        onStart: () => {
          window.focus();
          audioRef.current.start(window.MyPC?.info()?.volume);
          startLoop();

          if (
            typeof window !== 'undefined' &&
            new URLSearchParams(window.location.search).get('autostart') === '1'
          ) {
            handleStartNewGame();
          }
        },
        onPause: () => {
          stopLoop();
          audioRef.current.pause();
        },
        onResume: () => {
          window.focus();
          audioRef.current.resume();
          startLoop();
        },
        onDestroy: () => {
          stopLoop();
          audioRef.current.destroy();
          world.dispose();
        },
        onVolume: (v) => {
          audioRef.current.setVolumes(v);
        },
        onMenu: (id) => {
          if (id === 'save') {
            persistProgressNow();
          } else if (id === 'map') {
            handleOpenHub('map');
          } else if (id === 'missions') {
            handleOpenHub('missions');
          } else if (id === 'controls' || id === 'settings') {
            handleOpenHub('controls');
          } else if (id === 'title') {
            handleReturnToTitle();
          }
        },
        onInput: (action, pressed, repeat) => {
          if (!pressed) return;

          if (gameStateRef.current === 'title' && !settingsOpenRef.current) {
            if (action === 'up' || action === 'left') {
              navigateTitleOrModal('up');
            } else if (action === 'down' || action === 'right') {
              navigateTitleOrModal('down');
            } else if (action === 'confirm' || action === 'jump') {
              if (!repeat) navigateTitleOrModal('confirm');
            } else if (action === 'menu') {
              handleOpenHub('map');
            }
            return;
          }

          if (settingsOpenRef.current) {
            if (action === 'cancel' || action === 'menu') {
              handleCloseSettings();
            } else if (action === 'up' || action === 'left') {
              navigateTitleOrModal('up');
            } else if (action === 'down' || action === 'right') {
              navigateTitleOrModal('down');
            } else if ((action === 'confirm' || action === 'jump') && !repeat) {
              navigateTitleOrModal('confirm');
            }
            return;
          }

          if (gameStateRef.current === 'playing' && !repeat) {
            if (action === 'confirm') {
              handleToggleEnterExitCar();
            } else if (action === 'cancel' || action === 'menu') {
              handleOpenHub('map');
            }
          }
        },
      });
    }

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('gamepadconnected', refreshConnectedPads);
      window.removeEventListener('gamepaddisconnected', refreshConnectedPads);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      unsubBtn?.();
      unsubAxes?.();
      unsubPads?.();
      stopLoop();
      audioRef.current.destroy();
      world.dispose();
    };
  }, []);

  const activeTrack = radioTracks[currentStationIdx] || DEFAULT_RADIO_TRACKS[0];

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#061526] select-none">
      {/* Isolated Three.js WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        data-testid="solara-webgl-canvas"
        className="fixed inset-0 w-full h-full z-0"
      />

      {/* Title Screen Overlay over Live 3D Tangier Aerial Tour */}
      {gameState === 'title' && !settingsOpen && hudSnapshot && (
        <TitleScreen
          lang={lang}
          savedProgress={savedProgress}
          focusedIndex={menuFocusIdx}
          setFocusedIndex={(idx) => {
            menuFocusIdxRef.current = idx;
            setMenuFocusIdx(idx);
          }}
          onStartNewGame={handleStartNewGame}
          onContinueGame={handleContinueGame}
          onOpenHub={handleOpenHub}
          graphics={graphics}
          onChangeTextSize={handleChangeTextSize}
          connectedPads={connectedPads}
          controllerMapping={controllerMapping}
          telemetry={hudSnapshot.telemetry}
        />
      )}

      {/* Active Playing HUD with Top Compass Arrow & Rotating Road Mini-Map */}
      {(gameState === 'playing' || gameState === 'paused') && hudSnapshot && (
        <GameHud
          snapshot={hudSnapshot}
          currentTrack={activeTrack}
          controllerMapping={controllerMapping}
          graphics={graphics}
          radarZoomed={radarZoomed}
          onToggleRadarZoom={() => setRadarZoomed((z) => !z)}
          onToggleEnterExitCar={handleToggleEnterExitCar}
          onNextRadioStation={handleNextRadioStation}
          onTriggerAction={() => worldRef.current?.performAttackOrHorn()}
          onOpenHub={handleOpenHub}
          onFastTravelToZone={handleFastTravelToZone}
        />
      )}

      {/* Unified Command Hub: World Map, Missions, Context-Tabbed Controls, Text Size & Radio */}
      {settingsOpen && hudSnapshot && (
        <SettingsModal
          lang={lang}
          initialTab={hubInitialTab}
          isFromPause={gameState === 'paused'}
          snapshot={hudSnapshot}
          graphics={graphics}
          onChangeGraphics={handleUpdateGraphics}
          controllerMapping={controllerMapping}
          onChangeControllerMapping={handleUpdateControllerMapping}
          listeningAction={listeningAction}
          setListeningAction={setListeningAction}
          listeningKeyAction={listeningKeyAction}
          setListeningKeyAction={setListeningKeyAction}
          lastDetectedButton={lastDetectedButton}
          liveAxes={liveAxes}
          connectedPads={connectedPads}
          radioTracks={radioTracks}
          currentStationIndex={currentStationIdx}
          onSelectStation={handleSelectStation}
          onAddCustomTrack={handleAddCustomTrack}
          onSelectMission={handleSelectMission}
          onSetCustomWaypoint={handleSetCustomWaypoint}
          onFastTravelToZone={handleFastTravelToZone}
          telemetry={hudSnapshot.telemetry}
          onSaveProgress={persistProgressNow}
          onClose={handleCloseSettings}
          onReturnToTitle={gameState === 'paused' ? handleReturnToTitle : undefined}
          onSimulateGamepadButton={(btnIdx) =>
            handleGamepadButtonEvent(
              btnIdx,
              true,
              1,
              'pad0',
              window.MyPC?.gamepad?.name(btnIdx) || `Button${btnIdx}`
            )
          }
        />
      )}
    </main>
  );
}
