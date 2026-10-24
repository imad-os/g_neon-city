import {
  TANGIER_BUILDING_COLLIDERS,
  TANGIER_DISTRICTS,
  TANGIER_LANDMARKS,
  TANGIER_ROAD_NODES,
  TANGIER_ROAD_SEGMENTS,
  TANGIER_WORLD_MAX,
  TANGIER_WORLD_MIN,
  TANGIER_WORLD_SPAN,
  TANGIER_WORLD_ZONES,
  computeGpsRoadRoute,
  getRoadNodeById,
} from './tangierMapData.ts';
import type { MissionDef } from './types.ts';

const WORLD_MIN = TANGIER_WORLD_MIN;
const WORLD_MAX = TANGIER_WORLD_MAX;
const WORLD_SPAN = TANGIER_WORLD_SPAN;

let cachedBaseCanvas: HTMLCanvasElement | null = null;
let lastMiniMapHash = '';

export function worldToMapUv(x: number, z: number): { u: number; v: number } {
  return {
    u: (x - WORLD_MIN) / WORLD_SPAN,
    v: (z - WORLD_MIN) / WORLD_SPAN,
  };
}

export function mapUvToWorld(u: number, v: number): { x: number; z: number } {
  return {
    x: WORLD_MIN + u * WORLD_SPAN,
    z: WORLD_MIN + v * WORLD_SPAN,
  };
}

/**
 * Generates and caches a crisp 768x768 cartographic base map (4x faster to composite than 1536x1536)
 * of Greater Tangier (-460m to +460m): Mesnana Golf, Royal Country Club, Route de Boubana,
 * Route de Rahrah, Hay El Kawassim, Cap Spartel, Boukhalef Grand Stade, and Malabata Corniche.
 */
export function getTangierBaseMapCanvas(): HTMLCanvasElement {
  if (cachedBaseCanvas) return cachedBaseCanvas;

  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const toPx = (coord: number) => ((coord - WORLD_MIN) / WORLD_SPAN) * size;
  const toLen = (meters: number) => (meters / WORLD_SPAN) * size;

  // 1. Base Mediterranean Urban Terrain
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#051527');
  bgGrad.addColorStop(0.5, '#0a213a');
  bgGrad.addColorStop(1, '#07192e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle topographic & sector streaming grid (every 160m sector)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1;
  for (let g = -400; g <= 400; g += 80) {
    const p = toPx(g);
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // 2. Cap Spartel & Achakar Coastal Reserve (North-West Green Promontory)
  ctx.save();
  ctx.fillStyle = 'rgba(6, 78, 59, 0.45)';
  ctx.beginPath();
  ctx.roundRect(toPx(-430), toPx(-420), toLen(260), toLen(240), 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 3. Royal Country Club de Tanger (Mesnana Golf Greens, Fairways, Bunkers & Water Hazard)
  ctx.save();
  ctx.fillStyle = '#064e3b';
  ctx.beginPath();
  ctx.roundRect(toPx(-28), toPx(-68), toLen(96), toLen(106), 16);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.stroke();

  const fairways = [
    { x: -6, z: -50, rx: 14, rz: 10, rot: 0.2 },
    { x: 46, z: -48, rx: 18, rz: 11, rot: -0.15 },
    { x: 48, z: -15, rx: 16, rz: 10, rot: 0.1 },
    { x: 46, z: 16, rx: 18, rz: 11, rot: -0.2 },
    { x: -6, z: 14, rx: 15, rz: 11, rot: 0.12 },
  ];
  for (const fw of fairways) {
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.ellipse(toPx(fw.x), toPx(fw.z), toLen(fw.rx), toLen(fw.rz), fw.rot, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(toPx(fw.x + fw.rx * 0.45), toPx(fw.z), toLen(3.5), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(
      toPx(fw.x - fw.rx * 0.3),
      toPx(fw.z + fw.rz * 0.45),
      toLen(3.2),
      toLen(1.8),
      0.3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Golf Water Hazard Pond
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.ellipse(toPx(45), toPx(-32), toLen(9), toLen(5.5), -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Forêt Urbaine de Rahrah & Grand Stade Park
  ctx.save();
  ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
  ctx.beginPath();
  ctx.roundRect(toPx(26), toPx(52), toLen(150), toLen(145), 16);
  ctx.fill();

  ctx.fillStyle = '#0369a1';
  ctx.beginPath();
  ctx.ellipse(toPx(48), toPx(72), toLen(13), toLen(8), 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 5. CONTINUOUS CONNECTED ROAD NETWORK ACROSS GREATER TANGIER
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const seg of TANGIER_ROAD_SEGMENTS) {
    const a = getRoadNodeById(seg.fromNodeId);
    const b = getRoadNodeById(seg.toNodeId);
    if (!a || !b) continue;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = Math.max(3, toLen(seg.width + 3.4));
    ctx.beginPath();
    ctx.moveTo(toPx(a.x), toPx(a.z));
    ctx.lineTo(toPx(b.x), toPx(b.z));
    ctx.stroke();
  }
  for (const node of TANGIER_ROAD_NODES) {
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(toPx(node.x), toPx(node.z), Math.max(2.5, toLen(node.radius + 1.8)), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const seg of TANGIER_ROAD_SEGMENTS) {
    const a = getRoadNodeById(seg.fromNodeId);
    const b = getRoadNodeById(seg.toNodeId);
    if (!a || !b) continue;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(2, toLen(seg.width));
    ctx.beginPath();
    ctx.moveTo(toPx(a.x), toPx(a.z));
    ctx.lineTo(toPx(b.x), toPx(b.z));
    ctx.stroke();
  }
  for (const node of TANGIER_ROAD_NODES) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(toPx(node.x), toPx(node.z), Math.max(2, toLen(node.radius)), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.setLineDash([6, 6]);
  for (const seg of TANGIER_ROAD_SEGMENTS) {
    const a = getRoadNodeById(seg.fromNodeId);
    const b = getRoadNodeById(seg.toNodeId);
    if (!a || !b) continue;
    ctx.strokeStyle = seg.isMainArtery
      ? 'rgba(56, 189, 248, 0.48)'
      : 'rgba(248, 250, 252, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(toPx(a.x), toPx(a.z));
    ctx.lineTo(toPx(b.x), toPx(b.z));
    ctx.stroke();
  }
  ctx.restore();

  for (const node of TANGIER_ROAD_NODES) {
    if (node.isRoundabout) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(toPx(node.x), toPx(node.z), Math.max(2, toLen(node.radius * 0.46)), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(toPx(node.x), toPx(node.z), Math.max(1.4, toLen(node.radius * 0.34)), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(toPx(node.x), toPx(node.z), Math.max(1.0, toLen(node.radius * 0.22)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 6. ARCHITECTURAL BUILDING FOOTPRINTS (Exact 1:1 match with 3D world)
  for (const b of TANGIER_BUILDING_COLLIDERS) {
    const x = toPx(b.minX);
    const z = toPx(b.minZ);
    const w = toLen(b.maxX - b.minX);
    const d = toLen(b.maxZ - b.minZ);

    let fill = '#e2e8f0';
    let border = '#0284c7';
    if (b.style === 'boubana-villa') {
      fill = '#fed7aa';
      border = '#f59e0b';
    } else if (b.style === 'kawassim-house') {
      fill = '#bae6fd';
      border = '#0284c7';
    } else if (b.style === 'mosque') {
      fill = '#a7f3d0';
      border = '#10b981';
    } else if (b.style === 'clubhouse') {
      fill = '#fef08a';
      border = '#10b981';
    } else if (b.style === 'garage') {
      fill = '#38bdf8';
      border = '#f8fafc';
    } else if (b.style === 'socco-plaza') {
      fill = '#f1f5f9';
      border = '#00a8e8';
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(x + 2, z + 2, w, d);

    ctx.fillStyle = fill;
    ctx.fillRect(x, z, w, d);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, z, w, d);
  }

  // 7. DISTRICT & BOULEVARD LABELS ACROSS GREATER TANGIER
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const districtBadges = [
    { name: 'MESNANA GOLF', sub: 'Coeur de Ville', x: -62, z: -34, color: '#38bdf8' },
    { name: 'ROYAL GOLF 1914', sub: '18 Holes Country Club', x: 46, z: -2, color: '#34d399' },
    { name: 'HAY EL KAWASSIM', sub: 'حي القواسم', x: -62, z: 68, color: '#7dd3fc' },
    { name: 'ROUTE DE BOUBANA', sub: 'Villas & Socco Alto', x: 18, z: -115, color: '#fcd34d' },
    { name: 'FORÊT DE RAHRAH', sub: 'Parc & Lac Rahrah', x: 95, z: 135, color: '#5eead4' },
    { name: 'CAP SPARTEL & ACHAKAR', sub: 'Phare & Corniche Ouest', x: -295, z: -260, color: '#38bdf8' },
    { name: 'BOUKHALEF & GRAND STADE', sub: 'Stade Ibn Batouta', x: -175, z: 320, color: '#facc15' },
    { name: 'MALABATA CORNICHE', sub: 'Baie de Tanger & Marina', x: 310, z: -160, color: '#22d3ee' },
  ];

  for (const d of districtBadges) {
    const px = toPx(d.x);
    const pz = toPx(d.z);
    ctx.fillStyle = 'rgba(4, 16, 30, 0.88)';
    ctx.fillRect(px - 74, pz - 14, 148, 28);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - 74, pz - 14, 148, 28);
    ctx.font = '900 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = d.color;
    ctx.fillText(d.name, px, pz - 4);
    ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(d.sub, px, pz + 7);
  }
  ctx.restore();

  cachedBaseCanvas = canvas;
  return canvas;
}

/**
 * Renders the rotating Top Mini-Map with connected road network, glowing GPS route path,
 * player arrow, and perimeter directional target chevron.
 */
export function renderTopRotatingMiniMap(
  canvas: HTMLCanvasElement,
  params: {
    playerX: number;
    playerZ: number;
    playerHeading: number;
    targetX: number | null;
    targetZ: number | null;
    zoomedOut: boolean;
  }
): void {
  // Skip redundant 2D canvas blits when player/heading/target haven't changed
  const qx = Math.round(params.playerX * 2);
  const qz = Math.round(params.playerZ * 2);
  const qh = Math.round(params.playerHeading * 40);
  const qtX = params.targetX !== null ? Math.round(params.targetX) : 'n';
  const qtZ = params.targetZ !== null ? Math.round(params.targetZ) : 'n';
  const hash = `${qx}_${qz}_${qh}_${qtX}_${qtZ}_${params.zoomedOut ? 1 : 0}`;
  if (hash === lastMiniMapHash) return;
  lastMiniMapHash = hash;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const baseMap = getTangierBaseMapCanvas();

  ctx.clearRect(0, 0, w, h);

  const viewMeters = params.zoomedOut ? 220 : 115;
  const pxPerMeter = w / viewMeters;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(params.playerHeading - Math.PI);

  const playerOffsetX = -params.playerX * pxPerMeter;
  const playerOffsetZ = -params.playerZ * pxPerMeter;

  const mapLeft = (WORLD_MIN - params.playerX) * pxPerMeter;
  const mapTop = (WORLD_MIN - params.playerZ) * pxPerMeter;
  const mapDrawSize = WORLD_SPAN * pxPerMeter;
  ctx.drawImage(baseMap, mapLeft, mapTop, mapDrawSize, mapDrawSize);

  // Draw live connected GPS road route if an objective/waypoint is active
  if (params.targetX !== null && params.targetZ !== null) {
    const route = computeGpsRoadRoute(
      params.playerX,
      params.playerZ,
      params.targetX,
      params.targetZ
    );
    if (route.length >= 2) {
      ctx.strokeStyle = 'rgba(6, 21, 38, 0.92)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < route.length; i++) {
        const rx = playerOffsetX + route[i].x * pxPerMeter;
        const rz = playerOffsetZ + route[i].z * pxPerMeter;
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.stroke();

      ctx.strokeStyle = '#00a8e8';
      ctx.lineWidth = 4;
      ctx.stroke();

      const tx = playerOffsetX + params.targetX * pxPerMeter;
      const tz = playerOffsetZ + params.targetZ * pxPerMeter;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(tx, tz, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();

  // Draw Perimeter Directional Arrow pointing to Target (in screen space)
  if (params.targetX !== null && params.targetZ !== null) {
    const dx = params.targetX - params.playerX;
    const dz = params.targetZ - params.playerZ;
    const worldAngleToTarget = Math.atan2(dx, dz);
    const relAngle = worldAngleToTarget - params.playerHeading;

    const edgeRadius = Math.min(w, h) * 0.41;
    const arrowX = w / 2 + Math.sin(relAngle) * edgeRadius;
    const arrowY = h / 2 - Math.cos(relAngle) * edgeRadius;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(relAngle);
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#061526';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 6);
    ctx.lineTo(0, 2);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw Player Arrow at Center (always pointing UP)
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.fillStyle = '#38bdf8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // North ('N') Indicator on Perimeter
  const northAngle = -params.playerHeading + Math.PI;
  const nx = w / 2 + Math.sin(northAngle) * (w * 0.43);
  const ny = h / 2 - Math.cos(northAngle) * (h * 0.43);
  ctx.save();
  ctx.fillStyle = '#061526';
  ctx.beginPath();
  ctx.arc(nx, ny, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', nx, ny);
  ctx.restore();
}

/**
 * Renders the Full-Screen Interactive World Map of Greater Tangier
 * with GPS route line, mission icons, landmarks, active streaming radius ring, and player location.
 */
export function renderFullWorldMap(
  canvas: HTMLCanvasElement,
  params: {
    playerX: number;
    playerZ: number;
    playerHeading: number;
    activeTargetX: number | null;
    activeTargetZ: number | null;
    customWaypoint: { x: number; z: number } | null;
    missions: MissionDef[];
    currentMissionIndex: number;
    completedMissionIds: string[];
    zoom: number;
    panX: number;
    panZ: number;
  }
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const baseMap = getTangierBaseMapCanvas();

  ctx.fillStyle = '#04101e';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(params.zoom, params.zoom);

  const mapDrawSize = Math.min(w, h) * 0.92;
  const pxPerMeter = mapDrawSize / WORLD_SPAN;
  const offsetX = -params.panX * pxPerMeter;
  const offsetZ = -params.panZ * pxPerMeter;

  const toMapX = (wx: number) => offsetX + wx * pxPerMeter;
  const toMapZ = (wz: number) => offsetZ + wz * pxPerMeter;

  ctx.drawImage(
    baseMap,
    offsetX - mapDrawSize / 2,
    offsetZ - mapDrawSize / 2,
    mapDrawSize,
    mapDrawSize
  );

  // Draw 5-Part World Streaming Zone Boundaries + Active Streaming Bubble
  ctx.save();
  ctx.setLineDash([6 / params.zoom, 6 / params.zoom]);
  ctx.lineWidth = 1.4 / params.zoom;
  for (const zInfo of TANGIER_WORLD_ZONES) {
    const zx = toMapX(zInfo.bounds.minX);
    const zz = toMapZ(zInfo.bounds.minZ);
    const zw = (zInfo.bounds.maxX - zInfo.bounds.minX) * pxPerMeter;
    const zd = (zInfo.bounds.maxZ - zInfo.bounds.minZ) * pxPerMeter;
    ctx.strokeStyle = zInfo.color;
    ctx.strokeRect(zx, zz, zw, zd);
  }
  ctx.restore();

  const px = toMapX(params.playerX);
  const pz = toMapZ(params.playerZ);
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
  ctx.setLineDash([5 / params.zoom, 5 / params.zoom]);
  ctx.lineWidth = 1.8 / params.zoom;
  ctx.beginPath();
  ctx.arc(px, pz, 155 * pxPerMeter, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Draw GPS Shortest-Path Route along Connected Roads
  const destX = params.customWaypoint ? params.customWaypoint.x : params.activeTargetX;
  const destZ = params.customWaypoint ? params.customWaypoint.z : params.activeTargetZ;

  if (destX !== null && destZ !== null) {
    const route = computeGpsRoadRoute(params.playerX, params.playerZ, destX, destZ);
    if (route.length >= 2) {
      ctx.strokeStyle = 'rgba(4, 16, 30, 0.95)';
      ctx.lineWidth = 8 / params.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < route.length; i++) {
        const rx = toMapX(route[i].x);
        const rz = toMapZ(route[i].z);
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.stroke();

      ctx.strokeStyle = '#00a8e8';
      ctx.lineWidth = 4.5 / params.zoom;
      ctx.stroke();
    }
  }

  // Draw Landmarks
  for (const lm of TANGIER_LANDMARKS) {
    const lx = toMapX(lm.x);
    const lz = toMapZ(lm.z);
    ctx.fillStyle = '#061526';
    ctx.beginPath();
    ctx.arc(lx, lz, 6 / params.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2 / params.zoom;
    ctx.stroke();
  }

  // Draw Mission Start Markers
  for (const m of params.missions) {
    const mx = toMapX(m.startX);
    const mz = toMapZ(m.startZ);
    const isCurrent = m.index === params.currentMissionIndex;
    const isDone = params.completedMissionIds.includes(m.id);

    ctx.fillStyle = isCurrent ? '#f59e0b' : isDone ? '#10b981' : '#00a8e8';
    ctx.beginPath();
    ctx.arc(mx, mz, (isCurrent ? 9 : 7) / params.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / params.zoom;
    ctx.stroke();

    ctx.fillStyle = '#04101e';
    ctx.font = `900 ${Math.round(10 / params.zoom)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(m.index + 1), mx, mz);
  }

  // Draw Active Objective Pin
  if (params.activeTargetX !== null && params.activeTargetZ !== null) {
    const tx = toMapX(params.activeTargetX);
    const tz = toMapZ(params.activeTargetZ);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(tx, tz, 9 / params.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 / params.zoom;
    ctx.stroke();
  }

  // Draw Custom GPS Waypoint Pin
  if (params.customWaypoint) {
    const wx = toMapX(params.customWaypoint.x);
    const wz = toMapZ(params.customWaypoint.z);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(wx, wz, 8.5 / params.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 / params.zoom;
    ctx.stroke();
  }

  // Draw Player Position & Heading Chevron
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(params.playerHeading);
  ctx.fillStyle = '#00a8e8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 / params.zoom;
  const s = 10 / params.zoom;
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.lineTo(-s * 0.75, -s * 0.8);
  ctx.lineTo(0, -s * 0.35);
  ctx.lineTo(s * 0.75, -s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export { TANGIER_DISTRICTS, TANGIER_WORLD_SPAN };
