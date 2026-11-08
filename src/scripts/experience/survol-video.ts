import gsap from 'gsap';

// Survol en vidéo : le vol du drone rendu dans Twinmotion (lumière, ombres, herbe) remplace le vol
// calculé en direct quand la vidéo est prête à l'ouverture des volets. À la fin, elle se fond
// dans la 3D, posée sur la vue 0 du parcours. Si la vidéo manque ou tarde, le vol en 3D
// (survol.ts) prend sa place, comme avant.

/** Nombre de points de passage du vol (comme survol.ts) : la vidéo suit les mêmes repères. */
const ETAPES = 15;
/** Fondu de la vidéo vers la 3D (s). */
const FONDU = 1;

/** La vidéo du jour ou celle de la nuit, en petite taille sur téléphone. */
function source(nuit: boolean) {
  const petit = Math.min(innerWidth, innerHeight) < 700 || innerWidth < 900;
  return `/video/survol${nuit ? '-nuit' : ''}${petit ? '-mobile' : ''}.mp4`;
}

/** `nuit` : la lumière du site au chargement (heure du visiteur, ou son choix Jour / Nuit). */
export function creerSurvolVideo(video: HTMLVideoElement, nuit: boolean) {
  let deNuit = nuit;
  video.src = source(nuit);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.load();

  let enCours = false;
  let couvre = false;
  let fini = false;
  let quandFin: (() => void) | null = null;

  const terminer = () => {
    if (fini) return;
    fini = true;
    enCours = false;
    // La 3D reprend sous la vidéo (posée sur la vue 0), puis la vidéo s'efface.
    quandFin?.();
    quandFin = null;
    requestAnimationFrame(() => {
      couvre = false;
      gsap.to(video, {
        opacity: 0,
        duration: FONDU,
        ease: 'power1.inOut',
        onComplete: () => {
          video.pause();
          video.hidden = true;
          video.removeAttribute('src');
          video.load(); // libère la mémoire du décodeur
        },
      });
    });
  };
  video.addEventListener('ended', terminer);
  video.addEventListener('error', () => enCours && terminer());

  return {
    /** Assez chargée pour être lue jusqu'au bout sans attendre ? */
    get prete() {
      return !fini && !video.error && video.readyState >= 3;
    },
    /** La vidéo occupe tout l'écran : inutile de dessiner la 3D derrière. */
    get couvre() {
      return couvre;
    },
    get enCours() {
      return enCours;
    },
    /** Où en est le vol, en points de passage (pour les légendes). */
    get etape() {
      return video.duration ? (video.currentTime / video.duration) * ETAPES : 0;
    },
    /** Pose la première image derrière les volets, avant qu'ils ne s'ouvrent. */
    montrer() {
      couvre = true;
      video.hidden = false;
      gsap.set(video, { opacity: 1 });
    },
    /** Lance la vidéo ; `fin` est appelé quand elle se termine, juste avant le fondu. */
    jouer(fin: () => void) {
      quandFin = fin;
      enCours = true;
      this.montrer();
      video.play().catch(() => terminer());
    },
    /** Le visiteur est pressé : la fin du vol défile vite. */
    presser() {
      if (enCours) video.playbackRate = 4;
    },
    /** Le visiteur change la lumière : on passe à l'autre vidéo, au même moment du vol. */
    changer(nuit: boolean) {
      if (fini || nuit === deNuit) return;
      deNuit = nuit;
      const t = video.currentTime;
      const vitesse = video.playbackRate;
      video.src = source(nuit);
      video.load();
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = Math.min(t, video.duration || t);
          video.playbackRate = vitesse;
          if (enCours) video.play().catch(() => terminer());
        },
        { once: true },
      );
    },
    /** Arrêt immédiat (arrivée sur une section). */
    arreter() {
      if (enCours || !fini) {
        quandFin = null;
        fini = true;
        enCours = false;
        couvre = false;
        video.pause();
        video.hidden = true;
      }
    },
  };
}
