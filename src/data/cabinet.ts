// Coordonnées et présentation du cabinet, utilisées par la version simple du site
// (pied de page, pages Agence et Contact).
//
// PROVISOIRE : l'adresse, le téléphone, les e-mails et les réseaux sont à confirmer par le cabinet.
// Laissez un champ vide ('') pour le masquer.

export const cabinet = {
  nom: "Creativ'Lab Architects",
  ville: 'Abidjan',
  adresse: ["Abidjan, Côte d'Ivoire"],
  carte: "https://www.google.com/maps/search/?api=1&query=Creativ+Lab+Architects+Abidjan",
  telephone: '',
  email: 'contact@creativlabarchitects.com',
  emailRecrutement: '',
  reseaux: [
    // { nom: 'Instagram', url: 'https://www.instagram.com/...' },
  ] as { nom: string; url: string }[],
};

/** Projets mis en avant dans le diaporama plein écran de l'accueil (slugs de src/data/projets.ts). */
export const projetsUne = ['k2', 'zeya-6', 'koloma', 'lonaci'];

/** Page Agence. Texte provisoire, à remplacer par celui du cabinet. */
export const agence = {
  intro:
    "Creativ'Lab Architects est un cabinet d'architecture basé à Abidjan. Associés, architectes et techniciens conçoivent des logements, des bureaux et des équipements, de la première esquisse à la remise des clés.",
  vision:
    "Concevoir des lieux qui racontent. Lumière, matière, usage : chaque projet part de ceux qui l'habiteront et du site qui l'accueille.",
  demarche: [
    { titre: 'Esquisse et programme', texte: 'Comprendre le site, les usages et le budget avant de tracer le premier trait.' },
    { titre: 'Avant-projet et images 3D', texte: 'Voir et parcourir le projet avant la première pierre.' },
    { titre: 'Permis et dossiers techniques', texte: "Dossiers administratifs et techniques, suivis jusqu'à l'accord." },
    { titre: 'Suivi de chantier et livraison', texte: 'Coordination des entreprises, qualité, délais et réception.' },
  ],
  valeurs: [
    { titre: 'Exigence', texte: 'Le soin du détail, du plan masse à la poignée de porte.' },
    { titre: 'Audace', texte: 'Proposer une architecture qui surprend et qui dure.' },
    { titre: "Esprit d'équipe", texte: 'Réunir les talents autour de chaque projet.' },
  ],
};
