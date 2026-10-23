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

test('Solara Bay 5 districts classify coordinates accurately', () => {
  assert.equal(getDistrictAt(40, 0).id, 'starlight-beach');
  assert.equal(getDistrictAt(-40, 0).id, 'neon-strip');
  assert.equal(getDistrictAt(-40, 80).id, 'palm-harbor');
  assert.equal(getDistrictAt(-40, -85).id, 'coral-heights');
  assert.equal(getDistrictAt(-85, 20).id, 'sunset-industrial');
});

test('Building AABB collision prevents vehicles from driving through city blocks', () => {
  // Block center at (20, 20) is occupied by a Starlight Beach hotel block
  const insideAttempt = resolveCircleBuildingCollisions(20, 18, 1.5);
  assert.equal(insideAttempt.hitBuilding, true);
  // Position on Ocean Drive (x=40, z=18) is clear road
  const roadAttempt = resolveCircleBuildingCollisions(40, 18, 1.5);
  assert.equal(roadAttempt.hitBuilding, false);
});

test('vehicle physics accelerates, steers, and stays inside Solara Bay shoreline bounds', () => {
  const countach = VEHICLE_SPECS[0];
  let state = { x: 40, z: 0, heading: 0, speed: 0, kmh: 0, hitBuilding: false };
  for (let i = 0; i < 30; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0.15, handbrake: false },
      countach,
      1 / 60
    );
  }
  assert.ok(state.speed > 5, 'vehicle should accelerate forward');
  assert.ok(state.heading < 0, 'steering should rotate vehicle heading');

  const clamped = clampWorldPosition(250, -300);
  assert.ok(clamped.x <= 64);
  assert.ok(clamped.z >= -108);
});

test('saved progress validation restores valid MyPC save and rejects corrupt payloads', () => {
  assert.equal(validateSavedProgress(null), null);
  assert.equal(validateSavedProgress({ invalid: true }), null);

  const initial = createInitialProgress(1200);
  const restored = validateSavedProgress({
    ...initial,
    cash: 4500,
    currentMissionIndex: 2,
    completedMissions: ['m1-ocean-drive-pickup', 'm2-neon-strip-heat'],
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

