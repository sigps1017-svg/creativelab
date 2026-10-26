import { morceaux } from '../data/musique';

// Musique de fond, avec un menu dans l'en-tête pour couper le son ou choisir un autre morceau.
// Les navigateurs bloquent le son sans geste du visiteur : on tente la lecture à l'arrivée, sinon
// elle démarre au premier toucher, clic ou touche (sauf si le visiteur a coupé la musique).
// D'une page à l'autre, le morceau reprend là où il en était.

const CLE_SON = 'creativ-musique';
const CLE_MORCEAU = 'creativ-musique-morceau';
const CLE_POSITION = 'creativ-musique-position';
const VOLUME = 0.5;
const FONDU_MS = 1800;

function lire(stockage: () => Storage, cle: string) {
  try {
    return stockage().getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(stockage: () => Storage, cle: string, valeur: string) {
  try {
    stockage().setItem(cle, valeur);
  } catch {
    // Préférence non mémorisée (navigation privée) : sans conséquence.
  }
}

function initMusique(racine: HTMLElement) {
  if (!morceaux.length) return;
  const bouton = racine.querySelector<HTMLButtonElement>('.musique-bouton')!;
  const menu = racine.querySelector<HTMLElement>('.musique-menu')!;
  const son = racine.querySelector<HTMLButtonElement>('.musique-son')!;
  const choix = [...racine.querySelectorAll<HTMLButtonElement>('[data-morceau]')];

  let indice = Number(lire(() => localStorage, CLE_MORCEAU));
  if (!(indice >= 0 && indice < morceaux.length)) indice = 0;
  let veutMusique = lire(() => localStorage, CLE_SON) !== 'off';
  let reprendreAuRetour = false;
  let fondu = 0;

  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  audio.src = morceaux[indice].fichier;
  // Reprise à la même position en changeant de page.
  const position = lire(() => sessionStorage, CLE_POSITION)?.split(':');
  if (position && Number(position[0]) === indice) {
    audio.addEventListener('loadedmetadata', () => (audio.currentTime = Number(position[1]) || 0), { once: true });
  }

  const afficher = () => {
    const joue = !audio.paused;
    racine.classList.toggle('joue', joue);
    const action = joue ? 'Couper la musique' : 'Écouter la musique';
    bouton.title = `Musique : ${morceaux[indice].titre}`;
    son.textContent = joue ? '❚❚ Couper le son' : '▶ Écouter';
    son.setAttribute('aria-label', action);
    choix.forEach((c, i) => c.setAttribute('aria-pressed', String(i === indice)));
  };

  const fondre = (cible: number, fin?: () => void) => {
    cancelAnimationFrame(fondu);
    const depart = audio.volume;
    const debut = performance.now();
    const pas = (maintenant: number) => {
      const p = Math.min(1, (maintenant - debut) / FONDU_MS);
      audio.volume = depart + (cible - depart) * p;
      if (p < 1) fondu = requestAnimationFrame(pas);
      else fin?.();
    };
    fondu = requestAnimationFrame(pas);
  };

  const jouer = async () => {
    try {
      await audio.play();
      retirerGestes();
      fondre(VOLUME);
    } catch (erreur) {
      // Lecture refusée (aucun geste encore) ou fichier illisible : on attend le geste suivant.
      if ((erreur as Error).name !== 'NotAllowedError') console.warn("La musique n'a pas pu être lue.", erreur);
    }
    afficher();
  };

  const couper = () =>
    fondre(0, () => {
      audio.pause();
      afficher();
    });

  // Premier geste du visiteur : la musique démarre.
  const gestes = ['pointerdown', 'keydown', 'touchend'] as const;
  const premierGeste = (e: Event) => {
    if (racine.contains(e.target as Node)) return;
    if (veutMusique && audio.paused) jouer();
  };
  const retirerGestes = () => gestes.forEach((g) => removeEventListener(g, premierGeste, true));
  gestes.forEach((g) => addEventListener(g, premierGeste, true));

  // Le menu.
  const ouvrirMenu = (ouvert: boolean) => {
    menu.hidden = !ouvert;
    bouton.setAttribute('aria-expanded', String(ouvert));
  };
  bouton.addEventListener('click', () => ouvrirMenu(menu.hidden));
  addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !racine.contains(e.target as Node)) ouvrirMenu(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      ouvrirMenu(false);
      bouton.focus();
    }
  });

  son.addEventListener('click', () => {
    veutMusique = audio.paused;
    ecrire(() => localStorage, CLE_SON, veutMusique ? 'on' : 'off');
    if (veutMusique) jouer();
    else couper();
  });

  choix.forEach((c, i) =>
    c.addEventListener('click', () => {
      ecrire(() => localStorage, CLE_MORCEAU, String(i));
      veutMusique = true;
      ecrire(() => localStorage, CLE_SON, 'on');
      if (i !== indice) {
        indice = i;
        cancelAnimationFrame(fondu);
        audio.volume = 0;
        audio.src = morceaux[i].fichier;
      }
      jouer();
    }),
  );

  // Pause quand l'onglet est caché, reprise au retour.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      reprendreAuRetour = !audio.paused;
      if (reprendreAuRetour) audio.pause();
    } else if (reprendreAuRetour && veutMusique) jouer();
  });
  addEventListener('pagehide', () =>
    ecrire(() => sessionStorage, CLE_POSITION, `${indice}:${audio.currentTime.toFixed(1)}`),
  );

  audio.addEventListener('play', afficher);
  audio.addEventListener('pause', afficher);
  afficher();
  // Certains navigateurs autorisent la lecture dès l'arrivée.
  if (veutMusique) jouer();
}

const racine = document.querySelector<HTMLElement>('.musique');
if (racine) initMusique(racine);
