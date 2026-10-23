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
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSolaraTextureAtlas(): SolaraTextureAtlas {
  const asphaltRoad = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#1b1926';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.16)';
        ctx.fillRect((i * 73) % w, (i * 41) % h, 2, 2);
      }
      // Double yellow center line
      ctx.fillStyle = '#facc15';
      ctx.fillRect(w / 2 - 5, 0, 3, h);
      ctx.fillRect(w / 2 + 2, 0, 3, h);
      // White lane dashes
      ctx.fillStyle = 'rgba(248,250,252,0.75)';
      for (let y = 12; y < h; y += 48) {
        ctx.fillRect(w * 0.24, y, 3, 24);
        ctx.fillRect(w * 0.76, y, 3, 24);
      }
    },
    1,
    12
  );

  const artDecoFacadeCyan = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#1f1638';
      ctx.fillRect(0, 0, w, h);
      // Horizontal pastel Art Deco bands
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(0, 8, w, 6);
      ctx.fillStyle = '#ff2e93';
      ctx.fillRect(0, h - 10, w, 6);
      // Illuminated hotel windows
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 4; col++) {
          const lit = (row + col) % 3 !== 0;
          ctx.fillStyle = lit ? '#67e8f9' : '#0f172a';
          ctx.fillRect(18 + col * 58, 24 + row * 36, 38, 22);
          ctx.strokeStyle = '#00f5d4';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(18 + col * 58, 24 + row * 36, 38, 22);
        }
      }
    },
    2,
    3
  );

  const artDecoFacadePink = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#25133d';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff2e93';
      ctx.fillRect(0, 10, w, 6);
      ctx.fillStyle = '#ffe66d';
      ctx.fillRect(0, h - 12, w, 5);
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 4; col++) {
          const warm = (row * 3 + col) % 2 === 0;
          ctx.fillStyle = warm ? '#fde047' : '#f472b6';
          ctx.fillRect(18 + col * 58, 24 + row * 36, 38, 22);
        }
      }
    },
    2,
    3
  );

  const glassTowerFacade = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#3b0764');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 6; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(56,189,248,0.75)' : 'rgba(244,114,182,0.55)';
          ctx.fillRect(10 + c * 40, 10 + r * 30, 30, 20);
        }
      }
    },
    2,
    4
  );

  const palmBark = makeCanvasTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#5c4033';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 14) {
        ctx.fillStyle = y % 28 === 0 ? '#432d22' : '#73513f';
        ctx.fillRect(0, y, w, 6);
      }
    },
    1,
    2
  );

  const palmFrond = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#047857');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  });

  const beachSand = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(217,119,6,0.12)' : 'rgba(255,255,255,0.22)';
        ctx.fillRect((i * 53) % w, (i * 97) % h, 3, 3);
      }
    },
    8,
    18
  );

  const sidewalkTile = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    },
    4,
    4
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
