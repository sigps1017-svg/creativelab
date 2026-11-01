import { CatmullRomCurve3, Vector3 } from 'three';

// Survol du quartier à l'arrivée : quand les volets s'ouvrent, on découvre la ville vue du ciel,
// comme depuis un drone. Le vol longe la tour Horizon, passe au-dessus de la place et de sa
// fontaine, tourne autour de l'étang et du kiosque, suit la Boucle, puis franchit l'avenue et se
// pose devant la façade de Creativ Lab, exactement sur le premier point de vue du parcours : la
// visite guidée prend le relais. Un geste du visiteur (défilement, toucher, touche) accélère la
// fin du vol.

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

// Positions du drone et points regardés, de la vue d'ensemble à l'atterrissage.
const POSITIONS = [
  v(-185, 82, 235),
  v(-120, 52, 178),
  v(-62, 34, 112),
  v(-14, 24, 128),
  v(30, 18, 122),
  v(84, 16, 104),
  v(112, 22, 62),
  v(70, 16, 74),
  v(26, 10, 62),
  v(0, 6, 40), // = vue 0 du parcours (parvis, face à la façade)
];
const CIBLES = [
  v(-20, 12, 100),
  v(-48, 34, 135),
  v(-10, 4, 95),
  v(0, 2, 91),
  v(52, 1, 94),
  v(58, 2, 92),
  v(60, 8, 40),
  v(10, 6, 20),
  v(0, 6, 12),
  v(0, 5, 10),
];
const DUREE = 24; // secondes

/** Accélère au départ (sur les 8 premiers %), file régulièrement, puis freine pour se poser. */
const A = 0.08;
const B = 0.8;
const adoucir = (t: number) => {
  if (t < A) return (t * t) / (2 * A);
  if (t < B) return t - A / 2;
  const d = t - B;
  return B - A / 2 + d - (d * d) / (2 * (1 - B));
};

export function creerSurvol() {
  const courbePos = new CatmullRomCurve3(POSITIONS, false, 'centripetal');
  const courbeCible = new CatmullRomCurve3(CIBLES, false, 'centripetal');
  // Normalise la fonction d'adoucissement (elle doit aller de 0 à 1).
  const fin = adoucir(1);
  let t = 0;
  let vitesse = 1;
  let enVol = false;
  let quandPose: (() => void) | null = null;

  return {
    get actif() {
      return t < 1;
    },
    /** Le vol commence (les volets s'ouvrent) ; `pose` est appelé à l'atterrissage. */
    decoller(pose: () => void) {
      enVol = true;
      quandPose = pose;
    },
    /** Le visiteur est pressé : la fin du vol défile vite. */
    presser() {
      vitesse = 6;
    },
    /** Atterrissage immédiat (arrivée sur une section, mouvement réduit). */
    poser() {
      t = 1;
      enVol = false;
      quandPose?.();
      quandPose = null;
    },
    mettreAJour(dt: number, pos: Vector3, cible: Vector3) {
      if (enVol && t < 1) {
        t = Math.min(1, t + (dt * vitesse) / DUREE);
        if (t >= 1) {
          enVol = false;
          quandPose?.();
          quandPose = null;
        }
      }
      const u = Math.min(1, adoucir(t) / fin);
      courbePos.getPoint(u, pos);
      courbeCible.getPoint(u, cible);
    },
  };
}
