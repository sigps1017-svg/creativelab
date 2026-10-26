// Sons d'ambiance de la visite : la rumeur de la ville sur le parvis, le hall et ses pas à
// l'intérieur, le vent et le clapotis de la piscine sur le toit. Ils se fondent l'un dans
// l'autre en changeant d'espace, discrètement sous la musique.
// Ils suivent le bouton « Musique » de l'en-tête : couper le son les coupe aussi.
// Le son passe par Web Audio : sur iPhone, c'est le seul moyen de régler un volume.

const PISTES = {
  ville: '/ambiance/ville.mp3',
  interieur: '/ambiance/interieur.mp3',
  toit: '/ambiance/toit.mp3',
};
type Piste = keyof typeof PISTES;

/** Ambiance selon la place de la caméra (coordonnées du site : bâtiment de 40 × 24 m, toit à 11 m). */
function pisteEn(x: number, y: number, z: number): Piste {
  if (y > 10.6) return 'toit';
  return Math.abs(x) < 20 && Math.abs(z) < 12.2 ? 'interieur' : 'ville';
}
const NIVEAU: Record<Piste, number> = { ville: 0.9, interieur: 0.75, toit: 0.9 };
const VOLUME = 0.6;

export function creerAmbianceSonore() {
  let actif = true;
  try {
    actif = localStorage.getItem('creativ-musique') !== 'off';
  } catch {
    // préférence illisible : le son est permis par défaut
  }
  let ctx: AudioContext | null = null;
  let maitre: GainNode | null = null;
  const gains: Partial<Record<Piste, GainNode>> = {};
  let piste: Piste = 'ville';

  const appliquer = () => {
    if (!ctx) return;
    for (const [nom, g] of Object.entries(gains) as [Piste, GainNode][]) {
      g.gain.setTargetAtTime(nom === piste ? NIVEAU[nom] : 0, ctx.currentTime, 0.9);
    }
  };

  const charger = async (c: AudioContext, nom: Piste) => {
    const reponse = await fetch(PISTES[nom]);
    const tampon = await c.decodeAudioData(await reponse.arrayBuffer());
    const source = c.createBufferSource();
    source.buffer = tampon;
    source.loop = true;
    // Les bords d'un mp3 portent un court silence : la boucle les saute.
    source.loopStart = 0.06;
    source.loopEnd = tampon.duration - 0.06;
    const g = c.createGain();
    g.gain.value = 0;
    source.connect(g).connect(maitre!);
    source.start(0, 0.06);
    gains[nom] = g;
    appliquer();
  };

  // Doit être appelé pendant un geste du visiteur (toucher, clic, touche) : condition des navigateurs.
  const demarrer = () => {
    if (!actif) return;
    if (!ctx) {
      const Contexte = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Contexte) return;
      ctx = new Contexte();
      maitre = ctx.createGain();
      maitre.gain.value = 0;
      maitre.connect(ctx.destination);
      for (const nom of Object.keys(PISTES) as Piste[]) {
        charger(ctx, nom).catch((e) => console.warn("Ambiance sonore indisponible :", nom, e));
      }
    }
    ctx.resume();
    maitre!.gain.setTargetAtTime(VOLUME, ctx.currentTime, 1.2);
  };

  const arreter = () => {
    if (!ctx || !maitre) return;
    maitre.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  };

  const geste = () => {
    if (actif && ctx?.state !== 'running') demarrer();
  };
  for (const g of ['pointerdown', 'keydown', 'touchend']) addEventListener(g, geste, { capture: true, passive: true });

  addEventListener('creativ:son', (e) => {
    actif = (e as CustomEvent<boolean>).detail;
    if (actif) demarrer();
    else arreter();
  });

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (actif) ctx.resume();
  });

  return {
    /** À chaque image : la place de la caméra choisit l'ambiance. */
    regler(position: { x: number; y: number; z: number }) {
      const p = pisteEn(position.x, position.y, position.z);
      if (p === piste) return;
      piste = p;
      appliquer();
    },
  };
}
