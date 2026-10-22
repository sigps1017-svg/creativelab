// Liste des projets affichés dans la galerie 3D et sur les pages /projets.
//
// Les titres sont PROVISOIRES : ils viennent des noms de fichiers des images du carrousel actuel.
// Remplacez-les par les vrais noms, et complétez lieu, année, programme et description.
// Les 10 premiers projets de la liste sont accrochés au mur de la galerie 3D : réordonnez la liste
// pour choisir les projets mis en avant.
//
// Images : elles pointent pour l'instant vers le site actuel. Pour qu'elles s'affichent aussi dans
// la scène 3D, copiez-les dans public/images/projets/ et remplacez l'URL par '/images/projets/<fichier>'
// (un navigateur refuse souvent d'utiliser en 3D une image hébergée sur un autre domaine).

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

const WP = 'https://creativlabarchitects.com/wp-content/uploads';

export const projets: Projet[] = [
  { slug: 'k2', titre: 'K2', image: `${WP}/2025/02/200308_K2_C02_night-scaled.jpg` },
  { slug: 'zeya-6', titre: 'Zeya 6', image: `${WP}/2025/02/200702_zeya6_c02_night.jpg` },
  { slug: 'koloma', titre: 'Koloma', image: `${WP}/2025/02/210831_KOLOMA_C03-scaled.jpg` },
  { slug: 'lonaci', titre: 'LONACI', image: `${WP}/2025/02/LONACI_OK_Page_33-scaled.jpg` },
  { slug: 'afg-bank-plateau', titre: 'AFG Bank, agence Plateau', image: `${WP}/2025/02/01-APS-AGENCE-PLATEAU-AFGBANK-CI-A3-scaled.jpg` },
  { slug: 'nsia', titre: 'NSIA', image: `${WP}/2025/02/NSIA-END_03-Photo-scaled.jpg` },
  { slug: 'pafn', titre: 'PAFN', image: `${WP}/2025/02/PAFN_19-Photo-scaled.jpg` },
  { slug: 'pgcm', titre: 'PGCM', image: `${WP}/2025/02/PGCM_4-Photo-scaled.jpg` },
  { slug: 'mk', titre: 'MK', image: `${WP}/2025/02/MK_10-Photo-scaled-e1739174412281.jpg` },
  { slug: 'pigp', titre: 'PIGP', image: `${WP}/2025/02/PIGP_8-Photo-scaled.jpg` },
  { slug: 'villa', titre: 'Villa', image: `${WP}/2025/02/font-of-villa-02-1-scaled.jpg` },
  { slug: 'vue-sur-rue', titre: 'Vue sur rue', image: `${WP}/2025/02/street-view-5-scaled.jpg` },
  { slug: 'jardin', titre: 'Jardin', image: `${WP}/2025/01/garden-01-scaled.jpg` },
  { slug: 'imp', titre: 'IMP', image: `${WP}/2025/01/IMP_3-Photo-scaled.jpg` },
  { slug: 'vue-1', titre: 'Vue 1', image: `${WP}/2025/02/view-1-scaled.jpg` },
  { slug: 'hall-interieur', titre: 'Hall intérieur', image: `${WP}/2025/02/Interior-lobby-scaled.jpg` },
  { slug: 'interieur-1', titre: 'Intérieur 1', image: `${WP}/2025/02/INT_VIEW1_01-1.jpg` },
  { slug: 'salle-de-conference', titre: 'Salle de conférence', image: `${WP}/2025/02/CONFERENC.3.jpg` },
  { slug: 'vue-3', titre: 'Vue 3', image: `${WP}/2025/02/VIEW-03.jpg` },
  { slug: 'projet-2020', titre: 'Projet 2020', image: `${WP}/2025/02/WhatsApp-Image-2020-04-15-at-09.38.12-1.jpeg` },
  { slug: 'c1', titre: 'C1', image: `${WP}/2025/02/C1_NIGHT.jpg` },
];

/** Nombre de projets accrochés au mur de la galerie 3D. */
export const NB_PROJETS_GALERIE = 10;

export const projetsGalerie = projets.slice(0, NB_PROJETS_GALERIE);
