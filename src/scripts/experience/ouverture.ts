import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import type { Vector3 } from 'three';

gsap.registerPlugin(SplitText);

// Ouverture du site, en quatre temps :
// 1. Le chargement : sur fond noir, le plan du rez-de-chaussée se trace au trait (axes, murs,
//    cotes) au rythme du chargement, le compteur tourne chiffre par chiffre et les phases du
//    chantier s'allument une à une (implantation, structure, façades, matières, lumière).
//    Le nom du cabinet monte lettre par lettre au centre.
// 2. Prêt : un bouton « Entrer » apparaît, son anneau laiton se remplit ; à la fin du tour, on
//    entre de soi-même. Le clic du visiteur lance aussi la musique.
// 3. Les portes : tout s'efface, un filet de lumière passe entre deux portes, puis elles
//    s'écartent sur la scène 3D.
// 4. La lumière : la scène s'allume (exposition de presque noir à normale) pendant que la caméra
//    descend de la vue d'ensemble jusque devant la façade.

const LAITON = '#c8a165';
const PHASES = [0, 0.2, 0.4, 0.6, 0.8];
/** Durée de l'anneau du bouton Entrer avant l'entrée automatique (s). */
const ATTENTE_ENTRER = 4.5;

interface Options {
  /** Décalage de caméra animé jusqu'à zéro pendant l'ouverture des portes. */
  decalage: Vector3;
  /** Décalage du point regardé, ramené à zéro en même temps. */
  decalageCible: Vector3;
  /** Facteur appliqué à l'exposition de la scène : 0 = éteinte, 1 = normale. */
  eclairage: { v: number };
  /** Vitesse de l'animation (1 = normale), réglable par ?intro=0.1 pour la vérifier. */
  vitesse?: number;
}

export function jouerOuverture(racine: HTMLElement, { decalage, decalageCible, eclairage, vitesse = 1 }: Options) {
  const cadre = racine.querySelector<HTMLElement>('.intro-cadre')!;
  const titre = racine.querySelector<HTMLElement>('.ouverture-titre')!;
  const sousTitre = racine.querySelector<HTMLElement>('.ouverture-sous-titre')!;
  const trait = racine.querySelector<HTMLElement>('.ouverture-trait')!;
  const jauge = racine.querySelector<HTMLElement>('.ouverture-trait span')!;
  const compteur = racine.querySelector<HTMLElement>('#chargement-pourcent')!;
  const etat = racine.querySelector<HTMLElement>('.ouverture-etat')!;
  const plan = racine.querySelector<SVGElement>('.intro-plan')!;
  const roues = [...racine.querySelectorAll<HTMLElement>('.intro-compteur .roue > span')];
  const phases = [...racine.querySelectorAll<HTMLElement>('.intro-phases li')];
  const entrer = racine.querySelector<HTMLButtonElement>('.intro-entrer')!;
  const anneau = entrer.querySelector<SVGElement>('.anneau')!;
  const portes = racine.querySelectorAll<HTMLElement>('.porte');
  const fente = racine.querySelector<HTMLElement>('.intro-fente')!;
  const habillage = racine.querySelectorAll<HTMLElement>(
    '.intro-coin, .intro-legende, .intro-compteur, .intro-phases, .intro-grain',
  );
  const sobre = matchMedia('(prefers-reduced-motion: reduce)').matches;

  eclairage.v = sobre ? 1 : 0.04;

  // ---- Le plan : chaque trait se dessine dans l'ordre d'un chantier, au rythme du chargement ----
  const traits = (selecteur: string) => [...plan.querySelectorAll<SVGPathElement>(`${selecteur} path`)];
  const dessin = gsap
    .timeline({ paused: true, defaults: { ease: 'none' } })
    .to(traits('.plan-axes'), { strokeDashoffset: 0, duration: 0.22, stagger: 0.03 }, 0)
    .from(plan.querySelectorAll('.plan-reperes > *'), { opacity: 0, duration: 0.08, stagger: 0.012 }, 0.12)
    .to(traits('.plan-murs'), { strokeDashoffset: 0, duration: 0.3, stagger: 0.07 }, 0.25)
    .to(traits('.plan-cotes'), { strokeDashoffset: 0, duration: 0.15, stagger: 0.04 }, 0.7)
    .from(plan.querySelectorAll('.plan-cotes text, .plan-nord'), { opacity: 0, duration: 0.1 }, 0.85);
  dessin.progress(sobre ? 1 : 0);

  // Le plan suit doucement la souris : on le regarde de biais, comme posé sur une table.
  const versX = gsap.quickTo(plan, 'rotationY', { duration: 1.2, ease: 'power3.out' });
  const versY = gsap.quickTo(plan, 'rotationX', { duration: 1.2, ease: 'power3.out' });
  gsap.set(plan, { transformPerspective: 1400, rotation: matchMedia('(orientation: portrait)').matches ? 90 : 0 });
  const suivreSouris = (e: PointerEvent) => {
    versX((e.clientX / innerWidth - 0.5) * 10);
    versY((0.5 - e.clientY / innerHeight) * 8);
  };
  if (!sobre) addEventListener('pointermove', suivreSouris, { passive: true });

  // ---- Entrée : les lettres montent de leur masque, le trait se tend, ARCHITECTS se resserre ----
  // Les lettres sont découpées une fois la police chargée (sinon elles le seraient dans la police
  // de secours) : le tout reste caché jusque-là.
  let lettres: Element[] = [];
  const entree = gsap.timeline({ paused: true }).timeScale(vitesse);
  const entreeFinie = new Promise<void>((ok) => entree.eventCallback('onComplete', () => ok()));
  let vague: gsap.core.Tween | null = null;
  let sortie: gsap.core.Timeline | null = null;

  const police = Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 1500))]);
  police.then(() => {
    lettres = SplitText.create(titre, { type: 'chars', mask: 'chars' }).chars;
    const petites = SplitText.create(sousTitre, { type: 'chars' }).chars;
    gsap.set(cadre, { visibility: 'visible' });

    if (sobre) {
      entree.from(cadre, { opacity: 0, duration: 0.6 });
    } else {
      entree
        .from(habillage, { opacity: 0, duration: 1.2, stagger: 0.08, ease: 'power2.out' }, 0)
        .from(plan, { opacity: 0, scale: 1.06, duration: 2.4, ease: 'power2.out' }, 0)
        .from(
          lettres,
          {
            yPercent: 115,
            rotateX: -75,
            transformPerspective: 500,
            transformOrigin: '50% 100%',
            duration: 1.15,
            ease: 'expo.out',
            stagger: 0.055,
          },
          0.25,
        )
        .from(trait, { scaleX: 0, duration: 1, ease: 'power3.inOut' }, 0.7)
        .fromTo(
          sousTitre,
          { letterSpacing: '1.6em', opacity: 0 },
          { letterSpacing: '0.62em', opacity: 1, duration: 1.4, ease: 'power3.out' },
          0.95,
        )
        .from(petites, { opacity: 0, duration: 0.5, stagger: { each: 0.05, from: 'center' } }, 0.95)
        .from(etat, { opacity: 0, y: 8, duration: 0.6 }, 1.35)
        // ---- Attente : une vague de laiton court sur les lettres tant que le bâtiment arrive ----
        .call(() => {
          if (sortie) return;
          vague = gsap.to(lettres, {
            color: LAITON,
            duration: 0.55,
            ease: 'sine.inOut',
            stagger: { each: 0.08, repeat: -1, yoyo: true, repeatDelay: 0.9 },
          });
        });
    }
    entree.play();
  });

  // ---- Progression : pourcentage, jauge, compteur, phases et plan avancent ensemble ----
  const affiche = { p: 0 };
  const chiffres = [-1, -1, -1];
  const afficher = () => {
    const p = affiche.p;
    const n = Math.round(p * 100);
    compteur.textContent = String(n);
    gsap.set(jauge, { scaleX: p });
    String(n).padStart(3, '0').split('').forEach((c, i) => {
      if (+c === chiffres[i]) return;
      chiffres[i] = +c;
      gsap.to(roues[i], { yPercent: -c * 10, duration: 0.7, ease: 'power3.inOut', overwrite: true });
    });
    let courante = 0;
    PHASES.forEach((seuil, i) => p >= seuil && (courante = i));
    phases.forEach((li, i) => {
      li.classList.toggle('fait', i < courante || p >= 1);
      li.classList.toggle('en-cours', i === courante && p < 1);
    });
    if (!sobre) dessin.progress(p);
  };
  afficher();
  // Même quand tout arrive d'un coup, le compteur prend son temps (2,8 s pour 0 → 100) : le plan
  // a le temps de se tracer.
  let complet: gsap.core.Tween | null = null;
  const progression = (p: number) => {
    if (complet) return complet;
    const cible = Math.max(p, affiche.p);
    return gsap.to(affiche, {
      p: cible,
      duration: Math.max(0.9, (cible - affiche.p) * 2.8) / Math.min(1, vitesse * 4),
      ease: 'power2.out',
      overwrite: true,
      onUpdate: afficher,
    });
  };

  // ---- Prêt : le bouton Entrer, puis les portes ----
  let entrerMaintenant: (() => void) | null = null;
  const attendreVisiteur = () =>
    new Promise<void>((ok) => {
      entrer.hidden = false;
      const fin = () => {
        if (!entrerMaintenant) return;
        entrerMaintenant = null;
        tourne.kill();
        ok();
      };
      entrerMaintenant = fin;
      entrer.addEventListener('click', fin, { once: true });
      gsap.fromTo(entrer, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.6)' });
      gsap.to(etat, { opacity: 0, y: -6, duration: 0.4 });
      const tourne = gsap.fromTo(
        anneau,
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: ATTENTE_ENTRER / vitesse, ease: 'none', delay: 0.4, onComplete: fin },
      );
    });

  const ouvrir = async (quandVisible: () => void) => {
    if (sortie) return;
    sortie = gsap.timeline({ paused: true }).timeScale(vitesse);
    complet = progression(1);
    await entreeFinie;
    // Laisse le compteur arriver à 100 avant de proposer d'entrer.
    await complet;
    await new Promise((ok) => setTimeout(ok, 300 / vitesse));
    vague?.kill();
    if (!sobre) {
      gsap.to(lettres, { color: LAITON, duration: 0.5, stagger: 0.03 });
      await attendreVisiteur();
    }
    removeEventListener('pointermove', suivreSouris);
    if (sobre) {
      gsap.set([decalage, decalageCible], { x: 0, y: 0, z: 0 });
      sortie.to(racine, { opacity: 0, duration: 0.6 }).call(quandVisible, [], 0.2);
    } else {
      const [gauche, droite] = portes;
      sortie
        // tout s'efface : le nom s'envole, le plan se retire dans la profondeur
        .to(entrer, { opacity: 0, scale: 1.4, duration: 0.5, ease: 'power2.in' }, 0)
        .to(lettres, { yPercent: -115, rotateX: 60, transformPerspective: 500, duration: 0.7, ease: 'power3.in', stagger: 0.03 }, 0.05)
        .to(sousTitre, { letterSpacing: '1.4em', opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.05)
        .to(trait, { scaleX: 0, transformOrigin: '50% 50%', duration: 0.6, ease: 'power3.in' }, 0.1)
        .to(plan, { opacity: 0, scale: 0.92, duration: 0.9, ease: 'power2.in' }, 0)
        .to(habillage, { opacity: 0, duration: 0.5, stagger: 0.03 }, 0.1)
        // le filet de lumière entre les portes
        .to(fente, { opacity: 1, scaleY: 1, duration: 0.7, ease: 'expo.out' }, 0.75)
        .to(gauche, { boxShadow: 'inset -2px 0 0 rgba(232,190,120,0.9)', duration: 0.4 }, 1.15)
        .to(droite, { boxShadow: 'inset 2px 0 0 rgba(232,190,120,0.9)', duration: 0.4 }, 1.15)
        // les portes s'écartent, la lumière s'étire avec elles puis disparaît
        .to(gauche, { xPercent: -100, duration: 1.6, ease: 'expo.inOut' }, 1.35)
        .to(droite, { xPercent: 100, duration: 1.6, ease: 'expo.inOut' }, 1.35)
        .to(fente, { scaleX: 60, opacity: 0, duration: 0.9, ease: 'power2.out' }, 1.5)
        .call(quandVisible, [], 2.1)
        // la scène s'allume pendant que la caméra descend vers la façade
        .to(eclairage, { v: 1, duration: 3.2, ease: 'power2.inOut' }, 1.4)
        .to(decalage, { x: 0, y: 0, z: 0, duration: 4.6, ease: 'power3.inOut' }, 1.3)
        .to(decalageCible, { x: 0, y: 0, z: 0, duration: 4.6, ease: 'power3.inOut' }, 1.3);
    }
    sortie.play();
  };

  return {
    progression,
    ouvrir,
    /** Le visiteur pressé (défilement, clic, touche) accélère l'animation, ou entre s'il le peut. */
    presser() {
      if (entrerMaintenant) return entrerMaintenant();
      entree.timeScale(vitesse * 3);
      sortie?.timeScale(vitesse * 2);
    },
  };
}
