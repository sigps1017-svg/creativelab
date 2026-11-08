import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import police from './enseigne-police.json';

// L'enseigne de la façade : « CREATIV’LAB ARCHITECTS » en lettres de laiton découpées (Manrope),
// posées sur le bandeau sombre du modèle Blender, à la place des lettres d'origine.
// La nuit, les lettres s'allument et un rétroéclairage diffus les détache du bandeau : le nom se
// lit depuis le survol.

export const NOM_ENSEIGNE = 'CREATIV’LAB ARCHITECTS';

/** Centre du bandeau (coordonnées du site) et face avant. */
const CENTRE = { x: 0, y: 10.1, z: 15.2 };
const HAUTEUR_LETTRES = 0.95;
const ESPACEMENT = 0.32; // interlettrage, en hauteur de lettre
const EPAISSEUR = 0.08;

/** Lettres une à une, avec un interlettrage large comme sur une enseigne. */
function geometrieTexte() {
  const font = new Font(police as never);
  const parts: TextGeometry[] = [];
  let x = 0;
  const echelle = HAUTEUR_LETTRES / 720; // hauteur des capitales de Manrope : 720 / 1000
  for (const c of NOM_ENSEIGNE) {
    const glyphe = (police.glyphs as Record<string, { ha: number }>)[c];
    if (c !== ' ') {
      const g = new TextGeometry(c, { font, size: 1000 * echelle, depth: EPAISSEUR, curveSegments: 6, bevelEnabled: false });
      g.translate(x, 0, 0);
      parts.push(g);
    }
    x += glyphe.ha * echelle + ESPACEMENT * HAUTEUR_LETTRES;
  }
  return { parts, largeur: x - ESPACEMENT * HAUTEUR_LETTRES };
}

/** Halo flou du nom, peint sur une toile : le rétroéclairage des lettres sur le bandeau. */
function textureHalo(largeur: number) {
  const W = 2048;
  const H = Math.round((W * 2.2) / largeur) * 2;
  const toile = document.createElement('canvas');
  toile.width = W;
  toile.height = H;
  const ctx = toile.getContext('2d')!;
  ctx.filter = `blur(${Math.round(H * 0.12)}px)`;
  ctx.fillStyle = '#ffd59a';
  ctx.fillRect(W * 0.03, H * 0.34, W * 0.94, H * 0.32);
  const t = new CanvasTexture(toile);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function creerEnseigne(racine: Object3D, laitonModele: MeshStandardMaterial | undefined) {
  // Les lettres d'origine (« CREATIV LAB ARCHITECTS ») disparaissent ; le bandeau reste.
  racine.getObjectByName('Enseigne')?.traverse((o) => {
    if (o instanceof Mesh && (o.material as MeshStandardMaterial).name === 'Laiton') o.visible = false;
  });

  const { parts, largeur } = geometrieTexte();
  const lettres = laitonModele ? laitonModele.clone() : new MeshStandardMaterial({ color: '#c8a165', metalness: 0.85, roughness: 0.32 });
  lettres.name = 'Enseigne_lettres';
  lettres.emissive = new Color('#ffdcaa');
  lettres.emissiveIntensity = 0;
  const groupe: Mesh[] = [];
  for (const g of parts) {
    g.translate(CENTRE.x - largeur / 2, CENTRE.y - HAUTEUR_LETTRES / 2, CENTRE.z);
    const m = new Mesh(g, lettres);
    m.name = 'Enseigne_lettre';
    m.castShadow = true;
    racine.add(m);
    groupe.push(m);
  }

  const halo = new Mesh(
    new PlaneGeometry(largeur + 2.2, 2.2),
    new MeshBasicMaterial({ map: textureHalo(largeur + 2.2), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }),
  );
  halo.name = 'Enseigne_halo';
  halo.position.set(CENTRE.x, CENTRE.y, CENTRE.z + 0.02);
  halo.visible = false;
  racine.add(halo);

  return {
    reglerNuit(nuit: number) {
      lettres.emissiveIntensity = nuit * 2.6;
      (halo.material as MeshBasicMaterial).opacity = nuit * 0.55;
      halo.visible = nuit > 0.02;
    },
  };
}
