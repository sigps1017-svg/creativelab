# Creativ Lab Architects : base du bâtiment dans Blender
#
# Construit la base du bâtiment du site, aux bonnes cotes, prête à être retravaillée :
# niveaux, atrium, façades, galerie avec ses 10 cadres, mur de l'équipe, parvis,
# et les 10 caméras du parcours du site (Vue_00 à Vue_09).
#
# Utilisation : Blender > onglet Scripting > Ouvrir ce fichier (ou coller le texte) > Exécuter (Alt + P).
# Relancer le script remplace la collection « Creativ » par une version neuve : gardez vos
# modifications dans une autre collection, ou enregistrez le fichier .blend sous un autre nom avant.
#
# Repères (ne pas changer sans prévenir, le site s'y appuie) :
#   1 unité = 1 m, origine au centre du bâtiment au niveau du sol, entrée face à -Y (vue de face).
#   Rez-de-chaussée 0 m, 1er étage 6 m, toit 11 m.
#   Noms lus par le site : Cadre_01..10, Portrait_01..08, caméras Vue_00..09.

import math

import bpy
from mathutils import Vector

L, P = 40.0, 24.0  # emprise : largeur (X) et profondeur (Y)
ATRIUM_X, ATRIUM_Y = 8.0, 5.0  # demi-dimensions de l'atrium
NIVEAU_1, TOIT, DALLE = 6.0, 11.0, 0.5
MUR_FOND = P / 2  # le mur du fond est du côté +Y
FACADE = -P / 2  # la façade d'entrée est du côté -Y
CADRE_L, CADRE_H, CADRE_PAS = 2.6, 2.6 / 1.5, 3.4

# Points de vue du parcours, repris du site (src/scripts/experience/parcours.ts),
# convertis en coordonnées Blender : (x, y, z) du site -> (x, -z, y).
POINTS_DE_VUE = [
    ("parvis", (0, 6, 40), (0, 5, 10)),
    ("porte", (0, 2.2, 18), (0, 2.5, 0)),
    ("hall", (0, 1.8, 9), (0, 5.5, -2)),
    ("galerie_gauche", (-13, 1.8, -5), (-13, 2.5, -11.6)),
    ("galerie_droite", (13, 1.8, -5), (13, 2.5, -11.6)),
    ("atrium", (2, 3, 0), (0, 10, -2)),
    ("atelier", (-12, 9, 5), (-12, 7, -3)),
    ("equipe", (12, 7.8, -4.6), (12, 7.1, -11.6)),
    ("montee_toit", (3, 9.5, 0), (0, 14, 8)),
    ("terrasse", (0, 13.8, 7), (12, 10, 70)),
]


def site_vers_blender(p):
    x, y, z = p
    return Vector((x, -z, y))


# ---------------------------------------------------------------- collections

def collection(nom, parent):
    c = bpy.data.collections.new(nom)
    parent.children.link(c)
    return c


ancienne = bpy.data.collections.get("Creativ")
if ancienne:
    for o in list(ancienne.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(ancienne.children_recursive):
        bpy.data.collections.remove(c)
    bpy.data.collections.remove(ancienne)

racine = bpy.data.collections.new("Creativ")
bpy.context.scene.collection.children.link(racine)
C_STRUCTURE = collection("Structure", racine)
C_FACADES = collection("Facades", racine)
C_INTERIEUR = collection("Interieur", racine)
C_GALERIE = collection("Galerie", racine)
C_EQUIPE = collection("Equipe", racine)
C_ABORDS = collection("Abords", racine)
C_CAMERAS = collection("Cameras_parcours", racine)

# ---------------------------------------------------------------- matériaux

def materiau(nom, couleur, rugosite=0.6, metal=0.0, transparence=None, emission=None):
    m = bpy.data.materials.get(nom) or bpy.data.materials.new(nom)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = (int(couleur[i : i + 2], 16) / 255 for i in (1, 3, 5))
    m.diffuse_color = (r, g, b, 1)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = rugosite
    bsdf.inputs["Metallic"].default_value = metal
    if transparence is not None:
        bsdf.inputs["Alpha"].default_value = transparence
        m.diffuse_color = (r, g, b, transparence)
        for nom_entree in ("Transmission Weight", "Transmission"):  # Blender 4+ / 3.x
            if nom_entree in bsdf.inputs:
                bsdf.inputs[nom_entree].default_value = 1.0
                break
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
        elif hasattr(m, "blend_method"):
            m.blend_method = "BLEND"
    if emission is not None:
        for nom_entree in ("Emission Color", "Emission"):
            if nom_entree in bsdf.inputs:
                bsdf.inputs[nom_entree].default_value = (*emission, 1)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


BETON = materiau("Beton", "#d9d4cb", 0.85)
BETON_SOMBRE = materiau("Beton_sombre", "#8f8a82", 0.9)
SOL = materiau("Sol_interieur", "#b9ad9a", 0.55)
METAL = materiau("Metal", "#2b2a28", 0.4, 0.6)
LAITON = materiau("Laiton", "#c8a165", 0.3, 0.85)
VITRAGE = materiau("Vitrage", "#a9c2cf", 0.05, 0.1, transparence=0.2)
PLATRE = materiau("Platre", "#f4f1ec", 0.7)
PARVIS = materiau("Parvis", "#cfc6b8", 0.8)
SOL_EXT = materiau("Sol_exterieur", "#3b3934", 1.0)
EAU = materiau("Eau", "#1d2a33", 0.04, 1.0)
IMAGE = materiau("Image_projet", "#222120", 0.9, emission=(0.13, 0.13, 0.12))
PORTRAIT = materiau("Portrait", "#3a352e", 0.9)
RAMPE = materiau("Rampe_lumineuse", "#fff3dc", 0.5, emission=(1.0, 0.95, 0.86))

# ---------------------------------------------------------------- géométrie

def boite(nom, taille, centre, mat, coll):
    """Pavé de dimensions taille=(x, y, z) centré en centre=(x, y, z)."""
    mesh = bpy.data.meshes.new(nom)
    sx, sy, sz = (t / 2 for t in taille)
    sommets = [(x * sx, y * sy, z * sz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.from_pydata(sommets, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(nom, mesh)
    obj.location = centre
    coll.objects.link(obj)
    return obj


def plan(nom, largeur, hauteur, centre, mat, coll, normale="-Y"):
    """Rectangle vertical (normale -Y) ou horizontal (normale +Z)."""
    mesh = bpy.data.meshes.new(nom)
    l, h = largeur / 2, hauteur / 2
    if normale == "-Y":
        sommets = [(-l, 0, -h), (l, 0, -h), (l, 0, h), (-l, 0, h)]
    else:
        sommets = [(-l, -h, 0), (l, -h, 0), (l, h, 0), (-l, h, 0)]
    mesh.from_pydata(sommets, [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(nom, mesh)
    obj.location = centre
    coll.objects.link(obj)
    return obj


def dalle_percee(nom, dessus, debord_avant=0.0):
    """Dalle percée par l'atrium. debord_avant : avancée en marquise côté entrée (-Y)."""
    z = dessus - DALLE / 2
    avant = P / 2 - ATRIUM_Y + debord_avant
    boite(f"{nom}_avant", (L, avant, DALLE), (0, -(ATRIUM_Y + avant / 2), z), BETON, C_STRUCTURE)
    arriere = P / 2 - ATRIUM_Y
    boite(f"{nom}_arriere", (L, arriere, DALLE), (0, ATRIUM_Y + arriere / 2, z), BETON, C_STRUCTURE)
    cote = L / 2 - ATRIUM_X
    boite(f"{nom}_gauche", (cote, ATRIUM_Y * 2, DALLE), (-(ATRIUM_X + cote / 2), 0, z), BETON, C_STRUCTURE)
    boite(f"{nom}_droite", (cote, ATRIUM_Y * 2, DALLE), (ATRIUM_X + cote / 2, 0, z), BETON, C_STRUCTURE)


# Structure
boite("Plancher_RDC", (L, P, 0.3), (0, 0, -0.15), SOL, C_STRUCTURE)
dalle_percee("Dalle_N1", NIVEAU_1)
dalle_percee("Toit", TOIT, debord_avant=3.0)
boite("Mur_fond", (L + 0.8, 0.4, TOIT), (0, MUR_FOND + 0.2, TOIT / 2), BETON_SOMBRE, C_STRUCTURE)
boite("Pignon_gauche", (0.4, P, TOIT), (-L / 2 - 0.2, 0, TOIT / 2), BETON_SOMBRE, C_STRUCTURE)
boite("Pignon_droit", (0.4, P, TOIT), (L / 2 + 0.2, 0, TOIT / 2), BETON_SOMBRE, C_STRUCTURE)
for i, x in enumerate((-16, -8, 8, 16), 1):
    boite(f"Poteau_{i:02d}", (0.45, 0.45, TOIT - DALLE), (x, -(P / 2 - 4), (TOIT - DALLE) / 2), BETON, C_STRUCTURE)

# Façade d'entrée : vitrage, porte de 6 m, menuiseries. Le 1er étage est une baie vitrée
# continue (sans brise-soleil) pour voir l'atelier depuis le parvis.
porte = 3.0
pan = L / 2 - porte
h_rdc = NIVEAU_1 - DALLE
boite("Vitrage_RDC_gauche", (pan, 0.05, h_rdc), (-(porte + pan / 2), FACADE, h_rdc / 2), VITRAGE, C_FACADES)
boite("Vitrage_RDC_droit", (pan, 0.05, h_rdc), (porte + pan / 2, FACADE, h_rdc / 2), VITRAGE, C_FACADES)
boite("Vitrage_imposte", (porte * 2, 0.05, 1.0), (0, FACADE, h_rdc - 0.5), VITRAGE, C_FACADES)
h_n1 = TOIT - NIVEAU_1 - DALLE
boite("Vitrage_N1", (L, 0.05, h_n1), (0, FACADE, NIVEAU_1 + h_n1 / 2 - DALLE / 2), VITRAGE, C_FACADES)
x, i = -L / 2, 1
while x <= L / 2 + 0.01:
    if abs(x) >= porte:
        boite(f"Meneau_{i:02d}", (0.08, 0.12, TOIT - DALLE), (x, FACADE, (TOIT - DALLE) / 2), METAL, C_FACADES)
        i += 1
    x += 2.5

# Garde-corps vitrés du toit et de l'atrium
gc = 1.1
z_toit = TOIT + gc / 2
boite("GC_toit_avant", (L, 0.04, gc), (0, -(P / 2 + 3), z_toit), VITRAGE, C_FACADES)
boite("GC_toit_arriere", (L, 0.04, gc), (0, MUR_FOND, z_toit), VITRAGE, C_FACADES)
boite("GC_toit_gauche", (0.04, P + 3, gc), (-L / 2, -1.5, z_toit), VITRAGE, C_FACADES)
boite("GC_toit_droit", (0.04, P + 3, gc), (L / 2, -1.5, z_toit), VITRAGE, C_FACADES)
for niveau, z in (("N1", NIVEAU_1 + gc / 2), ("Toit", z_toit)):
    boite(f"GC_atrium_{niveau}_avant", (ATRIUM_X * 2, 0.04, gc), (0, -ATRIUM_Y, z), VITRAGE, C_FACADES)
    boite(f"GC_atrium_{niveau}_arriere", (ATRIUM_X * 2, 0.04, gc), (0, ATRIUM_Y, z), VITRAGE, C_FACADES)
    boite(f"GC_atrium_{niveau}_gauche", (0.04, ATRIUM_Y * 2, gc), (-ATRIUM_X, 0, z), VITRAGE, C_FACADES)
    if niveau == "N1":  # ouvert en haut de l'escalier de l'atrium (arrivée côté +Y, de y = 3,25 à 5)
        boite("GC_atrium_N1_droit", (0.04, ATRIUM_Y + 3.25, gc), (ATRIUM_X, (3.25 - ATRIUM_Y) / 2, z), VITRAGE, C_FACADES)
    else:
        boite(f"GC_atrium_{niveau}_droit", (0.04, ATRIUM_Y * 2, gc), (ATRIUM_X, 0, z), VITRAGE, C_FACADES)

# Hall : banque d'accueil et anneau lumineux suspendu dans l'atrium
boite("Accueil", (4, 1.2, 1.1), (7, -8, 0.55), PLATRE, C_INTERIEUR)
boite("Accueil_plateau", (4.1, 1.3, 0.06), (7, -8, 1.13), LAITON, C_INTERIEUR)
bpy.ops.mesh.primitive_torus_add(major_radius=4, minor_radius=0.07, major_segments=96, minor_segments=12, location=(0, 0, 9.8))
anneau = bpy.context.active_object
anneau.name = "Anneau_atrium"
anneau.data.materials.append(LAITON)
for c in anneau.users_collection:
    c.objects.unlink(anneau)
C_INTERIEUR.objects.link(anneau)

# Galerie : 10 cadres sur le mur du fond du rez-de-chaussée
debut = -(9 * CADRE_PAS) / 2
for n in range(10):
    x = debut + n * CADRE_PAS
    boite(f"Cadre_{n + 1:02d}_bordure", (CADRE_L + 0.16, 0.06, CADRE_H + 0.16), (x, MUR_FOND - 0.03, 2.6), METAL, C_GALERIE)
    plan(f"Cadre_{n + 1:02d}", CADRE_L, CADRE_H, (x, MUR_FOND - 0.07, 2.6), IMAGE, C_GALERIE)
boite("Rampe_lumineuse", (10 * CADRE_PAS, 0.25, 0.05), (0, MUR_FOND - 0.3, 4.3), RAMPE, C_GALERIE)

# Atelier (1er étage, à gauche) : table et maquettes
z_table = NIVEAU_1 + 0.9
boite("Atelier_table", (6, 2.6, 0.08), (-12, 3, z_table), PLATRE, C_INTERIEUR)
for i, (dx, dy) in enumerate(((-2.8, -1.1), (2.8, -1.1), (-2.8, 1.1), (2.8, 1.1)), 1):
    boite(f"Atelier_pied_{i}", (0.06, 0.06, 0.9), (-12 + dx, 3 + dy, NIVEAU_1 + 0.45), METAL, C_INTERIEUR)
for i, (x, y, l, h, p) in enumerate(
    ((-14, 3.4, 0.5, 0.6, 0.5), (-13.2, 2.6, 0.4, 1.1, 0.4), (-12.2, 3.2, 0.9, 0.35, 0.7), (-11.1, 2.7, 0.35, 0.8, 0.35), (-10.2, 3.4, 0.7, 0.5, 0.5)),
    1,
):
    boite(f"Maquette_{i}", (l, p, h), (x, y, z_table + 0.04 + h / 2), PLATRE, C_INTERIEUR)

# Mur de l'équipe (1er étage, à droite) : une rangée de 8 portraits, dans l'ordre de src/data/equipe.ts
for n in range(8):
    x = 12 + (n - 3.5) * 1.45
    boite(f"Bordure_portrait_{n + 1:02d}", (1.21, 0.04, 1.56), (x, MUR_FOND - 0.02, NIVEAU_1 + 2.2), METAL, C_EQUIPE)
    plan(f"Portrait_{n + 1:02d}", 1.15, 1.5, (x, MUR_FOND - 0.05, NIVEAU_1 + 2.2), PORTRAIT, C_EQUIPE)

# Abords : sol, parvis, bassin
plan("Sol_exterieur", 400, 400, (0, 0, -0.02), SOL_EXT, C_ABORDS, normale="+Z")
plan("Parvis", 56, 34, (0, -(P / 2 + 17), 0), PARVIS, C_ABORDS, normale="+Z")
plan("Bassin", 16, 7, (-14, -(P / 2 + 12), 0.02), EAU, C_ABORDS, normale="+Z")

# ---------------------------------------------------------------- caméras du parcours

for n, (nom, pos, cible) in enumerate(POINTS_DE_VUE):
    cam_data = bpy.data.cameras.new(f"Vue_{n:02d}_{nom}")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(50)
    cam = bpy.data.objects.new(f"Vue_{n:02d}", cam_data)
    p, c = site_vers_blender(pos), site_vers_blender(cible)
    cam.location = p
    cam.rotation_euler = (c - p).to_track_quat("-Z", "Y").to_euler()
    C_CAMERAS.objects.link(cam)

# ---------------------------------------------------------------- scène

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.camera = bpy.data.objects["Vue_00"]

soleil = bpy.data.objects.get("Soleil_Creativ")
if soleil is None:
    soleil = bpy.data.objects.new("Soleil_Creativ", bpy.data.lights.new("Soleil_Creativ", "SUN"))
    C_ABORDS.objects.link(soleil)
soleil.data.energy = 3.0
soleil.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))

if scene.world is None:
    scene.world = bpy.data.worlds.new("Monde")
scene.world.use_nodes = True
fond = scene.world.node_tree.nodes.get("Background")
if fond:
    fond.inputs["Color"].default_value = (0.78, 0.86, 0.93, 1)
    fond.inputs["Strength"].default_value = 0.8

print(f"Creativ : {len(racine.all_objects)} objets créés dans la collection « Creativ ».")
