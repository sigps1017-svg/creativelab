import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// « Horizon » : la tour de demain imaginée par Creativ Lab, visible depuis le toit-terrasse.
// Une tour de verre dont chaque étage porte une dalle-balcon blanche au contour ondulant : d'un
// niveau à l'autre, les vagues se décalent et la façade semble onduler comme de l'eau. Garde-corps
// en verre, socle paysager, jardins sur le toit. Le jour, les dalles accrochent le soleil ; la
// nuit, les appartements s'allument derrière le verre.

// Dans la ville, devant le bâtiment, sur la droite vu du toit (coordonnées du site).
const POSITION = new Vector3(-48, 0, 135);
const ROTATION = 0.55;
const NIVEAUX = 26;
const HAUTEUR_NIVEAU = 3.3;
const SOCLE = 7;
const LARGEUR = 26; // noyau vitré, en X
const PROFONDEUR = 17; // en Z
const RAYON = 5; // arrondi des angles du noyau
const POINTS_CONTOUR = 180;

/** Point et normale extérieure sur le pourtour d'un rectangle arrondi, pour t de 0 à 1. */
function pourtour(t: number, marge: number) {
  const lx = LARGEUR / 2 - RAYON;
  const lz = PROFONDEUR / 2 - RAYON;
  const arc = (Math.PI / 2) * RAYON;
  const segments = [2 * lx, arc, 2 * lz, arc, 2 * lx, arc, 2 * lz, arc];
  const total = segments.reduce((a, b) => a + b, 0);
  let d = (((t % 1) + 1) % 1) * total;
  const r = RAYON + marge;
  for (let k = 0; k < 8; k++) {
    if (d <= segments[k] || k === 7) {
      const f = segments[k] ? d / segments[k] : 0;
      switch (k) {
        case 0:
          return {
            p: new Vector2(-lx + f * 2 * lx, -lz - r),
            n: new Vector2(0, -1),
          };
        case 2:
          return {
            p: new Vector2(lx + r, -lz + f * 2 * lz),
            n: new Vector2(1, 0),
          };
        case 4:
          return {
            p: new Vector2(lx - f * 2 * lx, lz + r),
            n: new Vector2(0, 1),
          };
        case 6:
          return {
            p: new Vector2(-lx - r, lz - f * 2 * lz),
            n: new Vector2(-1, 0),
          };
        default: {
          const centres = [null, [lx, -lz], null, [lx, lz], null, [-lx, lz], null, [-lx, -lz]];
          const a0 = [0, -Math.PI / 2, 0, 0, 0, Math.PI / 2, 0, Math.PI][k];
          const a = a0 + f * (Math.PI / 2);
          const [cx, cz] = centres[k]!;
          const n = new Vector2(Math.cos(a), Math.sin(a));
          return { p: new Vector2(cx + n.x * r, cz + n.y * r), n };
        }
      }
    }
    d -= segments[k];
  }
  throw new Error('pourtour');
}

/** Débord de la dalle-balcon : des vagues lentes qui glissent d'un étage à l'autre. */
function debord(t: number, niveau: number) {
  const a = Math.sin(2 * Math.PI * (t * 3 + niveau * 0.055));
  const b = Math.sin(2 * Math.PI * (t * 5 - niveau * 0.037) + 1.3);
  const c = Math.sin(2 * Math.PI * (t * 2 + niveau * 0.021) + 2.1);
  const v = Math.max(0, 0.45 * a + 0.35 * b + 0.3 * c);
  return 0.9 + 3.4 * Math.pow(v, 1.4);
}

function contour(niveau: number) {
  return [...Array(POINTS_CONTOUR).keys()].map((i) => {
    const t = i / POINTS_CONTOUR;
    const { p, n } = pourtour(t, 0);
    return p.clone().addScaledVector(n, debord(t, niveau));
  });
}

/** Une bande verticale qui suit un contour fermé (garde-corps vitré). */
function bande(points: Vector2[], y: number, h: number) {
  const pos: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    pos.push(a.x, y, a.y, b.x, y, b.y, b.x, y + h, b.y, a.x, y, a.y, b.x, y + h, b.y, a.x, y + h, a.y);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** Fenêtres de nuit : des appartements éclairés, plus ou moins chauds. */
function fenetres() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (Math.random() < 0.45) continue;
      const v = 120 + Math.random() * 135;
      ctx.fillStyle = `rgb(${v}, ${v * (0.78 + Math.random() * 0.1)}, ${v * 0.55})`;
      ctx.fillRect(x * 32 + 1, y * 32 + 4, 30, 26);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Montants du mur-rideau : fines lignes claires sur le verre. */
function montants() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2f4250';
  ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#9aa6ad';
  ctx.fillRect(0, 0, 4, 128);
  ctx.fillRect(64, 0, 2, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function creerTourHorizon() {
  const groupe = new Group();
  groupe.name = 'Tour_Horizon';
  groupe.position.copy(POSITION);
  groupe.rotation.y = ROTATION;
  const haut = SOCLE + NIVEAUX * HAUTEUR_NIVEAU;

  // ---- Noyau vitré ----
  // Les formes sont tracées en (x, -z) : une fois couchées à l'horizontale, elles retombent en (x, z).
  const plan = (marge: number, n: number) =>
    new Shape(
      [...Array(n).keys()].map((i) => {
        const { p } = pourtour(i / n, marge);
        return new Vector2(p.x, -p.y);
      }),
    );
  const forme = plan(0, POINTS_CONTOUR);
  const noyauGeo = new ExtrudeGeometry(forme, {
    depth: haut - SOCLE,
    bevelEnabled: false,
    steps: 1,
  });
  noyauGeo.rotateX(-Math.PI / 2);
  noyauGeo.translate(0, SOCLE, 0);
  // Coordonnées de texture : u le long du pourtour (une trame de 1,6 m), v un étage par unité.
  {
    const p = noyauGeo.attributes.position;
    const uv = noyauGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const angle = Math.atan2(z / PROFONDEUR, x / LARGEUR);
      const perimetre = 2 * (LARGEUR + PROFONDEUR);
      uv.setXY(i, ((angle / (2 * Math.PI)) * perimetre) / 1.6, (p.getY(i) - SOCLE) / HAUTEUR_NIVEAU);
    }
  }
  const trame = montants();
  const lumieres = fenetres();
  lumieres.repeat.set(1 / 16, 1 / 16);
  const verre = new MeshStandardMaterial({
    map: trame,
    metalness: 0.75,
    roughness: 0.1,
    envMapIntensity: 1.4,
    emissive: new Color('#ffffff'),
    emissiveMap: lumieres,
    emissiveIntensity: 0,
  });
  const noyau = new Mesh(noyauGeo, verre);
  groupe.add(noyau);

  // ---- Dalles-balcons ondulantes ----
  const dalles: BufferGeometry[] = [];
  const garde: BufferGeometry[] = [];
  for (let i = 1; i <= NIVEAUX; i++) {
    const y = SOCLE + i * HAUTEUR_NIVEAU - 0.3;
    const c = contour(i);
    const g = new ExtrudeGeometry(new Shape(c.map((p) => new Vector2(p.x, -p.y))), {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    dalles.push(g);
    if (i < NIVEAUX) garde.push(bande(c, y + 0.3, 1.05));
  }
  const blanc = new MeshStandardMaterial({ color: '#f4f2ed', roughness: 0.55 });
  const dallesMesh = new Mesh(mergeGeometries(dalles), blanc);
  dallesMesh.castShadow = true;
  groupe.add(dallesMesh);
  const gardeVerre = new MeshPhysicalMaterial({
    color: '#cfe3e8',
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.28,
    side: DoubleSide,
    depthWrite: false,
  });
  groupe.add(new Mesh(mergeGeometries(garde), gardeVerre));

  // ---- Socle : deux niveaux de commerces vitrés, toiture plantée ----
  const socleForme = plan(7, 64);
  const socleGeo = new ExtrudeGeometry(socleForme, {
    depth: SOCLE - 0.6,
    bevelEnabled: false,
  });
  socleGeo.rotateX(-Math.PI / 2);
  const socle = new Mesh(
    socleGeo,
    new MeshStandardMaterial({
      color: '#6f7d84',
      metalness: 0.6,
      roughness: 0.15,
      envMapIntensity: 1.2,
    }),
  );
  groupe.add(socle);
  const toitureGeo = new ExtrudeGeometry(socleForme, {
    depth: 0.6,
    bevelEnabled: false,
  });
  toitureGeo.rotateX(-Math.PI / 2);
  toitureGeo.translate(0, SOCLE - 0.6, 0);
  groupe.add(new Mesh(toitureGeo, blanc));
  const jardinGeo = new ExtrudeGeometry(plan(5.5, 64), {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.3,
    bevelSegments: 2,
  });
  jardinGeo.rotateX(-Math.PI / 2);
  jardinGeo.translate(0, SOCLE, 0);
  groupe.add(new Mesh(jardinGeo, new MeshStandardMaterial({ color: '#5d7f45', roughness: 0.95 })));

  // ---- Couronnement : dernière dalle plus épaisse et jardin sur le toit ----
  const toitGeo = new ExtrudeGeometry(forme, {
    depth: 1.4,
    bevelEnabled: false,
  });
  toitGeo.rotateX(-Math.PI / 2);
  toitGeo.translate(0, haut, 0);
  groupe.add(new Mesh(toitGeo, blanc));

  return {
    groupe,
    /** 0 en plein jour, 1 la nuit. */
    reglerNuit(nuit: number) {
      verre.emissiveIntensity = 1.3 * nuit;
    },
    mettreAJour(_temps: number) {},
  };
}
