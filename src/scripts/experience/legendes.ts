import gsap from 'gsap';

// Légendes du survol : comme dans un film d'architecture, le nom de chaque lieu apparaît en bas à
// gauche, entre les bandes noires, au moment où le drone le survole.

interface Legende {
  /** Étape du vol (en points de passage, voir survol.ts) où la légende apparaît et disparaît. */
  de: number;
  a: number;
  lieu: string;
  detail: string;
}

const LEGENDES: Legende[] = [
  { de: 0.3, a: 2.2, lieu: 'La tour Horizon', detail: 'Demain, imaginé par Creativ Lab' },
  { de: 2.6, a: 4.2, lieu: 'La place', detail: 'Fontaine, café et guirlandes' },
  { de: 4.4, a: 5.9, lieu: "L'étang", detail: 'Le kiosque sur pilotis' },
  { de: 6.3, a: 7.8, lieu: 'Creativ Lab Architects', detail: 'La maison' },
  { de: 8.6, a: 10.6, lieu: "Le jardin de l'atelier", detail: "Miroir d'eau, oliviers, lavande" },
  { de: 11, a: 12.4, lieu: 'La Boucle', detail: 'Promenade plantée suspendue' },
  { de: 13, a: 15, lieu: 'Bienvenue', detail: "Entrez, l'architecture se visite" },
];

export function creerLegendes(racine: HTMLElement) {
  const lieu = racine.querySelector<HTMLElement>('.survol-lieu')!;
  const detail = racine.querySelector<HTMLElement>('.survol-detail')!;
  let courante: Legende | null = null;
  let anim: gsap.core.Timeline | null = null;

  return {
    /** Affiche la légende de cette étape du vol (aucune pour une étape négative). */
    montrer(etape: number) {
      const voulue = LEGENDES.find((l) => etape >= l.de && etape < l.a) ?? null;
      if (voulue === courante) return;
      courante = voulue;
      anim?.kill();
      anim = gsap.timeline();
      anim.to(racine, { opacity: 0, y: -8, duration: 0.45, ease: 'power2.in' });
      if (voulue) {
        anim
          .call(() => {
            lieu.textContent = voulue.lieu;
            detail.textContent = voulue.detail;
          })
          .set(racine, { y: 14 })
          .to(racine, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out' })
          .fromTo(lieu, { letterSpacing: '0.12em' }, { letterSpacing: '0.02em', duration: 1.6, ease: 'power2.out' }, '<');
      }
    },
  };
}
