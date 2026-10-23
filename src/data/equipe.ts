// L'équipe, dans l'ordre d'affichage : mur de l'équipe en 3D (portraits Portrait_01..08) et page /equipe.
// Photos dans public/images/equipe/ (portrait vertical, environ 2 × 3).

export interface Membre {
  slug: string;
  nom: string;
  role: string;
  photo: string;
  description: string;
  email?: string;
}

export const equipe: Membre[] = [
  {
    slug: 'souleymane-coulibaly',
    nom: 'Souleymane Coulibaly',
    role: 'Associé gérant',
    photo: '/images/equipe/souleymane-coulibaly.jpg',
    description: "Souleymane Coulibaly est l'associé gérant de Creativ'Lab Architectes.",
  },
  {
    slug: 'eric-vidah',
    nom: 'Eric Vidah',
    role: 'Associé, directeur de la création',
    photo: '/images/equipe/eric-vidah.jpg',
    description: "Eric Vidah est l'associé directeur de la création de Creativ'Lab Architectes.",
    email: 'a.vidah@creativlabarchitects.com',
  },
  {
    slug: 'rose-djedje',
    nom: 'Renée Rose Hélène Djédjé',
    role: 'Assistante administrative',
    photo: '/images/equipe/rose-djedje.jpg',
    description: "Renée Rose Hélène Djédjé est assistante administrative à Creativ'Lab.",
  },
  {
    slug: 'franck-kouakou',
    nom: 'Franck Odilon Kouakou',
    role: 'Technicien supérieur en bâtiment',
    photo: '/images/equipe/franck-kouakou.jpg',
    description: "Franck Odilon Kouakou est technicien supérieur en bâtiment à Creativ'Lab.",
  },
  {
    slug: 'judicael-kataka',
    nom: 'Judicaël Kataka',
    role: 'Architecte chargé de projets',
    photo: '/images/equipe/judicael-kataka.jpg',
    description:
      "Judicaël Kataka est architecte chargé de projets à Creativ'Lab. Il est titulaire d'un master en architecture de l'École africaine des métiers de l'architecture et de l'urbanisme (EAMAU) de Lomé, obtenu en 2020.",
  },
  {
    slug: 'elie-ouattara',
    nom: 'Elie Ouattara',
    role: 'Technicien supérieur en bâtiment',
    photo: '/images/equipe/elie-ouattara.jpg',
    description: "Elie Ouattara est technicien supérieur en bâtiment à Creativ'Lab.",
  },
  {
    slug: 'david-gnelibe',
    nom: 'David Gnelibe',
    role: 'Architecte chargé de projets',
    photo: '/images/equipe/david-gnelibe.jpg',
    description:
      "David Gnelibe est architecte chargé de projets à Creativ'Lab. Il est titulaire d'un master en architecture de l'École africaine des métiers de l'architecture et de l'urbanisme (EAMAU) de Lomé, obtenu en 2021.",
    email: 'd.gnelibe@creativlabarchitects.com',
  },
  {
    slug: 'danielle-boni',
    nom: 'Ahoua Grâce Danielle Boni',
    role: 'Technicienne supérieure en bâtiment',
    photo: '/images/equipe/danielle-boni.jpg',
    description: "Ahoua Grâce Danielle Boni est technicienne supérieure en bâtiment à Creativ'Lab.",
  },
];
