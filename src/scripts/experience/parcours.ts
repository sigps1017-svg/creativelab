import { CatmullRomCurve3, Vector3 } from 'three';

// Le chemin de la caméra : une suite de points de vue (position + point regardé).
// La caméra glisse d'un point à l'autre sur une courbe lisse quand on fait défiler la page.
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export const POINTS_DE_VUE = [
  { pos: v(-28, 10, 52), cible: v(0, 5, 0) }, // 0 parvis, vue d'ensemble
  { pos: v(0, 2.2, 18), cible: v(0, 2.5, 0) }, // 1 devant la porte
  { pos: v(0, 1.8, 9), cible: v(0, 5.5, -2) }, // 2 hall, regard vers l'atrium
  { pos: v(-13, 1.8, -5), cible: v(-13, 2.5, -11.6) }, // 3 galerie, côté gauche
  { pos: v(13, 1.8, -5), cible: v(13, 2.5, -11.6) }, // 4 galerie, côté droit
  { pos: v(2, 3, 0), cible: v(0, 10, -2) }, // 5 atrium, on lève les yeux
  { pos: v(-12, 9, 5), cible: v(-12, 7, -3) }, // 6 atelier
  { pos: v(12, 7.8, -2), cible: v(12, 8.2, -11.6) }, // 7 mur de l'équipe
  { pos: v(3, 9.5, 0), cible: v(0, 14, 8) }, // 8 montée vers le toit
  { pos: v(0, 13.8, 7), cible: v(12, 10, 70) }, // 9 terrasse, vue sur la ville
];

/**
 * Point de vue atteint quand chaque section arrive en haut de l'écran.
 * La galerie (espace 2) est une longue section : la caméra la longe de 3 à 4 pendant le défilement.
 */
export const VUE_PAR_ESPACE = [0, 2, 3, 6, 7, 9];
const VUE_FIN_GALERIE = 4;
const ESPACE_GALERIE = 2;

const courbePos = new CatmullRomCurve3(POINTS_DE_VUE.map((p) => p.pos), false, 'centripetal');
const courbeCible = new CatmullRomCurve3(POINTS_DE_VUE.map((p) => p.cible), false, 'centripetal');
const DERNIER = POINTS_DE_VUE.length - 1;

/** Position et point regardé pour un avancement k (0 = premier point de vue, DERNIER = dernier). */
export function vueA(k: number, pos: Vector3, cible: Vector3) {
  const t = Math.min(Math.max(k / DERNIER, 0), 1);
  courbePos.getPoint(t, pos);
  courbeCible.getPoint(t, cible);
}

interface Ancre {
  y: number;
  k: number;
}

let ancres: Ancre[] = [];

/** Recalcule les correspondances défilement → point de vue (au chargement et au redimensionnement). */
export function mesurerAncres(sections: HTMLElement[]) {
  const hauteurEcran = window.innerHeight;
  const maxScroll = document.documentElement.scrollHeight - hauteurEcran;
  ancres = [];
  sections.forEach((s, i) => {
    const haut = Math.min(s.offsetTop, maxScroll);
    ancres.push({ y: haut, k: VUE_PAR_ESPACE[i] });
    if (i === ESPACE_GALERIE) {
      const bas = Math.min(s.offsetTop + s.offsetHeight - hauteurEcran, maxScroll);
      ancres.push({ y: bas, k: VUE_FIN_GALERIE });
    }
  });
}

/** Avancement de la caméra pour une position de défilement donnée. */
export function vueDepuisScroll(y: number): number {
  if (ancres.length === 0) return 0;
  if (y <= ancres[0].y) return ancres[0].k;
  for (let i = 1; i < ancres.length; i++) {
    const a = ancres[i - 1];
    const b = ancres[i];
    if (y <= b.y) {
      const span = b.y - a.y || 1;
      return a.k + ((y - a.y) / span) * (b.k - a.k);
    }
  }
  return ancres[ancres.length - 1].k;
}

/** Position de défilement qui amène la section `espace` en haut de l'écran. */
export function scrollPourEspace(espace: number): number {
  return ancres.find((a) => a.k === VUE_PAR_ESPACE[espace])?.y ?? 0;
}

/** Espace dont on est le plus proche, pour le plan de navigation. */
export function espaceDepuisVue(k: number): number {
  let meilleur = 0;
  VUE_PAR_ESPACE.forEach((vue, i) => {
    if (k >= vue - 0.5) meilleur = i;
  });
  return meilleur;
}

/** Vrai quand la caméra est dans la galerie et que les cadres peuvent être cliqués. */
export function dansLaGalerie(k: number) {
  return k > 2.6 && k < 4.4;
}
