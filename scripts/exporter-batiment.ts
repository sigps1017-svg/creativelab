// Exporte le bâtiment provisoire du site en fichier glTF binaire (.glb), à ouvrir dans Blender
// comme base de modélisation : mêmes cotes, mêmes niveaux, mêmes emplacements que dans le site.
//
//   npx tsx scripts/exporter-batiment.ts [chemin/sortie.glb]
//
// Les images (projets, portraits) ne sont pas exportées : les cadres restent des surfaces vides.

import { writeFileSync } from 'node:fs';
import { LoadingManager, Mesh, type Material } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Le bâtiment dessine ses visuels provisoires dans des <canvas> : on fournit un canvas inerte.
const contexteVide = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => contexteVide }),
  // Les images des projets ne sont jamais chargées : l'élément <img> reste inerte.
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
};
// GLTFExporter lit le fichier binaire avec FileReader, absent de Node.
(globalThis as any).FileReader = class {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};

const { construireBatiment } = await import('../src/scripts/experience/batiment');
const { projetsGalerie } = await import('../src/data/projets');

const batiment = construireBatiment(projetsGalerie, [], new LoadingManager(), false);
batiment.groupe.name = 'Creativ_batiment_provisoire';

// Des noms lisibles dans Blender : matériau + numéro, et Cadre_<projet> pour la galerie.
const compteurs = new Map<string, number>();
batiment.groupe.traverse((o) => {
  if (!(o instanceof Mesh) || Array.isArray(o.material)) return;
  if (o.userData.slug) {
    o.name = `Cadre_${o.userData.slug}`;
    return;
  }
  const base = o.material.name || 'Objet';
  const n = (compteurs.get(base) ?? 0) + 1;
  compteurs.set(base, n);
  o.name = `${base}_${String(n).padStart(2, '0')}`;
});

batiment.groupe.traverse((o) => {
  if (!(o instanceof Mesh)) return;
  const mats = (Array.isArray(o.material) ? o.material : [o.material]) as (Material & { map?: unknown })[];
  for (const m of mats) if ('map' in m) m.map = null;
});

const sortie = process.argv[2] ?? 'public/models/batiment-provisoire.glb';
new GLTFExporter().parse(
  batiment.groupe,
  (resultat) => {
    writeFileSync(sortie, Buffer.from(resultat as ArrayBuffer));
    console.log(`Exporté : ${sortie}`);
  },
  (erreur) => {
    console.error(erreur);
    process.exit(1);
  },
  { binary: true },
);
