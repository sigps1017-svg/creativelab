// Le tracé des rues du quartier, partagé par le décor (quartier.ts) et la circulation (vie.ts).
// Coordonnées du site : bâtiment au centre, façade vers +z.

/** L'avenue existante (dans le modèle Blender de x = -200 à 200), 12 m de large. */
export const AVENUE_Z = 62;
export const AVENUE_DEMI = 6;
/** Rues transversales en x = ±100, et rue arrière entre elles. */
export const RUE_X = 100;
export const RUE_ARRIERE_Z = -116;
/** Rues extérieures, bordées de villas : en x = ±230, derrière (z = -220) et devant (z = 270). */
export const BORD_X = 230;
export const BORD_SUD = -220;
export const BORD_NORD = 270;
/** Les rues filent jusque-là et se perdent dans la brume (elle est opaque à 420 m). */
export const LOIN = 460;
/** Demi-largeur des rues (hors avenue) et largeur de leurs trottoirs. */
export const RUE_DEMI = 5;
export const TROTTOIR = 3;
