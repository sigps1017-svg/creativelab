import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LoadingManager,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
} from 'three';
import { chargerImageProjet, texturePortrait } from './textures';

// Bâtiment PROVISOIRE construit en formes simples, pour caler le parcours et les cadrages.
// Il sera remplacé par le modèle du bâtiment inventé, modélisé dans Blender et exporté en glTF
// (voir README, « Remplacer le bâtiment provisoire »). Les cotes sont en mètres.
//
// Plan : 40 m × 24 m, trois niveaux autour d'un atrium de 16 m × 10 m.
//   Rez-de-chaussée (0 m) : hall et galerie des projets sur le mur du fond.
//   1er étage (6 m) : atelier à gauche, mur de l'équipe à droite.
//   Toit-terrasse (11 m) : contact, vue sur la ville.

export interface ProjetGalerie {
  slug: string;
  titre: string;
  image: string;
}

/** Membre de l'équipe affiché sur le mur du 1er étage. */
export interface MembreMur {
  nom: string;
  role: string;
  photo: string;
}

export interface Batiment {
  groupe: Group;
  /** Images des projets, cliquables. userData : { slug, titre }. */
  cadres: Mesh[];
  /** Portraits du mur de l'équipe, cliquables. userData : { membre (index), titre }. */
  portraits: Mesh[];
  /** À appeler quand l'ambiance change : allume les vitres et les lampes la nuit. */
  reglerNuit: (nuit: number) => void;
  /** Résolue quand le bâtiment est en place dans le groupe. */
  pret: Promise<void>;
}

const L = 40;
const P = 24;
const ATRIUM_X = 8;
const ATRIUM_Z = 5;
const NIVEAU_1 = 6;
const TOIT = 11;
const DALLE = 0.5;

const CADRE_LARGEUR = 2.6;
const CADRE_HAUTEUR = CADRE_LARGEUR / 1.5;
const CADRE_PAS = 3.4;
const MUR_FOND = -P / 2;

const PORTRAIT_LARGEUR = 1.15;
const PORTRAIT_HAUTEUR = 1.5;
const PORTRAIT_PAS = 1.45;

export function construireBatiment(
  projets: ProjetGalerie[],
  equipe: MembreMur[],
  manager: LoadingManager,
  ombres: boolean,
): Batiment {
  const groupe = new Group();

  const beton = new MeshStandardMaterial({ name: 'Beton', color: '#d9d4cb', roughness: 0.85 });
  const betonSombre = new MeshStandardMaterial({ name: 'Beton_sombre', color: '#8f8a82', roughness: 0.9 });
  const sol = new MeshStandardMaterial({ name: 'Sol_interieur', color: '#b9ad9a', roughness: 0.55 });
  const metal = new MeshStandardMaterial({ name: 'Metal', color: '#2b2a28', roughness: 0.4, metalness: 0.6 });
  const laiton = new MeshStandardMaterial({
    name: 'Laiton',
    color: '#c8a165',
    roughness: 0.3,
    metalness: 0.85,
    emissive: new Color('#c8a165'),
    emissiveIntensity: 0,
  });
  const vitre = new MeshStandardMaterial({
    name: 'Vitrage',
    color: '#a9c2cf',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    emissive: new Color('#ffcf8a'),
    emissiveIntensity: 0,
  });
  const platre = new MeshStandardMaterial({ name: 'Platre', color: '#f4f1ec', roughness: 0.7 });

  const boite = (
    l: number,
    h: number,
    p: number,
    x: number,
    y: number,
    z: number,
    mat: Material,
    parent: Object3D = groupe,
  ) => {
    const m = new Mesh(new BoxGeometry(l, h, p), mat);
    m.position.set(x, y, z);
    m.castShadow = ombres && mat !== vitre;
    m.receiveShadow = ombres;
    parent.add(m);
    return m;
  };

  // Dalle percée par l'atrium, définie par le dessus de la dalle.
  const dallePercee = (dessus: number, avantZ = P / 2) => {
    const y = dessus - DALLE / 2;
    const profAvant = avantZ - ATRIUM_Z;
    boite(L, DALLE, profAvant, 0, y, ATRIUM_Z + profAvant / 2, beton);
    boite(L, DALLE, P / 2 - ATRIUM_Z, 0, y, -(ATRIUM_Z + P / 2) / 2, beton);
    const lCote = L / 2 - ATRIUM_X;
    boite(lCote, DALLE, ATRIUM_Z * 2, -(ATRIUM_X + lCote / 2), y, 0, beton);
    boite(lCote, DALLE, ATRIUM_Z * 2, ATRIUM_X + lCote / 2, y, 0, beton);
  };

  // ---- Structure ----
  boite(L, 0.3, P, 0, -0.15, 0, sol); // plancher du rez-de-chaussée
  dallePercee(NIVEAU_1);
  dallePercee(TOIT, P / 2 + 3); // le toit déborde de 3 m en marquise au-dessus de l'entrée

  boite(L + 0.8, TOIT, 0.4, 0, TOIT / 2, MUR_FOND - 0.2, betonSombre); // mur du fond
  boite(0.4, TOIT, P, -L / 2 - 0.2, TOIT / 2, 0, betonSombre); // pignon gauche
  boite(0.4, TOIT, P, L / 2 + 0.2, TOIT / 2, 0, betonSombre); // pignon droit

  for (const x of [-16, -8, 8, 16]) {
    boite(0.45, TOIT - DALLE, 0.45, x, (TOIT - DALLE) / 2, P / 2 - 4, beton);
  }

  // ---- Façade avant : vitrage, porte ; baie vitrée continue au 1er étage ----
  const zFacade = P / 2;
  const porte = 3;
  const lPan = L / 2 - porte;
  boite(lPan, NIVEAU_1 - DALLE, 0.05, -(porte + lPan / 2), (NIVEAU_1 - DALLE) / 2, zFacade, vitre);
  boite(lPan, NIVEAU_1 - DALLE, 0.05, porte + lPan / 2, (NIVEAU_1 - DALLE) / 2, zFacade, vitre);
  boite(porte * 2, 1, 0.05, 0, NIVEAU_1 - DALLE - 0.5, zFacade, vitre);
  boite(L, TOIT - NIVEAU_1 - DALLE, 0.05, 0, (NIVEAU_1 + TOIT - DALLE) / 2, zFacade, vitre);

  for (let x = -L / 2; x <= L / 2 + 0.01; x += 2.5) {
    if (Math.abs(x) < porte) continue;
    boite(0.08, TOIT - DALLE, 0.12, x, (TOIT - DALLE) / 2, zFacade, metal);
  }

  // Garde-corps vitrés du toit et de l'atrium.
  const gc = 1.1;
  const yGc = TOIT + gc / 2;
  boite(L, gc, 0.04, 0, yGc, P / 2 + 3, vitre);
  boite(L, gc, 0.04, 0, yGc, MUR_FOND, vitre);
  boite(0.04, gc, P + 3, -L / 2, yGc, 1.5, vitre);
  boite(0.04, gc, P + 3, L / 2, yGc, 1.5, vitre);
  for (const y of [NIVEAU_1 + gc / 2, yGc]) {
    boite(ATRIUM_X * 2, gc, 0.04, 0, y, ATRIUM_Z, vitre);
    boite(ATRIUM_X * 2, gc, 0.04, 0, y, -ATRIUM_Z, vitre);
    boite(0.04, gc, ATRIUM_Z * 2, -ATRIUM_X, y, 0, vitre);
    boite(0.04, gc, ATRIUM_Z * 2, ATRIUM_X, y, 0, vitre);
  }

  // ---- Hall : banque d'accueil et anneau lumineux suspendu dans l'atrium ----
  boite(4, 1.1, 1.2, 7, 0.55, 8, platre);
  boite(4.1, 0.06, 1.3, 7, 1.13, 8, laiton);

  const anneau = new Mesh(new TorusGeometry(4, 0.07, 12, 96), laiton);
  anneau.rotation.x = Math.PI / 2;
  anneau.position.set(0, 9.8, 0);
  groupe.add(anneau);

  // ---- Galerie : les projets accrochés au mur du fond ----
  const cadres: Mesh[] = [];
  const debutX = -((projets.length - 1) * CADRE_PAS) / 2;
  projets.forEach((p, i) => {
    const x = debutX + i * CADRE_PAS;
    const y = 2.6;
    boite(CADRE_LARGEUR + 0.16, CADRE_HAUTEUR + 0.16, 0.06, x, y, MUR_FOND + 0.03, metal);

    const mat = new MeshBasicMaterial({ name: `Image_${p.slug}`, toneMapped: false });
    const image = new Mesh(new PlaneGeometry(CADRE_LARGEUR, CADRE_HAUTEUR), mat);
    image.position.set(x, y, MUR_FOND + 0.07);
    image.userData = { slug: p.slug, titre: p.titre };
    groupe.add(image);
    cadres.push(image);

    chargerImageProjet(p.image, p.titre, CADRE_LARGEUR / CADRE_HAUTEUR, manager, (t) => {
      mat.map?.dispose();
      mat.map = t;
      mat.needsUpdate = true;
    });
  });
  // Rampe lumineuse au-dessus des cadres.
  const rampe = new MeshBasicMaterial({ name: 'Rampe_lumineuse', color: '#fff3dc' });
  boite(projets.length * CADRE_PAS, 0.05, 0.25, 0, 4.3, MUR_FOND + 0.3, rampe);

  // ---- Atelier : table de maquettes ----
  const yTable = NIVEAU_1 + 0.9;
  boite(6, 0.08, 2.6, -12, yTable, -3, platre);
  for (const [dx, dz] of [
    [-2.8, -1.1],
    [2.8, -1.1],
    [-2.8, 1.1],
    [2.8, 1.1],
  ]) {
    boite(0.06, 0.9, 0.06, -12 + dx, NIVEAU_1 + 0.45, -3 + dz, metal);
  }
  const maquettes = [
    [-14, -3.4, 0.5, 0.6, 0.5],
    [-13.2, -2.6, 0.4, 1.1, 0.4],
    [-12.2, -3.2, 0.9, 0.35, 0.7],
    [-11.1, -2.7, 0.35, 0.8, 0.35],
    [-10.2, -3.4, 0.7, 0.5, 0.5],
  ];
  for (const [x, z, l, h, p] of maquettes) {
    boite(l, h, p, x, yTable + 0.04 + h / 2, z, platre);
  }

  // ---- Mur de l'équipe : une rangée de portraits ----
  const portraits: Mesh[] = [];
  equipe.forEach((m, i) => {
    const mat = new MeshBasicMaterial({ name: 'Portrait', toneMapped: false });
    const portrait = new Mesh(new PlaneGeometry(PORTRAIT_LARGEUR, PORTRAIT_HAUTEUR), mat);
    portrait.position.set(12 + (i - (equipe.length - 1) / 2) * PORTRAIT_PAS, NIVEAU_1 + 2.2, MUR_FOND + 0.05);
    portrait.userData = { membre: i, titre: m.nom };
    portraits.push(portrait);
    groupe.add(portrait);
    chargerImageProjet(m.photo, m.nom, PORTRAIT_LARGEUR / PORTRAIT_HAUTEUR, manager, (t) => {
      mat.map?.dispose();
      mat.map = t;
      mat.needsUpdate = true;
    }, m.role.toUpperCase(), texturePortrait(i));
  });

  // ---- Lampes intérieures : discrètes le jour, chaleureuses la nuit ----
  const lampes = [
    new PointLight('#ffd9a0', 0, 22, 2),
    new PointLight('#ffd9a0', 0, 22, 2),
    new PointLight('#ffd9a0', 0, 22, 2),
  ];
  lampes[0].position.set(0, 4.5, 4);
  lampes[1].position.set(-12, 9.8, -1);
  lampes[2].position.set(12, 9.8, -4);
  lampes.forEach((l) => groupe.add(l));

  construireAbords(groupe, ombres);

  const reglerNuit = (nuit: number) => {
    vitre.emissiveIntensity = nuit * 0.35;
    vitre.opacity = 0.2 + nuit * 0.15;
    laiton.emissiveIntensity = nuit * 0.6;
    lampes.forEach((l) => (l.intensity = 25 + nuit * 70));
  };

  return { groupe, cadres, portraits, reglerNuit, pret: Promise.resolve() };
}

/** Parvis, bassin, arbres et silhouette de la ville autour du bâtiment. */
function construireAbords(groupe: Group, ombres: boolean) {
  const sol = new Mesh(new PlaneGeometry(800, 800), new MeshStandardMaterial({ name: 'Sol_exterieur', color: '#3b3934', roughness: 1 }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = -0.02;
  sol.receiveShadow = ombres;
  groupe.add(sol);

  const parvis = new Mesh(new PlaneGeometry(56, 34), new MeshStandardMaterial({ name: 'Parvis', color: '#cfc6b8', roughness: 0.8 }));
  parvis.rotation.x = -Math.PI / 2;
  parvis.position.set(0, 0, P / 2 + 17);
  parvis.receiveShadow = ombres;
  groupe.add(parvis);

  const bassin = new Mesh(
    new PlaneGeometry(16, 7),
    new MeshStandardMaterial({ name: 'Eau', color: '#1d2a33', roughness: 0.04, metalness: 1 }),
  );
  bassin.rotation.x = -Math.PI / 2;
  bassin.position.set(-14, 0.02, P / 2 + 12);
  groupe.add(bassin);

  const tronc = new MeshStandardMaterial({ name: 'Tronc', color: '#4a3b2c', roughness: 1 });
  const feuillage = new MeshStandardMaterial({ name: 'Feuillage', color: '#4e6a45', roughness: 0.9, flatShading: true });
  const arbres = [
    [12, 20],
    [17, 25],
    [22, 19],
    [-24, 26],
    [-6, 30],
    [26, 30],
  ];
  for (const [x, z] of arbres) {
    const t = new Mesh(new CylinderGeometry(0.15, 0.2, 2.6), tronc);
    t.position.set(x, 1.3, z);
    t.castShadow = ombres;
    groupe.add(t);
    const f = new Mesh(new IcosahedronGeometry(1.8, 1), feuillage);
    f.position.set(x, 3.6, z);
    f.castShadow = ombres;
    groupe.add(f);
  }

  // Ville : des volumes simples, tenus à distance du parvis et du point de vue d'arrivée.
  const nb = 220;
  const immeubles = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ name: 'Ville', color: '#77736b', roughness: 0.95 }),
    nb,
  );
  const o = new Object3D();
  let n = 0;
  let graine = 7;
  const hasard = () => {
    graine = (graine * 16807) % 2147483647;
    return graine / 2147483647;
  };
  while (n < nb) {
    const angle = hasard() * Math.PI * 2;
    const r = 70 + hasard() * 220;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    // Garder le parvis et le point de vue d'arrivée dégagés.
    if (z > 0 && Math.abs(x) < 40 && r < 90) continue;
    if (Math.hypot(x + 28, z - 52) < 30) continue;
    const h = 5 + hasard() * hasard() * 38;
    o.position.set(x, h / 2, z);
    o.scale.set(8 + hasard() * 14, h, 8 + hasard() * 14);
    o.rotation.y = Math.round(hasard() * 3) * (Math.PI / 12);
    o.updateMatrix();
    immeubles.setMatrixAt(n++, o.matrix);
  }
  immeubles.receiveShadow = ombres;
  groupe.add(immeubles);
}
