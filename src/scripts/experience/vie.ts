import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AVENUE_Z, BORD_NORD, BORD_SUD, BORD_X, LOIN, RUE_ARRIERE_Z, RUE_X } from './rues';
import { hasard } from './vegetation';
import { GABARITS, piecesVoiture, voitureGaree, type Gabarit, type NomVoiture } from './voitures';

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

/** Deux voies, une dans chaque sens, sur toute la longueur d'une rue. */
function rue(le: 'x' | 'z', c: number, ecart: number, voitures: number, de = -LOIN, a = LOIN): Voie[] {
  const longueur = a - de;
  return le === 'x'
    ? [
        { depart: new Vector3(de, 0, c - ecart), dir: new Vector3(1, 0, 0), longueur, voitures },
        { depart: new Vector3(a, 0, c + ecart), dir: new Vector3(-1, 0, 0), longueur, voitures },
      ]
    : [
        { depart: new Vector3(c - ecart, 0, de), dir: new Vector3(0, 0, 1), longueur, voitures },
        { depart: new Vector3(c + ecart, 0, a), dir: new Vector3(0, 0, -1), longueur, voitures },
      ];
}

// Les rues filent jusqu'à la brume (rues.ts) : les voitures y disparaissent et en reviennent.
const VOIES: Voie[] = [
  // Avenue (z = 62, 12 m de large).
  ...rue('x', AVENUE_Z, 2.8, 12),
  // Rues transversales (x = ±100) et extérieures (x = ±230, z = -220 et 270), 10 m de large.
  ...rue('z', -RUE_X, 2.4, 6),
  ...rue('z', RUE_X, 2.4, 6),
  ...rue('z', -BORD_X, 2.4, 4),
  ...rue('z', BORD_X, 2.4, 4),
  ...rue('x', BORD_SUD, 2.4, 4),
  ...rue('x', BORD_NORD, 2.4, 4),
  // Rue arrière (z = -116), entre les transversales.
  ...rue('x', RUE_ARRIERE_Z, 2, 2, -95, 95),
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

/** Phares (blancs, à l'avant) et feux (rouges, à l'arrière), à la place de ceux du modèle. */
function feux({ longueur, phare, feu }: Gabarit) {
  const x = longueur / 2 + 0.01;
  const pieces: BufferGeometry[] = [];
  for (const sens of [-1, 1]) {
    pieces.push(piece(new BoxGeometry(0.04, 0.1, 0.3), x - 0.12, phare.y, sens * phare.z, '#fff3d6'));
    pieces.push(piece(new BoxGeometry(0.04, 0.1, 0.3), -x + 0.06, feu.y, sens * feu.z, '#ff2a1c'));
  }
  return mergeGeometries(pieces)!;
}

// Le parking du parvis (à gauche de l'allée) : les places du modèle Blender, en coordonnées du
// site ; sens 1 = capot vers le bâtiment, -1 = vers l'avenue.
const GAREES: { nom: NomVoiture; x: number; sens: number; couleur: string | null }[] = [
  { nom: 'xtrail', x: -22, sens: 1, couleur: '#e9e8e2' },
  { nom: 'gmc', x: -19, sens: -1, couleur: null },
  { nom: 'xtrail', x: -13, sens: 1, couleur: '#1b2a3e' },
  { nom: 'xtrail', x: -10, sens: 1, couleur: '#4b5159' },
];

export function creerCirculation(mobile: boolean) {
  const groupe = new Group();
  groupe.name = 'Circulation';
  // Un pick-up GMC pour trois X-Trail, chaque X-Trail de sa couleur.
  const autos: { voie: Voie; s: number; vitesse: number; nom: NomVoiture; rang: number }[] = [];
  const nombre: Record<NomVoiture, number> = { gmc: 0, xtrail: 0 };
  for (const voie of VOIES) {
    const n = mobile ? Math.ceil(voie.voitures / 2) : voie.voitures;
    for (let i = 0; i < n; i++) {
      const nom: NomVoiture = autos.length % 4 === 3 ? 'gmc' : 'xtrail';
      autos.push({ voie, s: ((i + tirage() * 0.6) / n) * voie.longueur, vitesse: 9 + tirage() * 4, nom, rang: nombre[nom]++ });
    }
  }
  const lampes = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  // Les instances de chaque modèle : une par pièce (carrosserie, vitres, roues…) et les feux.
  const flottes: Record<NomVoiture, InstancedMesh[]> = { gmc: [], xtrail: [] };
  for (const nom of ['gmc', 'xtrail'] as NomVoiture[]) {
    const lumieres = new InstancedMesh(feux(GABARITS[nom]), lampes, nombre[nom]);
    lumieres.frustumCulled = false;
    flottes[nom].push(lumieres);
    groupe.add(lumieres);
    piecesVoiture(nom).then((pieces) => {
      for (const { geometrie, materiau } of pieces) {
        const inst = new InstancedMesh(geometrie, materiau, nombre[nom]);
        inst.frustumCulled = false;
        inst.receiveShadow = true;
        if (materiau.name === 'Peinture') {
          autos.forEach((a) => a.nom === nom && inst.setColorAt(a.rang, new Color(PEINTURES[a.rang % PEINTURES.length])));
        }
        flottes[nom].push(inst);
        groupe.add(inst);
      }
      poser();
    });
  }

  // Les voitures garées sur le parking du parvis.
  for (const g of GAREES) {
    voitureGaree(g.nom, g.couleur, !mobile).then((v) => {
      v.position.set(g.x, 0.03, 34.5);
      v.rotation.y = (g.sens * Math.PI) / 2;
      groupe.add(v);
    });
  }

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const un = new Vector3(1, 1, 1);
  const axeY = new Vector3(0, 1, 0);
  let dernier = 0;
  const poser = () => {
    for (const a of autos) {
      p.copy(a.voie.depart).addScaledVector(a.voie.dir, a.s);
      q.setFromAxisAngle(axeY, Math.atan2(-a.voie.dir.z, a.voie.dir.x));
      m.compose(p, q, un);
      for (const inst of flottes[a.nom]) inst.setMatrixAt(a.rang, m);
    }
    for (const inst of [...flottes.gmc, ...flottes.xtrail]) inst.instanceMatrix.needsUpdate = true;
  };
  return {
    groupe,
    reglerNuit(nuit: number) {
      // Le jour, des feux éteints (grisés) ; la nuit, ils brillent (et le halo les fait rayonner).
      lampes.color.setScalar(0.35 + 2.4 * nuit);
    },
    mettreAJour(t: number) {
      const dt = Math.min(Math.max(t - dernier, 0), 0.1);
      dernier = t;
      for (const a of autos) a.s = (a.s + a.vitesse * dt) % a.voie.longueur;
      poser();
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
