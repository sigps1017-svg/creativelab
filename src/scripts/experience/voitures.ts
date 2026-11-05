import { Group, Mesh, MeshStandardMaterial, type BufferGeometry, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Les vraies voitures (modèles Sketchfab fournis par IB, préparés par scripts/preparer-voitures.mjs) :
// un pick-up GMC Sierra HD2500 et un SUV Nissan X-Trail. En mètres, posés au sol, avant vers +x.
// Deux versions de chacun : « proche » pour le parking du parvis, « loin » pour la circulation.

export type NomVoiture = 'gmc' | 'xtrail';

export interface Gabarit {
  longueur: number;
  /** Phares avant : hauteur et écart depuis l'axe ; feux arrière de même. */
  phare: { y: number; z: number };
  feu: { y: number; z: number };
  /** Matériau de carrosserie qu'on peut repeindre (sinon la voiture garde sa couleur). */
  peinture: boolean;
}

export const GABARITS: Record<NomVoiture, Gabarit> = {
  gmc: { longueur: 6.35, phare: { y: 1.12, z: 0.78 }, feu: { y: 1.1, z: 0.9 }, peinture: false },
  xtrail: { longueur: 4.68, phare: { y: 0.84, z: 0.66 }, feu: { y: 0.98, z: 0.68 }, peinture: true },
};

/** Une pièce de voiture : géométrie et matériau, prêts à être instanciés. */
export interface Piece {
  geometrie: BufferGeometry;
  materiau: Material;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Group>>();

function charger(nom: NomVoiture, version: 'proche' | 'loin') {
  const url = `/modeles/voitures/${nom}-${version}.glb`;
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then((g) => g.scene));
  return cache.get(url)!;
}

/** Les pièces de la version « loin », géométries ramenées dans le repère de la voiture. */
export async function piecesVoiture(nom: NomVoiture): Promise<Piece[]> {
  const scene = await charger(nom, 'loin');
  scene.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geometrie = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    pieces.push({ geometrie, materiau: o.material as Material });
  });
  return pieces;
}

/** Une voiture garée, version détaillée ; la carrosserie prend la couleur donnée (si repeignable). */
export async function voitureGaree(nom: NomVoiture, couleur: string | null, ombres: boolean) {
  const voiture = (await charger(nom, 'proche')).clone(true);
  voiture.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.castShadow = ombres;
    o.receiveShadow = true;
    const m = o.material as Material;
    if (couleur && m.name === 'Peinture' && m instanceof MeshStandardMaterial) {
      const copie = m.clone();
      copie.color.set(couleur);
      o.material = copie;
    }
  });
  return voiture;
}
