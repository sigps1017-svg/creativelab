import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Végétation du quartier : des essences méditerranéennes dessinées une fois (feuillage en touffes
// irrégulières, couleurs plus sombres dans le creux et plus claires au soleil), puis répétées par
// instanciation : des centaines d'arbres pour quelques appels de dessin.

export type Essence = 'platane' | 'olivier' | 'pin' | 'cypres' | 'palmier' | 'buisson' | 'roseaux' | 'lavande';

/** Générateur pseudo-aléatoire reproductible : le quartier est le même à chaque visite. */
export function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alea = hasard(7);

/** Bruit déterministe d'une position (les sommets partagés bougent ensemble). */
function bruit(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Colore une géométrie : du sombre (bas, creux) au clair (haut), avec un grain par sommet. */
function colorer(g: BufferGeometry, bas: string, haut: string, grain = 0.08, y0?: number, y1?: number) {
  const p = g.attributes.position;
  g.computeBoundingBox();
  const min = y0 ?? g.boundingBox!.min.y;
  const max = y1 ?? g.boundingBox!.max.y;
  const c0 = new Color(bas);
  const c1 = new Color(haut);
  const c = new Color();
  const couleurs = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(Math.max((p.getY(i) - min) / (max - min || 1), 0), 1);
    c.copy(c0).lerp(c1, t * t * (3 - 2 * t));
    const v = 1 + (bruit(p.getX(i), p.getY(i), p.getZ(i)) - 0.5) * 2 * grain;
    couleurs.set([c.r * v, c.g * v, c.b * v], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(couleurs, 3));
  return g;
}

/** Une touffe de feuillage : une sphère grossière, bosselée, lissée. */
function touffe(rayon: number, ecrasement = 1, detail = 1) {
  let g: BufferGeometry = new IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (bruit(x * 3.1, y * 3.1, z * 3.1) - 0.5) * 0.55;
    p.setXYZ(i, x * k * rayon, y * k * rayon * ecrasement, z * k * rayon);
  }
  g.computeVertexNormals();
  return g;
}

function tronc(r0: number, r1: number, h: number, inclinaison = 0, cap = 0) {
  const g = new CylinderGeometry(r1, r0, h, 7, 2, true);
  g.deleteAttribute('uv');
  g.translate(0, h / 2, 0);
  g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(inclinaison, cap, 0, 'YXZ')));
  return g;
}

function placer(g: BufferGeometry, x: number, y: number, z: number) {
  g.translate(x, y, z);
  return g;
}

function assembler(pieces: BufferGeometry[]) {
  for (const g of pieces) {
    if (g.attributes.uv) g.deleteAttribute('uv');
  }
  const nonIndexees = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(nonIndexees)!;
}

const ECORCE = ['#4a3b2c', '#6e5a45'] as const;

const FABRIQUES: Record<Essence, () => BufferGeometry> = {
  // Platane : grand arbre d'alignement, couronne large et lumineuse.
  platane() {
    const pieces = [colorer(tronc(0.32, 0.2, 5.2), '#5d5a4c', '#9a9580')];
    const centres = [
      [0, 6.6, 0, 2.6],
      [1.7, 6.0, 0.6, 2.0],
      [-1.6, 6.2, -0.4, 2.1],
      [0.4, 6.1, 1.8, 1.9],
      [-0.5, 6.0, -1.8, 1.9],
      [0.2, 8.0, 0.1, 1.9],
    ];
    for (const [x, y, z, r] of centres) pieces.push(placer(colorer(touffe(r, 0.85), '#2f4a1f', '#8fb256', 0.12, -r, r), x, y, z));
    return assembler(pieces);
  },
  // Olivier : tronc noueux en deux branches, feuillage gris-vert, bas et étalé.
  olivier() {
    const pieces = [
      colorer(tronc(0.22, 0.12, 1.9, 0.35, 0), ...ECORCE),
      colorer(tronc(0.18, 0.1, 1.7, 0.45, 2.4), ...ECORCE),
    ];
    const centres = [
      [0.5, 2.5, 0.5, 1.25],
      [-0.6, 2.3, -0.5, 1.15],
      [0.0, 3.0, -0.1, 1.1],
      [-0.2, 2.3, 0.9, 0.9],
      [0.9, 2.2, -0.6, 0.9],
    ];
    for (const [x, y, z, r] of centres) pieces.push(placer(colorer(touffe(r, 0.7), '#4c5a3a', '#b3bf92', 0.14, -r, r), x, y, z));
    return assembler(pieces);
  },
  // Pin parasol : long fût nu un peu penché, couronne plate en ombrelle.
  pin() {
    const pieces = [colorer(tronc(0.28, 0.16, 7.6, 0.12, 0.5), '#5b3b28', '#8a5a3b')];
    const sommet = new Vector3(0, 7.6, 0).applyEuler(new Euler(0.12, 0.5, 0, 'YXZ'));
    const centres = [
      [0, 0.3, 0, 2.5],
      [2.3, 0, 0.6, 1.9],
      [-2.2, 0, -0.5, 2.0],
      [0.5, 0.05, 2.2, 1.8],
      [-0.6, 0.1, -2.3, 1.8],
      [1.6, 0, -1.7, 1.6],
      [-1.7, 0, 1.6, 1.6],
    ];
    for (const [x, y, z, r] of centres) {
      pieces.push(placer(colorer(touffe(r, 0.42), '#26391b', '#6f8f43', 0.14, -r * 0.42, r * 0.42), sommet.x + x, sommet.y + y, sommet.z + z));
    }
    return assembler(pieces);
  },
  // Cyprès : une flamme vert sombre, haute et serrée.
  cypres() {
    const corps = touffe(1, 1, 2);
    const p = corps.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); // de -1 à 1
      const effile = 1 - Math.max(0, y) * 0.75; // pointe en haut
      p.setXYZ(i, p.getX(i) * 0.95 * effile, (y + 1) * 4.6 + 0.4, p.getZ(i) * 0.95 * effile);
    }
    corps.computeVertexNormals();
    return assembler([colorer(tronc(0.16, 0.12, 0.8), ...ECORCE), colorer(corps, '#1f3319', '#55743a', 0.12)]);
  },
  // Palmier : stipe annelé et courbe, palmes retombantes.
  palmier() {
    const pieces: BufferGeometry[] = [];
    const segments = 9;
    let base = new Vector3();
    let angle = 0;
    for (let i = 0; i < segments; i++) {
      const h = 0.85;
      angle += 0.035;
      const g = new CylinderGeometry(0.2 - i * 0.008, 0.24 - i * 0.008, h, 8, 1, true);
      g.deleteAttribute('uv');
      g.translate(0, h / 2, 0);
      g.rotateZ(-angle);
      g.translate(base.x, base.y, base.z);
      colorer(g, i % 2 ? '#7a6650' : '#8d7a60', i % 2 ? '#8d7a60' : '#a08c70', 0.06);
      pieces.push(g);
      base = base.add(new Vector3(Math.sin(angle) * h, Math.cos(angle) * h, 0));
    }
    const nPalmes = 11;
    for (let k = 0; k < nPalmes; k++) {
      const l = 3.4;
      const g = new PlaneGeometry(l, 0.7, 8, 1);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i) + l / 2; // 0 à l
        const largeur = Math.sin((x / l) * Math.PI) * (0.4 + 0.6 * (1 - x / l));
        pp.setXYZ(i, x, -0.11 * x * x + 0.25 * x, pp.getY(i) * largeur);
      }
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      g.rotateZ((k % 3) * 0.12 - 0.05);
      g.rotateY((k / nPalmes) * Math.PI * 2 + (k % 2) * 0.2);
      g.translate(base.x, base.y, base.z);
      colorer(g, '#3d5f25', '#7ea24a', 0.12, base.y - 1.2, base.y + 0.5);
      pieces.push(g);
    }
    pieces.push(placer(colorer(touffe(0.35, 1), '#5a4a32', '#7b6a48'), base.x, base.y - 0.1, base.z));
    return assembler(pieces);
  },
  // Buisson : boule taillée, pour les haies et les jardinières (rayon 1, posée au sol).
  buisson() {
    return assembler([placer(colorer(touffe(1, 0.8), '#2b4420', '#7a9f4c', 0.14), 0, 0.7, 0)]);
  },
  // Lavande : un coussin bas et bleu-violet (étiré par l'instanciation pour former les rangs).
  lavande() {
    return assembler([placer(colorer(touffe(1, 0.6), '#3f4a3a', '#9c86d4', 0.16), 0, 0.45, 0)]);
  },
  // Roseaux : une touffe de tiges fines au bord de l'étang.
  roseaux() {
    const pieces: BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const g = new CylinderGeometry(0.005, 0.035, 1.6 + (i % 3) * 0.4, 3, 1, true);
      g.deleteAttribute('uv');
      g.translate(0, 0.9, 0);
      g.rotateX(0.12 * Math.cos(a * 3));
      g.rotateZ(0.12 * Math.sin(a * 2));
      g.translate(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
      pieces.push(colorer(g, '#5d6e33', '#c3b77d', 0.1));
    }
    return assembler(pieces);
  },
};

/** Les arbres à planter, par essence ; plantés d'un coup à la fin (une instanciation par essence). */
export class Pepiniere {
  private places = new Map<Essence, Matrix4[]>();
  private tirage = alea;

  planter(essence: Essence, x: number, z: number, taille = 1, y = 0, aplatir = 1) {
    const t = taille * (0.85 + this.tirage() * 0.3);
    const m = new Matrix4().compose(
      new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(0, this.tirage() * Math.PI * 2, 0)),
      new Vector3(t, t * aplatir, t),
    );
    if (!this.places.has(essence)) this.places.set(essence, []);
    this.places.get(essence)!.push(m);
  }

  /** Nombre de sujets plantés (pour les ombres au sol). */
  liste() {
    return [...this.places.entries()];
  }

  /** Crée une InstancedMesh par essence. */
  pousser(materiau: MeshStandardMaterial, ombre = false) {
    const maillages: InstancedMesh[] = [];
    const teinte = new Color();
    for (const [essence, matrices] of this.places) {
      const geo = FABRIQUES[essence]();
      const im = new InstancedMesh(geo, materiau, matrices.length);
      im.name = `Quartier_${essence}`;
      matrices.forEach((m, i) => {
        im.setMatrixAt(i, m);
        const v = 0.88 + this.tirage() * 0.24;
        im.setColorAt(i, teinte.setRGB(v, v * (0.97 + this.tirage() * 0.06), v));
      });
      im.receiveShadow = true;
      im.castShadow = ombre;
      im.computeBoundingSphere();
      maillages.push(im);
    }
    return maillages;
  }
}

export function materiauVegetal() {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: DoubleSide });
}
