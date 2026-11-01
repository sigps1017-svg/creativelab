import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LineSegments,
  LineBasicMaterial,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  QuadraticBezierCurve3,
  Quaternion,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalesEau } from './piscine';
import { hasard, materiauVegetal, Pepiniere } from './vegetation';

// Le quartier autour de la maison d'architecture. Là où il n'y avait qu'une pelouse et des blocs
// gris, un quartier-jardin d'architecture blanche et méditerranéenne :
//   - de l'autre côté de l'avenue, face à l'entrée, une place dallée de travertin avec sa fontaine
//     à jets, ses tables sous parasols, un café et des guirlandes lumineuses ;
//   - à sa droite, un étang bordé de roseaux, avec un kiosque en bois sur pilotis et son ponton ;
//   - tout autour, des villas contemporaines aux volumes blancs décalés : terrasses, pergolas en
//     bois, toits plantés, piscines dans les jardins ; leurs fenêtres s'allument le soir ;
//   - « la Boucle » : une promenade plantée suspendue à 7 m qui fait le tour de l'îlot, enjambe
//     l'avenue deux fois et passe au-dessus de la place ; son garde-corps s'éclaire la nuit ;
//   - des rues secondaires avec trottoirs, passages piétons, platanes, palmiers et lampadaires.
// Tout est généré ici (pas dans le .glb Blender, dont la lumière précalculée demande ~15 h) : les
// pièces sont fusionnées par matériau et la végétation instanciée, pour rester léger.

// Coordonnées du site : bâtiment au centre, façade vers +z ; l'avenue existante longe z = 62.
const AVENUE_Z = 62;
const AVENUE_DEMI = 6;
const RUE_X = 100; // rues transversales en x = ±100
const RUE_ARRIERE_Z = -116;
const PLACE = { x: 0, z: 93, demiX: 27, demiZ: 20 };
const FONTAINE = new Vector2(0, 91);
const ETANG = new Vector2(56, 92);
const BOUCLE_Y = 7;

const tirage = hasard(2026);
const entre = (a: number, b: number) => a + tirage() * (b - a);

// ------------------------------------------------------------------ textures dessinées

function toile(taille: number, dessin: (ctx: CanvasRenderingContext2D, t: number) => void, couleur = true): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  dessin(c.getContext('2d')!, taille);
  const t = new CanvasTexture(c);
  if (couleur) t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function grain(ctx: CanvasRenderingContext2D, t: number, force: number, n = 9000) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * force})`;
    ctx.fillRect(Math.random() * t, Math.random() * t, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** Enduit à la chaux : blanc cassé, légèrement nuagé. */
const enduit = () =>
  toile(256, (ctx, t) => {
    ctx.fillStyle = '#f4f0e8';
    ctx.fillRect(0, 0, t, t);
    for (let i = 0; i < 40; i++) {
      const g = ctx.createRadialGradient(Math.random() * t, Math.random() * t, 0, Math.random() * t, Math.random() * t, 40 + Math.random() * 60);
      g.addColorStop(0, `rgba(205,195,180,${Math.random() * 0.12})`);
      g.addColorStop(1, 'rgba(205,195,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, t, t);
    }
    grain(ctx, t, 0.06);
  });

/** Dallage de travertin en opus romain (dalles de tailles variées). */
const travertin = () =>
  toile(512, (ctx, t) => {
    ctx.fillStyle = '#b9ad98';
    ctx.fillRect(0, 0, t, t);
    const pas = t / 8;
    for (let y = 0; y < 8; y++) {
      let x = (y % 2) * pas * 0.5 - pas;
      while (x < t) {
        const l = pas * (1 + Math.floor(Math.random() * 2) * 0.5);
        const v = 205 + Math.random() * 28;
        ctx.fillStyle = `rgb(${v + 6},${v},${v - 14})`;
        ctx.fillRect(x + 2, y * pas + 2, l - 4, pas - 4);
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = `rgba(150,130,100,${Math.random() * 0.12})`;
          ctx.fillRect(x + Math.random() * l, y * pas + Math.random() * pas, 10 + Math.random() * 30, 1.5);
        }
        x += l;
      }
    }
    grain(ctx, t, 0.08, 20000);
  });

const pavesTrottoir = () =>
  toile(256, (ctx, t) => {
    ctx.fillStyle = '#9d988d';
    ctx.fillRect(0, 0, t, t);
    const pas = t / 8;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const v = 180 + Math.random() * 25;
        ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
        ctx.fillRect(x * pas + 1.5, y * pas + 1.5, pas - 3, pas - 3);
      }
    grain(ctx, t, 0.07);
  });

const bitume = () =>
  toile(256, (ctx, t) => {
    ctx.fillStyle = '#4a4a4c';
    ctx.fillRect(0, 0, t, t);
    grain(ctx, t, 0.18, 26000);
  });

/** Lames de bois (terrasses, pergolas, ponton, la Boucle). */
const lames = () =>
  toile(256, (ctx, t) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const v = 0.85 + Math.random() * 0.25;
      ctx.fillStyle = `rgb(${158 * v},${110 * v},${72 * v})`;
      ctx.fillRect(0, (i * t) / n, t, t / n);
      ctx.fillStyle = 'rgba(60,35,20,0.5)';
      ctx.fillRect(0, (i * t) / n, t, 2);
      for (let k = 0; k < 30; k++) {
        ctx.fillStyle = `rgba(90,55,30,${Math.random() * 0.18})`;
        ctx.fillRect(Math.random() * t, (i * t) / n + Math.random() * (t / n), 20 + Math.random() * 60, 1);
      }
    }
  });

/** Toile de store rayée, écrue et terre cuite. */
const rayures = () =>
  toile(128, (ctx, t) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f1e9da' : '#b4573a';
      ctx.fillRect((i * t) / 8, 0, t / 8, t);
    }
  });

/** Tache douce (ombres au sol, halos de lumière). */
const tache = () =>
  toile(
    128,
    (ctx, t) => {
      const g = ctx.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, t, t);
    },
    false,
  );

// ------------------------------------------------------------------ chantier : pièces fusionnées

type Cle =
  | 'enduit'
  | 'pierre'
  | 'verre'
  | 'verreSombre'
  | 'cadre'
  | 'bois'
  | 'toitVert'
  | 'travertin'
  | 'trottoir'
  | 'bitume'
  | 'marquage'
  | 'tissu'
  | 'store'
  | 'terreCuite'
  | 'berge'
  | 'gravier'
  | 'rocher'
  | 'eauPiscine'
  | 'bardeaux';

/** Projette des coordonnées de texture « au mètre », selon l'orientation de chaque face. */
function uvMonde(g: BufferGeometry, echelle: number) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) [u, v] = [p.getX(i), p.getZ(i)];
    else if (ax >= az) [u, v] = [p.getZ(i), p.getY(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = u / echelle;
    uv[i * 2 + 1] = v / echelle;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

class Chantier {
  pieces = new Map<Cle, BufferGeometry[]>();
  private repereCourant = new Matrix4();
  private local = new Matrix4();

  /** Les pièces suivantes sont posées dans le repère d'une parcelle (x, z, rotation). */
  repere(x: number, z: number, ry = 0) {
    this.repereCourant.makeRotationY(ry).setPosition(x, 0, z);
  }
  absolu() {
    this.repereCourant.identity();
  }

  ajouter(cle: Cle, g: BufferGeometry, local?: Matrix4) {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const nom of Object.keys(geo.attributes)) if (nom !== 'position' && nom !== 'normal') geo.deleteAttribute(nom);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (local) geo.applyMatrix4(local);
    geo.applyMatrix4(this.repereCourant);
    if (!this.pieces.has(cle)) this.pieces.set(cle, []);
    this.pieces.get(cle)!.push(geo);
    geo = g;
  }

  /** Boîte posée : (x, z) centre au sol, y0 = hauteur du dessous. */
  boite(cle: Cle, l: number, h: number, p: number, x: number, y0: number, z: number, ry = 0) {
    this.local.makeRotationY(ry).setPosition(x, y0 + h / 2, z);
    this.ajouter(cle, new BoxGeometry(l, h, p), this.local);
  }

  cylindre(cle: Cle, rHaut: number, rBas: number, h: number, x: number, y0: number, z: number, segments = 20) {
    this.local.makeTranslation(x, y0 + h / 2, z);
    this.ajouter(cle, new CylinderGeometry(rHaut, rBas, h, segments), this.local);
  }

  construire(groupe: Group, materiaux: Record<Cle, { mat: Material; echelle?: number; ombre?: boolean }>) {
    for (const [cle, geos] of this.pieces) {
      const { mat, echelle = 1, ombre = false } = materiaux[cle];
      const g = mergeGeometries(geos)!;
      uvMonde(g, echelle);
      const m = new Mesh(g, mat);
      m.name = `Quartier_${cle}`;
      m.receiveShadow = true;
      m.castShadow = ombre;
      groupe.add(m);
    }
  }
}

// ------------------------------------------------------------------ le quartier

export function creerQuartier(mobile: boolean) {
  const groupe = new Group();
  groupe.name = 'Quartier';
  const ch = new Chantier();
  const pep = new Pepiniere();
  const lampadaires: Vector3[] = [];
  const ombres: { x: number; z: number; r: number; f: number }[] = [];
  const animations: ((t: number) => void)[] = [];

  // ---- Matériaux ----
  const verreJour = { color: '#26343d', roughness: 0.06, metalness: 0.55, envMapIntensity: 1.5 };
  const verre = new MeshStandardMaterial({ ...verreJour, emissive: new Color('#ffc781'), emissiveIntensity: 0 });
  const verreSombre = new MeshStandardMaterial({ ...verreJour });
  const eauPiscine = new MeshStandardMaterial({ color: '#2a9fb5', roughness: 0.05, metalness: 0.1, emissive: new Color('#36c4dc'), emissiveIntensity: 0 });
  const materiaux = {
    enduit: { mat: new MeshStandardMaterial({ map: enduit(), roughness: 0.92 }), echelle: 4, ombre: true },
    pierre: { mat: new MeshStandardMaterial({ color: '#e2d9c8', roughness: 0.7 }), ombre: true },
    verre: { mat: verre },
    verreSombre: { mat: verreSombre },
    cadre: { mat: new MeshStandardMaterial({ color: '#2c2b29', roughness: 0.45, metalness: 0.6 }), ombre: true },
    bois: { mat: new MeshStandardMaterial({ map: lames(), roughness: 0.7 }), echelle: 2, ombre: true },
    toitVert: { mat: new MeshStandardMaterial({ color: '#5f7c3f', roughness: 0.95 }) },
    travertin: { mat: new MeshStandardMaterial({ map: travertin(), roughness: 0.78 }), echelle: 9 },
    trottoir: { mat: new MeshStandardMaterial({ map: pavesTrottoir(), roughness: 0.85 }), echelle: 2.4 },
    bitume: { mat: new MeshStandardMaterial({ map: bitume(), roughness: 0.92, color: '#b8b8b8' }), echelle: 5 },
    marquage: { mat: new MeshStandardMaterial({ color: '#efefea', roughness: 0.7 }) },
    tissu: { mat: new MeshStandardMaterial({ color: '#f2ebdd', roughness: 0.9, side: DoubleSide }), ombre: true },
    store: { mat: new MeshStandardMaterial({ map: rayures(), roughness: 0.9, side: DoubleSide }), echelle: 2.4, ombre: true },
    terreCuite: { mat: new MeshStandardMaterial({ color: '#b56a48', roughness: 0.85 }) },
    berge: { mat: new MeshStandardMaterial({ color: '#8b7d5e', roughness: 1 }) },
    gravier: { mat: new MeshStandardMaterial({ map: pavesTrottoir(), color: '#efe2c6', roughness: 1, side: DoubleSide }), echelle: 1.2 },
    rocher: { mat: new MeshStandardMaterial({ color: '#a39b8c', roughness: 0.95 }) },
    eauPiscine: { mat: eauPiscine },
    bardeaux: { mat: new MeshStandardMaterial({ color: '#5a3d2b', roughness: 0.85, flatShading: true }), ombre: true },
  } satisfies Record<Cle, { mat: Material; echelle?: number; ombre?: boolean }>;

  // ================================================================ rues

  ch.absolu();
  // Trottoir nord de l'avenue (le sud existe déjà dans le modèle), coupé aux rues transversales.
  for (const [x0, x1] of [
    [-200, -RUE_X - 5],
    [-RUE_X + 5, RUE_X - 5],
    [RUE_X + 5, 200],
  ]) {
    ch.boite('trottoir', x1 - x0, 0.14, 4, (x0 + x1) / 2, 0, AVENUE_Z + AVENUE_DEMI + 2);
  }
  // Rues transversales (x = ±100) et rue arrière, avec leurs trottoirs.
  for (const sx of [-1, 1]) {
    const x = sx * RUE_X;
    for (const [z0, z1] of [
      [-190, AVENUE_Z - AVENUE_DEMI],
      [AVENUE_Z + AVENUE_DEMI, 240],
    ]) {
      ch.boite('bitume', 10, 0.03, z1 - z0, x, 0, (z0 + z1) / 2);
      for (const c of [-1, 1]) {
        ch.boite('trottoir', 3, 0.14, z1 - z0, x + c * 6.5, 0, (z0 + z1) / 2);
      }
      // Pointillés centraux.
      for (let z = z0 + 4; z < z1 - 2; z += 8) ch.boite('marquage', 0.15, 0.01, 3, x, 0.03, z);
    }
  }
  ch.boite('bitume', 2 * RUE_X - 10, 0.03, 9, 0, 0, RUE_ARRIERE_Z);
  ch.boite('trottoir', 2 * RUE_X - 16, 0.14, 3, 0, 0, RUE_ARRIERE_Z + 6);
  ch.boite('trottoir', 2 * RUE_X - 16, 0.14, 3, 0, 0, RUE_ARRIERE_Z - 6);

  // Passages piétons : bandes parallèles à la circulation.
  const passage = (x: number, z: number, longueur: number, travers: 'x' | 'z') => {
    for (let d = -longueur / 2 + 0.5; d < longueur / 2; d += 1.1) {
      if (travers === 'z') ch.boite('marquage', 3.6, 0.012, 0.55, x, 0.02, z + d);
      else ch.boite('marquage', 0.55, 0.012, 3.6, x + d, 0.035, z);
    }
  };
  passage(0, AVENUE_Z, 2 * AVENUE_DEMI, 'z'); // de l'allée d'entrée à la place
  passage(-RUE_X + 9, AVENUE_Z, 2 * AVENUE_DEMI, 'z');
  passage(RUE_X - 9, AVENUE_Z, 2 * AVENUE_DEMI, 'z');
  for (const sx of [-1, 1]) {
    passage(sx * RUE_X, AVENUE_Z - 12, 10, 'x');
    passage(sx * RUE_X, AVENUE_Z + 12, 10, 'x');
  }

  // Arbres d'alignement et lampadaires le long des rues.
  for (let z = -180; z < 230; z += 15) {
    if (Math.abs(z - AVENUE_Z) < 14 || Math.abs(z - RUE_ARRIERE_Z) < 10) continue;
    for (const sx of [-1, 1]) {
      const palmier = Math.round(z / 15) % 2 === 0;
      pep.planter(palmier ? 'palmier' : 'platane', sx * (RUE_X - 6.8), z, palmier ? 1.05 : 0.9, 0.14);
      pep.planter(palmier ? 'platane' : 'palmier', sx * (RUE_X + 6.8), z + 7, palmier ? 0.9 : 1.05, 0.14);
      ombres.push({ x: sx * (RUE_X - 6.8), z, r: palmier ? 3 : 5, f: 0.5 });
      ombres.push({ x: sx * (RUE_X + 6.8), z: z + 7, r: palmier ? 5 : 3, f: 0.5 });
    }
    if (Math.round(z / 15) % 2 === 0) {
      lampadaires.push(new Vector3(-RUE_X + 6.2, 0.14, z + 3.5), new Vector3(RUE_X - 6.2, 0.14, z + 3.5));
    }
  }
  for (let x = -190; x <= 190; x += 16) {
    if (Math.abs(Math.abs(x) - RUE_X) < 10) continue;
    if (Math.abs(x - PLACE.x) > PLACE.demiX + 2) pep.planter('platane', x, AVENUE_Z + AVENUE_DEMI + 2.6, 0.95, 0.14);
    if (Math.round(x / 16) % 2 === 0) lampadaires.push(new Vector3(x + 8, 0.14, AVENUE_Z + AVENUE_DEMI + 1.2));
  }
  for (let x = -RUE_X + 12; x <= RUE_X - 12; x += 16) {
    pep.planter('olivier', x, RUE_ARRIERE_Z + 6.5, 1, 0.14);
    pep.planter('cypres', x + 8, RUE_ARRIERE_Z - 6.5, 1, 0.14);
    if (Math.round(x / 16) % 2 === 0) lampadaires.push(new Vector3(x + 4, 0.14, RUE_ARRIERE_Z + 5.6));
  }

  // ---- Le parvis de la maison ----
  // Les arbres du modèle Blender (boules de feuillage) sont masqués par modele.ts : on replante
  // aux mêmes endroits des essences du quartier, et les haies qui cadrent le parvis.
  const parvis = new Pepiniere(); // proches du bâtiment : ils portent une ombre au soleil
  for (const x of [-60, -48, -12, 12, 24, 36, 48, 60]) {
    parvis.planter('platane', x, 54.5, 0.85, 0.12);
    ombres.push({ x, z: 54.5, r: 4.5, f: 0.4 });
  }
  const jardin: [number, number, 'pin' | 'platane' | 'olivier'][] = [
    [24, 20, 'pin'],
    [27, 30, 'platane'],
    [-27, 20, 'platane'],
    [-38, 30, 'pin'],
    [30, 6, 'platane'],
    [-31, 4, 'pin'],
    [26, -10, 'pin'],
    [-27, -12, 'platane'],
    [16, 40, 'olivier'],
    [-44, 14, 'platane'],
  ];
  for (const [x, z, essence] of jardin) parvis.planter(essence, x, z, essence === 'olivier' ? 1.3 : 0.85);
  for (const sx of [-1, 1]) {
    for (let z = 16.5; z <= 41.5; z += 0.85) parvis.planter('buisson', sx * 26, z, 0.62, 0, 1.15);
  }

  // ================================================================ villas

  /** Une villa contemporaine, façade vers +z de son repère : volumes blancs décalés. */
  const villa = (x: number, z: number, ry: number) => {
    ch.repere(x, z, ry);
    const W = Math.round(entre(11, 16));
    const D = Math.round(entre(9, 12));
    const H = 3.4;
    const fenetres = (l: number, y0: number, h: number, cx: number, cz: number, rot: number, n: number, largeurMax: number) => {
      // Une rangée de baies (verre et menuiserie fine) sur une façade.
      const pas = l / n;
      for (let i = 0; i < n; i++) {
        const w = Math.min(largeurMax, pas - 0.9);
        const d = -l / 2 + pas * (i + 0.5);
        const dx = Math.cos(rot) * d;
        const dz = -Math.sin(rot) * d;
        const nx = Math.sin(rot);
        const nz = Math.cos(rot);
        ch.boite('cadre', w + 0.16, h + 0.16, 0.08, cx + dx + nx * 0.02, y0 - 0.08, cz + dz + nz * 0.02, rot);
        ch.boite(tirage() < 0.6 ? 'verre' : 'verreSombre', w, h, 0.06, cx + dx + nx * 0.05, y0, cz + dz + nz * 0.05, rot);
        // Meneau au milieu des grandes baies.
        if (w > 2.2) ch.boite('cadre', 0.06, h, 0.1, cx + dx + nx * 0.08, y0, cz + dz + nz * 0.08, rot);
      }
    };

    // Parcelle : sol de pierre devant, muret blanc à couvertine, haie et jardin.
    const px = W / 2 + 3.5;
    const pz0 = -D / 2 - 9;
    const pz1 = D / 2 + 5;
    ch.boite('pierre', W + 2, 0.06, 4.2, 0, 0, D / 2 + 2.1);
    for (const sx of [-1, 1]) {
      ch.boite('enduit', 0.3, 1.1, pz1 - pz0, sx * px, 0, (pz0 + pz1) / 2);
      ch.boite('pierre', 0.42, 0.06, pz1 - pz0, sx * px, 1.1, (pz0 + pz1) / 2);
      ch.boite('enduit', px - 1.6, 1.1, 0.3, sx * (px + 1.6) / 2, 0, pz1);
      ch.boite('pierre', px - 1.6, 0.06, 0.42, sx * (px + 1.6) / 2, 1.1, pz1);
    }
    ch.boite('enduit', 2 * px, 1.6, 0.3, 0, 0, pz0);
    // Rez-de-chaussée et sa dalle débordante.
    ch.boite('enduit', W, H, D, 0, 0, 0);
    ch.boite('enduit', W + 0.6, 0.3, D + 0.6, 0, H, 0);
    fenetres(W - 1, 0.25, 2.6, 0, D / 2, 0, Math.max(2, Math.round(W / 4.2)), 3.2);
    for (const sx of [-1, 1]) fenetres(D - 2, 0.9, 1.6, (sx * W) / 2, 0, (sx * Math.PI) / 2, 2, 1.6);
    fenetres(W - 2, 0.25, 2.6, 0, -D / 2, Math.PI, 2, 3.4);
    // Auvent d'entrée et porte en bois.
    const porteX = W / 2 - 1.4;
    ch.boite('enduit', 2.6, 0.18, 2.2, porteX, 2.75, D / 2 + 1.1);
    ch.boite('bois', 1.2, 2.4, 0.1, porteX, 0, D / 2 + 0.05);

    // Étage : un volume plus petit, décalé, parfois en porte-à-faux vers la rue.
    const W2 = Math.round(W * entre(0.55, 0.75));
    const D2 = Math.round(D * entre(0.7, 0.92));
    const ox = (tirage() < 0.5 ? -1 : 1) * (W - W2) / 2;
    const oz = tirage() < 0.5 ? entre(0.6, 1.6) : -entre(0, 1.2);
    const y1 = H + 0.3;
    ch.boite('enduit', W2, H - 0.3, D2, ox, y1, oz);
    ch.boite('enduit', W2 + 0.5, 0.3, D2 + 0.5, ox, y1 + H - 0.3, oz);
    fenetres(W2 - 0.8, y1 + 0.2, 2.3, ox, oz + D2 / 2, 0, Math.max(1, Math.round(W2 / 3.6)), 3.4);
    fenetres(W2 - 1.5, y1 + 0.9, 1.4, ox, oz - D2 / 2, Math.PI, 2, 1.5);
    // Brise-soleil en lames de bois sur un côté de l'étage.
    const cote = Math.sign(ox) || 1;
    for (let k = 0; k < 9; k++) {
      ch.boite('bois', 0.08, H - 0.4, 0.22, ox + cote * (W2 / 2 + 0.12), y1 + 0.05, oz - D2 / 2 + 0.6 + k * ((D2 - 1.2) / 8), 0);
    }
    // Terrasse sur le toit du rez-de-chaussée : garde-corps vitré, pergola, jardinières.
    const tx = -ox; // côté libre
    const largeurTerrasse = W - W2;
    ch.boite('bois', largeurTerrasse - 0.4, 0.05, D - 0.4, tx, H + 0.3, 0);
    ch.boite('verreSombre', largeurTerrasse, 1.0, 0.04, tx, H + 0.3, D / 2 + 0.25);
    ch.boite('cadre', largeurTerrasse, 0.05, 0.08, tx, H + 1.3, D / 2 + 0.25);
    if (largeurTerrasse > 3) {
      const pl = largeurTerrasse - 0.8;
      for (const [a, b] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]) {
        ch.boite('cadre', 0.1, 2.5, 0.1, tx + (a * pl) / 2, H + 0.35, (b * (D - 2)) / 2 - 0.5);
      }
      for (let k = 0; k < 14; k++) ch.boite('bois', pl + 0.4, 0.16, 0.06, tx, H + 2.85, -D / 2 + 0.6 + k * ((D - 2.2) / 13));
      ch.boite('terreCuite', 0.5, 0.5, 0.5, tx + pl / 2 - 0.2, H + 0.35, D / 2 - 0.6);
      pep.planter('olivier', 0, 0, 0.35, 0, 1); // placé ci-dessous en coordonnées du site
      replacerDernier(x, z, ry, tx + pl / 2 - 0.2, H + 0.85, D / 2 - 0.6);
    }
    // Toit plat planté ; parfois un petit pavillon au second, avec son jardin.
    ch.boite('toitVert', W2 - 0.6, 0.12, D2 - 0.6, ox, y1 + H, oz);
    if (tirage() < 0.4) {
      const w3 = Math.min(5, W2 - 2);
      ch.boite('enduit', w3, 2.7, 4, ox - Math.sign(ox) * 0.5, y1 + H, oz - D2 / 2 + 2.4);
      ch.boite('enduit', w3 + 0.4, 0.25, 4.4, ox - Math.sign(ox) * 0.5, y1 + H + 2.7, oz - D2 / 2 + 2.4);
      fenetres(w3 - 0.6, y1 + H + 0.2, 2.2, ox - Math.sign(ox) * 0.5, oz - D2 / 2 + 4.4, 0, 1, 2.6);
    }
    // Jardin : piscine à l'arrière (une sur deux), haies, arbres.
    if (tirage() < 0.55) {
      const lp = Math.min(W - 2, 8);
      ch.boite('pierre', lp + 1.2, 0.12, 4.6, 0, 0, -D / 2 - 4.6);
      ch.boite('eauPiscine', lp, 0.02, 3.4, 0, 0.12, -D / 2 - 4.6);
      for (let k = 0; k < 2; k++) ch.boite('bois', 0.7, 0.35, 1.9, -lp / 2 + 1 + k * 1.2, 0.12, -D / 2 - 1.6);
    }
    const plantes: [number, number][] = [];
    for (let k = 0; k < 6; k++) plantes.push([-px + 1 + k * ((2 * px - 2) / 5), pz0 + 1]);
    for (const [bx, bz] of plantes) planterDans(x, z, ry, 'buisson', bx, bz, 0.7);
    planterDans(x, z, ry, tirage() < 0.5 ? 'palmier' : 'olivier', -px + 1.6, pz1 - 1.6, 0.9);
    planterDans(x, z, ry, tirage() < 0.5 ? 'cypres' : 'pin', px - 1.8, pz0 + 2.2, 0.8);
    planterDans(x, z, ry, 'cypres', px - 1.2, D / 2 + 1, 0.7);
    for (let k = 0; k < 4; k++) planterDans(x, z, ry, 'buisson', -W / 2 + 0.8 + k * 1.2, D / 2 + 3.6, 0.45);
    ombres.push({ x, z, r: Math.max(W, D) * 0.95, f: 0.45 });
    ch.absolu();
  };

  /** Plante dans le repère d'une parcelle. */
  const versSite = (x: number, z: number, ry: number, lx: number, lz: number) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [x + lx * c + lz * s, z - lx * s + lz * c] as const;
  };
  function planterDans(x: number, z: number, ry: number, essence: Parameters<Pepiniere['planter']>[0], lx: number, lz: number, taille: number) {
    const [sx, sz] = versSite(x, z, ry, lx, lz);
    pep.planter(essence, sx, sz, taille);
    if (essence !== 'buisson') ombres.push({ x: sx, z: sz, r: 3.2 * taille, f: 0.55 });
  }
  function replacerDernier(x: number, z: number, ry: number, lx: number, y: number, lz: number) {
    // L'olivier en pot de la terrasse : on le replace dans le repère de la parcelle.
    const liste = pep.liste().find(([e]) => e === 'olivier')![1];
    const m = liste[liste.length - 1];
    const [sx, sz] = versSite(x, z, ry, lx, lz);
    m.elements[12] = sx;
    m.elements[13] = y;
    m.elements[14] = sz;
  }

  const VILLAS: [number, number, number][] = [
    // De l'autre côté de l'avenue, de part et d'autre de la place et de l'étang.
    [-84, 86, Math.PI],
    [-126, 86, Math.PI],
    [-160, 88, Math.PI],
    [126, 86, Math.PI],
    [160, 88, Math.PI],
    // Côté bâtiment, au-delà des rues transversales.
    [-126, 38, 0],
    [-160, 36, 0],
    [126, 38, 0],
    [160, 36, 0],
    // Le long des rues transversales.
    [-118, -6, Math.PI / 2],
    [-118, -48, Math.PI / 2],
    [-118, -88, Math.PI / 2],
    [118, -6, -Math.PI / 2],
    [118, -48, -Math.PI / 2],
    [118, -88, -Math.PI / 2],
    [-118, 130, Math.PI / 2],
    [118, 128, -Math.PI / 2],
    [-118, 170, Math.PI / 2],
    [118, 168, -Math.PI / 2],
    // Derrière, au-delà de la rue arrière.
    [-74, -138, 0],
    [-38, -140, 0],
    [0, -138, 0],
    [38, -140, 0],
    [74, -138, 0],
    // Au fond, derrière la place et l'étang (la tour Horizon est à gauche).
    [6, 142, Math.PI],
    [40, 140, Math.PI],
    [76, 142, Math.PI],
    [24, 176, Math.PI],
    [62, 178, Math.PI],
  ];
  const villas = mobile ? VILLAS.filter(([x, z]) => Math.hypot(x, z) < 175) : VILLAS;
  for (const [x, z, ry] of villas) villa(x, z, ry);

  // ================================================================ la place

  ch.absolu();
  const { x: PX, z: PZ, demiX, demiZ } = PLACE;
  ch.boite('travertin', 2 * demiX, 0.12, 2 * demiZ, PX, 0, PZ);
  // Bordure de pierre.
  for (const s of [-1, 1]) {
    ch.boite('pierre', 2 * demiX + 0.6, 0.16, 0.3, PX, 0, PZ + s * demiZ);
    ch.boite('pierre', 0.3, 0.16, 2 * demiZ, PX + s * demiX, 0, PZ);
  }

  // Fontaine : bassin en pierre, double vasque, jets en gerbe ; couronne de buis.
  const profil = (pts: [number, number][]) => pts.map(([r, y]) => new Vector2(r, y));
  const lathe = (cle: Cle, pts: [number, number][], x: number, z: number, segments = 64) => {
    ch.ajouter(cle, new LatheGeometry(profil(pts), segments), new Matrix4().makeTranslation(x, 0, z));
  };
  lathe('pierre', [
    [0, 0.12],
    [5.6, 0.12],
    [5.6, 0.62],
    [5.85, 0.66],
    [5.85, 0.78],
    [5.25, 0.78],
    [5.25, 0.3],
    [0, 0.3],
  ], FONTAINE.x, FONTAINE.y);
  lathe('pierre', [
    [0, 0.3],
    [0.75, 0.3],
    [0.5, 0.8],
    [0.42, 1.6],
    [0.6, 1.8],
    [2.1, 2.05],
    [2.2, 2.2],
    [1.9, 2.2],
    [0.3, 2.1],
    [0.22, 2.7],
    [0.4, 2.85],
    [1.05, 3.05],
    [1.1, 3.15],
    [0.9, 3.15],
    [0.12, 3.1],
    [0.12, 3.5],
    [0.22, 3.62],
    [0, 3.7],
  ], FONTAINE.x, FONTAINE.y, 48);
  const normales = normalesEau();
  normales.repeat.set(3, 3);
  const eauMat = new MeshStandardMaterial({
    color: '#1d6a78',
    roughness: 0.04,
    metalness: 0.15,
    normalMap: normales,
    envMapIntensity: 1.6,
    emissive: new Color('#3fb8d0'),
    emissiveIntensity: 0,
  });
  eauMat.normalScale.set(0.35, 0.35);
  const disque = (r: number, y: number) => {
    const m = new Mesh(new CylinderGeometry(r, r, 0.02, 64), eauMat);
    m.position.set(FONTAINE.x, y, FONTAINE.y);
    groupe.add(m);
  };
  disque(5.28, 0.62);
  disque(1.95, 2.12);
  disque(0.95, 3.08);
  // Jets : une gerbe centrale et huit arcs qui retombent dans le bassin.
  const jetMat = new MeshStandardMaterial({
    color: '#e8f6fa',
    roughness: 0.1,
    transparent: true,
    opacity: 0.55,
    emissive: new Color('#bfefff'),
    emissiveIntensity: 0.15,
    depthWrite: false,
  });
  const jets: BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const courbe = new QuadraticBezierCurve3(
      new Vector3(dx * 4.9, 0.7, dz * 4.9),
      new Vector3(dx * 3.6, 3.4, dz * 3.6),
      new Vector3(dx * 2.3, 0.65, dz * 2.3),
    );
    jets.push(new TubeGeometry(courbe, 20, 0.05, 6, false));
  }
  const gerbe = new CylinderGeometry(0.03, 0.09, 2.4, 8, 1, true);
  gerbe.translate(0, 3.7 + 1.2, 0);
  jets.push(gerbe);
  const jetMesh = new Mesh(mergeGeometries(jets.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const nom of Object.keys(g.attributes)) if (nom !== 'position' && nom !== 'normal') g.deleteAttribute(nom);
    return g;
  }))!, jetMat);
  jetMesh.position.set(FONTAINE.x, 0, FONTAINE.y);
  jetMesh.renderOrder = 3;
  groupe.add(jetMesh);
  animations.push((t) => {
    normales.offset.set(t * 0.03, t * 0.021);
    const pulse = 1 + Math.sin(t * 1.7) * 0.04;
    jetMesh.scale.set(1, pulse, 1);
    jetMat.opacity = 0.5 + Math.sin(t * 9) * 0.05;
  });
  // Couronne de buis taillés autour du bassin, interrompue face à l'entrée.
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) > 0.97) continue;
    pep.planter('buisson', FONTAINE.x + Math.cos(a) * 7.3, FONTAINE.y + Math.sin(a) * 7.3, 0.62, 0.12, 0.9);
  }

  // Tables de café sous parasols, en anneau autour de la fontaine.
  const tableCafe = (x: number, z: number, a: number) => {
    ch.cylindre('cadre', 0.06, 0.06, 0.72, x, 0.12, z, 8);
    ch.cylindre('pierre', 0.45, 0.45, 0.04, x, 0.84, z, 24);
    for (let k = 0; k < 4; k++) {
      const b = a + (k * Math.PI) / 2 + Math.PI / 4;
      const cx = x + Math.cos(b) * 0.85;
      const cz = z + Math.sin(b) * 0.85;
      ch.boite('bois', 0.44, 0.05, 0.44, cx, 0.55, cz, -b);
      ch.boite('bois', 0.44, 0.45, 0.05, cx + Math.cos(b) * 0.2, 0.6, cz + Math.sin(b) * 0.2, Math.PI / 2 - b);
      for (const [u, v] of [
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ]) ch.boite('cadre', 0.03, 0.43, 0.03, cx + u, 0.12, cz + v);
    }
    // Parasol : mât et toile à huit pans.
    ch.cylindre('cadre', 0.035, 0.035, 2.4, x, 0.84, z, 6);
    const toileP = new ConeGeometry(1.7, 0.55, 8, 1, true);
    ch.ajouter('tissu', toileP, new Matrix4().makeTranslation(x, 3.0, z));
  };
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.31;
    if (Math.sin(a) > 0.8) continue; // allée vers le café dégagée
    tableCafe(FONTAINE.x + Math.cos(a) * 13.2, FONTAINE.y + Math.sin(a) * 11.5, a);
  }

  // Le café : pavillon blanc vitré au fond de la place, store rayé et terrasse.
  const CZ = PZ + demiZ - 4.5;
  ch.boite('enduit', 22, 4.2, 6, 0, 0.12, CZ + 1.2);
  ch.boite('enduit', 23, 0.35, 7, 0, 4.3, CZ + 1.2);
  ch.boite('cadre', 21, 3.1, 0.08, 0, 0.3, CZ - 1.82);
  for (let i = 0; i < 7; i++) {
    ch.boite(i === 3 ? 'verreSombre' : 'verre', 2.75, 2.9, 0.06, -9 + i * 3, 0.4, CZ - 1.88);
  }
  const store = new PlaneGeometry(21, 2.6);
  store.rotateX(-Math.PI / 2 + 0.35);
  ch.ajouter('store', store, new Matrix4().makeTranslation(0, 3.35, CZ - 3.0));
  for (let i = 0; i < 3; i++) {
    const tx = -7 + i * 7;
    for (const d of [-1, 1]) {
      ch.boite('pierre', 1.2, 0.75, 0.7, tx + d * 1.6, 0.12, CZ - 4.6);
    }
    pep.planter('olivier', tx, CZ - 4.6, 0.55, 0.85);
  }
  // Grands oliviers en bacs aux angles, platanes sur les côtés.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ox = PX + sx * (demiX - 3);
      const oz = PZ + sz * (demiZ - 3.5) - (sz > 0 ? 3 : 0);
      ch.boite('pierre', 2.4, 0.6, 2.4, ox, 0.12, oz);
      ch.boite('toitVert', 2.1, 0.05, 2.1, ox, 0.72, oz);
      pep.planter('olivier', ox, oz, 1.05, 0.75);
    }
    for (let k = 0; k < 4; k++) {
      const z = PZ - demiZ + 8 + k * 7.5;
      pep.planter('platane', PX + sx * (demiX - 1.4), z, 1.05, 0.12);
      ombres.push({ x: PX + sx * (demiX - 1.4), z, r: 5.5, f: 0.4 });
      ch.boite('bois', 0.55, 0.45, 2.2, PX + sx * (demiX - 3.6), 0.12, z + 3.7);
      ch.boite('cadre', 0.5, 0.4, 0.08, PX + sx * (demiX - 3.6), 0.12, z + 2.9);
      ch.boite('cadre', 0.5, 0.4, 0.08, PX + sx * (demiX - 3.6), 0.12, z + 4.5);
    }
  }
  // La nuit, la place baigne dans la lumière chaude des guirlandes (une seule lampe, sur ordinateur).
  const lumierePlace = mobile ? null : new PointLight('#ffc27a', 0, 42, 1);
  if (lumierePlace) {
    lumierePlace.position.set(FONTAINE.x, 6, FONTAINE.y);
    groupe.add(lumierePlace);
  }
  // Lampadaires de la place.
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) lampadaires.push(new Vector3(PX + sx * (demiX - 6.5), 0.12, PZ + sz * 9));

  // Guirlandes lumineuses tendues au-dessus de la place.
  const mats: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 0.2, 1]) mats.push(new Vector3(PX + sx * (demiX - 1.2), 0, PZ + sz * (demiZ - 7)));
  for (const p of mats) ch.cylindre('cadre', 0.06, 0.08, 5.6, p.x, 0.12, p.z, 8);
  const brins: [Vector3, Vector3][] = [
    [mats[0], mats[3]],
    [mats[1], mats[4]],
    [mats[0], mats[4]],
    [mats[1], mats[3]],
    [mats[1], mats[5]],
    [mats[2], mats[4]],
  ];
  const ampoules: Vector3[] = [];
  const fils: Vector3[] = [];
  for (const [a0, b0] of brins) {
    const a = a0.clone().setY(5.6);
    const b = b0.clone().setY(5.6);
    const n = Math.round(a.distanceTo(b) / 1.3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 1.4;
      fils.push(p);
      if (i > 0) fils.push(p);
      if (i > 0 && i < n) ampoules.push(p.clone().setY(p.y - 0.12));
    }
    fils.pop();
  }
  const fil = new LineSegments(new BufferGeometry().setFromPoints(fils), new LineBasicMaterial({ color: '#2b2622' }));
  groupe.add(fil);
  const ampouleMat = new MeshStandardMaterial({ color: '#fff4dc', emissive: new Color('#ffcf7a'), emissiveIntensity: 0.4 });
  const bulbes = new InstancedMesh(new SphereGeometry(0.09, 8, 6), ampouleMat, ampoules.length);
  ampoules.forEach((p, i) => bulbes.setMatrixAt(i, new Matrix4().makeTranslation(p.x, p.y, p.z)));
  groupe.add(bulbes);

  // ================================================================ le jardin de l'atelier

  // Derrière la maison, à l'intérieur de la Boucle : un jardin méditerranéen sur l'axe du
  // bâtiment. Terrasse de travertin à la sortie, long miroir d'eau bordé de cyprès, allées de
  // gravier, oliveraie d'un côté, rangs de lavande de l'autre, et une pergola blanche au bout.
  const JZ0 = -18; // sortie arrière du bâtiment
  const JZ1 = -80; // fond du jardin
  ch.boite('travertin', 30, 0.08, 6, 0, 0, JZ0 - 3);
  const bassinZ0 = JZ0 - 8;
  const bassinZ1 = JZ1 + 10;
  const bassinL = bassinZ0 - bassinZ1;
  const bassinZ = (bassinZ0 + bassinZ1) / 2;
  ch.boite('pierre', 9, 0.42, bassinL + 1, 0, 0, bassinZ);
  const miroir = new Mesh(new PlaneGeometry(8, bassinL).rotateX(-Math.PI / 2), eauMat);
  miroir.position.set(0, 0.43, bassinZ);
  groupe.add(miroir);
  for (const sx of [-1, 1]) {
    ch.boite('pierre', 3, 0.05, JZ0 - JZ1 + 6, sx * 7, 0, (JZ0 + JZ1) / 2 - 3);
    for (let z = bassinZ0 - 2; z >= bassinZ1; z -= 6) {
      pep.planter('cypres', sx * 9.6, z, 0.95);
      ombres.push({ x: sx * 9.6, z, r: 2, f: 0.4 });
    }
    for (let z = bassinZ0 - 5; z >= bassinZ1; z -= 12) lampadaires.push(new Vector3(sx * 5.2, 0, z));
  }
  // Oliveraie à gauche, en quinconce.
  for (let i = 0; i < 5; i++) {
    for (let k = 0; k < 7; k++) {
      const x = -16 - i * 6.5;
      const z = JZ0 - 9 - k * 7 - (i % 2) * 3.5;
      pep.planter('olivier', x, z, 1.15);
      ombres.push({ x, z, r: 3.2, f: 0.45 });
    }
  }
  // Lavande à droite : des rangs réguliers, comme en Provence.
  for (let x = 14; x <= 42; x += 2.4) {
    for (let z = JZ0 - 8; z >= JZ1 + 6; z -= 2.6) pep.planter('lavande', x, z, 0.7, 0, 1);
  }
  // Pergola blanche au bout de l'axe, avec bancs et grandes jarres.
  const PZ0 = JZ1 + 4;
  ch.boite('travertin', 16, 0.08, 8, 0, 0, PZ0);
  for (const sx of [-1, 1]) {
    for (const dz of [-2.6, 2.6]) {
      for (const x of [3, 7]) ch.cylindre('enduit', 0.26, 0.3, 3.2, sx * x, 0.08, PZ0 + dz, 16);
    }
    ch.boite('bois', 3.2, 0.08, 0.6, sx * 5, 0.5, PZ0, 0);
    ch.boite('pierre', 0.5, 0.42, 0.5, sx * 3.8, 0.08, PZ0);
    ch.boite('pierre', 0.5, 0.42, 0.5, sx * 6.2, 0.08, PZ0);
    ch.cylindre('terreCuite', 0.55, 0.35, 1.1, sx * 9.2, 0.08, PZ0 - 2.6, 16);
    pep.planter('olivier', sx * 9.2, PZ0 - 2.6, 0.45, 1.15);
  }
  ch.boite('enduit', 15.4, 0.3, 0.3, 0, 3.28, PZ0 - 2.6);
  ch.boite('enduit', 15.4, 0.3, 0.3, 0, 3.28, PZ0 + 2.6);
  for (let k = 0; k < 18; k++) ch.boite('bois', 0.12, 0.2, 6.2, -7.65 + k * 0.9, 3.58, PZ0);
  // Haie en arc de cercle derrière la pergola.
  for (let k = 0; k <= 24; k++) {
    const a = Math.PI + (k / 24) * Math.PI;
    pep.planter('buisson', Math.cos(a) * 11, PZ0 - 1 + Math.sin(a) * 5.5, 0.75, 0, 1.3);
  }

  // ================================================================ l'étang et son kiosque

  // Contour organique de l'étang (lissé), puis berge, allée de gravier et eau.
  const contour = (marge: number) => {
    const pts: Vector3[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + 0.18 * Math.sin(a * 2 + 0.6) + 0.1 * Math.cos(a * 3 + 1.3);
      pts.push(new Vector3(ETANG.x + Math.cos(a) * (17 * r + marge), 0, ETANG.y + Math.sin(a) * (12 * r + marge)));
    }
    return new CatmullRomCurve3(pts, true, 'centripetal').getSpacedPoints(160).slice(0, -1);
  };
  const forme = (pts: Vector3[]) => new Shape(pts.map((p) => new Vector2(p.x, -p.z)));
  const plan = (pts: Vector3[], cle: Cle, y: number) => {
    const g = new ShapeGeometry(forme(pts));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    ch.ajouter(cle, g);
  };
  /** Ruban entre deux contours (allée, berge). */
  const anneau = (a: Vector3[], b: Vector3[], cle: Cle, y: number) => {
    const pos: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      pos.push(a[i].x, y, a[i].z, b[i].x, y, b[i].z, a[j].x, y, a[j].z);
      pos.push(a[j].x, y, a[j].z, b[i].x, y, b[i].z, b[j].x, y, b[j].z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    ch.ajouter(cle, g);
  };
  const bordEau = contour(0);
  plan(contour(2.2), 'berge', 0.02);
  anneau(contour(5), contour(7.4), 'gravier', 0.05);
  const eauEtang = new MeshStandardMaterial({
    color: '#2b4f4a',
    roughness: 0.05,
    metalness: 0.2,
    normalMap: normales,
    envMapIntensity: 1.3,
  });
  eauEtang.normalScale.set(0.25, 0.25);
  const etangGeo = new ShapeGeometry(forme(bordEau));
  etangGeo.rotateX(-Math.PI / 2);
  const etang = new Mesh(etangGeo, eauEtang);
  etang.position.y = 0.06;
  etang.receiveShadow = true;
  groupe.add(etang);
  // Rochers, roseaux et nénuphars.
  const rochers: Matrix4[] = [];
  bordEau.forEach((p, i) => {
    const d = p.clone().sub(new Vector3(ETANG.x, 0, ETANG.y)).normalize();
    if (i % 3 === 0) {
      const s = entre(0.35, 0.8);
      rochers.push(new Matrix4().compose(
        p.clone().addScaledVector(d, 0.6).setY(0.05),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), entre(0, 6)),
        new Vector3(s, s * 0.55, s * entre(0.8, 1.3)),
      ));
    }
    if (i % 9 === 2 || i % 9 === 3) pep.planter('roseaux', p.x - d.x * 0.6, p.z - d.z * 0.6, entre(0.8, 1.2), 0.02);
  });
  const rocs = new InstancedMesh(new IcosahedronGeometry(1, 1), materiaux.rocher.mat, rochers.length);
  rochers.forEach((m, i) => {
    rocs.setMatrixAt(i, m);
    const v = entre(0.75, 1.1);
    rocs.setColorAt(i, new Color(v, v * 0.97, v * 0.9));
  });
  rocs.receiveShadow = true;
  groupe.add(rocs);
  const nenuphars: Matrix4[] = [];
  for (let i = 0; i < 26; i++) {
    const a = entre(0, Math.PI * 2);
    const r = Math.sqrt(entre(0.15, 0.8));
    nenuphars.push(new Matrix4().makeRotationY(entre(0, 6)).setPosition(ETANG.x - 5 + Math.cos(a) * 9 * r, 0.08, ETANG.y + 2 + Math.sin(a) * 6 * r));
  }
  const feuilles = new InstancedMesh(new CylinderGeometry(0.42, 0.42, 0.015, 10, 1, false, 0.3, Math.PI * 1.8), new MeshStandardMaterial({ color: '#4d7a33', roughness: 0.6 }), nenuphars.length);
  nenuphars.forEach((m, i) => feuilles.setMatrixAt(i, m));
  groupe.add(feuilles);

  // Le kiosque : plancher hexagonal sur pilotis au bord de l'eau, toit de bardeaux, lanterne.
  const KX = ETANG.x + 6;
  const KZ = ETANG.y + 4;
  const KY = 0.55;
  ch.ajouter('bois', new CylinderGeometry(4.1, 4.1, 0.22, 6), new Matrix4().makeTranslation(KX, KY, KZ));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ch.cylindre('bois', 0.12, 0.12, KY, KX + Math.cos(a) * 3.6, 0, KZ + Math.sin(a) * 3.6, 8);
    ch.cylindre('bois', 0.13, 0.13, 2.9, KX + Math.cos(a) * 3.7, KY + 0.1, KZ + Math.sin(a) * 3.7, 8);
    // Garde-corps bas entre les poteaux, sauf côté ponton.
    if (k !== 1) {
      const b = a + Math.PI / 6;
      const cx = KX + Math.cos(b) * 3.2;
      const cz = KZ + Math.sin(b) * 3.2;
      ch.boite('bois', 3.6, 0.08, 0.1, cx, KY + 0.95, cz, Math.PI / 2 - b);
      ch.boite('bois', 3.6, 0.08, 0.1, cx, KY + 0.55, cz, Math.PI / 2 - b);
      ch.boite('bois', 3.4, 0.08, 0.5, cx - Math.cos(b) * 0.3, KY + 0.45, cz - Math.sin(b) * 0.3, Math.PI / 2 - b);
    }
  }
  const ceinture = new CylinderGeometry(4.25, 4.25, 0.35, 6, 1, true);
  ch.ajouter('bois', ceinture, new Matrix4().makeTranslation(KX, KY + 3.0, KZ));
  ch.ajouter('bardeaux', new ConeGeometry(5.3, 2.6, 6), new Matrix4().makeTranslation(KX, KY + 4.4, KZ));
  ch.ajouter('bardeaux', new ConeGeometry(1.1, 1.2, 6), new Matrix4().makeTranslation(KX, KY + 6.0, KZ));
  ch.cylindre('cadre', 0.03, 0.06, 0.8, KX, KY + 6.4, KZ, 6);
  // Ponton : du chemin de gravier au kiosque.
  const pontonDir = new Vector3(Math.cos(Math.PI / 3 + Math.PI / 6), 0, Math.sin(Math.PI / 3 + Math.PI / 6));
  for (let k = 0; k < 9; k++) {
    const p = new Vector3(KX, 0, KZ).addScaledVector(pontonDir, 4.2 + k * 0.9);
    ch.boite('bois', 2.2, 0.12, 0.8, p.x, KY - 0.05, p.z, Math.atan2(pontonDir.x, pontonDir.z));
    if (k % 3 === 0) for (const s of [-1, 1]) ch.cylindre('bois', 0.08, 0.08, KY, p.x + pontonDir.z * s, 0, p.z - pontonDir.x * s, 6);
  }
  const lanterneMat = new MeshStandardMaterial({ color: '#fff2d6', emissive: new Color('#ffbe6b'), emissiveIntensity: 0.2 });
  const lanterne = new Mesh(new CylinderGeometry(0.25, 0.3, 0.55, 6), lanterneMat);
  lanterne.position.set(KX, KY + 2.4, KZ);
  groupe.add(lanterne);
  ch.cylindre('cadre', 0.01, 0.01, 0.9, KX, KY + 2.65, KZ, 4);
  // Arbres et bancs autour de l'étang.
  contour(9.5).forEach((p, i) => {
    if (i % 16 === 0) pep.planter(i % 32 ? 'pin' : 'platane', p.x, p.z, 1);
    if (i % 16 === 8) {
      pep.planter('cypres', p.x, p.z, 0.9);
      const d = p.clone().sub(new Vector3(ETANG.x, 0, ETANG.y)).normalize();
      const q = p.clone().addScaledVector(d, -2.8);
      ch.boite('bois', 2.0, 0.08, 0.5, q.x, 0.45, q.z, Math.atan2(d.x, d.z));
      ch.boite('pierre', 0.35, 0.45, 0.45, q.x + d.z * 0.8, 0, q.z - d.x * 0.8);
      ch.boite('pierre', 0.35, 0.45, 0.45, q.x - d.z * 0.8, 0, q.z + d.x * 0.8);
    }
    if (i % 20 === 4) lampadaires.push(p.clone().setY(0.05));
  });

  // ================================================================ la Boucle, promenade suspendue

  const traces: [number, number][] = [
    [-66, -62],
    [-68, -12],
    [-66, 36],
    [-60, 80],
    [-42, 104],
    [-16, 121],
    [22, 123],
    [52, 122],
    [82, 112],
    [92, 82],
    [84, 40],
    [72, -12],
    [70, -62],
    [40, -88],
    [0, -94],
    [-40, -88],
  ];
  const boucle = new CatmullRomCurve3(
    traces.map(([x, z], i) => new Vector3(x, BOUCLE_Y + 0.6 * Math.sin(i * 1.7), z)),
    true,
    'centripetal',
  );
  const N = mobile ? 360 : 640;
  const centres = boucle.getSpacedPoints(N).slice(0, -1);
  const cotes = centres.map((p, i) => {
    const t = centres[(i + 1) % N].clone().sub(centres[(i - 1 + N) % N]).setY(0).normalize();
    return new Vector3(t.z, 0, -t.x);
  });
  /** Extrude un profil (s : écart latéral, y : hauteur relative) le long de la Boucle. */
  const longueurs: number[] = [0];
  for (let i = 1; i <= N; i++) longueurs.push(longueurs[i - 1] + centres[i % N].distanceTo(centres[i - 1]));
  const lofts = new Map<Material, number[][]>();
  const loft = (profilL: [number, number][], mat: Material, uvLong = 2) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const point = (i: number, k: number) => {
      const c = centres[i % N];
      const s = cotes[i % N];
      return [c.x + s.x * profilL[k][0], c.y + profilL[k][1], c.z + s.z * profilL[k][0]];
    };
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < profilL.length - 1; k++) {
        const a = point(i, k);
        const b = point(i + 1, k);
        const c = point(i, k + 1);
        const d = point(i + 1, k + 1);
        pos.push(...a, ...b, ...c, ...c, ...b, ...d);
        const u0 = longueurs[i] / uvLong;
        const u1 = longueurs[i + 1] / uvLong;
        const v0 = k / 2;
        const v1 = (k + 1) / 2;
        uv.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1);
      }
    }
    if (!lofts.has(mat)) lofts.set(mat, [[], []]);
    lofts.get(mat)![0].push(...pos);
    lofts.get(mat)![1].push(...uv);
  };
  const blancBoucle = materiaux.enduit.mat;
  const garde = new MeshStandardMaterial({ color: '#cfe3e8', roughness: 0.05, transparent: true, opacity: 0.25, side: DoubleSide, depthWrite: false });
  const led = new MeshStandardMaterial({ color: '#fff3dc', emissive: new Color('#ffd79a'), emissiveIntensity: 0 });
  const terre = new MeshStandardMaterial({ color: '#4f6a34', roughness: 1, side: DoubleSide });
  const lamesLong = lames();
  lamesLong.rotation = Math.PI / 2;
  const platelage = new MeshStandardMaterial({ map: lamesLong, roughness: 0.75, side: DoubleSide });
  // Tablier blanc au ventre arrondi.
  loft([
    [2.7, 0.62],
    [2.7, -0.3],
    [2.3, -0.72],
    [1.1, -0.95],
    [-1.1, -0.95],
    [-2.3, -0.72],
    [-2.7, -0.3],
    [-2.7, 0.62],
  ], blancBoucle, 4);
  // Jardinières sur les deux bords, platelage de bois au centre.
  loft([
    [1.55, 0.06],
    [1.55, 0.62],
  ], blancBoucle);
  loft([
    [-1.55, 0.62],
    [-1.55, 0.06],
  ], blancBoucle);
  loft([
    [2.7, 0.56],
    [1.55, 0.56],
  ], terre);
  loft([
    [-1.55, 0.56],
    [-2.7, 0.56],
  ], terre);
  loft([
    [1.55, 0.06],
    [-1.55, 0.06],
  ], platelage, 3);
  // Garde-corps de verre et main courante lumineuse.
  loft([
    [2.72, 0.6],
    [2.72, 1.75],
  ], garde);
  loft([
    [-2.72, 1.75],
    [-2.72, 0.6],
  ], garde);
  loft([
    [1.5, 0.2],
    [1.5, 0.26],
  ], led);
  loft([
    [-1.5, 0.26],
    [-1.5, 0.2],
  ], led);
  for (const [mat, [pos, uv]] of lofts) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    const m = new Mesh(g, mat);
    m.name = 'Quartier_boucle';
    m.receiveShadow = true;
    m.castShadow = mat === blancBoucle;
    groupe.add(m);
  }
  // Arbustes et graminées dans les jardinières.
  const pasBuisson = mobile ? 3 : 2;
  for (let i = 0; i < N; i += pasBuisson) {
    const s = cotes[i];
    const c = centres[i];
    const cote = (i / pasBuisson) % 2 ? 1 : -1;
    pep.planter('buisson', c.x + s.x * cote * 2.1, c.z + s.z * cote * 2.1, entre(0.45, 0.7), c.y + 0.5, 1.2);
  }
  const pasOlivier = mobile ? 24 : 14;
  for (let i = 0; i < N; i += pasOlivier) {
    const s = cotes[i];
    const c = centres[i];
    const cote = (i / pasOlivier) % 2 ? 1 : -1;
    pep.planter('olivier', c.x + s.x * cote * 2.1, c.z + s.z * cote * 2.1, 0.55, c.y + 0.56);
  }
  // Piles : fûts blancs évasés, jamais sur une chaussée ni dans l'étang.
  const surChaussee = (x: number, z: number) =>
    Math.abs(z - AVENUE_Z) < AVENUE_DEMI + 4.5 ||
    Math.abs(Math.abs(x) - RUE_X) < 9 ||
    Math.abs(z - RUE_ARRIERE_Z) < 8;
  const dansEtang = (x: number, z: number) => ((x - ETANG.x) / 22) ** 2 + ((z - ETANG.y) / 16) ** 2 < 1;
  const pasPile = Math.round(16 / (longueurs[N] / N));
  for (let i = 0; i < N; i += pasPile) {
    const c = centres[i];
    if (surChaussee(c.x, c.z) || dansEtang(c.x, c.z)) continue;
    ch.ajouter('enduit', new CylinderGeometry(0.75, 0.38, c.y - 0.9, 20), new Matrix4().makeTranslation(c.x, (c.y - 0.9) / 2, c.z));
  }
  // Deux tours d'ascenseur vitrées : près de la place et derrière le bâtiment.
  for (const [ax, az] of [
    [-30, 120],
    [-74, -16],
  ]) {
    let meilleur = 0;
    centres.forEach((c, i) => {
      if (Math.hypot(c.x - ax, c.z - az) < Math.hypot(centres[meilleur].x - ax, centres[meilleur].z - az)) meilleur = i;
    });
    const c = centres[meilleur];
    const s = cotes[meilleur];
    const sens = Math.sign(s.x * (ax - c.x) + s.z * (az - c.z)) || 1;
    const p = c.clone().addScaledVector(s, sens * 4.6);
    ch.cylindre('verre', 1.7, 1.7, c.y + 2.4, p.x, 0, p.z, 32);
    ch.cylindre('enduit', 1.85, 1.85, 0.4, p.x, c.y + 2.4, p.z, 32);
    ch.cylindre('enduit', 1.85, 1.85, 0.3, p.x, 0, p.z, 32);
    ch.boite('enduit', 2.2, 0.3, 2.2, c.x + s.x * sens * 3.0, c.y + 0.3, c.z + s.z * sens * 3.0, Math.atan2(s.x, s.z));
  }

  // ================================================================ silhouette lointaine

  // Au loin, dans la brume, une ville blanche et basse : toits plats, quelques volumes plus hauts.
  const lointains: Matrix4[] = [];
  for (let i = 0; i < (mobile ? 90 : 160); i++) {
    const a = entre(0, Math.PI * 2);
    const r = entre(230, 330);
    const h = tirage() < 0.88 ? entre(4, 10) : entre(12, 18);
    lointains.push(
      new Matrix4().compose(
        new Vector3(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a + entre(-0.2, 0.2)),
        new Vector3(entre(7, 15), h, entre(7, 13)),
      ),
    );
  }
  const loin = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#f1ebe1', roughness: 0.9 }), lointains.length);
  lointains.forEach((m, i) => loin.setMatrixAt(i, m));
  groupe.add(loin);

  // ================================================================ assemblage

  ch.construire(groupe, materiaux);

  // Lampadaires : mât, crosse, lanterne qui s'allume, halo au sol la nuit.
  const mat1 = new CylinderGeometry(0.06, 0.09, 4.6, 8);
  mat1.translate(0, 2.3, 0);
  const crosse = new BoxGeometry(0.9, 0.08, 0.08);
  crosse.translate(0.42, 4.55, 0);
  const pieceMat = mergeGeometries([mat1.toNonIndexed(), crosse.toNonIndexed()].map((g) => {
    g.deleteAttribute('uv');
    return g;
  }))!;
  const tete = new BoxGeometry(0.5, 0.14, 0.32);
  tete.translate(0.82, 4.45, 0);
  const lampeMat = new MeshStandardMaterial({ color: '#fff6e5', emissive: new Color('#ffd8a0'), emissiveIntensity: 0.1 });
  const poteaux = new InstancedMesh(pieceMat, materiaux.cadre.mat, lampadaires.length);
  const tetes = new InstancedMesh(tete, lampeMat, lampadaires.length);
  const halos = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tache(), color: '#ffc985', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    lampadaires.length,
  );
  lampadaires.forEach((p, i) => {
    const m = new Matrix4().makeRotationY((i * 2.399) % (Math.PI * 2)).setPosition(p);
    poteaux.setMatrixAt(i, m);
    tetes.setMatrixAt(i, m);
    const q = new Vector3(0.82, 0, 0).applyMatrix4(new Matrix4().extractRotation(m));
    halos.setMatrixAt(i, new Matrix4().compose(new Vector3(p.x + q.x, p.y + 0.04, p.z + q.z), new Quaternion(), new Vector3(9, 1, 9)));
  });
  halos.renderOrder = 1;
  groupe.add(poteaux, tetes, halos);

  // Ombres douces au pied des arbres et des maisons (au-delà de la portée des ombres du soleil).
  for (const [essence, matrices] of [...pep.liste(), ...(mobile ? parvis.liste() : [])]) {
    if (essence === 'buisson' || essence === 'roseaux') continue;
    for (const m of matrices) if (m.elements[13] < 0.2) ombres.push({ x: m.elements[12], z: m.elements[14], r: essence === 'cypres' ? 2 : 3.6, f: 0.35 });
  }
  const taches = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tache(), color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }),
    ombres.length,
  );
  ombres.forEach((o, i) => taches.setMatrixAt(i, new Matrix4().makeScale(o.r * 2, 1, o.r * 2).setPosition(o.x, 0.03, o.z)));
  taches.renderOrder = 1;
  groupe.add(taches);

  // Végétation.
  const vegetal = materiauVegetal();
  groupe.add(...pep.pousser(vegetal), ...parvis.pousser(vegetal, !mobile));

  return {
    groupe,
    /** 0 en plein jour, 1 la nuit. */
    reglerNuit(nuit: number) {
      verre.emissiveIntensity = 1.1 * nuit;
      eauPiscine.emissiveIntensity = 0.5 * nuit;
      eauMat.emissiveIntensity = 0.35 * nuit;
      jetMat.emissiveIntensity = 0.15 + 0.9 * nuit;
      lampeMat.emissiveIntensity = 0.1 + 3 * nuit;
      (halos.material as MeshBasicMaterial).opacity = 0.8 * nuit;
      if (lumierePlace) lumierePlace.intensity = 5 * nuit;
      halos.visible = nuit > 0.02;
      ampouleMat.emissiveIntensity = 0.4 + 3.2 * nuit;
      lanterneMat.emissiveIntensity = 0.2 + 3 * nuit;
      led.emissiveIntensity = 2.2 * nuit;
    },
    mettreAJour(temps: number) {
      for (const a of animations) a(temps);
    },
  };
}
