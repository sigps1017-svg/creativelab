import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import type { Vector3 } from 'three';

gsap.registerPlugin(SplitText);

// Ouverture du site : le nom du cabinet s'écrit lettre par lettre pendant le chargement, une vague
// de laiton parcourt les lettres tant que le bâtiment arrive, puis le nom s'envole, deux volets
// s'écartent sur la scène 3D et la caméra glisse de la vue d'ensemble jusque devant la façade.

const LAITON = '#c8a165';

interface Options {
  /** Décalage de caméra animé jusqu'à zéro pendant l'ouverture des volets. */
  decalage: Vector3;
  /** Décalage du point regardé, ramené à zéro en même temps. */
  decalageCible: Vector3;
  /** Vitesse de l'animation (1 = normale), réglable par ?intro=0.1 pour la vérifier. */
  vitesse?: number;
}

export function jouerOuverture(racine: HTMLElement, { decalage, decalageCible, vitesse = 1 }: Options) {
  const titre = racine.querySelector<HTMLElement>('.ouverture-titre')!;
  const sousTitre = racine.querySelector<HTMLElement>('.ouverture-sous-titre')!;
  const trait = racine.querySelector<HTMLElement>('.ouverture-trait')!;
  const jauge = racine.querySelector<HTMLElement>('.ouverture-trait span')!;
  const compteur = racine.querySelector<HTMLElement>('#chargement-pourcent')!;
  const etat = racine.querySelector<HTMLElement>('.ouverture-etat')!;
  const volets = racine.querySelectorAll<HTMLElement>('.volet');
  const sobre = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Les lettres sont découpées une fois la police chargée (sinon elles le seraient dans la police
  // de secours) : le nom reste caché jusque-là.
  let lettres: Element[] = [];
  const entree = gsap.timeline({ paused: true }).timeScale(vitesse);
  const entreeFinie = new Promise<void>((ok) => entree.eventCallback('onComplete', () => ok()));
  let vague: gsap.core.Tween | null = null;
  let sortie: gsap.core.Timeline | null = null;

  const police = Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 1500))]);
  police.then(() => {
    lettres = SplitText.create(titre, { type: 'chars', mask: 'chars' }).chars;
    const petites = SplitText.create(sousTitre, { type: 'chars' }).chars;
    gsap.set(racine.querySelector('.ouverture'), { visibility: 'visible' });

    // ---- Entrée : les lettres montent de leur masque, le trait se tend, ARCHITECTS se resserre ----
    if (sobre) {
      entree.from([titre, sousTitre, trait, etat], { opacity: 0, duration: 0.6 });
    } else {
      entree
        .from(lettres, {
          yPercent: 115,
          rotateX: -75,
          transformPerspective: 500,
          transformOrigin: '50% 100%',
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.055,
        })
        .from(trait, { scaleX: 0, duration: 1, ease: 'power3.inOut' }, 0.45)
        .fromTo(
          sousTitre,
          { letterSpacing: '1.6em', opacity: 0 },
          { letterSpacing: '0.62em', opacity: 1, duration: 1.4, ease: 'power3.out' },
          0.7,
        )
        .from(petites, { opacity: 0, duration: 0.5, stagger: { each: 0.05, from: 'center' } }, 0.7)
        .from(etat, { opacity: 0, y: 8, duration: 0.6 }, 1.1)
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

  // Le pourcentage et la jauge avancent en douceur, sans sauts.
  const affiche = { p: 0 };
  const progression = (p: number) => {
    gsap.to(affiche, {
      p: Math.max(p, affiche.p),
      duration: 0.6,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: () => {
        compteur.textContent = String(Math.round(affiche.p * 100));
        gsap.set(jauge, { scaleX: affiche.p });
      },
    });
  };

  // ---- Sortie : le nom s'envole, les volets s'écartent, la caméra s'avance ----
  const ouvrir = async (quandVisible: () => void) => {
    if (sortie) return;
    sortie = gsap.timeline({ paused: true }).timeScale(vitesse);
    progression(1);
    await entreeFinie;
    vague?.kill();
    if (sobre) {
      gsap.set([decalage, decalageCible], { x: 0, y: 0, z: 0 });
      sortie.to(racine, { opacity: 0, duration: 0.6 }).call(quandVisible, [], 0.2);
    } else {
      sortie
        .to(lettres, { color: LAITON, duration: 0.3, stagger: 0.02 }, 0)
        .to(lettres, { yPercent: -115, rotateX: 60, transformPerspective: 500, duration: 0.7, ease: 'power3.in', stagger: 0.03 }, 0.2)
        .to(sousTitre, { letterSpacing: '1.4em', opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.2)
        .to(trait, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.6, ease: 'power3.in' }, 0.3)
        .to(etat, { opacity: 0, duration: 0.3 }, 0.2)
        .to(volets[0], { yPercent: -100, duration: 1.3, ease: 'expo.inOut' }, 0.75)
        .to(volets[1], { yPercent: 100, duration: 1.3, ease: 'expo.inOut' }, 0.75)
        .call(quandVisible, [], 1.5)
        .to(decalage, { x: 0, y: 0, z: 0, duration: 4.2, ease: 'power2.inOut' }, 0.75)
        .to(decalageCible, { x: 0, y: 0, z: 0, duration: 4.2, ease: 'power2.inOut' }, 0.75);
    }
    sortie.play();
  };

  return {
    progression,
    ouvrir,
    /** Le visiteur pressé (défilement, clic, touche) accélère l'animation. */
    presser() {
      entree.timeScale(vitesse * 3);
      sortie?.timeScale(vitesse * 2.5);
    },
  };
}
