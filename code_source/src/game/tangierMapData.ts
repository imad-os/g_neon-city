import type {
  BuildingCollider,
  DistrictId,
  DistrictInfo,
  MapLandmark,
  RoadNode,
  RoadSegment,
} from './types.ts';

/**
 * Greater Tangier World Bounds (-460m to +460m = 920m x 920m Open World, 16x larger area).
 * Divided into 160m x 160m Spatial Streaming Sectors so only nearby sectors are loaded in 3D.
 */
export const TANGIER_WORLD_MIN = -460;
export const TANGIER_WORLD_MAX = 460;
export const TANGIER_WORLD_SPAN = TANGIER_WORLD_MAX - TANGIER_WORLD_MIN; // 920m
export const TANGIER_SECTOR_SIZE = 160;

/**
 * Primary X (North-South) and Z (West-East) road axes across Greater Tangier:
 * Core Mesnana Golf, Royal Country Club & Hay El Kawassim sit in the center
 * surrounded by Cap Spartel (NW), Route de Boubana (N), Malabata Corniche (NE/E),
 * Forêt de Rahrah (SE), and Quartier Boukhalef / Grand Stade (SW/S).
 */
export const TANGIER_AVENUES_X = [
  -410, -280, -175, -90, -62.5, -35, 20, 75, 190, 310, 410,
] as const;

export const TANGIER_STREETS_Z = [
  -390, -260, -160, -75, -15, 45, 95, 210, 320, 410,
] as const;

export const TANGIER_DISTRICTS: DistrictInfo[] = [
  {
    id: 'mesnana-golf',
    name: 'Mesnana Golf',
    arabicName: 'مسنانة غولف',
    tagline: 'Rond-Point Mesnana, Golf Gardens residences & lively Tangier boulevards',
    color: '#00a8e8',
    bounds: { minX: -145, maxX: -25, minZ: -55, maxZ: 45 },
  },
  {
    id: 'royal-golf',
    name: 'Royal Golf de Tanger',
    arabicName: 'النادي الملكي للغولف',
    tagline: 'Historic 1914 18-hole championship fairways, umbrella pines & Royal Clubhouse',
    color: '#10b981',
    bounds: { minX: -25, maxX: 140, minZ: -55, maxZ: 45 },
  },
  {
    id: 'hay-kawassim',
    name: 'Hay El Kawassim',
    arabicName: 'حي القواسم',
    tagline: 'Authentic Kawassim residential quarters, Al-Kawassim Mosque & souk plazas',
    color: '#38bdf8',
    bounds: { minX: -145, maxX: 20, minZ: 45, maxZ: 165 },
  },
  {
    id: 'route-boubana',
    name: 'Route de Boubana & Socco Alto',
    arabicName: 'طريق بوبانة وسوكو ألتو',
    tagline: 'Hillside Mediterranean villas, diplomatic estates & Place Socco Alto',
    color: '#f59e0b',
    bounds: { minX: -145, maxX: 150, minZ: -210, maxZ: -55 },
  },
  {
    id: 'foret-rahrah',
    name: 'Route & Forêt de Rahrah',
    arabicName: 'غابة وطريق الرهراه',
    tagline: 'Rahrah urban pine forest, Lac Rahrah & Grand Stade connector avenue',
    color: '#2dd4bf',
    bounds: { minX: 20, maxX: 250, minZ: 45, maxZ: 260 },
  },
  {
    id: 'cap-spartel',
    name: 'Cap Spartel & Achakar',
    arabicName: 'كاب سبارطيل وأشقار',
    tagline: 'Atlantic-Mediterranean lighthouse promontory, pine cliffs & coastal highway',
    color: '#0ea5e9',
    bounds: { minX: -460, maxX: -145, minZ: -460, maxZ: 140 },
  },
  {
    id: 'boukhalef-uni',
    name: 'Boukhalef & Grand Stade',
    arabicName: 'بوخالف والملعب الكبير',
    tagline: 'Ibn Batouta Stadium complex, University campus & Route de Rabat',
    color: '#eab308',
    bounds: { minX: -460, maxX: 460, minZ: 140, maxZ: 460 },
  },
  {
    id: 'malabata-corniche',
    name: 'Malabata & Corniche Tanger',
    arabicName: 'مالاباطا وكورنيش طنجة',
    tagline: 'Bay of Tangier waterfront promenade, high-rise hotels & Marina towers',
    color: '#06b6d4',
    bounds: { minX: 140, maxX: 460, minZ: -460, maxZ: 460 },
  },
];

function classifyDistrictByCoords(x: number, z: number): DistrictId {
  for (const d of TANGIER_DISTRICTS) {
    if (
      x >= d.bounds.minX &&
      x <= d.bounds.maxX &&
      z >= d.bounds.minZ &&
      z <= d.bounds.maxZ
    ) {
      return d.id;
    }
  }
  if (x < -145 && z < 140) return 'cap-spartel';
  if (z > 140) return 'boukhalef-uni';
  if (x > 140) return 'malabata-corniche';
  if (z < -55) return 'route-boubana';
  return 'mesnana-golf';
}

const CORE_NAMED_NODES: Record<string, { id: string; name: string; isRoundabout: boolean; radius: number }> = {
  '-90_-75': { id: 'n_bassatine_nw', name: 'Carrefour Hay El Bassatine', isRoundabout: true, radius: 7.5 },
  '-62.5_-75': { id: 'n_mesnana_nord_sub', name: 'Croisement Rue Mesnana Nord', isRoundabout: false, radius: 6.5 },
  '-35_-75': { id: 'n_boubana_west', name: 'Rond-Point Boubana Ouest', isRoundabout: true, radius: 8.5 },
  '20_-75': { id: 'n_boubana_golf', name: 'Rond-Point Country Club Boubana', isRoundabout: true, radius: 8.5 },
  '75_-75': { id: 'n_socco_alto', name: 'Rond-Point Socco Alto', isRoundabout: true, radius: 9.5 },

  '-90_-15': { id: 'n_porte_mesnana', name: 'Porte de Mesnana Ouest', isRoundabout: true, radius: 7.5 },
  '-62.5_-15': { id: 'n_mesnana_centre', name: 'Place du Marché Mesnana', isRoundabout: false, radius: 6.5 },
  '-35_-15': { id: 'n_rp_mesnana_golf', name: 'Rond-Point Mesnana Golf', isRoundabout: true, radius: 9.5 },
  '20_-15': { id: 'n_royal_golf_gate', name: 'Porte Royal Golf de Tanger', isRoundabout: true, radius: 8.5 },
  '75_-15': { id: 'n_boubana_hills', name: 'Belvédère Colline de Boubana', isRoundabout: true, radius: 8.0 },

  '-90_45': { id: 'n_kawassim_ouest', name: 'Place Hay El Kawassim Ouest', isRoundabout: true, radius: 8.0 },
  '-62.5_45': { id: 'n_kawassim_mosque', name: 'Carrefour Mosquée Al-Kawassim', isRoundabout: false, radius: 6.5 },
  '-35_45': { id: 'n_rp_kawassim', name: 'Rond-Point Al Kawassim', isRoundabout: true, radius: 9.0 },
  '20_45': { id: 'n_golf_gardens_sud', name: 'Rond-Point Golf Gardens', isRoundabout: true, radius: 8.5 },
  '75_45': { id: 'n_corniche_golf', name: 'Carrefour Corniche du Golf', isRoundabout: true, radius: 8.0 },

  '-90_95': { id: 'n_kawassim_sud', name: 'Porte Kawassim Sud', isRoundabout: true, radius: 7.5 },
  '-62.5_95': { id: 'n_kawassim_rahrah', name: 'Croisement Kawassim - Rahrah', isRoundabout: false, radius: 6.5 },
  '-35_95': { id: 'n_rp_rahrah', name: 'Rond-Point Route de Rahrah', isRoundabout: true, radius: 8.5 },
  '20_95': { id: 'n_foret_rahrah', name: 'Entrée Forêt de Rahrah', isRoundabout: true, radius: 8.5 },
  '75_95': { id: 'n_stade_tanger', name: 'Rond-Point Route du Grand Stade', isRoundabout: true, radius: 9.5 },
};

const AVENUE_NAMES_BY_X: Record<number, string> = {
  [-410]: 'Route Côtière Cap Spartel - Achakar',
  [-280]: 'Boulevard Diplomatique Jbel Kbir',
  [-175]: 'Avenue Moulay Rachid',
  [-90]: 'Boulevard Bassatine - Kawassim Ouest',
  [-62.5]: 'Rue Hay El Kawassim & Souk Mesnana',
  [-35]: 'Avenue Principale de Mesnana Golf',
  [20]: 'Allée du Royal Country Club',
  [75]: 'Boulevard Socco Alto & Corniche du Golf',
  [190]: 'Avenue des Forces Armées Royales (FAR)',
  [310]: 'Boulevard Mohammed V',
  [410]: 'Corniche de Malabata & Baie de Tanger',
};

const STREET_NAMES_BY_Z: Record<number, string> = {
  [-390]: 'Promenade du Détroit & Cap Spartel',
  [-260]: 'Avenue de la Kasbah & Marshan',
  [-160]: 'Boulevard California & Vieille Montagne',
  [-75]: 'Route de Boubana & Avenue Socco Alto',
  [-15]: 'Boulevard Mesnana Golf',
  [45]: 'Avenue Hay El Kawassim & Golf Gardens',
  [95]: 'Route de Rahrah & Boulevard du Stade',
  [210]: 'Avenue Université Boukhalef',
  [320]: 'Boulevard Ibn Batouta (Grand Stade)',
  [410]: 'Autoroute Tanger Med - Rabat',
};

function buildGreaterTangierGraph(): {
  nodes: RoadNode[];
  segments: RoadSegment[];
} {
  const nodes: RoadNode[] = [];
  const nodeGrid: Record<string, RoadNode> = {};

  for (let zi = 0; zi < TANGIER_STREETS_Z.length; zi++) {
    const z = TANGIER_STREETS_Z[zi];
    for (let xi = 0; xi < TANGIER_AVENUES_X.length; xi++) {
      const x = TANGIER_AVENUES_X[xi];
      // Rue -62.5 is a local residential street inside Mesnana/Kawassim (between Z = -160 and Z = +210)
      if (x === -62.5 && (z < -160 || z > 210)) continue;

      const key = `${x}_${z}`;
      const core = CORE_NAMED_NODES[key];
      const district = classifyDistrictByCoords(x, z);

      const isMajorIntersection =
        x !== -62.5 && ((xi + zi) % 2 === 0 || Math.abs(x) >= 190 || Math.abs(z) >= 210);

      const node: RoadNode = core
        ? {
            id: core.id,
            name: core.name,
            x,
            z,
            isRoundabout: core.isRoundabout,
            radius: core.radius,
            district,
          }
        : {
            id: `n_${x}_${z}`,
            name: isMajorIntersection
              ? `Rond-Point ${STREET_NAMES_BY_Z[z]?.split('&')[0]?.trim() || 'Tanger'}`
              : `Carrefour ${AVENUE_NAMES_BY_X[x]?.split('&')[0]?.trim() || 'Tanger'}`,
            x,
            z,
            isRoundabout: isMajorIntersection,
            radius: isMajorIntersection ? 8.5 : 6.8,
            district,
          };

      nodes.push(node);
      nodeGrid[key] = node;
    }
  }

  const segments: RoadSegment[] = [];

  // Horizontal West-East Road Segments
  for (let zi = 0; zi < TANGIER_STREETS_Z.length; zi++) {
    const z = TANGIER_STREETS_Z[zi];
    const rowNodes = TANGIER_AVENUES_X.map((x) => nodeGrid[`${x}_${z}`]).filter(
      (n): n is RoadNode => Boolean(n)
    );
    for (let i = 0; i < rowNodes.length - 1; i++) {
      const a = rowNodes[i];
      const b = rowNodes[i + 1];
      const streetName = STREET_NAMES_BY_Z[z] || 'Boulevard de Tanger';
      segments.push({
        id: `seg_h_${z}_${i}`,
        name: streetName,
        fromNodeId: a.id,
        toNodeId: b.id,
        width: Math.abs(z) >= 210 ? 12 : 11.5,
        isMainArtery: true,
        speedLimitKmh: Math.abs(z) >= 210 ? 90 : 70,
      });
    }
  }

  // Vertical North-South Road Segments
  for (let xi = 0; xi < TANGIER_AVENUES_X.length; xi++) {
    const x = TANGIER_AVENUES_X[xi];
    const colNodes = TANGIER_STREETS_Z.map((z) => nodeGrid[`${x}_${z}`]).filter(
      (n): n is RoadNode => Boolean(n)
    );
    for (let i = 0; i < colNodes.length - 1; i++) {
      const a = colNodes[i];
      const b = colNodes[i + 1];
      const aveName = AVENUE_NAMES_BY_X[x] || 'Avenue de Tanger';
      segments.push({
        id: `seg_v_${x}_${i}`,
        name: aveName,
        fromNodeId: a.id,
        toNodeId: b.id,
        width: x === -62.5 ? 9.5 : 11.5,
        isMainArtery: x !== -62.5,
        speedLimitKmh: x === -62.5 ? 50 : 75,
      });
    }
  }

  return { nodes, segments };
}

const BUILT_GRAPH = buildGreaterTangierGraph();

export const TANGIER_ROAD_NODES: RoadNode[] = BUILT_GRAPH.nodes;
export const TANGIER_ROAD_SEGMENTS: RoadSegment[] = BUILT_GRAPH.segments;

export const TANGIER_LANDMARKS: MapLandmark[] = [
  {
    id: 'lm_rp_mesnana',
    name: 'Rond-Point Mesnana Golf',
    category: 'roundabout',
    district: 'mesnana-golf',
    x: -35,
    z: -15,
    description: 'Central roundabout connecting Avenue Mesnana, Golf Gardens, and Royal Golf.',
  },
  {
    id: 'lm_royal_clubhouse',
    name: 'Royal Country Club de Tanger (1914)',
    category: 'golf',
    district: 'royal-golf',
    x: -5,
    z: -32,
    description: 'Historic Tangier golf clubhouse surrounded by emerald fairways and sand bunkers.',
  },
  {
    id: 'lm_kawassim_mosque',
    name: 'Mosquée & Place Hay El Kawassim',
    category: 'mosque',
    district: 'hay-kawassim',
    x: -50,
    z: 62,
    description: 'Iconic Kawassim neighborhood mosque with traditional Moroccan minaret and plaza.',
  },
  {
    id: 'lm_socco_alto',
    name: 'Centre Commercial Socco Alto',
    category: 'plaza',
    district: 'route-boubana',
    x: 75,
    z: -75,
    description: 'Premier Tangier shopping & dining promenade at the top of Route de Boubana.',
  },
  {
    id: 'lm_garage_atlas',
    name: 'Garage Atlas Tanger (Pay & Repair)',
    category: 'garage',
    district: 'hay-kawassim',
    x: -76,
    z: 68,
    description: 'Drive near Garage Atlas in Kawassim to repair your car and clear police heat.',
  },
  {
    id: 'lm_cap_spartel',
    name: 'Phare du Cap Spartel & Achakar',
    category: 'villa',
    district: 'cap-spartel',
    x: -280,
    z: -260,
    description: 'Iconic northwestern cape where the Mediterranean Sea meets the Atlantic Ocean.',
  },
  {
    id: 'lm_grand_stade',
    name: 'Grand Stade Ibn Batouta (Boukhalef)',
    category: 'plaza',
    district: 'boukhalef-uni',
    x: -175,
    z: 320,
    description: 'Monumental Tangier sports arena along Boulevard Ibn Batouta in Boukhalef.',
  },
  {
    id: 'lm_malabata_bay',
    name: 'Corniche de Malabata & Marina Bay',
    category: 'plaza',
    district: 'malabata-corniche',
    x: 310,
    z: -160,
    description: 'Eastern beachfront promenade lined with luxury hotels and sea-blue towers.',
  },
  {
    id: 'lm_foret_rahrah',
    name: 'Parc & Forêt Urbaine de Rahrah',
    category: 'forest',
    district: 'foret-rahrah',
    x: 48,
    z: 72,
    description: 'Lush eucalyptus and umbrella pine forest along Route de Rahrah.',
  },
];

/**
 * Hand-crafted Core Buildings in Mesnana Golf, Royal Country Club, Kawassim & Boubana
 * plus procedurally generated Greater Tangier district blocks (set back >= 14m from roads).
 */
const CORE_BUILDINGS: BuildingCollider[] = [
  // --- MESNANA GOLF & MESNANA NORD BLOCKS ---
  {
    id: 'b_mesnana_nw_1',
    name: 'Résidence Jardins de Mesnana A',
    style: 'tangier-apt',
    minX: -81,
    maxX: -71.5,
    minZ: -64,
    maxZ: -48,
    height: 18,
  },
  {
    id: 'b_mesnana_nw_2',
    name: 'Résidence Jardins de Mesnana B',
    style: 'tangier-apt',
    minX: -81,
    maxX: -71.5,
    minZ: -42,
    maxZ: -26,
    height: 21,
  },
  {
    id: 'b_mesnana_ne_1',
    name: 'Immeuble Golf Gardens Nord',
    style: 'tangier-apt',
    minX: -53.5,
    maxX: -44.5,
    minZ: -64,
    maxZ: -48,
    height: 22,
  },
  {
    id: 'b_mesnana_ne_2',
    name: 'Café & Galerie Mesnana Golf',
    style: 'tangier-apt',
    minX: -53.5,
    maxX: -44.5,
    minZ: -42,
    maxZ: -27,
    height: 15,
  },
  {
    id: 'b_mesnana_sw_1',
    name: 'Résidence Détroit Azur',
    style: 'tangier-apt',
    minX: -81,
    maxX: -71.5,
    minZ: -4,
    maxZ: 13,
    height: 20,
  },
  {
    id: 'b_mesnana_sw_2',
    name: 'Complexe Al Boughaz Mesnana',
    style: 'tangier-apt',
    minX: -81,
    maxX: -71.5,
    minZ: 18,
    maxZ: 34,
    height: 17,
  },
  {
    id: 'b_mesnana_se_1',
    name: 'Les Terrasses de Mesnana Golf',
    style: 'tangier-apt',
    minX: -53.5,
    maxX: -44.5,
    minZ: -3,
    maxZ: 14,
    height: 24,
  },
  {
    id: 'b_mesnana_se_2',
    name: 'Clinique & Pharmacie du Golf',
    style: 'tangier-apt',
    minX: -53.5,
    maxX: -44.5,
    minZ: 19,
    maxZ: 34,
    height: 16,
  },

  // --- HAY EL KAWASSIM NEIGHBORHOOD BLOCKS ---
  {
    id: 'b_kawassim_garage',
    name: 'Garage Atlas Tanger (Repair & Paint)',
    style: 'garage',
    minX: -81,
    maxX: -71.5,
    minZ: 56,
    maxZ: 68,
    height: 9,
  },
  {
    id: 'b_kawassim_w_2',
    name: 'Dar El Kawassim Sud',
    style: 'kawassim-house',
    minX: -81,
    maxX: -71.5,
    minZ: 72,
    maxZ: 84,
    height: 13,
  },
  {
    id: 'b_kawassim_mosque',
    name: 'Mosquée Al-Kawassim',
    style: 'mosque',
    minX: -53.5,
    maxX: -44.5,
    minZ: 56,
    maxZ: 69,
    height: 14,
  },
  {
    id: 'b_kawassim_souk',
    name: 'Fondouk & Souk El Kawassim',
    style: 'kawassim-house',
    minX: -53.5,
    maxX: -44.5,
    minZ: 73,
    maxZ: 84,
    height: 12,
  },
  {
    id: 'b_kawassim_east_1',
    name: 'Résidence Les Oliviers Kawassim',
    style: 'kawassim-house',
    minX: -23,
    maxX: -9,
    minZ: 56,
    maxZ: 69,
    height: 15,
  },
  {
    id: 'b_kawassim_east_2',
    name: 'Villas Jardins de Kawassim',
    style: 'kawassim-house',
    minX: -4,
    maxX: 9,
    minZ: 56,
    maxZ: 69,
    height: 14,
  },
  {
    id: 'b_kawassim_east_3',
    name: 'Collège & Plaza Rahrah-Kawassim',
    style: 'tangier-apt',
    minX: -22,
    maxX: 8,
    minZ: 74,
    maxZ: 84,
    height: 13,
  },

  // --- ROYAL GOLF DE TANGER CLUBHOUSE ---
  {
    id: 'b_royal_clubhouse',
    name: 'Pavillon Royal Country Club (1914)',
    style: 'clubhouse',
    minX: -15,
    maxX: 3,
    minZ: -38,
    maxZ: -25,
    height: 10,
  },

  // --- ROUTE DE BOUBANA & SOCCO ALTO ---
  {
    id: 'b_bassatine_nord',
    name: 'Résidence Hay El Bassatine',
    style: 'tangier-apt',
    minX: -82,
    maxX: -46,
    minZ: -102,
    maxZ: -87,
    height: 19,
  },
  {
    id: 'b_boubana_villa_1',
    name: 'Palais & Villa Boubana',
    style: 'boubana-villa',
    minX: -24,
    maxX: 8,
    minZ: -101,
    maxZ: -87,
    height: 11,
  },
  {
    id: 'b_boubana_villa_2',
    name: 'Domaine Diplomatique Boubana',
    style: 'boubana-villa',
    minX: 32,
    maxX: 58,
    minZ: -101,
    maxZ: -87,
    height: 12,
  },
  {
    id: 'b_socco_alto_mall',
    name: 'Centre Socco Alto Tanger',
    style: 'socco-plaza',
    minX: 66,
    maxX: 96,
    minZ: -103,
    maxZ: -87,
    height: 16,
  },
  {
    id: 'b_boubana_east_villas',
    name: 'Villas Panoramiques du Golf',
    style: 'boubana-villa',
    minX: 86,
    maxX: 101,
    minZ: -62,
    maxZ: -28,
    height: 11,
  },
  {
    id: 'b_stade_pavilion',
    name: 'Pavillon Sportif Sud-Est',
    style: 'socco-plaza',
    minX: 86,
    maxX: 102,
    minZ: 56,
    maxZ: 82,
    height: 15,
  },
];

function generateExpandedDistrictBuildings(): BuildingCollider[] {
  const all: BuildingCollider[] = [...CORE_BUILDINGS];
  const mainX = [-410, -280, -175, -90, -35, 20, 75, 190, 310, 410];
  const mainZ = [-390, -260, -160, -75, -15, 45, 95, 210, 320, 410];

  let idx = 0;
  for (let zi = 0; zi < mainZ.length - 1; zi++) {
    const z1 = mainZ[zi];
    const z2 = mainZ[zi + 1];

    for (let xi = 0; xi < mainX.length - 1; xi++) {
      const x1 = mainX[xi];
      const x2 = mainX[xi + 1];

      // Skip the central Mesnana / Royal Golf / Kawassim / Rahrah core (-95..105, -105..100)
      // because it is already populated with hand-crafted landmarks, fairways & lakes
      if (x1 >= -95 && x2 <= 80 && z1 >= -80 && z2 <= 100) {
        continue;
      }

      const cellW = x2 - x1;
      const cellD = z2 - z1;
      if (cellW < 44 || cellD < 44) continue;

      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const distId = classifyDistrictByCoords(cx, cz);

      // Leave open pine parks in parts of Cap Spartel & Rahrah
      if ((xi + zi) % 5 === 0 && (distId === 'cap-spartel' || distId === 'foret-rahrah')) {
        continue;
      }

      const style: BuildingCollider['style'] =
        distId === 'cap-spartel' || distId === 'route-boubana'
          ? 'boubana-villa'
          : distId === 'malabata-corniche'
            ? idx % 3 === 0
              ? 'socco-plaza'
              : 'tangier-apt'
            : distId === 'boukhalef-uni'
              ? idx % 4 === 0
                ? 'mosque'
                : 'tangier-apt'
              : 'kawassim-house';

      // Place 2 well-spaced buildings per city block, set back >= 16m from every road centerline
      const margin = 17;
      const availW = cellW - margin * 2;
      const availD = cellD - margin * 2;
      if (availW < 16 || availD < 16) continue;

      const b1W = Math.min(28, availW * 0.42);
      const b1D = Math.min(26, availD * 0.44);
      const h1 =
        distId === 'malabata-corniche'
          ? 22 + ((idx * 7) % 16)
          : distId === 'cap-spartel'
            ? 10 + ((idx * 3) % 6)
            : 14 + ((idx * 5) % 12);

      all.push({
        id: `b_exp_${idx}_a`,
        name: `Résidence ${distId.toUpperCase()} ${idx + 1}A`,
        style,
        minX: Math.round(x1 + margin),
        maxX: Math.round(x1 + margin + b1W),
        minZ: Math.round(z1 + margin),
        maxZ: Math.round(z1 + margin + b1D),
        height: h1,
      });

      if (availW >= 42 && availD >= 42) {
        const b2W = Math.min(28, availW * 0.42);
        const b2D = Math.min(26, availD * 0.44);
        const h2 =
          distId === 'malabata-corniche'
            ? 24 + ((idx * 9) % 18)
            : 13 + ((idx * 7) % 11);

        all.push({
          id: `b_exp_${idx}_b`,
          name: `Complexe ${distId.toUpperCase()} ${idx + 1}B`,
          style: idx % 5 === 0 ? 'socco-plaza' : style,
          minX: Math.round(x2 - margin - b2W),
          maxX: Math.round(x2 - margin),
          minZ: Math.round(z2 - margin - b2D),
          maxZ: Math.round(z2 - margin),
          height: h2,
        });
      }

      idx++;
    }
  }

  return all;
}

export const TANGIER_BUILDING_COLLIDERS: BuildingCollider[] = generateExpandedDistrictBuildings();

/**
 * Spatial Hash Grid for O(1) Building Collision & Sector Streaming
 */
const COLLISION_CELL_SIZE = 80;
const BUILDING_SPATIAL_HASH: Map<string, BuildingCollider[]> = (() => {
  const map = new Map<string, BuildingCollider[]>();
  for (const b of TANGIER_BUILDING_COLLIDERS) {
    const minCellX = Math.floor(b.minX / COLLISION_CELL_SIZE);
    const maxCellX = Math.floor(b.maxX / COLLISION_CELL_SIZE);
    const minCellZ = Math.floor(b.minZ / COLLISION_CELL_SIZE);
    const maxCellZ = Math.floor(b.maxZ / COLLISION_CELL_SIZE);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = `${cx}_${cz}`;
        let list = map.get(key);
        if (!list) {
          list = [];
          map.set(key, list);
        }
        list.push(b);
      }
    }
  }
  return map;
})();

export function getBuildingsNearPoint(x: number, z: number): BuildingCollider[] {
  const cx = Math.floor(x / COLLISION_CELL_SIZE);
  const cz = Math.floor(z / COLLISION_CELL_SIZE);
  return BUILDING_SPATIAL_HASH.get(`${cx}_${cz}`) || [];
}

const NODE_MAP: Record<string, RoadNode> = (() => {
  const map: Record<string, RoadNode> = {};
  for (const n of TANGIER_ROAD_NODES) {
    map[n.id] = n;
  }
  return map;
})();

export function getRoadNodeById(id: string): RoadNode | undefined {
  return NODE_MAP[id];
}

/**
 * Finds the closest road node in Greater Tangier to any (x, z) point.
 */
export function findClosestRoadNode(x: number, z: number): RoadNode {
  let best = TANGIER_ROAD_NODES[0];
  let bestDist = Infinity;
  for (let i = 0; i < TANGIER_ROAD_NODES.length; i++) {
    const n = TANGIER_ROAD_NODES[i];
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

/**
 * Finds the name of the street segment or roundabout closest to (x, z).
 */
export function getStreetNameAt(x: number, z: number): string {
  for (const n of TANGIER_ROAD_NODES) {
    if (n.isRoundabout && Math.hypot(x - n.x, z - n.z) <= n.radius + 4) {
      return n.name;
    }
  }

  let bestName = 'Boulevard Mesnana Golf';
  let bestDist = Infinity;

  for (const seg of TANGIER_ROAD_SEGMENTS) {
    const a = NODE_MAP[seg.fromNodeId];
    const b = NODE_MAP[seg.toNodeId];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const t =
      lenSq > 0
        ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq))
        : 0;
    const projX = a.x + t * dx;
    const projZ = a.z + t * dz;
    const d = Math.hypot(x - projX, z - projZ);
    if (d < bestDist) {
      bestDist = d;
      bestName = seg.name;
    }
  }

  return bestName;
}

/**
 * Computes the shortest connected road-network GPS path from (startX, startZ)
 * to (targetX, targetZ) across the Greater Tangier road graph.
 */
export function computeGpsRoadRoute(
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number
): { x: number; z: number }[] {
  const startNode = findClosestRoadNode(startX, startZ);
  const endNode = findClosestRoadNode(targetX, targetZ);

  if (startNode.id === endNode.id) {
    return [
      { x: startX, z: startZ },
      { x: startNode.x, z: startNode.z },
      { x: targetX, z: targetZ },
    ];
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const n of TANGIER_ROAD_NODES) {
    dist[n.id] = Infinity;
    prev[n.id] = null;
    unvisited.add(n.id);
  }
  dist[startNode.id] = 0;

  while (unvisited.size > 0) {
    let u: string | null = null;
    let bestD = Infinity;
    for (const id of unvisited) {
      if (dist[id] < bestD) {
        bestD = dist[id];
        u = id;
      }
    }
    if (!u || u === endNode.id) break;
    unvisited.delete(u);

    const uNode = NODE_MAP[u];
    for (const seg of TANGIER_ROAD_SEGMENTS) {
      let vId: string | null = null;
      if (seg.fromNodeId === u) vId = seg.toNodeId;
      else if (seg.toNodeId === u) vId = seg.fromNodeId;
      if (!vId || !unvisited.has(vId)) continue;

      const vNode = NODE_MAP[vId];
      const weight = Math.hypot(vNode.x - uNode.x, vNode.z - uNode.z);
      const alt = dist[u] + weight;
      if (alt < dist[vId]) {
        dist[vId] = alt;
        prev[vId] = u;
      }
    }
  }

  const path: { x: number; z: number }[] = [{ x: startX, z: startZ }];
  const nodeChain: RoadNode[] = [];
  let curr: string | null = endNode.id;
  while (curr && NODE_MAP[curr]) {
    nodeChain.unshift(NODE_MAP[curr]);
    curr = prev[curr];
  }

  for (const n of nodeChain) {
    path.push({ x: n.x, z: n.z });
  }
  path.push({ x: targetX, z: targetZ });
  return path;
}
