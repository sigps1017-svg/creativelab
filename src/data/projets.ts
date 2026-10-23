// Liste des projets affichés dans la galerie 3D et sur les pages /projets.
//
// Les titres sont PROVISOIRES : ils viennent des noms de fichiers des images du carrousel actuel.
// Remplacez-les par les vrais noms, et complétez lieu, année, programme et description.
// Les 10 premiers projets de la liste sont accrochés au mur de la galerie 3D : réordonnez la liste
// pour choisir les projets mis en avant.
//
// Images : copiées du site actuel dans public/images/projets/ (1 800 px de large au plus). Elles doivent
// rester sur ce domaine : un navigateur refuse d'utiliser en 3D une image hébergée ailleurs.

export interface Projet {
  slug: string;
  titre: string;
  image: string;
  lieu?: string;
  annee?: string;
  programme?: string;
  surface?: string;
  description?: string;
}

export const projets: Projet[] = [
  { slug: 'k2', titre: 'K2', image: '/images/projets/k2.jpg' },
  { slug: 'zeya-6', titre: 'Zeya 6', image: '/images/projets/zeya-6.jpg' },
  { slug: 'koloma', titre: 'Koloma', image: '/images/projets/koloma.jpg' },
  { slug: 'lonaci', titre: 'LONACI', image: '/images/projets/lonaci.jpg' },
  { slug: 'afg-bank-plateau', titre: 'AFG Bank, agence Plateau', image: '/images/projets/afg-bank-plateau.jpg' },
  { slug: 'nsia', titre: 'NSIA', image: '/images/projets/nsia.jpg' },
  { slug: 'pafn', titre: 'PAFN', image: '/images/projets/pafn.jpg' },
  { slug: 'pgcm', titre: 'PGCM', image: '/images/projets/pgcm.jpg' },
  { slug: 'mk', titre: 'MK', image: '/images/projets/mk.jpg' },
  { slug: 'pigp', titre: 'PIGP', image: '/images/projets/pigp.jpg' },
  { slug: 'villa', titre: 'Villa', image: '/images/projets/villa.jpg' },
  { slug: 'vue-sur-rue', titre: 'Vue sur rue', image: '/images/projets/vue-sur-rue.jpg' },
  { slug: 'jardin', titre: 'Jardin', image: '/images/projets/jardin.jpg' },
  { slug: 'imp', titre: 'IMP', image: '/images/projets/imp.jpg' },
  { slug: 'vue-1', titre: 'Vue 1', image: '/images/projets/vue-1.jpg' },
  { slug: 'hall-interieur', titre: 'Hall intérieur', image: '/images/projets/hall-interieur.jpg' },
  { slug: 'interieur-1', titre: 'Intérieur 1', image: '/images/projets/interieur-1.jpg' },
  { slug: 'salle-de-conference', titre: 'Salle de conférence', image: '/images/projets/salle-de-conference.jpg' },
  { slug: 'vue-3', titre: 'Vue 3', image: '/images/projets/vue-3.jpg' },
  { slug: 'projet-2020', titre: 'Projet 2020', image: '/images/projets/projet-2020.jpg' },
  { slug: 'c1', titre: 'C1', image: '/images/projets/c1.jpg' },
];

/** Nombre de projets accrochés au mur de la galerie 3D. */
export const NB_PROJETS_GALERIE = 10;

export const projetsGalerie = projets.slice(0, NB_PROJETS_GALERIE);
