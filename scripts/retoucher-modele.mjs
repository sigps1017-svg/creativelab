// Retouches du bâtiment exporté par Blender (public/modeles/creativ-batiment.glb), lancées par
// npm run optimiser-modele avant la compression (sur le fichier tel qu'il sort de Blender) :
//   - le parvis : la texture photo des dalles est éclaircie, pour garder un parvis lumineux ;
//   - le béton banché (Beton_sombre) prend le béton lisse des murs, plus calme derrière les
//     cadres de la galerie et les portraits.
// Le script peut être relancé sans risque : chaque retouche n'est faite qu'une fois.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const FICHIER = 'public/modeles/creativ-batiment.glb';
const ECLAIRCIR = { Parvis: 1.55 }; // matériau : facteur appliqué à sa texture de couleur

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(FICHIER);
const racine = doc.getRoot();
const materiau = (nom) => racine.listMaterials().find((m) => m.getName() === nom);

for (const [nom, facteur] of Object.entries(ECLAIRCIR)) {
  const tex = materiau(nom)?.getBaseColorTexture();
  if (!tex || tex.getExtras().eclairci) continue;
  const dossier = mkdtempSync(join(tmpdir(), 'creativ-'));
  const entree = join(dossier, 'entree.webp');
  const sortie = join(dossier, 'sortie.webp');
  writeFileSync(entree, tex.getImage());
  execFileSync('convert', [entree, '-colorspace', 'RGB', '-evaluate', 'multiply', String(facteur), '-colorspace', 'sRGB', '-quality', '85', sortie]);
  tex.setImage(readFileSync(sortie)).setMimeType('image/webp').setExtras({ eclairci: facteur });
  console.log(`${nom} : texture éclaircie ×${facteur}`);
}

const banche = materiau('Beton_sombre');
const lisse = materiau('Beton');
if (banche && lisse && banche.getBaseColorTexture()?.getName().startsWith('concrete_slab_wall')) {
  banche
    .setBaseColorTexture(lisse.getBaseColorTexture())
    .setNormalTexture(lisse.getNormalTexture())
    .setMetallicRoughnessTexture(lisse.getMetallicRoughnessTexture());
  for (const t of racine.listTextures()) if (t.getName().startsWith('concrete_slab_wall') && t.listParents().length <= 1) t.dispose();
  console.log('Beton_sombre : béton lisse des murs');
}

await io.write(FICHIER, doc);
