// Prépare les voitures réalistes du parvis et de la circulation (public/modeles/voitures/).
// Sources (fournies par IB, Sketchfab, licence CC-BY-4.0, crédités au pied du formulaire de contact, src/pages/index.astro) :
//   - GMC Sierra HD2500, par « 01 » : https://sketchfab.com/3d-models/gmc-sierra-hd2500-c31554882b074e168ddc65bd6d1e5464
//   - 2023 Nissan X-Trail 4x4-i, par Ddiaz Design : https://sketchfab.com/3d-models/2023-nissan-x-trail-4x4-i-f9f2cbdacac74ee7acfe1c731195ccaa
// Les fichiers bruts (40 Mo) restent hors du dépôt : dossier passé en argument.
// Lancer : node scripts/preparer-voitures.mjs <dossier des .glb sources>
//
// Pour chaque voiture, deux versions :
//   - <nom>-proche.glb : pour les voitures garées sur le parvis (≈ 35 000 triangles) ;
//   - <nom>-loin.glb   : pour la circulation, en instances (≈ 9 000 triangles).
// Toutes deux en mètres, posées au sol (y = 0), centrées, l'avant vers +x.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  clearNodeTransform,
  dedup,
  flatten,
  join,
  meshopt,
  palette,
  prune,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';

const SORTIE = 'public/modeles/voitures/';
const VOITURES = [
  // longueur réelle (m) ; demi-tour si le modèle regarde vers -x une fois redressé ;
  // matériau de carrosserie (que le site repeint par voiture), s'il existe.
  { nom: 'gmc', fichier: 'gmc_sierra_hd2500.glb', longueur: 6.35, demiTour: false, peinture: null },
  { nom: 'xtrail', fichier: 'nissan_x-trail_2023.glb', longueur: 4.68, demiTour: false, peinture: 'Car_Paint' },
];
const VERSIONS = [
  { suffixe: 'proche', triangles: 35000, texture: 512, erreur: 0.006, couleursSeules: false },
  // De loin, chaque texture devient sa couleur moyenne : quelques matériaux seulement à dessiner.
  { suffixe: 'loin', triangles: 10000, texture: 256, erreur: 0.025, couleursSeules: true },
];

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const dossier = process.argv[2];
const PIXEL_NOIR = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer());
if (!dossier) throw new Error('Usage : node scripts/preparer-voitures.mjs <dossier des .glb sources>');

/** Multiplie deux matrices 4×4 (colonnes, comme glTF). */
function mul(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
  return r;
}
const appliquer = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/** Tous les sommets en coordonnées du monde. */
function sommets(doc) {
  const pts = [];
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh();
    if (!m) continue;
    const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      const v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) pts.push(appliquer(w, a.getElement(i, v)));
    }
  }
  return pts;
}

/** Redresse la voiture : axe long sur x, en mètres, roues au sol, centrée. */
function normaliser(doc, { longueur, demiTour }) {
  const scene = doc.getRoot().getDefaultScene();
  const pts = sommets(doc);
  // Axe principal dans le plan horizontal (analyse en composantes principales).
  let mx = 0, mz = 0;
  for (const p of pts) { mx += p[0]; mz += p[2]; }
  mx /= pts.length; mz /= pts.length;
  let cxx = 0, czz = 0, cxz = 0;
  for (const p of pts) { const dx = p[0] - mx, dz = p[2] - mz; cxx += dx * dx; czz += dz * dz; cxz += dx * dz; }
  let phi = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  if (demiTour) phi += Math.PI;
  const c = Math.cos(phi), s = Math.sin(phi);
  const rot = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  // Mesure dans le repère redressé.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    const q = appliquer(rot, p);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
  }
  const e = longueur / (max[0] - min[0]);
  const echelle = [e, 0, 0, 0, 0, e, 0, 0, 0, 0, e, 0, 0, 0, 0, 1];
  const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2, 1];
  const total = mul(echelle, mul(t, rot));
  const racine = doc.createNode('Voiture').setMatrix(total);
  for (const n of scene.listChildren()) { scene.removeChild(n); racine.addChild(n); }
  scene.addChild(racine);
  return { largeur: (max[2] - min[2]) * e, hauteur: (max[1] - min[1]) * e };
}

/** Une texture presque unie devient une simple couleur (moins de matériaux, moins d'appels de dessin). */
async function simplifierTextures(doc, couleursSeules) {
  const srgbVersLineaire = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  for (const mat of doc.getRoot().listMaterials()) {
    // Seule la couleur compte à la distance où on voit les voitures.
    mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
    mat.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
    for (const ext of mat.listExtensions()) ext.dispose();
    const tex = mat.getBaseColorTexture();
    if (!tex) continue;
    // Moyenne et écart pondérés par l'opacité : sous les pixels transparents, la couleur est arbitraire.
    const img = sharp(Buffer.from(tex.getImage()));
    const { width = 1, height = 1 } = await img.metadata();
    const { data } = await img.clone().toColourspace('srgb').ensureAlpha().resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const somme = [0, 0, 0], carres = [0, 0, 0];
    let poids = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      poids += a;
      for (let k = 0; k < 3; k++) { somme[k] += data[i + k] * a; carres[k] += data[i + k] ** 2 * a; }
    }
    poids = Math.max(poids, 1e-6);
    const moyenne = somme.map((x) => x / poids);
    const ecart = carres.reduce((acc, x, k) => acc + Math.sqrt(Math.max(0, x / poids - moyenne[k] ** 2)), 0) / 3;
    if (couleursSeules || width * height <= 256 || ecart < 14) {
      const f = mat.getBaseColorFactor();
      const moy = moyenne.map((x) => srgbVersLineaire(x / 255));
      const opacite = poids / (data.length / 4);
      mat.setBaseColorFactor([f[0] * moy[0], f[1] * moy[1], f[2] * moy[2], mat.getAlphaMode() === 'OPAQUE' ? f[3] : f[3] * opacite]);
      mat.setBaseColorTexture(null);
      // Une texture découpée (logos, grilles) devenue couleur unie : presque opaque, elle l'est ;
      // presque invisible, elle disparaît.
      if (mat.getAlphaMode() !== 'OPAQUE') {
        const a = mat.getBaseColorFactor()[3];
        if (a > 0.85) mat.setAlphaMode('OPAQUE').setBaseColorFactor([...mat.getBaseColorFactor().slice(0, 3), 1]);
        else if (a < 0.08) for (const p of mat.listParents()) if (p.propertyType === 'Primitive') p.dispose();
      }
    }
  }
}

/** Vitres : un verre sombre transparent (sans la transmission, qui coûte un rendu de plus). */
function vitres(doc) {
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getAlphaMode() !== 'BLEND') continue;
    const [r, g, b, a] = mat.getBaseColorFactor();
    mat.setBaseColorFactor([r * 0.3, g * 0.3, b * 0.3, Math.max(a, 0.55)]);
    mat.setRoughnessFactor(0.05).setMetallicFactor(0.2);
  }
}

/** Couleurs de sommets toutes blanches : inutiles, et elles empêchent de fusionner. */
function sansCouleursBlanches(doc) {
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const c = p.getAttribute('COLOR_0');
      if (!c) continue;
      const v = [];
      let blanc = true;
      for (let i = 0; i < c.getCount() && blanc; i++) {
        c.getElement(i, v);
        if (v[0] < 0.97 || v[1] < 0.97 || v[2] < 0.97) blanc = false;
      }
      if (blanc) p.setAttribute('COLOR_0', null);
    }
  }
}

/**
 * Simplification de chaque primitive. « Permissive » autorise à fondre les coutures (normales,
 * UV) et « Prune » retire les petites pièces isolées, invisibles à distance : sans cela, les
 * centaines de pièces détachées d'un modèle Sketchfab bloquent la simplification. L'erreur
 * tolérée est en mètres (la voiture est déjà à l'échelle).
 */
function alleger(doc, ratio, erreur) {
  if (ratio >= 1) return;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const idx = p.getIndices();
      if (!idx || p.getMode() !== 4 || idx.getCount() < 6 || idx.getCount() % 3) continue;
      const positions = new Float32Array(pos.getCount() * 3);
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) positions.set(pos.getElement(i, v), i * 3);
      const indices = new Uint32Array(idx.getArray());
      const cible = Math.min(indices.length, Math.max(3, Math.floor((indices.length * ratio) / 3) * 3));
      const [res] = MeshoptSimplifier.simplify(indices, positions, 3, cible, erreur, ['Permissive', 'Prune', 'ErrorAbsolute']);
      if (res.length === 0) {
        p.dispose();
        continue;
      }
      idx.setArray(new (idx.getArray().constructor)(res));
    }
  }
}

function compterTriangles(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
}

for (const v of VOITURES) {
  for (const version of VERSIONS) {
    const doc = await io.read(path.join(dossier, v.fichier));
    const racine = doc.getRoot();
    racine.listAnimations().forEach((a) => a.dispose());
    racine.listCameras().forEach((c) => c.dispose());
    const dims = normaliser(doc, v);
    await doc.transform(flatten());
    for (const n of racine.listNodes()) if (n.getMesh()) clearNodeTransform(n);
    sansCouleursBlanches(doc);
    await simplifierTextures(doc, version.couleursSeules);
    vitres(doc);
    // La carrosserie à repeindre garde son propre matériau : palette() ne doit pas l'absorber.
    const peinture = v.peinture && racine.listMaterials().find((m) => m.getName() === v.peinture);
    if (peinture) peinture.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.22);
    // Simplifiée avant toute fusion : une arête ne peut pas glisser d'un matériau à l'autre.
    const avant = compterTriangles(doc);
    alleger(doc, Math.min(1, version.triangles / avant), version.erreur);
    // palette() fusionne les matériaux unis ; la carrosserie et les vitres (transparentes) restent à part :
    // leurs primitives perdent leur matériau le temps de l'opération (palette() les ignore alors).
    await doc.transform(dedup(), prune());
    const proteges = new Map();
    for (const m of racine.listMeshes())
      for (const p of m.listPrimitives()) {
        const mat = p.getMaterial();
        if (mat && (mat === peinture || mat.getAlphaMode() !== 'OPAQUE')) { proteges.set(p, mat); p.setMaterial(null); }
      }
    await doc.transform(palette({ min: 3 }));
    for (const [p, mat] of proteges) p.setMaterial(mat);
    await doc.transform(dedup());
    await doc.transform(
      join({ keepNamed: false }),
      weld(),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [version.texture, version.texture], quality: 82 }),
    );
    // Le matériau de la carrosserie est nommé « Peinture » pour que le site le retrouve.
    if (v.peinture) for (const m of racine.listMaterials()) if (m.getName() === v.peinture) m.setName('Peinture');
    const b = getBounds(racine.getDefaultScene());
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const fichier = `${SORTIE}${v.nom}-${version.suffixe}.glb`;
    await io.write(fichier, doc);
    console.log(
      fichier,
      `${avant} → ${compterTriangles(doc)} triangles,`,
      `${racine.listMaterials().length} matériaux,`,
      `${dims.largeur.toFixed(2)} × ${dims.hauteur.toFixed(2)} m,`,
      'boîte',
      b.min.map((x) => x.toFixed(2)).join(' '),
      '/',
      b.max.map((x) => x.toFixed(2)).join(' '),
    );
  }
}
