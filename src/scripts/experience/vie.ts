import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hasard } from './vegetation';

// La vie du quartier : des voitures qui circulent sur l'avenue et les rues (phares et feux
// arrière allumés le soir), et une volée d'oiseaux qui tourne au-dessus de la place.

const tirage = hasard(31);

// ------------------------------------------------------------------ circulation

/** Une voie : point de départ, direction, longueur (les voitures bouclent d'un bout à l'autre). */
interface Voie {
  depart: Vector3;
  dir: Vector3;
  longueur: number;
  voitures: number;
}

const VOIES: Voie[] = [
  // Avenue (z = 62, 12 m de large) : une voie dans chaque sens.
  { depart: new Vector3(-210, 0, 59.2), dir: new Vector3(1, 0, 0), longueur: 420, voitures: 7 },
  { depart: new Vector3(210, 0, 64.8), dir: new Vector3(-1, 0, 0), longueur: 420, voitures: 7 },
  // Rues transversales (x = ±100, 10 m de large).
  { depart: new Vector3(-102.4, 0, -190), dir: new Vector3(0, 0, 1), longueur: 430, voitures: 4 },
  { depart: new Vector3(-97.6, 0, 240), dir: new Vector3(0, 0, -1), longueur: 430, voitures: 4 },
  { depart: new Vector3(97.6, 0, -190), dir: new Vector3(0, 0, 1), longueur: 430, voitures: 4 },
  { depart: new Vector3(102.4, 0, 240), dir: new Vector3(0, 0, -1), longueur: 430, voitures: 4 },
  // Rue arrière (z = -116).
  { depart: new Vector3(-95, 0, -118), dir: new Vector3(1, 0, 0), longueur: 190, voitures: 2 },
  { depart: new Vector3(95, 0, -114), dir: new Vector3(-1, 0, 0), longueur: 190, voitures: 2 },
];

const PEINTURES = ['#f2f0ea', '#1d1f22', '#7c8288', '#2c3e57', '#8a2e2a', '#c9c3b6', '#3d4a3c', '#e7e2d6'];

function teinter(g: BufferGeometry, couleur: string) {
  const c = new Color(couleur);
  const n = g.attributes.position.count;
  const couleurs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) couleurs.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(couleurs, 3));
  return g;
}

function piece(g: BufferGeometry, x: number, y: number, z: number, couleur: string) {
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return teinter(g.index ? g.toNonIndexed() : g, couleur);
}

/** Une berline stylisée, longue de 4,5 m, avant vers +x. La carrosserie (blanche) prend la teinte de l'instance. */
function voiture() {
  const pieces = [
    piece(new BoxGeometry(4.5, 0.62, 1.8), 0, 0.55, 0, '#ffffff'),
    piece(new BoxGeometry(2.3, 0.55, 1.6), -0.25, 1.12, 0, '#ffffff'),
    // Vitres (sombres, la teinte de l'instance les assombrit à peine).
    piece(new BoxGeometry(2.34, 0.42, 1.62), -0.25, 1.12, 0, '#1a2026'),
    piece(new BoxGeometry(0.06, 0.4, 1.5), 0.92, 1.1, 0, '#1a2026'),
  ];
  for (const x of [-1.45, 1.45]) {
    for (const z of [-0.82, 0.82]) {
      const roue = new CylinderGeometry(0.34, 0.34, 0.24, 12);
      roue.rotateX(Math.PI / 2);
      pieces.push(piece(roue, x, 0.34, z, '#111111'));
    }
  }
  return mergeGeometries(pieces)!;
}

/** Phares (blancs, à l'avant) et feux (rouges, à l'arrière). */
function feux() {
  const pieces: BufferGeometry[] = [];
  for (const z of [-0.62, 0.62]) {
    pieces.push(piece(new BoxGeometry(0.06, 0.12, 0.34), 2.26, 0.68, z, '#fff3d6'));
    pieces.push(piece(new BoxGeometry(0.06, 0.1, 0.4), -2.26, 0.7, z, '#ff2a1c'));
  }
  return mergeGeometries(pieces)!;
}

export function creerCirculation(mobile: boolean) {
  const groupe = new Group();
  groupe.name = 'Circulation';
  const autos: { voie: Voie; s: number; vitesse: number }[] = [];
  for (const voie of VOIES) {
    const n = mobile ? Math.ceil(voie.voitures / 2) : voie.voitures;
    for (let i = 0; i < n; i++) {
      autos.push({ voie, s: ((i + tirage() * 0.6) / n) * voie.longueur, vitesse: 9 + tirage() * 4 });
    }
  }
  const carrosserie = new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 });
  const corps = new InstancedMesh(voiture(), carrosserie, autos.length);
  const lampes = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lumieres = new InstancedMesh(feux(), lampes, autos.length);
  autos.forEach((_, i) => corps.setColorAt(i, new Color(PEINTURES[i % PEINTURES.length])));
  corps.frustumCulled = lumieres.frustumCulled = false;
  corps.castShadow = !mobile;
  corps.receiveShadow = true;
  groupe.add(corps, lumieres);

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const un = new Vector3(1, 1, 1);
  const axeY = new Vector3(0, 1, 0);
  let dernier = 0;
  return {
    groupe,
    reglerNuit(nuit: number) {
      // Le jour, des feux éteints (grisés) ; la nuit, ils brillent (et le halo les fait rayonner).
      lampes.color.setScalar(0.35 + 2.4 * nuit);
    },
    mettreAJour(t: number) {
      const dt = Math.min(Math.max(t - dernier, 0), 0.1);
      dernier = t;
      autos.forEach((a, i) => {
        a.s = (a.s + a.vitesse * dt) % a.voie.longueur;
        p.copy(a.voie.depart).addScaledVector(a.voie.dir, a.s);
        q.setFromAxisAngle(axeY, Math.atan2(-a.voie.dir.z, a.voie.dir.x));
        m.compose(p, q, un);
        corps.setMatrixAt(i, m);
        lumieres.setMatrixAt(i, m);
      });
      corps.instanceMatrix.needsUpdate = true;
      lumieres.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ oiseaux

/** Une aile : un triangle effilé, attaché au corps par sa base (en x = 0). */
function aile(sens: number) {
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, -0.12, 0, 0, 0.14, sens * 0.62, 0, -0.04]), 3),
  );
  g.computeVertexNormals();
  return g;
}

export function creerOiseaux(mobile: boolean) {
  const groupe = new Group();
  groupe.name = 'Oiseaux';
  const n = mobile ? 9 : 16;
  const mat = new MeshBasicMaterial({ color: '#2a2a2e', side: DoubleSide });
  const gauche = new InstancedMesh(aile(-1), mat, n);
  const droite = new InstancedMesh(aile(1), mat, n);
  gauche.frustumCulled = droite.frustumCulled = false;
  groupe.add(gauche, droite);
  const vol = Array.from({ length: n }, () => ({
    dr: (tirage() - 0.5) * 10,
    dh: (tirage() - 0.5) * 5,
    da: (tirage() - 0.5) * 0.35,
    battement: 7 + tirage() * 3,
    phase: tirage() * 6.28,
    taille: 0.8 + tirage() * 0.4,
  }));
  // La volée décrit une large boucle au-dessus de la place et de l'étang.
  const centre = new Vector3(25, 34, 80);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  return {
    groupe,
    mettreAJour(t: number) {
      vol.forEach((o, i) => {
        const a = t * 0.07 + o.da;
        const r = 62 + o.dr;
        p.set(centre.x + Math.cos(a) * r, centre.y + o.dh + Math.sin(t * 0.3 + o.phase) * 2, centre.z + Math.sin(a) * r * 0.7);
        const cap = Math.atan2(-Math.sin(a), 0.7 * Math.cos(a)); // tangente à la boucle
        const plane = Math.sin(t * 0.5 + o.phase) > 0.55; // de temps en temps, il plane
        const battement = plane ? 0.15 : Math.sin(t * o.battement + o.phase) * 0.7;
        s.setScalar(o.taille);
        for (const [aile, sens] of [
          [gauche, 1],
          [droite, -1],
        ] as const) {
          e.set(0, cap, sens * battement, 'YXZ');
          q.setFromEuler(e);
          m.compose(p, q, s);
          aile.setMatrixAt(i, m);
        }
      });
      gauche.instanceMatrix.needsUpdate = true;
      droite.instanceMatrix.needsUpdate = true;
    },
  };
}
