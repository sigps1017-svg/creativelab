import { CatmullRomCurve3, Vector3 } from 'three';

// Le chemin de la caméra : une suite de points de vue (position + point regardé).
// La caméra glisse d'un point à l'autre sur une courbe lisse quand on fait défiler la page.
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export const POINTS_DE_VUE = [
  { pos: v(0, 6, 40), cible: v(0, 5, 10) }, // 0 parvis, face à la façade
  { pos: v(0, 2.2, 18), cible: v(0, 2.5, 0) }, // 1 devant la porte
  { pos: v(0, 1.8, 9), cible: v(0, 5.5, -2) }, // 2 hall, regard vers l'atrium
  { pos: v(-13, 1.8, -5), cible: v(-13, 2.5, -11.6) }, // 3 galerie, côté gauche
  { pos: v(13, 1.8, -5), cible: v(13, 2.5, -11.6) }, // 4 galerie, côté droit
  { pos: v(2, 3, 0), cible: v(0, 10, -2) }, // 5 atrium, on lève les yeux
  { pos: v(-12, 9, 5), cible: v(-12, 7, -3) }, // 6 atelier
  { pos: v(0, 8.4, -3.5), cible: v(0, 8.5, -11.9) }, // 7 écran des services, au fond de l'atrium
  { pos: v(11, 7.8, -4.6), cible: v(11, 7.1, -11.6) }, // 8 mur de l'équipe, début (regard un peu bas : la carte de texte passe sous les portraits)
  { pos: v(13, 7.8, -4.6), cible: v(13, 7.1, -11.6) }, // 9 mur de l'équipe, fin
  { pos: v(3, 9.5, 0), cible: v(0, 14, 8) }, // 10 montée vers le toit
  { pos: v(0, 14.2, 7), cible: v(8, 17, 70) }, // 11 terrasse, la ville et le ciel du spectacle de drones
];

/**
 * Point de vue atteint quand chaque section arrive en haut de l'écran.
 * La galerie et l'équipe sont de longues sections : la caméra longe leur mur pendant le défilement
 * (de 3 à 4 pour la galerie, de 8 à 9 pour l'équipe).
 */
export const VUE_PAR_ESPACE = [0, 2, 3, 6, 7, 8, 11];
const VUE_DE_FIN: Record<number, number> = { 2: 4, 5: 9 };

// Le mur de l'équipe mesure une dizaine de mètres : sur un écran large on le voit en entier,
// sur un téléphone en portrait la caméra le parcourt d'un bout à l'autre (premier au dernier portrait).
const EQUIPE_CENTRE = 12;
const EQUIPE_DEMI_COURSE = { large: 1, portrait: 3.8 };

let courbePos: CatmullRomCurve3;
let courbeCible: CatmullRomCurve3;
const DERNIER = POINTS_DE_VUE.length - 1;

/** Adapte le parcours à la forme de l'écran (au chargement et au redimensionnement). */
export function reglerCadrage(portrait: boolean) {
  // Sur écran large, l'écran des services se décale à droite de la carte de texte.
  POINTS_DE_VUE[7].pos.x = POINTS_DE_VUE[7].cible.x = portrait ? 0 : -2;
  const d = portrait ? EQUIPE_DEMI_COURSE.portrait : EQUIPE_DEMI_COURSE.large;
  POINTS_DE_VUE[8].pos.x = POINTS_DE_VUE[8].cible.x = EQUIPE_CENTRE - d;
  POINTS_DE_VUE[9].pos.x = POINTS_DE_VUE[9].cible.x = EQUIPE_CENTRE + d;
  courbePos = new CatmullRomCurve3(POINTS_DE_VUE.map((p) => p.pos), false, 'centripetal');
  courbeCible = new CatmullRomCurve3(POINTS_DE_VUE.map((p) => p.cible), false, 'centripetal');
}
reglerCadrage(false);

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
    if (i in VUE_DE_FIN) {
      const bas = Math.min(s.offsetTop + s.offsetHeight - hauteurEcran, maxScroll);
      ancres.push({ y: bas, k: VUE_DE_FIN[i] });
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

/** Vrai quand la caméra fait face au mur de l'équipe et que les portraits peuvent être cliqués. */
export function devantLEquipe(k: number) {
  return k > 7.6 && k < 9.4;
}

/** Vrai quand la caméra est dans la galerie et que les cadres peuvent être cliqués. */
export function dansLaGalerie(k: number) {
  return k > 2.6 && k < 4.4;
}
