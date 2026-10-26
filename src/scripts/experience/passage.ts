import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import type { Vector3 } from 'three';

gsap.registerPlugin(SplitText);

// Retour vers un espace déjà visité, depuis le menu : plutôt que de refaire le chemin à l'envers,
// les deux volets de l'ouverture se referment sur le nom du lieu, la scène change derrière eux,
// puis ils s'écartent et la caméra glisse jusqu'à sa place, comme à l'arrivée sur le site.

interface Options {
  /** Décalage de caméra ramené à zéro à l'ouverture des volets. */
  decalage: Vector3;
  decalageCible: Vector3;
}

export function creerPassage(racine: HTMLElement, { decalage, decalageCible }: Options) {
  const volets = racine.querySelectorAll<HTMLElement>('.volet');
  const etage = racine.querySelector<HTMLElement>('.passage-etage')!;
  const nom = racine.querySelector<HTMLElement>('.passage-nom')!;
  const trait = racine.querySelector<HTMLElement>('.passage-trait')!;
  const sobre = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enCours: gsap.core.Timeline | null = null;
  let decoupe: SplitText | null = null;

  gsap.set(volets[0], { yPercent: -100 });
  gsap.set(volets[1], { yPercent: 100 });

  return {
    get actif() {
      return !!enCours;
    },
    /**
     * Joue le passage. `changer` est appelé volets fermés : il place la scène sur le nouvel espace
     * et renvoie le décalage de départ de la caméra (en recul), ramené à zéro ensuite.
     */
    jouer(lieu: { nom: string; etage: string }, changer: () => [Vector3, Vector3] | void, fin?: () => void) {
      enCours?.progress(1);
      decoupe?.revert();
      etage.textContent = lieu.etage;
      nom.textContent = lieu.nom;
      decoupe = SplitText.create(nom, { type: 'chars', mask: 'chars' });
      const lettres = decoupe.chars;
      racine.style.visibility = 'visible';

      const tl = gsap.timeline({
        onComplete: () => {
          racine.style.visibility = 'hidden';
          enCours = null;
          fin?.();
        },
      });
      enCours = tl;
      const poser = () => {
        const depart = changer();
        if (depart && !sobre) {
          decalage.copy(depart[0]);
          decalageCible.copy(depart[1]);
        }
      };

      if (sobre) {
        tl.fromTo(racine, { opacity: 0 }, { opacity: 1, duration: 0.3 })
          .call(poser)
          .to(racine, { opacity: 0, duration: 0.4 }, '+=0.2')
          .set(racine, { opacity: 1 });
        return;
      }

      tl
        // Les volets se referment.
        .to(volets[0], { yPercent: 0, duration: 0.75, ease: 'expo.inOut' }, 0)
        .to(volets[1], { yPercent: 0, duration: 0.75, ease: 'expo.inOut' }, 0)
        // Le nom du lieu monte de son masque, le trait se tend.
        .fromTo(etage, { opacity: 0, letterSpacing: '0.9em' }, { opacity: 1, letterSpacing: '0.42em', duration: 0.8, ease: 'power3.out' }, 0.45)
        .from(lettres, { yPercent: 115, rotateX: -70, transformPerspective: 500, transformOrigin: '50% 100%', duration: 0.75, ease: 'expo.out', stagger: 0.04 }, 0.5)
        .fromTo(trait, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' }, 0.55)
        // Derrière les volets, la scène change de lieu.
        .call(poser, [], 0.8)
        // Le nom s'envole, les volets s'écartent, la caméra s'avance.
        .to(lettres, { yPercent: -115, rotateX: 60, duration: 0.55, ease: 'power3.in', stagger: 0.025 }, 1.55)
        .to(etage, { opacity: 0, duration: 0.4 }, 1.6)
        .to(trait, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.5, ease: 'power3.in' }, 1.6)
        .to(volets[0], { yPercent: -100, duration: 1.2, ease: 'expo.inOut' }, 1.95)
        .to(volets[1], { yPercent: 100, duration: 1.2, ease: 'expo.inOut' }, 1.95)
        .to(decalage, { x: 0, y: 0, z: 0, duration: 2.6, ease: 'power2.out' }, 2.05)
        .to(decalageCible, { x: 0, y: 0, z: 0, duration: 2.6, ease: 'power2.out' }, 2.05)
        .set(trait, { transformOrigin: '0% 50%' });
    },
  };
}
