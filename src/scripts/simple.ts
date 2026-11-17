// Comportements de la version simple : apparition des blocs au défilement, transition entre pages,
// diaporama plein écran de l'accueil.

const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Apparition douce des éléments [data-apparait] et fondu blanc entre les pages du site. */
export function animerPage(racine: ParentNode = document) {
  document.documentElement.classList.add('ss-pret');

  const elements = racine.querySelectorAll<HTMLElement>('[data-apparait]');
  if (reduit() || !('IntersectionObserver' in window)) {
    elements.forEach((e) => e.classList.add('ss-visible'));
  } else {
    const obs = new IntersectionObserver(
      (entrees) =>
        entrees.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('ss-visible');
          obs.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    elements.forEach((e) => obs.observe(e));
  }

  // Fondu en quittant la page, pour les liens internes.
  if (reduit()) return;
  document.addEventListener('click', (ev) => {
    const lien = (ev.target as Element).closest?.('a');
    if (!lien || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || lien.target) return;
    const url = new URL(lien.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname || lien.hasAttribute('download')) return;
    ev.preventDefault();
    document.documentElement.classList.add('ss-depart');
    setTimeout(() => (location.href = url.href), 380);
  });
  // Retour arrière depuis le cache du navigateur : on retire le voile.
  addEventListener('pageshow', () => document.documentElement.classList.remove('ss-depart'));
}

/** Diaporama plein écran : fondu enchaîné, léger zoom, compteur et barres de progression. */
export function diaporama(racine: HTMLElement, duree = 6000) {
  const diapos = [...racine.querySelectorAll<HTMLElement>('.ss-diapo')];
  const barres = [...racine.querySelectorAll<HTMLElement>('.ss-diapo-barre')];
  const compteur = racine.querySelector<HTMLElement>('.ss-diapo-numero');
  if (diapos.length === 0) return;

  let courant = 0;
  let minuteur = 0;

  const montrer = (i: number) => {
    courant = (i + diapos.length) % diapos.length;
    diapos.forEach((d, j) => {
      d.classList.toggle('est-active', j === courant);
      d.setAttribute('aria-hidden', String(j !== courant));
      d.querySelector('a')?.setAttribute('tabindex', j === courant ? '0' : '-1');
    });
    barres.forEach((b, j) => {
      b.classList.remove('est-active');
      b.classList.toggle('est-passee', j < courant);
      b.setAttribute('aria-current', String(j === courant));
    });
    // Relance l'animation de la barre courante.
    const barre = barres[courant];
    if (barre) {
      void barre.offsetWidth;
      barre.classList.add('est-active');
    }
    if (compteur) compteur.textContent = String(courant + 1).padStart(2, '0');
    clearTimeout(minuteur);
    if (!reduit()) minuteur = window.setTimeout(() => montrer(courant + 1), duree);
  };

  racine.style.setProperty('--duree-diapo', `${duree}ms`);
  barres.forEach((b, j) => b.addEventListener('click', () => montrer(j)));
  racine.querySelector('.ss-diapo-precedent')?.addEventListener('click', () => montrer(courant - 1));
  racine.querySelector('.ss-diapo-suivant')?.addEventListener('click', () => montrer(courant + 1));

  // Glisser du doigt sur téléphone.
  let departX = 0;
  racine.addEventListener('touchstart', (e) => (departX = e.touches[0].clientX), { passive: true });
  racine.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - departX;
      if (Math.abs(dx) > 50) montrer(courant + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(minuteur);
    else montrer(courant);
  });

  montrer(0);
}
