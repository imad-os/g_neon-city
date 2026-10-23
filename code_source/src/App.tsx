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
  normalizeKeyboardCode,
  remapControllerAction,
  validateSavedProgress,
} from './game/rules.ts';
import type {
  ControllerMapping,
  GameActionId,
  GameState,
  GraphicsSettings,
  LanguageCode,
  MyPCGamepadPadInfo,
  RadioTrack,
  SavedProgress,
} from './game/types.ts';
import { SolaraWorld3D, type WorldHudSnapshot } from './game/world3d.ts';

const SAVE_KEY_PROGRESS = 'neon_city_save_v1';
const SAVE_KEY_GRAPHICS = 'neon_city_graphics_v2';
const SAVE_KEY_CONTROLLER = 'neon_city_controller_v1';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<SolaraWorld3D | null>(null);
  const audioRef = useRef<SolaraAudioEngine>(new SolaraAudioEngine());

  // Mutable refs for 60Hz loop so React renders never recreate the loop
  const gameStateRef = useRef<GameState>('title');
  const settingsOpenRef = useRef<boolean>(false);
  const graphicsRef = useRef<GraphicsSettings>(getPresetForMyPCTier('mid'));
  const mappingRef = useRef<ControllerMapping>(createDefaultControllerMapping('switch'));
  const listeningActionRef = useRef<GameActionId | null>(null);
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

  // React UI state (synced at <= 10Hz during gameplay)
  const [lang, setLang] = useState<LanguageCode>('en');
  const [gameState, setGameState] = useState<GameState>('title');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [menuFocusIdx, setMenuFocusIdx] = useState<number>(0);
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);
  const [graphics, setGraphics] = useState<GraphicsSettings>(() => getPresetForMyPCTier('mid'));
  const [controllerMapping, setControllerMapping] = useState<ControllerMapping>(() =>
    createDefaultControllerMapping('switch')
  );
  const [listeningAction, setListeningActionState] = useState<GameActionId | null>(null);
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

  const setListeningAction = (act: GameActionId | null) => {
    listeningActionRef.current = act;
    setListeningActionState(act);
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
    worldRef.current?.applyGraphicsSettings(next);
    window.MyPC?.save(SAVE_KEY_GRAPHICS, next);
    if (worldRef.current) {
      setHudSnapshot(worldRef.current.getHudSnapshot());
    }
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
        : 500;
    const fresh = createInitialProgress(startingCash);
    worldRef.current?.loadFromSavedProgress(fresh);
    audioRef.current.start(window.MyPC?.info()?.volume);
    audioRef.current.setInCar(false);
    audioRef.current.playSfx('menuSelect');
    settingsOpenRef.current = false;
    setSettingsOpen(false);
    syncBodyState('playing', false);
    if (worldRef.current) {
      worldRef.current.triggerBanner(
        'WELCOME TO SOLARA BAY 1988 — TAKE ANY CAR ON OCEAN DRIVE!',
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
        `PROGRESS RESTORED · $${existing.cash.toLocaleString()} · MISSION ${existing.currentMissionIndex + 1}`,
        3.5
      );
      setHudSnapshot(worldRef.current.getHudSnapshot());
    } else {
      handleStartNewGame();
    }
  };

  const handleOpenSettings = () => {
    audioRef.current.playSfx('menuSelect');
    settingsOpenRef.current = true;
    setSettingsOpen(true);
    if (gameStateRef.current === 'playing') {
      syncBodyState('paused', true);
    }
  };

  const handleCloseSettings = () => {
    audioRef.current.playSfx('menuSelect');
    setListeningAction(null);
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
      const count = savedProgressRef.current ? 3 : 2;
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
          else handleOpenSettings();
        } else {
          if (idx === 0) handleStartNewGame();
          else handleOpenSettings();
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

    // 1. Settings / Pause Modal Navigation via Controller
    if (settingsOpenRef.current) {
      if (index === btns.pauseMenu || index === 9) {
        handleCloseSettings();
      } else if (index === 4 || index === 5) {
        // L / R Shoulder buttons cycle modal tabs
        const tabs = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-modal-tab]')
        );
        if (tabs.length > 0) {
          const activeIdx = tabs.findIndex((el) =>
            el.className.includes('shadow-[0_0_20px')
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
      } else if (index === 0 || index === 1 || index === 9 || index === btns.enterExitCar) {
        navigateTitleOrModal('confirm');
      } else if (index === 8 || index === btns.pauseMenu) {
        handleOpenSettings();
      }
      return;
    }

    // 3. Active 3D Gameplay Actions via Controller
    if (gameStateRef.current === 'playing') {
      if (index === btns.enterExitCar) {
        handleToggleEnterExitCar();
      } else if (index === btns.nextRadio) {
        handleNextRadioStation();
      } else if (index === btns.attackFire || index === btns.hornSiren) {
        worldRef.current?.performAttackOrHorn();
      } else if (index === btns.cameraView) {
        worldRef.current?.cycleCameraView();
      } else if (index === btns.radarZoom) {
        setRadarZoomed((z) => !z);
      } else if (index === btns.nextWeapon) {
        persistProgressNow();
        worldRef.current?.triggerBanner('PROGRESS SAVED TO MY PC PROFILE', 2.2);
      } else if (index === btns.pauseMenu || index === 9) {
        handleOpenSettings();
      }
    }
  };

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // Ensure iframe has keyboard focus immediately and whenever clicked/touched
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
        world.triggerBanner('BUSTED BY SCPD! -$200 BAIL · RELEASED AT PRECINCT', 4.0);
        audioRef.current.playSfx('siren');
        persistProgressNow();
      } else if (ev === 'wasted') {
        world.triggerBanner('WASTED · PATCHED UP AT SOLARA BAY CLINIC', 4.0);
        audioRef.current.playSfx('hit');
      } else {
        audioRef.current.playSfx(ev);
      }
    });
    worldRef.current = world;
    setHudSnapshot(world.getHudSnapshot());

    const onResize = () => world.resize();
    window.addEventListener('resize', onResize);

    // Sync connected gamepads from both MyPC.gamepad and browser navigator.getGamepads()
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
          // Ignore security errors in restricted contexts
        }
      }
      setConnectedPads(list);
    };

    window.addEventListener('gamepadconnected', refreshConnectedPads);
    window.addEventListener('gamepaddisconnected', refreshConnectedPads);
    refreshConnectedPads();

    // Full Keyboard Support (QWERTY WASD, AZERTY ZQSD, Arrows, F/Enter, Space, Shift, R, C, E/H/G, M/Tab, F5/K, Esc/P)
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
        normCode === 'Space'
      ) {
        // Prevent page scrolling inside iframe
        if (!(e.target instanceof HTMLButtonElement && normCode === 'Space' && settingsOpenRef.current)) {
          e.preventDefault();
        }
      }

      if (e.repeat) return;

      // Cancel controller remap listening first on Escape
      if (normCode === 'Escape' && listeningActionRef.current) {
        e.preventDefault();
        setListeningAction(null);
        return;
      }

      // Pause / Options toggle
      if (normCode === 'Escape' || normCode === 'KeyP') {
        e.preventDefault();
        if (settingsOpenRef.current) {
          handleCloseSettings();
        } else {
          handleOpenSettings();
        }
        return;
      }

      // Title Screen Keyboard Navigation
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
        }
        return;
      }

      // Active 3D Gameplay Keyboard Shortcuts
      if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
        if (normCode === 'KeyF' || normCode === 'Enter') {
          e.preventDefault();
          handleToggleEnterExitCar();
        } else if (normCode === 'KeyR') {
          e.preventDefault();
          handleNextRadioStation();
        } else if (normCode === 'KeyC' || normCode === 'KeyV') {
          e.preventDefault();
          world.cycleCameraView();
        } else if (normCode === 'KeyE' || normCode === 'KeyH' || normCode === 'KeyG') {
          e.preventDefault();
          world.performAttackOrHorn();
        } else if (normCode === 'KeyM' || normCode === 'Tab') {
          e.preventDefault();
          setRadarZoomed((z) => !z);
        } else if (normCode === 'F5' || normCode === 'KeyK') {
          e.preventDefault();
          persistProgressNow();
          world.triggerBanner('PROGRESS SAVED TO MY PC PROFILE', 2.2);
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

    // Fixed 60Hz loop state (Zero allocations per frame)
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

    // Polls both window.MyPC.gamepad AND native W3C navigator.getGamepads() at 60Hz
    const pollGamepadsAndKeyboard = () => {
      const mypc = window.MyPC;
      const gp = mypc?.gamepad;
      const map = mappingRef.current;
      const dz = map.deadzone;
      const keys = keysDownRef.current;

      // Read first active W3C Gamepad if available
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

      // Edge-detect all 18 controller buttons so physical gamepads work everywhere
      // (Title screen, Options modal remapping, and Gameplay)
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

      // Edge-detect Left Stick for Title Screen & Options Modal navigation
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

      const keyLeft = keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft');
      const keyRight = keys.has('KeyD') || keys.has('ArrowRight');
      const keyUp = keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp');
      const keyDown = keys.has('KeyS') || keys.has('ArrowDown');

      if (mypc?.isDown('left') || isBtnPressed(14) || keyLeft) sx = -1;
      if (mypc?.isDown('right') || isBtnPressed(15) || keyRight) sx = 1;
      if (mypc?.isDown('up') || isBtnPressed(12) || keyUp) sy = 1;
      if (mypc?.isDown('down') || isBtnPressed(13) || keyDown) sy = -1;

      if (keys.has('KeyJ')) rx = -0.85;
      if (keys.has('KeyL')) rx = 0.85;

      stepInput.moveX = sx * map.steerSensitivity;
      stepInput.moveY = sy;
      stepInput.lookX = rx;
      stepInput.lookY = ry;

      const accelBtn = map.buttons.accelerate;
      const brakeBtn = map.buttons.brake;
      stepInput.accelerate = Math.max(
        readBtnValue(accelBtn),
        mypc?.isDown('up') || mypc?.isDown('jump') || keyUp ? 1 : 0,
        sy > 0.15 ? sy : 0
      );
      stepInput.brake = Math.max(
        readBtnValue(brakeBtn),
        mypc?.isDown('down') || keyDown ? 1 : 0,
        sy < -0.15 ? -sy : 0
      );
      stepInput.handbrake = !!(
        isBtnPressed(map.buttons.handbrake) ||
        mypc?.isDown('run') ||
        keys.has('Space')
      );
      stepInput.sprint = !!(
        isBtnPressed(map.buttons.sprint) ||
        mypc?.isDown('run') ||
        keys.has('ShiftLeft') ||
        keys.has('ShiftRight') ||
        keys.has('Space')
      );
    };

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      if (!lastTs) lastTs = ts;
      const rawDeltaMs = Math.min(250, ts - lastTs);
      lastTs = ts;
      accumMs += rawDeltaMs;

      while (accumMs >= STEP_MS) {
        pollGamepadsAndKeyboard();
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
      if (hudSyncAccum >= 125) {
        hudSyncAccum = 0;
        setHudSnapshot(world.getHudSnapshot());
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
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

    // Dedicated 40ms gamepad poller so controller navigation & button remapping
    // respond immediately even when the game is paused or software WebGL is busy
    const gamepadTimerId = window.setInterval(() => {
      pollGamepadsAndKeyboard();
    }, 40);

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
              ? savedGfx
              : getPresetForMyPCTier(info.quality?.tier);
          graphicsRef.current = initialGfx;
          setGraphics(initialGfx);
          world.applyGraphicsSettings(initialGfx);

          const savedCtrl = window.MyPC?.load<ControllerMapping | null>(SAVE_KEY_CONTROLLER, null);
          if (savedCtrl && savedCtrl.buttons) {
            mappingRef.current = savedCtrl;
            setControllerMapping(savedCtrl);
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
                  item.artist || 'Solara FM',
                  item.url
                );
              }
            }
            setRadioTracks([...audioRef.current.getTracks()]);
          }

          window.MyPC?.setMenu([
            { id: 'save', label: 'Save Progress' },
            { id: 'settings', label: 'Options & Controls Deck' },
            { id: 'title', label: 'Return to Title Screen' },
          ]);

          window.MyPC?.progress(1.0);
          window.MyPC?.ready();
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
          } else if (id === 'settings') {
            handleOpenSettings();
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
              handleOpenSettings();
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
              handleOpenSettings();
            }
          }
        },
      });
    } else {
      startLoop();
    }

    return () => {
      window.clearInterval(gamepadTimerId);
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
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0618] select-none">
      {/* Isolated Three.js WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        data-testid="solara-webgl-canvas"
        className="fixed inset-0 w-full h-full z-0"
      />

      {/* Title Screen Overlay over Live 3D Solara Bay Aerial Camera Tour */}
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
          onOpenSettings={handleOpenSettings}
          connectedPads={connectedPads}
          controllerMapping={controllerMapping}
          telemetry={hudSnapshot.telemetry}
        />
      )}

      {/* Active Playing HUD */}
      {(gameState === 'playing' || gameState === 'paused') && hudSnapshot && (
        <GameHud
          snapshot={hudSnapshot}
          currentTrack={activeTrack}
          controllerMapping={controllerMapping}
          graphics={graphics}
          radarZoomed={radarZoomed}
          onToggleEnterExitCar={handleToggleEnterExitCar}
          onNextRadioStation={handleNextRadioStation}
          onTriggerAction={() => worldRef.current?.performAttackOrHorn()}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {/* 1988 Arcade Pause & Options Deck */}
      {settingsOpen && hudSnapshot && (
        <SettingsModal
          lang={lang}
          isFromPause={gameState === 'paused'}
          graphics={graphics}
          onChangeGraphics={handleUpdateGraphics}
          controllerMapping={controllerMapping}
          onChangeControllerMapping={handleUpdateControllerMapping}
          listeningAction={listeningAction}
          setListeningAction={setListeningAction}
          lastDetectedButton={lastDetectedButton}
          liveAxes={liveAxes}
          connectedPads={connectedPads}
          radioTracks={radioTracks}
          currentStationIndex={currentStationIdx}
          onSelectStation={handleSelectStation}
          onAddCustomTrack={handleAddCustomTrack}
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
