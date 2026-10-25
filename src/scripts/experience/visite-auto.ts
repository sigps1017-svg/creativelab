import gsap from 'gsap';
import type Lenis from 'lenis';

// Visite guidée automatique : à l'arrivée, après un temps d'arrêt devant la façade, la page défile
// seule d'un espace à l'autre et marque une pause à chacun. Un toucher (ou un clic) sur la scène
// met en pause, un autre reprend ; dès que le visiteur fait défiler lui-même, il reprend la main.
// Le bouton en bas à gauche montre l'état et relance la visite.

export interface Etape {
  /** Position de défilement à atteindre. */
  y: number;
  /** Durée du trajet jusque-là, en secondes. */
  trajet: number;
  /** Temps d'arrêt une fois arrivé. */
  arret: number;
}

const LIBELLES = {
  lecture: '❚❚ Pause',
  pause: '▶ Reprendre',
  arret: '▶ Visite guidée',
};

export function creerVisiteAuto(lenis: Lenis, bouton: HTMLButtonElement, etapes: () => Etape[]) {
  let chrono: gsap.core.Timeline | null = null;
  let etat: keyof typeof LIBELLES = 'arret';
  const position = { y: 0 };

  const afficher = (e: keyof typeof LIBELLES) => {
    etat = e;
    bouton.textContent = LIBELLES[e];
    bouton.setAttribute('aria-pressed', String(e === 'lecture'));
    document.documentElement.classList.toggle('visite-auto', e !== 'arret');
  };
  afficher('arret');

  const lancer = () => {
    chrono?.kill();
    const liste = etapes();
    // On repart de l'endroit où l'on se trouve : les étapes déjà passées sont sautées
    // (et la visite recommence depuis le début si l'on était arrivé au bout).
    let suivantes = liste.filter((e) => e.y > lenis.scroll + 4);
    if (!suivantes.length) {
      lenis.scrollTo(0, { immediate: true });
      suivantes = liste.filter((e) => e.y > 4);
    }
    position.y = lenis.scroll;
    chrono = gsap.timeline({ onComplete: () => afficher('arret') });
    for (const e of suivantes) {
      chrono
        .to(position, {
          y: e.y,
          duration: e.trajet,
          ease: 'power1.inOut',
          onUpdate: () => lenis.scrollTo(position.y, { immediate: true }),
        })
        .to({}, { duration: e.arret });
    }
    afficher('lecture');
  };

  const pause = () => {
    if (etat !== 'lecture') return;
    chrono?.pause();
    afficher('pause');
  };
  const reprendre = () => {
    if (etat !== 'pause' || !chrono) return;
    // Si le visiteur a bougé entre-temps, on repart de là où il est.
    if (Math.abs(lenis.scroll - position.y) > 4) lancer();
    else {
      chrono.resume();
      afficher('lecture');
    }
  };
  const arreter = () => {
    chrono?.kill();
    chrono = null;
    afficher('arret');
  };

  bouton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (etat === 'lecture') pause();
    else if (etat === 'pause') reprendre();
    else lancer();
  });

  // Le visiteur fait défiler lui-même : il reprend la main.
  const prendreLaMain = () => {
    if (etat === 'lecture' || etat === 'pause') arreter();
  };
  addEventListener('wheel', prendreLaMain, { passive: true });
  // Défilement tactile natif, barre de défilement… : la page s'écarte de la visite.
  lenis.on('scroll', () => {
    if (etat === 'lecture' && Math.abs(lenis.scroll - position.y) > 40) arreter();
  });
  addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) prendreLaMain();
  });
  // Toucher : un glissement reprend la main, un simple toucher met en pause ou reprend.
  let debut: { x: number; y: number; t: number } | null = null;
  addEventListener(
    'pointerdown',
    (e) => {
      debut = { x: e.clientX, y: e.clientY, t: performance.now() };
    },
    { passive: true },
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (debut && e.pointerType === 'touch' && Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > 12) {
        debut = null;
        prendreLaMain();
      }
    },
    { passive: true },
  );
  addEventListener('pointerup', (e) => {
    const d = debut;
    debut = null;
    if (!d || etat === 'arret') return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || performance.now() - d.t > 500) return;
    // Les champs, liens et boutons gardent leur rôle.
    if ((e.target as Element).closest('a, button, input, textarea, select, label, dialog, .entete')) return;
    if (etat === 'lecture') pause();
    else reprendre();
  });

  return {
    lancer,
    arreter,
    pause,
    get active() {
      return etat !== 'arret';
    },
  };
}
