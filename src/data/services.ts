// Services du cabinet, affichés tour à tour sur le grand écran du 1er étage (scène 3D)
// et en liste dans la version simple.
// Texte provisoire : à confirmer par le cabinet.

export interface Service {
  titre: string;
  resume: string;
}

export const services: Service[] = [
  { titre: 'Conception architecturale', resume: 'Logements, bureaux, équipements : du programme au projet.' },
  { titre: "Architecture d'intérieur", resume: 'Aménagement, matières et mobilier pensés avec le bâti.' },
  { titre: 'Images 3D et visites virtuelles', resume: 'Voir et parcourir le projet avant la première pierre.' },
  { titre: 'Permis de construire', resume: "Dossiers administratifs et techniques, suivis jusqu'à l'accord." },
  { titre: 'Suivi de chantier', resume: 'Coordination des entreprises, qualité, délais et réception.' },
  { titre: 'Urbanisme et aménagement', resume: 'Lotissements, plans de masse et études de faisabilité.' },
];
