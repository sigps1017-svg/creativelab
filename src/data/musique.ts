// Musique de fond du site. Le premier morceau est joué par défaut ; le visiteur peut en choisir
// un autre dans le menu « Musique » de l'en-tête (son choix est mémorisé).
// Pour changer la musique : déposer le fichier (.mp3 ou .m4a) dans public/musique/ et l'ajouter ici.
// Morceaux actuels : compositions originales pour le site, libres de droits.

export interface Morceau {
  titre: string;
  fichier: string;
}

export const morceaux: Morceau[] = [
  { titre: 'Lumière du matin', fichier: '/musique/lumiere-du-matin.mp3' },
  { titre: 'Atelier', fichier: '/musique/atelier.mp3' },
  { titre: 'Crépuscule', fichier: '/musique/crepuscule.mp3' },
];
