// Prépare les personnages réalistes des promeneurs (public/modeles/personnes/).
// Sources : modèles d'exemple de three.js (r180), personnages Mixamo et Ready Player Me.
//   - femme.glb  : « Michelle » (Mixamo), sans sa danse
//   - homme.glb  : avatar Ready Player Me en costume, sans le chapeau
//   - mouvements.glb : animations « walk » et « idle » du robot Mixamo « Xbot », squelette seul
// Lancer : npm run preparer-personnes
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const SOURCE = 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/';
const SORTIE = 'public/modeles/personnes/';
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

async function lire(nom) {
  const r = await fetch(SOURCE + nom);
  if (!r.ok) throw new Error(`${nom} : ${r.status}`);
  return io.readBinary(new Uint8Array(await r.arrayBuffer()));
}

async function finir(doc, fichier, { textures = true } = {}) {
  const etapes = [prune(), dedup()];
  if (textures) etapes.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }));
  etapes.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...etapes);
  await io.write(SORTIE + fichier, doc);
  console.log('écrit', SORTIE + fichier);
}

// Femme : on retire ses animations (danse, pose en T).
{
  const doc = await lire('Michelle.glb');
  doc.getRoot().listAnimations().forEach((a) => a.dispose());
  await finir(doc, 'femme.glb');
}

// Homme : on retire le chapeau de cow-boy.
{
  const doc = await lire('readyplayer.me.glb');
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh();
    if (m && m.listPrimitives().some((p) => p.getMaterial()?.getName() === 'Wolf3D_Headwear')) {
      m.dispose();
      n.dispose();
    }
  }
  await finir(doc, 'homme.glb');
}

// Mouvements : marche et attente du robot Mixamo, sans maillage (sa pose de repos est en T).
{
  const doc = await lire('Xbot.glb');
  const racine = doc.getRoot();
  racine.listAnimations().forEach((a) => !['walk', 'idle'].includes(a.getName()) && a.dispose());
  for (const n of racine.listNodes()) if (n.getMesh() || n.getSkin()) { n.setMesh(null); n.setSkin(null); }
  racine.listMeshes().forEach((m) => m.dispose());
  racine.listSkins().forEach((s) => s.dispose());
  await doc.transform(resample());
  await finir(doc, 'mouvements.glb', { textures: false });
}
