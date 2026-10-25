import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';

// « Horizon » : la tour de demain imaginée par Creativ Lab, visible depuis le toit-terrasse.
// Une pyramide vrillée : quarante plateaux carrés qui rétrécissent et tournent d'un huitième de tour
// de la base au sommet, une peau de verre sombre, des jardins suspendus tous les six niveaux, des
// arêtes de lumière laiton et une flèche lumineuse. Le jour, elle reflète le ciel ; la nuit, ses
// fenêtres et ses arêtes s'allument.

// Dans la ville, devant le bâtiment, sur la droite vu du toit (coordonnées du site).
const POSITION = new Vector3(-48, 0, 135);
const NIVEAUX = 40;
const HAUTEUR_NIVEAU = 2.0;
const BASE = 62; // côté du premier plateau
const SOMMET = 3;
const VRILLE = Math.PI / 4;
const RETRAIT_VERRE = 0.9;

const cote = (i: number) => SOMMET + (BASE - SOMMET) * Math.pow(1 - i / NIVEAUX, 0.92);
const angle = (i: number) => (i / NIVEAUX) * VRILLE;

/** Coins d'un plateau carré de côté c, tourné de a, à la hauteur y. */
function coins(c: number, a: number, y: number) {
  const r = c / 2;
  return [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ].map(([x, z]) => new Vector3(x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)));
}

/** Fenêtres éclairées la nuit : une grille irrégulière de lumière chaude. */
function fenetres() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  const colonnes = 16;
  const lignes = 8;
  for (let y = 0; y < lignes; y++) {
    for (let x = 0; x < colonnes; x++) {
      if (Math.random() < 0.38) continue;
      const v = 140 + Math.random() * 115;
      ctx.fillStyle = `rgb(${v}, ${v * 0.82}, ${v * 0.55})`;
      ctx.fillRect(x * 16 + 2, y * 32 + 6, 12, 22);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function creerTourHorizon() {
  const groupe = new Group();
  groupe.name = 'Tour_Horizon';
  groupe.position.copy(POSITION);
  groupe.rotation.y = -0.35;

  // ---- Peau de verre : un fût vrillé, d'un plateau à l'autre ----
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < NIVEAUX; i++) {
    const bas = coins(cote(i) - 2 * RETRAIT_VERRE, angle(i), i * HAUTEUR_NIVEAU);
    const haut = coins(cote(i + 1) - 2 * RETRAIT_VERRE, angle(i + 1), (i + 1) * HAUTEUR_NIVEAU);
    for (let k = 0; k < 4; k++) {
      const a = bas[k];
      const b = bas[(k + 1) % 4];
      const c = haut[(k + 1) % 4];
      const d = haut[k];
      // u : nombre de travées sur la largeur de la face ; v : un étage par unité.
      const ub = a.distanceTo(b) / 3;
      const uh = d.distanceTo(c) / 3;
      for (const [p, u, v] of [
        [a, 0, i],
        [c, uh, i + 1],
        [b, ub, i],
        [a, 0, i],
        [d, 0, i + 1],
        [c, uh, i + 1],
      ] as [Vector3, number, number][]) {
        pos.push(p.x, p.y, p.z);
        uv.push(u / 16, v / 8);
      }
    }
  }
  const geoVerre = new BufferGeometry();
  geoVerre.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geoVerre.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geoVerre.computeVertexNormals();
  const verre = new MeshStandardMaterial({
    color: '#22303c',
    metalness: 0.9,
    roughness: 0.08,
    envMapIntensity: 1.3,
    emissive: new Color('#ffffff'),
    emissiveMap: fenetres(),
    emissiveIntensity: 0,
  });
  const fut = new Mesh(geoVerre, verre);
  fut.castShadow = true;
  groupe.add(fut);

  // ---- Plateaux : une dalle blanche par niveau, qui déborde du verre ----
  const plateau = new MeshStandardMaterial({ color: '#f2efe8', roughness: 0.45 });
  const dalles = new InstancedMesh(new BoxGeometry(1, 1, 1), plateau, NIVEAUX + 1);
  const o = new Object3D();
  for (let i = 0; i <= NIVEAUX; i++) {
    o.position.set(0, i * HAUTEUR_NIVEAU, 0);
    o.rotation.set(0, -angle(i), 0);
    o.scale.set(cote(i), i === 0 ? 1.2 : 0.32, cote(i));
    o.updateMatrix();
    dalles.setMatrixAt(i, o.matrix);
  }
  dalles.castShadow = true;
  groupe.add(dalles);

  // ---- Jardins suspendus : une haie de verdure sur le pourtour, tous les six niveaux ----
  const jardinsNiveaux = [...Array(NIVEAUX).keys()].filter((i) => i > 0 && i % 6 === 0);
  const vert = new MeshStandardMaterial({ color: '#4f7a3c', roughness: 0.9 });
  const haies = new InstancedMesh(new BoxGeometry(1, 1, 1), vert, jardinsNiveaux.length * 4);
  jardinsNiveaux.forEach((i, j) => {
    const c = cote(i);
    const p = coins(c, angle(i), i * HAUTEUR_NIVEAU + 0.45);
    for (let k = 0; k < 4; k++) {
      // Chaque haie longe un côté du plateau, un peu en retrait du bord.
      o.position.copy(p[k]).add(p[(k + 1) % 4]).multiplyScalar(0.5);
      o.position.x *= (c / 2 - 0.35) / (c / 2);
      o.position.z *= (c / 2 - 0.35) / (c / 2);
      o.rotation.set(0, -angle(i) - (k % 2) * (Math.PI / 2), 0);
      o.scale.set(c - 0.8, 0.7, 0.6);
      o.updateMatrix();
      haies.setMatrixAt(j * 4 + k, o.matrix);
    }
  });
  groupe.add(haies);

  // ---- Arêtes de lumière : les quatre coins des plateaux reliés du pied au sommet ----
  const arete = new MeshStandardMaterial({
    color: '#c8a165',
    metalness: 0.8,
    roughness: 0.25,
    emissive: new Color('#ffcb7a'),
    emissiveIntensity: 0.15,
  });
  for (let k = 0; k < 4; k++) {
    const points = [...Array(NIVEAUX + 1).keys()].map((i) => coins(cote(i) + 0.1, angle(i), i * HAUTEUR_NIVEAU + 0.18)[k]);
    const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 120, 0.22, 6), arete);
    groupe.add(tube);
  }

  // ---- Flèche et balise au sommet ----
  const sommet = NIVEAUX * HAUTEUR_NIVEAU;
  const fleche = new Mesh(new ConeGeometry(1.4, 16, 12), new MeshStandardMaterial({ color: '#e9e4da', metalness: 0.6, roughness: 0.2 }));
  fleche.position.y = sommet + 8;
  groupe.add(fleche);
  const balise = new MeshStandardMaterial({ color: '#ffffff', emissive: new Color('#ffd79a'), emissiveIntensity: 1.5, toneMapped: false });
  const feu = new Mesh(new SphereGeometry(0.6, 16, 12), balise);
  feu.position.y = sommet + 16.4;
  groupe.add(feu);

  // ---- Socle : un parvis surélevé et son miroir d'eau ----
  const socle = new Mesh(new CylinderGeometry(50, 53, 1.2, 64), new MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.7 }));
  socle.position.y = 0.4;
  socle.receiveShadow = true;
  groupe.add(socle);

  return {
    groupe,
    /** 0 en plein jour, 1 la nuit. */
    reglerNuit(nuit: number) {
      verre.emissiveIntensity = 1.4 * nuit;
      arete.emissiveIntensity = 0.15 + 1.1 * nuit;
      balise.emissiveIntensity = 1.5 + 2 * nuit;
    },
    mettreAJour(temps: number) {
      // La balise du sommet respire doucement.
      feu.scale.setScalar(1 + 0.25 * Math.sin(temps * 2));
    },
  };
}
