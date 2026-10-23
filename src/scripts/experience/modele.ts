import {
  Color,
  Group,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { construireBatiment, type Batiment, type ProjetGalerie } from './batiment';
import { chargerImageProjet, texturePortrait } from './textures';

// Le bâtiment modélisé dans Blender (scripts/blender), exporté en glTF et compressé :
// voir README, « Mettre à jour le modèle 3D ».
// Il remplace le bâtiment provisoire, qui reste la solution de secours si le fichier manque.
export const URL_MODELE = '/modeles/creativ-batiment.glb';

/**
 * Charge le modèle en arrière-plan. Le groupe est vide au départ et se remplit à l'arrivée du
 * fichier ; les cadres de la galerie sont ajoutés à `cadres` au même moment.
 */
export function chargerBatiment(
  projets: ProjetGalerie[],
  manager: LoadingManager,
  ombres: boolean,
): Batiment {
  const groupe = new Group();
  const cadres: Mesh[] = [];
  let nuit = 0;
  let appliquerNuit = (_n: number) => {};

  const reglerNuit = (n: number) => {
    nuit = n;
    appliquerNuit(n);
  };

  const secours = () => {
    const provisoire = construireBatiment(projets, manager, ombres);
    groupe.add(provisoire.groupe);
    cadres.push(...provisoire.cadres);
    appliquerNuit = provisoire.reglerNuit;
    appliquerNuit(nuit);
  };

  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    URL_MODELE,
    (gltf) => {
      const prepare = preparerModele(gltf.scene, projets, manager, ombres);
      groupe.add(gltf.scene);
      cadres.push(...prepare.cadres);
      appliquerNuit = prepare.reglerNuit;
      appliquerNuit(nuit);
    },
    undefined,
    secours,
  );

  return { groupe, cadres, reglerNuit };
}

function preparerModele(racine: Group, projets: ProjetGalerie[], manager: LoadingManager, ombres: boolean) {
  // Le verre transmissif de Blender coûte un rendu supplémentaire : un verre transparent suffit.
  const vitre = new MeshStandardMaterial({
    name: 'Vitrage',
    color: '#a9c2cf',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    emissive: new Color('#ffcf8a'),
    emissiveIntensity: 0,
  });
  const laitons: MeshStandardMaterial[] = [];
  const lampes: MeshStandardMaterial[] = [];
  const cadres: Mesh[] = [];

  racine.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mat = o.material as Material;
    if (mat.name === 'Vitrage') {
      o.material = vitre;
      o.layers.set(1);
      return;
    }
    if (mat instanceof MeshStandardMaterial) {
      if (mat.name === 'Laiton') laitons.push(mat);
      if (mat.name === 'Lumiere_chaude') lampes.push(mat);
      if (mat.map) mat.map.anisotropy = 8;
    }
    // La ville lointaine et le sol n'ont pas besoin de projeter d'ombre.
    const lointain = o.name.startsWith('Ville') || mat.name === 'Sol_exterieur';
    o.castShadow = ombres && !lointain;
    o.receiveShadow = ombres;
  });

  // Galerie : les cadres Cadre_01..10, dans l'ordre des projets.
  for (let i = 0; i < 10; i++) {
    const cadre = racine.getObjectByName(`Cadre_${String(i + 1).padStart(2, '0')}`);
    if (!(cadre instanceof Mesh)) continue;
    const p = projets[i];
    if (!p) {
      cadre.visible = false;
      continue;
    }
    const aspect = plaquerImage(cadre);
    const mat = new MeshBasicMaterial({ name: `Image_${p.slug}`, toneMapped: false });
    cadre.material = mat;
    cadre.userData = { slug: p.slug, titre: p.titre };
    cadres.push(cadre);
    chargerImageProjet(p.image, p.titre, aspect, manager, (t) => {
      mat.map?.dispose();
      mat.map = t;
      mat.needsUpdate = true;
    });
  }

  // Mur de l'équipe : portraits provisoires.
  for (let i = 0; i < 4; i++) {
    const portrait = racine.getObjectByName(`Portrait_${String(i + 1).padStart(2, '0')}`);
    if (!(portrait instanceof Mesh)) continue;
    plaquerImage(portrait);
    portrait.material = new MeshBasicMaterial({ name: 'Portrait', map: texturePortrait(i), toneMapped: false });
  }

  const reglerNuit = (nuit: number) => {
    vitre.emissiveIntensity = nuit * 0.35;
    vitre.opacity = 0.18 + nuit * 0.15;
    laitons.forEach((m) => {
      m.emissive.set('#c8a165');
      m.emissiveIntensity = nuit * 0.6;
    });
    lampes.forEach((m) => (m.emissiveIntensity = 1.5 + nuit * 4));
  };

  return { cadres, reglerNuit };
}

/**
 * Coordonnées de texture d'un rectangle plat (cadre, portrait) : l'image le couvre entièrement,
 * à l'endroit. Renvoie le rapport largeur / hauteur du rectangle.
 */
function plaquerImage(m: Mesh): number {
  const g = m.geometry;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  if (!uv) return 1.5;
  const largeur = b.max.x - b.min.x || 1;
  const hauteur = b.max.y - b.min.y || 1;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - b.min.x) / largeur, (pos.getY(i) - b.min.y) / hauteur);
  }
  uv.needsUpdate = true;
  return largeur / hauteur;
}
