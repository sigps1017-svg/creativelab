import { CatmullRomCurve3, Vector3 } from 'three';

// Survol du quartier à l'arrivée : quand les volets s'ouvrent, on découvre la ville vue du ciel,
// comme depuis un drone. Le vol longe la tour Horizon, passe au-dessus de la place et de sa
// fontaine, tourne autour de l'étang et du kiosque, passe devant la maison, en fait le tour par l'arrière
// (la Boucle, la rue arrière et ses villas), puis revient se poser devant la façade de Creativ Lab, exactement sur le premier point de vue du parcours : la
// visite guidée prend le relais. Un geste du visiteur (défilement, toucher, touche) accélère la
// fin du vol.

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

// Positions du drone et points regardés, de la vue d'ensemble à l'atterrissage.
const POSITIONS = [
  v(-185, 82, 235),
  v(-120, 52, 178),
  v(-72, 36, 100),
  v(-14, 24, 128),
  v(30, 18, 122),
  v(84, 16, 104),
  v(62, 16, 64), // on revient vers la maison…
  v(12, 14, 54), // … on passe devant sa façade sans s'arrêter…
  v(-62, 20, 22), // … on la contourne par la gauche…
  v(-58, 28, -74), // … pour découvrir l'arrière : la Boucle, la rue arrière et ses villas
  v(18, 30, -104),
  v(84, 24, -38), // retour par la droite
  v(56, 13, 56),
  v(2, 7.5, 64), // on descend vers le parvis : les voitures de Creativ Lab…
  v(-6, 6.2, 50), // … puis la façade, et l'on voit dedans
  v(0, 6, 40), // = vue 0 du parcours (parvis, face à la façade)
];
const CIBLES = [
  v(-20, 12, 100),
  v(-48, 34, 135),
  v(-10, 4, 95),
  v(0, 2, 91),
  v(52, 1, 94),
  v(58, 2, 92),
  v(0, 6, 10),
  v(-20, 6, 0),
  v(-30, 4, -40),
  v(10, 3, -125),
  v(40, 3, -140),
  v(20, 6, 10),
  v(-4, 4, 28),
  v(-16, 0.8, 34.5),
  v(-6, 4, 16),
  v(0, 5, 10),
];
const DUREE = 42; // secondes

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
    /** Où en est le vol, compté en points de passage (0 = départ, POSITIONS.length - 1 = posé). */
    get etape() {
      return Math.min(1, adoucir(t) / fin) * (POSITIONS.length - 1);
    },
    get enVol() {
      return enVol;
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
