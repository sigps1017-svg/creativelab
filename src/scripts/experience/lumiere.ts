import { Color, MathUtils, Vector3 } from 'three';

// La lumière suit l'heure réelle du visiteur : matin, midi, crépuscule, nuit.
// Le visiteur peut aussi choisir le jour ou la nuit (bouton de l'en-tête, choix mémorisé).
// Pour tester une heure précise : ajoutez ?heure=20 à l'adresse.

export interface Ambiance {
  ciel: Color;
  soleilCouleur: Color;
  soleilIntensite: number;
  soleilPosition: Vector3;
  ambiante: number;
  /** 0 en plein jour, 1 en pleine nuit : allume les fenêtres et les lampes intérieures. */
  nuit: number;
}

export type ModeLumiere = 'auto' | 'jour' | 'nuit';
export const MODES: ModeLumiere[] = ['auto', 'jour', 'nuit'];
const CLE = 'creativ-lumiere';

export function modeEnregistre(): ModeLumiere {
  try {
    const m = localStorage.getItem(CLE) as ModeLumiere | null;
    if (m && MODES.includes(m)) return m;
  } catch {}
  return 'auto';
}

export function enregistrerMode(m: ModeLumiere) {
  try {
    localStorage.setItem(CLE, m);
  } catch {}
}

/** Heure à montrer pour un mode : l'heure réelle en automatique, sinon une heure de jour ou de nuit. */
export function heurePourMode(m: ModeLumiere): number {
  const h = heureDuVisiteur();
  if (m === 'jour') return h >= 8.5 && h <= 17 ? h : 11;
  if (m === 'nuit') return h >= 21 || h < 5 ? h : 22.5;
  return h;
}

/** Le mode automatique donne-t-il la nuit en ce moment ? (pour l'affichage du bouton) */
export function estLaNuit(heure: number) {
  return ambiancePour(heure).nuit > 0.5;
}

// Quelques ambiances de référence, interpolées selon l'heure.
const REPERES = [
  { h: 0, ciel: '#0b1020', soleil: '#6c7cff', intensite: 0.15, ambiante: 0.25, nuit: 1 },
  { h: 6, ciel: '#3b3f5c', soleil: '#ff9a6b', intensite: 0.6, ambiante: 0.4, nuit: 0.7 },
  { h: 8, ciel: '#bcd3e6', soleil: '#ffd9a8', intensite: 2.2, ambiante: 0.7, nuit: 0 },
  { h: 13, ciel: '#cfe0ee', soleil: '#fff4e2', intensite: 3, ambiante: 0.9, nuit: 0 },
  { h: 17.5, ciel: '#e9b98f', soleil: '#ffb070', intensite: 2, ambiante: 0.6, nuit: 0.1 },
  { h: 19.3, ciel: '#3d2c4a', soleil: '#ff7a4a', intensite: 0.7, ambiante: 0.35, nuit: 0.8 },
  { h: 21, ciel: '#0d1226', soleil: '#6c7cff', intensite: 0.15, ambiante: 0.25, nuit: 1 },
  { h: 24, ciel: '#0b1020', soleil: '#6c7cff', intensite: 0.15, ambiante: 0.25, nuit: 1 },
];

export function heureDuVisiteur(): number {
  const param = new URLSearchParams(location.search).get('heure');
  if (param !== null && !Number.isNaN(Number(param))) return MathUtils.clamp(Number(param), 0, 23.99);
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function ambiancePour(heure: number): Ambiance {
  let i = 0;
  while (i < REPERES.length - 2 && heure >= REPERES[i + 1].h) i++;
  const a = REPERES[i];
  const b = REPERES[i + 1];
  const t = (heure - a.h) / (b.h - a.h);

  // Le soleil se lève à l'est (x+) à 6 h et se couche à l'ouest (x-) vers 19 h.
  // La nuit, la « lune » reste haute au-dessus du parvis pour garder des ombres lisibles.
  const angle = MathUtils.mapLinear(MathUtils.clamp(heure, 6, 19.3), 6, 19.3, 0, Math.PI);
  const hauteur = Math.max(Math.sin(angle), 0.25);
  const soleilPosition = new Vector3(Math.cos(angle) * 60, hauteur * 70, 40);

  return {
    ciel: new Color(a.ciel).lerp(new Color(b.ciel), t),
    soleilCouleur: new Color(a.soleil).lerp(new Color(b.soleil), t),
    soleilIntensite: MathUtils.lerp(a.intensite, b.intensite, t),
    soleilPosition,
    ambiante: MathUtils.lerp(a.ambiante, b.ambiante, t),
    nuit: MathUtils.lerp(a.nuit, b.nuit, t),
  };
}
