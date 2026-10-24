import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPHICS_PRESETS,
  VEHICLE_SPECS,
  applyStickDeadzone,
  clampWorldPosition,
  createDefaultControllerMapping,
  createInitialProgress,
  estimateGraphicsFootprint,
  getButtonLabel,
  getDistrictAt,
  getLogicalDimensions,
  getResolvedHudVisibility,
  pickTrafficVehicleSpec,
  remapControllerAction,
  resolveCircleBuildingCollisions,
  stepVehiclePhysics,
  validateSavedProgress,
} from './rules.ts';

test('Graphics presets scale from 1GB TV Eco up to Ultra (50k) and Super (100k) polygons', () => {
  const eco = estimateGraphicsFootprint(GRAPHICS_PRESETS['1gb-tv-eco']);
  const high = estimateGraphicsFootprint(GRAPHICS_PRESETS['solara-high']);
  const ultra = estimateGraphicsFootprint(GRAPHICS_PRESETS['solara-ultra-50k']);
  const superPreset = estimateGraphicsFootprint(GRAPHICS_PRESETS['solara-super-100k']);

  assert.equal(eco.budgetStatus, 'ultra-safe');
  assert.ok(eco.estimatedTriangles < high.estimatedTriangles);
  assert.ok(ultra.estimatedTriangles >= 48000 && ultra.estimatedTriangles <= 62000);
  assert.ok(superPreset.estimatedTriangles >= 95000);

  const dims540 = getLogicalDimensions('960x540');
  assert.equal(dims540.width, 960);
  assert.equal(dims540.height, 540);
});

test('Citroën C3 2019 (White / Red Roof) is the primary vehicle and very common in traffic', () => {
  const c3 = VEHICLE_SPECS[0];
  assert.equal(c3.id, 'citroen-c3-2019');
  assert.equal(c3.primaryColor, 0xf8fafc);
  assert.equal(c3.secondaryColor, 0xdc2626);
  assert.equal(pickTrafficVehicleSpec(0).id, 'citroen-c3-2019');
  assert.equal(pickTrafficVehicleSpec(2).id, 'citroen-c3-2019');
});

test('HUD visibility settings resolve all 12 toggles cleanly', () => {
  const hud = getResolvedHudVisibility(GRAPHICS_PRESETS['solara-high']);
  assert.equal(hud.masterHud, true);
  assert.equal(hud.minimap, true);
  assert.equal(hud.speedometer, true);
});

test('Nintendo Switch controller mapping resolves button labels and remaps cleanly', () => {
  const mapping = createDefaultControllerMapping('switch');
  assert.equal(getButtonLabel(0, 'switch'), 'B (Bottom)');
  assert.equal(getButtonLabel(1, 'switch'), 'A (Right)');
  assert.equal(getButtonLabel(7, 'switch'), 'ZR Trigger');

  const updated = remapControllerAction(mapping, 'accelerate', 0);
  assert.equal(updated.buttons.accelerate, 0);
  assert.equal(mapping.buttons.accelerate, 7, 'original mapping remains immutable');
});

test('analog stick deadzone filters drift and scales active input to 0..1', () => {
  assert.equal(applyStickDeadzone(0.08, 0.15), 0);
  assert.equal(applyStickDeadzone(-0.12, 0.15), 0);
  const full = applyStickDeadzone(1.0, 0.15);
  assert.ok(Math.abs(full - 1.0) < 1e-6);
});

test('Greater Tangier 8 districts classify coordinates accurately', () => {
  assert.equal(getDistrictAt(-50, 0).id, 'mesnana-golf');
  assert.equal(getDistrictAt(40, 0).id, 'royal-golf');
  assert.equal(getDistrictAt(-50, 80).id, 'hay-kawassim');
  assert.equal(getDistrictAt(0, -100).id, 'route-boubana');
  assert.equal(getDistrictAt(80, 100).id, 'foret-rahrah');
  assert.equal(getDistrictAt(-300, -250).id, 'cap-spartel');
  assert.equal(getDistrictAt(-180, 320).id, 'boukhalef-uni');
  assert.equal(getDistrictAt(310, -160).id, 'malabata-corniche');
});

test('Building AABB collision prevents vehicles from driving through city blocks', () => {
  const insideAttempt = resolveCircleBuildingCollisions(-76, -56, 1.5);
  assert.equal(insideAttempt.hitBuilding, true);
  const roadAttempt = resolveCircleBuildingCollisions(-35, -15, 1.5);
  assert.equal(roadAttempt.hitBuilding, false);
});

test('vehicle physics accelerates, steers, and stays inside Greater Tangier bounds', () => {
  const car = VEHICLE_SPECS[0];
  let state = { x: -35, z: -15, heading: 0, speed: 0, kmh: 0, hitBuilding: false };
  for (let i = 0; i < 30; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0.15, handbrake: false },
      car,
      1 / 60
    );
  }
  assert.ok(state.speed > 5, 'vehicle should accelerate forward');
  assert.ok(state.heading < 0, 'steering should rotate vehicle heading');

  const clamped = clampWorldPosition(950, -950);
  assert.ok(clamped.x <= 438);
  assert.ok(clamped.z >= -438);
});

test('saved progress validation restores valid MyPC save and rejects corrupt payloads', () => {
  assert.equal(validateSavedProgress(null), null);
  assert.equal(validateSavedProgress({ invalid: true }), null);

  const initial = createInitialProgress(1200);
  const restored = validateSavedProgress({
    ...initial,
    cash: 4500,
    currentMissionIndex: 2,
    completedMissions: ['m1-mesnana-golf-welcome', 'm2-kawassim-courier'],
  });
  assert.ok(restored);
  assert.equal(restored.cash, 4500);
  assert.equal(restored.currentMissionIndex, 2);
  assert.equal(restored.completedMissions.length, 2);
});

test('keyboard normalization supports QWERTY WASD, AZERTY ZQSD, Arrow keys, and Numpad', async () => {
  const { normalizeKeyboardCode } = await import('./rules.ts');
  assert.equal(normalizeKeyboardCode('KeyW', 'w'), 'KeyW');
  assert.equal(normalizeKeyboardCode('KeyZ', 'z'), 'KeyW');
  assert.equal(normalizeKeyboardCode('KeyQ', 'q'), 'KeyA');
  assert.equal(normalizeKeyboardCode('NumpadEnter', 'Enter'), 'Enter');
  assert.equal(normalizeKeyboardCode('', 'ArrowUp'), 'ArrowUp');
  assert.equal(normalizeKeyboardCode('', ' '), 'Space');
});
