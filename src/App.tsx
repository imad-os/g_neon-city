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

  const handleGamepadButtonEvent = (
    index: number,
    pressed: boolean,
    _value: number,
    dev: string,
    name: string
  ) => {
    if (!pressed) return;
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
    if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
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
      } else if (index === btns.pauseMenu) {
        handleOpenSettings();
      }
    } else if (index === btns.pauseMenu && settingsOpenRef.current) {
      handleCloseSettings();
    }
  };

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

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

    // Full Keyboard Support (WASD, Arrows, F/Enter, R, C, E/H, M, F5, Esc/P)
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      keysDownRef.current.add(e.code);
      if (e.repeat) return;

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (settingsOpenRef.current) {
          handleCloseSettings();
        } else {
          handleOpenSettings();
        }
        return;
      }

      if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
        if (e.code === 'KeyF' || e.code === 'Enter') {
          e.preventDefault();
          handleToggleEnterExitCar();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          handleNextRadioStation();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          world.cycleCameraView();
        } else if (e.code === 'KeyE' || e.code === 'KeyH' || e.code === 'KeyG') {
          e.preventDefault();
          world.performAttackOrHorn();
        } else if (e.code === 'KeyM' || e.code === 'Tab') {
          e.preventDefault();
          setRadarZoomed((z) => !z);
        } else if (e.code === 'F5' || e.code === 'KeyK') {
          e.preventDefault();
          persistProgressNow();
          world.triggerBanner('PROGRESS SAVED TO MY PC PROFILE', 2.2);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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

    const readControllerKeyboardAndSDKInput = () => {
      const mypc = window.MyPC;
      const gp = mypc?.gamepad;
      const map = mappingRef.current;
      const dz = map.deadzone;
      const keys = keysDownRef.current;

      let sx = gp ? applyStickDeadzone(gp.axis(0), dz) : 0;
      let sy = gp ? -applyStickDeadzone(gp.axis(1), dz) : 0;
      const rx = gp ? applyStickDeadzone(gp.axis(2), dz) : 0;
      const ry = gp
        ? (map.invertLookY ? 1 : -1) * applyStickDeadzone(gp.axis(3), dz)
        : 0;

      const keyLeft = keys.has('KeyA') || keys.has('ArrowLeft');
      const keyRight = keys.has('KeyD') || keys.has('ArrowRight');
      const keyUp = keys.has('KeyW') || keys.has('ArrowUp');
      const keyDown = keys.has('KeyS') || keys.has('ArrowDown');

      if (mypc?.isDown('left') || gp?.pressed(14) || keyLeft) sx = -1;
      if (mypc?.isDown('right') || gp?.pressed(15) || keyRight) sx = 1;
      if (mypc?.isDown('up') || gp?.pressed(12) || keyUp) sy = 1;
      if (mypc?.isDown('down') || gp?.pressed(13) || keyDown) sy = -1;

      stepInput.moveX = sx * map.steerSensitivity;
      stepInput.moveY = sy;
      stepInput.lookX = rx;
      stepInput.lookY = ry;

      const accelBtn = map.buttons.accelerate;
      const brakeBtn = map.buttons.brake;
      stepInput.accelerate = Math.max(
        gp ? gp.value(accelBtn) : 0,
        gp?.pressed(accelBtn) ? 1 : 0,
        mypc?.isDown('up') || mypc?.isDown('jump') || keyUp ? 1 : 0
      );
      stepInput.brake = Math.max(
        gp ? gp.value(brakeBtn) : 0,
        gp?.pressed(brakeBtn) ? 1 : 0,
        mypc?.isDown('down') || keyDown ? 1 : 0
      );
      stepInput.handbrake = !!(
        gp?.pressed(map.buttons.handbrake) ||
        mypc?.isDown('run') ||
        keys.has('Space')
      );
      stepInput.sprint = !!(
        gp?.pressed(map.buttons.sprint) ||
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
        if (gameStateRef.current === 'playing' && !settingsOpenRef.current) {
          readControllerKeyboardAndSDKInput();
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
      unsubPads = window.MyPC.gamepad.on('pads', (list: MyPCGamepadPadInfo[]) => {
        setConnectedPads(list);
      });
      setConnectedPads(window.MyPC.gamepad.pads());
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
            const count = savedProgressRef.current ? 3 : 2;
            if (action === 'up') {
              menuFocusIdxRef.current = (menuFocusIdxRef.current - 1 + count) % count;
              setMenuFocusIdx(menuFocusIdxRef.current);
              audioRef.current.playSfx('menuMove');
            } else if (action === 'down') {
              menuFocusIdxRef.current = (menuFocusIdxRef.current + 1) % count;
              setMenuFocusIdx(menuFocusIdxRef.current);
              audioRef.current.playSfx('menuMove');
            } else if (action === 'confirm' || action === 'jump') {
              if (repeat) return;
              const idx = menuFocusIdxRef.current;
              if (savedProgressRef.current) {
                if (idx === 0) handleContinueGame();
                else if (idx === 1) handleStartNewGame();
                else handleOpenSettings();
              } else {
                if (idx === 0) handleStartNewGame();
                else handleOpenSettings();
              }
            } else if (action === 'menu') {
              handleOpenSettings();
            }
            return;
          }

          if (settingsOpenRef.current) {
            if (action === 'cancel' || action === 'menu') {
              handleCloseSettings();
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
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
