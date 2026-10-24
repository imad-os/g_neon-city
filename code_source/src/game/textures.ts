import * as THREE from 'three';

export interface SolaraTextureAtlas {
  asphaltRoad: THREE.CanvasTexture;
  artDecoFacadeCyan: THREE.CanvasTexture;
  artDecoFacadePink: THREE.CanvasTexture;
  glassTowerFacade: THREE.CanvasTexture;
  palmBark: THREE.CanvasTexture;
  palmFrond: THREE.CanvasTexture;
  beachSand: THREE.CanvasTexture;
  sidewalkTile: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    draw(ctx, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSolaraTextureAtlas(): SolaraTextureAtlas {
  // High-contrast charcoal asphalt road with Moroccan red/white/blue curbs & crisp lane markings
  const asphaltRoad = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.22)';
        ctx.fillRect((i * 73) % w, (i * 41) % h, 2, 2);
      }
      // Tangier white & sea-blue painted curb edge stripes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 10, h);
      ctx.fillRect(w - 10, 0, 10, h);
      ctx.fillStyle = '#0077b6';
      for (let y = 0; y < h; y += 32) {
        ctx.fillRect(0, y, 10, 16);
        ctx.fillRect(w - 10, y, 10, 16);
      }
      // Double yellow center line markings
      ctx.fillStyle = '#facc15';
      ctx.fillRect(w / 2 - 5, 0, 3, h);
      ctx.fillRect(w / 2 + 2, 0, 3, h);
      // Crisp white lane dashes
      ctx.fillStyle = '#f8fafc';
      for (let y = 10; y < h; y += 44) {
        ctx.fillRect(w * 0.26, y, 4, 24);
        ctx.fillRect(w * 0.74, y, 4, 24);
      }
    },
    1,
    8
  );

  // Sunlit Tangier Whitewash & Mediterranean Blue Residential Facade (Mesnana Golf / Golf Gardens)
  const artDecoFacadeCyan = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      // Subtle horizontal plaster lines
      ctx.fillStyle = '#f1f5f9';
      for (let y = 0; y < h; y += 42) {
        ctx.fillRect(0, y, w, 3);
      }
      // Tangier Sea Blue architectural cornice & lower plinth
      ctx.fillStyle = '#0077b6';
      ctx.fillRect(0, 0, w, 14);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, h - 16, w, 16);
      // Mediterranean windows with blue frames & sunlit balconies
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 4; col++) {
          const lit = (row + col) % 2 === 0;
          ctx.fillStyle = lit ? '#38bdf8' : '#0f172a';
          ctx.fillRect(20 + col * 56, 24 + row * 42, 34, 26);
          ctx.strokeStyle = '#0077b6';
          ctx.lineWidth = 3;
          ctx.strokeRect(20 + col * 56, 24 + row * 42, 34, 26);
          // Balcony rail
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(16 + col * 56, 48 + row * 42, 42, 4);
        }
      }
    },
    2,
    2
  );

  // Hay El Kawassim & Boubana Warm Moroccan Sand / Terracotta Facade
  const artDecoFacadePink = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(0, 0, w, 12);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, h - 14, w, 14);
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 4; col++) {
          const warm = (row * 3 + col) % 2 === 0;
          ctx.fillStyle = warm ? '#fde68a' : '#1e293b';
          ctx.fillRect(20 + col * 56, 24 + row * 42, 34, 26);
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(20 + col * 56, 24 + row * 42, 34, 26);
        }
      }
    },
    2,
    2
  );

  // Socco Alto & Modern Tangier Commercial Glass Plaza Facade
  const glassTowerFacade = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 0, w, 14);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#0284c7' : '#38bdf8';
          ctx.fillRect(16 + c * 58, 22 + r * 36, 44, 26);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 2;
          ctx.strokeRect(16 + c * 58, 22 + r * 36, 44, 26);
        }
      }
    },
    2,
    2
  );

  const palmBark = makeCanvasTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 14) {
        ctx.fillStyle = y % 28 === 0 ? '#451a03' : '#92400e';
        ctx.fillRect(0, y, w, 6);
      }
    },
    1,
    2
  );

  const palmFrond = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(1, '#15803d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  });

  // Royal Golf de Tanger Lush Emerald Fairway Turf Texture
  const beachSand = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, 0, w, h);
      // Mowed golf fairway stripes
      for (let s = 0; s < w; s += 32) {
        ctx.fillStyle =
          (s / 32) % 2 === 0 ? 'rgba(52, 211, 153, 0.45)' : 'rgba(5, 150, 105, 0.45)';
        ctx.fillRect(s, 0, 16, h);
      }
    },
    8,
    8
  );

  // Warm Moroccan Limestone / Sandstone Urban Terrain (Contrasts sharply with dark asphalt roads)
  const sidewalkTile = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#dfd8c8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e7e0d2';
      ctx.fillRect(4, 4, w / 2 - 6, h / 2 - 6);
      ctx.fillRect(w / 2 + 2, h / 2 + 2, w / 2 - 6, h / 2 - 6);
      ctx.strokeStyle = '#c4bba8';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    },
    18,
    18
  );

  return {
    asphaltRoad,
    artDecoFacadeCyan,
    artDecoFacadePink,
    glassTowerFacade,
    palmBark,
    palmFrond,
    beachSand,
    sidewalkTile,
    dispose: () => {
      asphaltRoad.dispose();
      artDecoFacadeCyan.dispose();
      artDecoFacadePink.dispose();
      glassTowerFacade.dispose();
      palmBark.dispose();
      palmFrond.dispose();
      beachSand.dispose();
      sidewalkTile.dispose();
    },
  };
}
