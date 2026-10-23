# Creativ Lab Architects : habillage réaliste du bâtiment
#
# À lancer APRÈS creativ_batiment_blender.py, dans le même fichier.
# Ajoute : ciel physique et soleil, matériaux procéduraux (béton, terrazzo, chêne, marbre,
# verre, tissus), escalier de l'atrium, mobilier du hall, de la galerie, de l'atelier, de
# l'espace équipe et du toit-terrasse, abords paysagers (pelouse, arbres, haies, bancs,
# luminaires) et une silhouette de ville au loin.
#
# Relancer le script remplace la collection « Creativ_Amenagement » et met à jour les matériaux.
# Coordonnées Blender : entrée côté -Y, mur du fond (galerie) côté +Y, 1 unité = 1 m.

import math
import random

import bmesh
import bpy
from mathutils import Euler, Vector

random.seed(7)
NIVEAU_1, TOIT = 6.0, 11.0

# ================================================================== collections

def nouvelle_collection(nom, parent):
    c = bpy.data.collections.new(nom)
    parent.children.link(c)
    return c


ancienne = bpy.data.collections.get("Creativ_Amenagement")
if ancienne:
    for o in list(ancienne.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(ancienne.children_recursive):
        bpy.data.collections.remove(c)
    bpy.data.collections.remove(ancienne)
for m in [m for m in bpy.data.meshes if m.users == 0]:
    bpy.data.meshes.remove(m)

RACINE = bpy.data.collections.new("Creativ_Amenagement")
bpy.context.scene.collection.children.link(RACINE)
C_ARCHI = nouvelle_collection("Archi_complements", RACINE)
C_HALL = nouvelle_collection("Mobilier_hall", RACINE)
C_GALERIE = nouvelle_collection("Mobilier_galerie", RACINE)
C_ATELIER = nouvelle_collection("Mobilier_atelier", RACINE)
C_EQUIPE = nouvelle_collection("Mobilier_equipe", RACINE)
C_TOIT = nouvelle_collection("Mobilier_toit", RACINE)
C_PAYSAGE = nouvelle_collection("Paysage", RACINE)
C_VILLE = nouvelle_collection("Ville", RACINE)
C_LUMIERES = nouvelle_collection("Lumieres", RACINE)

# ================================================================== matériaux

def rgb(hexa):
    return tuple(int(hexa[i : i + 2], 16) / 255 for i in (1, 3, 5))


def nouveau_materiau(nom):
    m = bpy.data.materials.get(nom) or bpy.data.materials.new(nom)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    sortie = nt.nodes.new("ShaderNodeOutputMaterial")
    sortie.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], sortie.inputs["Surface"])
    return m, nt, bsdf


def coords(nt, echelle=1.0):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (echelle, echelle, echelle)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def rampe(nt, entree, c1, c2, p1=0.0, p2=1.0):
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].position, r.color_ramp.elements[1].position = p1, p2
    r.color_ramp.elements[0].color = (*c1, 1)
    r.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(entree, r.inputs["Fac"])
    return r.outputs["Color"]


def relief(nt, bsdf, hauteur, force=0.15, distance=0.02):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = force
    b.inputs["Distance"].default_value = distance
    nt.links.new(hauteur, b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def mat_beton(nom, clair, fonce, banches=False):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt)
    bruit = nt.nodes.new("ShaderNodeTexNoise")
    bruit.inputs["Scale"].default_value = 1.6
    bruit.inputs["Detail"].default_value = 12
    bruit.inputs["Roughness"].default_value = 0.62
    nt.links.new(v, bruit.inputs["Vector"])
    nt.links.new(rampe(nt, bruit.outputs["Fac"], rgb(fonce), rgb(clair), 0.3, 0.72), bsdf.inputs["Base Color"])
    nt.links.new(rampe(nt, bruit.outputs["Fac"], (0.72,) * 3, (0.92,) * 3), bsdf.inputs["Roughness"])
    hauteur = bruit.outputs["Fac"]
    if banches:  # joints horizontaux de coffrage tous les 0,6 m
        w = nt.nodes.new("ShaderNodeTexWave")
        w.wave_type, w.bands_direction = "BANDS", "Z"
        w.inputs["Scale"].default_value = 0.83
        w.inputs["Distortion"].default_value = 0.0
        nt.links.new(v, w.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMath")
        mix.operation = "ADD"
        nt.links.new(bruit.outputs["Fac"], mix.inputs[0])
        nt.links.new(w.outputs["Fac"], mix.inputs[1])
        hauteur = mix.outputs[0]
    relief(nt, bsdf, hauteur, 0.12)
    return m


def mat_bois(nom, clair, fonce, echelle=1.0, vernis=0.35):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt, echelle)
    sep = nt.nodes.new("ShaderNodeMapping")
    sep.inputs["Scale"].default_value = (1.0, 0.06, 1.0)  # fibres allongées le long de Y
    nt.links.new(v, sep.inputs["Vector"])
    vague = nt.nodes.new("ShaderNodeTexWave")
    vague.wave_type, vague.bands_direction, vague.wave_profile = "BANDS", "X", "SIN"
    vague.inputs["Scale"].default_value = 14
    vague.inputs["Distortion"].default_value = 9
    vague.inputs["Detail"].default_value = 4
    vague.inputs["Detail Scale"].default_value = 1.4
    nt.links.new(sep.outputs["Vector"], vague.inputs["Vector"])
    bruit = nt.nodes.new("ShaderNodeTexNoise")
    bruit.inputs["Scale"].default_value = 9
    bruit.inputs["Detail"].default_value = 6
    nt.links.new(sep.outputs["Vector"], bruit.inputs["Vector"])
    veines = nt.nodes.new("ShaderNodeMath")
    veines.operation = "MULTIPLY"
    nt.links.new(vague.outputs["Fac"], veines.inputs[0])
    nt.links.new(bruit.outputs["Fac"], veines.inputs[1])
    nt.links.new(rampe(nt, veines.outputs[0], rgb(fonce), rgb(clair), 0.08, 0.42), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = vernis
    relief(nt, bsdf, veines.outputs[0], 0.05)
    return m


def mat_parquet(nom, clair, fonce):
    """Lames de chêne : briques allongées + veinage."""
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt)
    brique = nt.nodes.new("ShaderNodeTexBrick")
    brique.inputs["Scale"].default_value = 1.0
    brique.inputs["Brick Width"].default_value = 1.6
    brique.inputs["Row Height"].default_value = 0.18
    brique.inputs["Mortar Size"].default_value = 0.004
    brique.inputs["Color1"].default_value = (*rgb(clair), 1)
    brique.inputs["Color2"].default_value = (*rgb(fonce), 1)
    brique.inputs["Mortar"].default_value = (0.12, 0.08, 0.05, 1)
    brique.offset = 0.37
    nt.links.new(v, brique.inputs["Vector"])
    bruit = nt.nodes.new("ShaderNodeTexNoise")
    bruit.inputs["Scale"].default_value = 40
    nt.links.new(v, bruit.inputs["Vector"])
    mel = nt.nodes.new("ShaderNodeMix")
    mel.data_type, mel.blend_type = "RGBA", "MULTIPLY"
    mel.inputs["Factor"].default_value = 0.25
    nt.links.new(brique.outputs["Color"], mel.inputs[6])
    nt.links.new(bruit.outputs["Color"], mel.inputs[7])
    nt.links.new(mel.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.32
    relief(nt, bsdf, brique.outputs["Fac"], 0.2, 0.005)
    return m


def mat_dallage(nom, c1, c2, taille=1.2, joint=0.006, rugosite=0.75):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt)
    brique = nt.nodes.new("ShaderNodeTexBrick")
    brique.inputs["Scale"].default_value = 1.0 / taille
    brique.inputs["Brick Width"].default_value = 1.0
    brique.inputs["Row Height"].default_value = 0.5
    brique.inputs["Mortar Size"].default_value = joint
    brique.inputs["Color1"].default_value = (*rgb(c1), 1)
    brique.inputs["Color2"].default_value = (*rgb(c2), 1)
    brique.inputs["Mortar"].default_value = (0.25, 0.24, 0.22, 1)
    brique.offset = 0.5
    nt.links.new(v, brique.inputs["Vector"])
    nt.links.new(brique.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rugosite
    relief(nt, bsdf, brique.outputs["Fac"], 0.3, 0.01)
    return m


def mat_terrazzo(nom):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt, 6.0)
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 5
    vor.inputs["Randomness"].default_value = 1
    nt.links.new(v, vor.inputs["Vector"])
    eclats = rampe(nt, vor.outputs["Distance"], (0.42, 0.40, 0.37), rgb("#ebe6dd"), 0.05, 0.12)
    vor2 = nt.nodes.new("ShaderNodeTexVoronoi")
    vor2.inputs["Scale"].default_value = 11
    nt.links.new(v, vor2.inputs["Vector"])
    mel = nt.nodes.new("ShaderNodeMix")
    mel.data_type, mel.blend_type = "RGBA", "MULTIPLY"
    mel.inputs["Factor"].default_value = 1.0
    nt.links.new(eclats, mel.inputs[6])
    nt.links.new(rampe(nt, vor2.outputs["Distance"], (0.62, 0.52, 0.42), (1, 1, 1), 0.04, 0.09), mel.inputs[7])
    nt.links.new(mel.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.18
    return m


def mat_marbre(nom):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt, 0.8)
    vague = nt.nodes.new("ShaderNodeTexWave")
    vague.inputs["Scale"].default_value = 2.2
    vague.inputs["Distortion"].default_value = 14
    vague.inputs["Detail"].default_value = 8
    nt.links.new(v, vague.inputs["Vector"])
    nt.links.new(rampe(nt, vague.outputs["Fac"], (0.55, 0.53, 0.5), (0.95, 0.94, 0.92), 0.0, 0.25), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.12
    return m


def mat_simple(nom, couleur, rugosite=0.6, metal=0.0, **extra):
    m, nt, bsdf = nouveau_materiau(nom)
    bsdf.inputs["Base Color"].default_value = (*rgb(couleur), 1)
    bsdf.inputs["Roughness"].default_value = rugosite
    bsdf.inputs["Metallic"].default_value = metal
    for k, val in extra.items():
        bsdf.inputs[k].default_value = val
    m.diffuse_color = (*rgb(couleur), 1)
    return m


def mat_tissu(nom, couleur):
    m, nt, bsdf = nouveau_materiau(nom)
    bsdf.inputs["Base Color"].default_value = (*rgb(couleur), 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Sheen Weight"].default_value = 0.6
    bsdf.inputs["Sheen Roughness"].default_value = 0.4
    v = coords(nt, 60)
    b = nt.nodes.new("ShaderNodeTexNoise")
    b.inputs["Scale"].default_value = 3
    nt.links.new(v, b.inputs["Vector"])
    relief(nt, bsdf, b.outputs["Fac"], 0.08)
    return m


def mat_vegetal(nom, c1, c2):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt, 1.5)
    b = nt.nodes.new("ShaderNodeTexNoise")
    b.inputs["Scale"].default_value = 4
    b.inputs["Detail"].default_value = 10
    nt.links.new(v, b.inputs["Vector"])
    nt.links.new(rampe(nt, b.outputs["Fac"], rgb(c1), rgb(c2), 0.35, 0.7), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Subsurface Weight"].default_value = 0.15
    relief(nt, bsdf, b.outputs["Fac"], 0.6, 0.1)
    return m


def mat_pelouse(nom):
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt, 1.0)
    b = nt.nodes.new("ShaderNodeTexNoise")
    b.inputs["Scale"].default_value = 0.6
    b.inputs["Detail"].default_value = 14
    nt.links.new(v, b.inputs["Vector"])
    fin = nt.nodes.new("ShaderNodeTexNoise")
    fin.inputs["Scale"].default_value = 180
    nt.links.new(v, fin.inputs["Vector"])
    nt.links.new(rampe(nt, b.outputs["Fac"], rgb("#3d5a2a"), rgb("#6f8a3f"), 0.3, 0.75), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    relief(nt, bsdf, fin.outputs["Fac"], 0.5, 0.02)
    return m


def mat_eau(nom):
    m, nt, bsdf = nouveau_materiau(nom)
    bsdf.inputs["Base Color"].default_value = (0.02, 0.05, 0.06, 1)
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["IOR"].default_value = 1.33
    v = coords(nt, 0.6)
    b = nt.nodes.new("ShaderNodeTexNoise")
    b.inputs["Scale"].default_value = 3
    nt.links.new(v, b.inputs["Vector"])
    relief(nt, bsdf, b.outputs["Fac"], 0.08)
    return m


def mat_verre(nom, teinte="#d6e4ea"):
    m, nt, bsdf = nouveau_materiau(nom)
    bsdf.inputs["Base Color"].default_value = (*rgb(teinte), 1)
    bsdf.inputs["Roughness"].default_value = 0.0
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["IOR"].default_value = 1.5
    bsdf.inputs["Thin Wall"].default_value = True
    m.diffuse_color = (*rgb(teinte), 0.25)
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "DITHERED"
    if hasattr(m, "use_raytrace_refraction"):
        m.use_raytrace_refraction = True
    return m


def mat_lumiere(nom, couleur, force):
    m, nt, bsdf = nouveau_materiau(nom)
    bsdf.inputs["Base Color"].default_value = (*rgb(couleur), 1)
    bsdf.inputs["Emission Color"].default_value = (*rgb(couleur), 1)
    bsdf.inputs["Emission Strength"].default_value = force
    return m


# On remplace les matériaux du bâtiment de base (les objets les gardent par leur nom).
BETON = mat_beton("Beton", "#ddd8cf", "#b9b2a6")
BETON_SOMBRE = mat_beton("Beton_sombre", "#a49d92", "#7b756c", banches=True)
SOL = mat_terrazzo("Sol_interieur")
METAL = mat_simple("Metal", "#2a2723", 0.32, 1.0)
LAITON = mat_simple("Laiton", "#c8a165", 0.22, 1.0)
VITRAGE = mat_verre("Vitrage")
PLATRE = mat_simple("Platre", "#f2efea", 0.75)
PARVIS = mat_dallage("Parvis", "#d6cfc3", "#cbc3b5", 1.2)
SOL_EXT = mat_pelouse("Sol_exterieur")
EAU = mat_eau("Eau")

CHENE = mat_bois("Chene", "#c49a6c", "#9a7148")
NOYER = mat_bois("Noyer", "#6e4a31", "#3f2a1c", vernis=0.25)
PARQUET = mat_parquet("Parquet_chene", "#c8a27a", "#b48d63")
MARBRE = mat_marbre("Marbre")
DECK = mat_bois("Deck_bois", "#9c7a5a", "#6f533b", echelle=0.8, vernis=0.6)
DALLES_EXT = mat_dallage("Dalles_terrasse", "#bdb6aa", "#b2aa9c", 0.6, 0.008)
BITUME = mat_beton("Bitume", "#3a3936", "#2b2a28")
TROTTOIR = mat_dallage("Trottoir", "#a8a296", "#9e978a", 0.5, 0.01)
LIN = mat_tissu("Tissu_lin", "#d8cfc0")
VELOURS = mat_tissu("Tissu_velours_vert", "#3e5345")
TERRACOTTA = mat_tissu("Tissu_terracotta", "#a5583a")
CUIR = mat_simple("Cuir_cognac", "#7a4426", 0.45)
NOIR_MAT = mat_simple("Noir_mat", "#141414", 0.5)
BLANC_MAT = mat_simple("Blanc_laque", "#ecebe7", 0.3)
POT = mat_beton("Pot_beton", "#8d877e", "#6c665e")
TERRE = mat_simple("Terre", "#2e231b", 0.95)
FEUILLAGE = mat_vegetal("Feuillage", "#2f4a22", "#5f7f35")
FEUILLAGE_CLAIR = mat_vegetal("Feuillage_clair", "#4f6b2e", "#8fa64c")
GRAMINEES = mat_vegetal("Graminees", "#5f6a34", "#9c9358")
ECORCE = mat_simple("Ecorce", "#4a3a2c", 0.95)
TAPIS = mat_tissu("Tapis_laine", "#b9ab97")
ECRAN = mat_simple("Ecran", "#050608", 0.08)
LIVRES = [mat_simple(f"Livre_{i}", c, 0.7) for i, c in enumerate(("#8b3a2b", "#2f4858", "#d9c9a8", "#3f5b45", "#c47f3b", "#e8e4dc"))]
LUMIERE_CHAUDE = mat_lumiere("Lumiere_chaude", "#ffd9a8", 12)


def mat_facade_ville(nom, beton, vitre):
    """Façades d'immeubles lointains : une grille de fenêtres via une texture de briques."""
    m, nt, bsdf = nouveau_materiau(nom)
    v = coords(nt)
    b = nt.nodes.new("ShaderNodeTexBrick")
    b.inputs["Scale"].default_value = 0.25
    b.inputs["Brick Width"].default_value = 0.6
    b.inputs["Row Height"].default_value = 0.85
    b.inputs["Mortar Size"].default_value = 0.08
    b.inputs["Color1"].default_value = (*rgb(vitre), 1)
    b.inputs["Color2"].default_value = (*rgb(vitre), 1)
    b.inputs["Mortar"].default_value = (*rgb(beton), 1)
    b.offset = 0.0
    # Projection sur les façades verticales : (x + y) en horizontal, z en vertical.
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(v, sep.inputs["Vector"])
    somme = nt.nodes.new("ShaderNodeMath")
    nt.links.new(sep.outputs["X"], somme.inputs[0])
    nt.links.new(sep.outputs["Y"], somme.inputs[1])
    uv = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(somme.outputs[0], uv.inputs["X"])
    nt.links.new(sep.outputs["Z"], uv.inputs["Y"])
    nt.links.new(uv.outputs["Vector"], b.inputs["Vector"])
    nt.links.new(b.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rampe(nt, b.outputs["Fac"], (0.15,) * 3, (0.85,) * 3), bsdf.inputs["Roughness"])
    return m


VILLE = mat_facade_ville("Ville_facades", "#b9b1a4", "#3c4750")
VILLE_VITRES = mat_facade_ville("Ville_vitres", "#8c8579", "#5a6670")

# ================================================================== primitives

def _objet(nom, bm, mat, coll, loc, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(mat)
    o = bpy.data.objects.new(nom, me)
    o.location = loc
    o.rotation_euler = rot
    coll.objects.link(o)
    return o


def biseau(o, largeur=0.01, segments=2):
    mod = o.modifiers.new("Biseau", "BEVEL")
    mod.width, mod.segments = largeur, segments
    mod.limit_method = "ANGLE"
    if hasattr(o.data, "shade_smooth"):
        o.data.shade_smooth()
    if hasattr(o.data, "set_sharp_from_angle"):
        o.data.set_sharp_from_angle(angle=math.radians(35))
    return o


def boite(nom, taille, loc, mat, coll, rot=(0, 0, 0), arrondi=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=taille, verts=bm.verts)
    o = _objet(nom, bm, mat, coll, loc, rot)
    if arrondi:
        biseau(o, arrondi, 3)
    return o


def cylindre(nom, rayon, hauteur, loc, mat, coll, segments=24, rayon2=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=rayon,
                          radius2=rayon if rayon2 is None else rayon2, depth=hauteur)
    o = _objet(nom, bm, mat, coll, loc, rot)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return o


def sphere(nom, rayon, loc, mat, coll, subdiv=3, echelle=(1, 1, 1), bosselage=0.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=rayon)
    for v in bm.verts:
        if bosselage:
            n = math.sin(v.co.x * 7.1) * math.cos(v.co.y * 6.3) * math.sin(v.co.z * 5.7 + 1.3)
            v.co *= 1 + bosselage * (n + random.uniform(-0.6, 0.6))
        v.co.x *= echelle[0]
        v.co.y *= echelle[1]
        v.co.z *= echelle[2]
    o = _objet(nom, bm, mat, coll, loc)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


# ================================================================== mobilier

def canape(nom, loc, rot_z, coll, tissu=LIN, places=3):
    L = 0.85 * places + 0.3
    o = boite(f"{nom}_base", (L, 0.95, 0.22), (0, 0, 0.2), tissu, coll, arrondi=0.04)
    pieces = [o]
    for i in range(places):
        x = -L / 2 + 0.15 + 0.85 * (i + 0.5)
        pieces.append(boite(f"{nom}_assise_{i}", (0.84, 0.78, 0.16), (x, 0.06, 0.39), tissu, coll, arrondi=0.06))
        pieces.append(boite(f"{nom}_dossier_{i}", (0.84, 0.2, 0.42), (x, 0.4, 0.62), tissu, coll, rot=(math.radians(-8), 0, 0), arrondi=0.07))
    pieces.append(boite(f"{nom}_accoudoir_g", (0.16, 0.95, 0.5), (-L / 2 + 0.08, 0, 0.45), tissu, coll, arrondi=0.06))
    pieces.append(boite(f"{nom}_accoudoir_d", (0.16, 0.95, 0.5), (L / 2 - 0.08, 0, 0.45), tissu, coll, arrondi=0.06))
    for sx in (-1, 1):
        for sy in (-1, 1):
            pieces.append(cylindre(f"{nom}_pied", 0.025, 0.1, (sx * (L / 2 - 0.12), sy * 0.38, 0.05), NOYER, coll, 12))
    return grouper(nom, pieces, loc, rot_z, coll)


def fauteuil(nom, loc, rot_z, coll, tissu=VELOURS):
    p = [
        boite(f"{nom}_assise", (0.78, 0.78, 0.18), (0, 0, 0.36), tissu, coll, arrondi=0.07),
        boite(f"{nom}_dossier", (0.78, 0.18, 0.5), (0, 0.33, 0.66), tissu, coll, rot=(math.radians(-12), 0, 0), arrondi=0.08),
        boite(f"{nom}_accoudoir_g", (0.12, 0.7, 0.32), (-0.36, 0.02, 0.5), tissu, coll, arrondi=0.05),
        boite(f"{nom}_accoudoir_d", (0.12, 0.7, 0.32), (0.36, 0.02, 0.5), tissu, coll, arrondi=0.05),
    ]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(cylindre(f"{nom}_pied", 0.02, 0.28, (sx * 0.32, sy * 0.3, 0.14), NOYER, coll, 12, rayon2=0.012))
    return grouper(nom, p, loc, rot_z, coll)


def table_basse(nom, loc, coll, rayon=0.55, mat=MARBRE):
    p = [cylindre(f"{nom}_plateau", rayon, 0.04, (0, 0, 0.38), mat, coll, 48),
         cylindre(f"{nom}_pied", 0.12, 0.36, (0, 0, 0.18), METAL, coll, 24, rayon2=0.08)]
    return grouper(nom, p, loc, 0, coll)


def chaise(nom, loc, rot_z, coll, assise=CHENE):
    p = [boite(f"{nom}_assise", (0.45, 0.44, 0.03), (0, 0, 0.46), assise, coll, arrondi=0.01),
         boite(f"{nom}_dossier", (0.42, 0.025, 0.28), (0, 0.21, 0.72), assise, coll, rot=(math.radians(-8), 0, 0), arrondi=0.01)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(cylindre(f"{nom}_pied", 0.014, 0.46, (sx * 0.19, sy * 0.18, 0.23), NOIR_MAT, coll, 10))
    return grouper(nom, p, loc, rot_z, coll)


def table(nom, loc, coll, l=2.2, p_=1.0, h=0.74, mat=CHENE, rot_z=0.0):
    p = [boite(f"{nom}_plateau", (l, p_, 0.04), (0, 0, h - 0.02), mat, coll, arrondi=0.008)]
    for sx in (-1, 1):
        p.append(boite(f"{nom}_pied", (0.05, p_ - 0.2, h - 0.04), (sx * (l / 2 - 0.15), 0, (h - 0.04) / 2), NOIR_MAT, coll))
    return grouper(nom, p, loc, rot_z, coll)


def bureau(nom, loc, rot_z, coll):
    p = [boite(f"{nom}_plateau", (1.6, 0.8, 0.03), (0, 0, 0.735), CHENE, coll, arrondi=0.006)]
    for sx in (-1, 1):
        p.append(boite(f"{nom}_pied", (0.04, 0.7, 0.72), (sx * 0.76, 0, 0.36), BLANC_MAT, coll))
    p.append(boite(f"{nom}_ecran", (0.62, 0.02, 0.36), (0, 0.22, 1.02), ECRAN, coll, arrondi=0.005))
    p.append(boite(f"{nom}_ecran_dos", (0.63, 0.015, 0.37), (0, 0.235, 1.02), NOIR_MAT, coll))
    p.append(cylindre(f"{nom}_ecran_pied", 0.012, 0.13, (0, 0.24, 0.81), METAL, coll, 8))
    p.append(boite(f"{nom}_clavier", (0.42, 0.13, 0.015), (0, -0.08, 0.758), BLANC_MAT, coll))
    p.append(cylindre(f"{nom}_lampe", 0.06, 0.02, (0.6, 0.2, 0.76), LAITON, coll, 16))
    return grouper(nom, p, loc, rot_z, coll)


def plante(nom, loc, coll, hauteur=1.6, rayon_pot=0.3, mat_pot=POT, feuillage=FEUILLAGE):
    p = [cylindre(f"{nom}_pot", rayon_pot, rayon_pot * 1.6, (0, 0, rayon_pot * 0.8), mat_pot, coll, 32, rayon2=rayon_pot * 0.85),
         cylindre(f"{nom}_terre", rayon_pot * 0.9, 0.02, (0, 0, rayon_pot * 1.58), TERRE, coll, 32)]
    h0 = rayon_pot * 1.6
    p.append(cylindre(f"{nom}_tronc", 0.025, hauteur * 0.6, (0, 0, h0 + hauteur * 0.3), ECORCE, coll, 8, rayon2=0.015))
    for i in range(5):
        a = i * 2.4
        r = hauteur * 0.17
        p.append(sphere(f"{nom}_feuilles_{i}", r, (math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, h0 + hauteur * (0.55 + 0.09 * i)),
                        feuillage, coll, 2, (1, 1, 0.8), 0.25))
    return grouper(nom, p, loc, random.uniform(0, 6.28), coll)


def suspension(nom, loc, coll, hauteur_cable=1.2, rayon=0.25):
    p = [cylindre(f"{nom}_cable", 0.004, hauteur_cable, (0, 0, hauteur_cable / 2), NOIR_MAT, coll, 6),
         cylindre(f"{nom}_abat_jour", 0.05, rayon * 0.9, (0, 0, -rayon * 0.45), NOIR_MAT, coll, 32, rayon2=rayon),
         sphere(f"{nom}_ampoule", 0.05, (0, 0, -rayon * 0.8), LUMIERE_CHAUDE, coll, 2)]
    return grouper(nom, p, loc, 0, coll)


def bibliotheque(nom, loc, rot_z, coll, l=3.0, h=2.2):
    p = [boite(f"{nom}_dos", (l, 0.03, h), (0, 0.17, h / 2), NOYER, coll)]
    for sx in (-1, 0, 1):
        p.append(boite(f"{nom}_montant", (0.03, 0.36, h), (sx * (l / 2 - 0.015), 0, h / 2), NOYER, coll))
    etageres = 5
    for k in range(etageres + 1):
        z = 0.03 + k * (h - 0.06) / etageres
        p.append(boite(f"{nom}_etagere", (l, 0.36, 0.03), (0, 0, z), NOYER, coll))
        if k < etageres:
            x = -l / 2 + 0.06
            while x < l / 2 - 0.1:
                ep = random.uniform(0.025, 0.06)
                ht = random.uniform(0.22, 0.32)
                if random.random() > 0.12:
                    p.append(boite(f"{nom}_livre", (ep, 0.24, ht), (x + ep / 2, -0.02, z + 0.015 + ht / 2), random.choice(LIVRES), coll))
                x += ep + 0.003
                if abs(x) < 0.05:
                    x += 0.04
    return grouper(nom, p, loc, rot_z, coll)


def tapis(nom, taille, loc, coll, rot_z=0.0, mat=TAPIS):
    return boite(nom, (taille[0], taille[1], 0.012), (loc[0], loc[1], loc[2] + 0.006), mat, coll, rot=(0, 0, rot_z), arrondi=0.005)


def banc(nom, loc, rot_z, coll, l=2.4, mat=CHENE, pied=METAL):
    p = [boite(f"{nom}_assise", (l, 0.5, 0.06), (0, 0, 0.44), mat, coll, arrondi=0.01)]
    for sx in (-1, 1):
        p.append(boite(f"{nom}_pied", (0.06, 0.45, 0.41), (sx * (l / 2 - 0.2), 0, 0.205), pied, coll))
    return grouper(nom, p, loc, rot_z, coll)


def transat(nom, loc, rot_z, coll):
    p = [boite(f"{nom}_cadre", (0.7, 1.9, 0.06), (0, 0, 0.3), DECK, coll, arrondi=0.01),
         boite(f"{nom}_matelas", (0.64, 1.3, 0.08), (0, -0.28, 0.37), LIN, coll, arrondi=0.03),
         boite(f"{nom}_dossier", (0.64, 0.65, 0.08), (0, 0.62, 0.55), LIN, coll, rot=(math.radians(40), 0, 0), arrondi=0.03)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(boite(f"{nom}_pied", (0.05, 0.05, 0.27), (sx * 0.3, sy * 0.85, 0.135), DECK, coll))
    return grouper(nom, p, loc, rot_z, coll)


def lampadaire(nom, loc, coll, h=4.5):
    p = [cylindre(f"{nom}_mat", 0.06, h, (0, 0, h / 2), METAL, coll, 12, rayon2=0.04),
         boite(f"{nom}_tete", (0.18, 0.7, 0.08), (0, 0.3, h), METAL, coll, arrondi=0.01),
         boite(f"{nom}_diffuseur", (0.14, 0.6, 0.01), (0, 0.3, h - 0.045), LUMIERE_CHAUDE, coll)]
    return grouper(nom, p, loc, 0, coll)


def borne(nom, loc, coll):
    p = [cylindre(f"{nom}_corps", 0.08, 0.8, (0, 0, 0.4), METAL, coll, 16),
         cylindre(f"{nom}_feu", 0.075, 0.08, (0, 0, 0.7), LUMIERE_CHAUDE, coll, 16)]
    return grouper(nom, p, loc, 0, coll)


def arbre(nom, loc, coll, h=7.0, couronne=2.6, feuillage=FEUILLAGE):
    p = [cylindre(f"{nom}_tronc", 0.22 * h / 7, h * 0.55, (0, 0, h * 0.275), ECORCE, coll, 12, rayon2=0.12 * h / 7)]
    for i in range(3):  # branches maîtresses
        a = i * 2.1 + random.uniform(0, 0.5)
        p.append(cylindre(f"{nom}_branche", 0.08, h * 0.3, (math.cos(a) * 0.4, math.sin(a) * 0.4, h * 0.62), ECORCE, coll, 8,
                          rayon2=0.04, rot=(math.cos(a + 1.57) * 0.6, math.sin(a + 1.57) * 0.6, 0)))
    for i in range(9):
        a = random.uniform(0, 6.28)
        r = random.uniform(0.2, 0.75) * couronne
        z = h * 0.68 + random.uniform(-0.15, 0.3) * couronne
        p.append(sphere(f"{nom}_houppier_{i}", couronne * random.uniform(0.45, 0.65),
                        (math.cos(a) * r, math.sin(a) * r, z), feuillage, coll, 3, (1, 1, 0.85), 0.18))
    return grouper(nom, p, loc, random.uniform(0, 6.28), coll)


def grouper(nom, pieces, loc, rot_z, coll):
    """Rassemble les pièces sous un « empty » pour déplacer chaque meuble d'un bloc."""
    e = bpy.data.objects.new(nom, None)
    e.empty_display_type, e.empty_display_size = "PLAIN_AXES", 0.3
    coll.objects.link(e)
    for pc in pieces:
        pc.parent = e
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    return e


# ================================================================== architecture complémentaire

def deplacer(nom, loc):
    o = bpy.data.objects.get(nom)
    if o:
        o.location = loc


# La banque d'accueil passe à droite du poteau, en marbre et chêne.
deplacer("Accueil", (11.5, -7.6, 0.55))
deplacer("Accueil_plateau", (11.5, -7.6, 1.13))
if bpy.data.objects.get("Accueil"):
    bpy.data.objects["Accueil"].data.materials[0] = CHENE
    bpy.data.objects["Accueil_plateau"].data.materials[0] = MARBRE

# Parquet de chêne au 1er étage (autour de l'atrium).
for nom, taille, loc in (
    ("Parquet_N1_avant", (40, 7, 0.02), (0, -8.5, NIVEAU_1 + 0.01)),
    ("Parquet_N1_arriere", (40, 7, 0.02), (0, 8.5, NIVEAU_1 + 0.01)),
    ("Parquet_N1_gauche", (12, 10, 0.02), (-14, 0, NIVEAU_1 + 0.01)),
    ("Parquet_N1_droite", (12, 10, 0.02), (14, 0, NIVEAU_1 + 0.01)),
):
    boite(nom, taille, loc, PARQUET, C_ARCHI)

# Toit-terrasse : dalles sur plots, deck bois autour de l'atrium.
for nom, taille, loc in (
    ("Terrasse_avant", (40, 10, 0.04), (0, -10, TOIT + 0.02)),
    ("Terrasse_arriere", (40, 7, 0.04), (0, 8.5, TOIT + 0.02)),
    ("Terrasse_gauche", (12, 10, 0.04), (-14, 0, TOIT + 0.02)),
    ("Terrasse_droite", (12, 10, 0.04), (14, 0, TOIT + 0.02)),
):
    boite(nom, taille, loc, DALLES_EXT, C_ARCHI)

# Escalier sculptural de l'atrium : volée droite le long du bord arrière, du RDC au 1er étage.
marches, h_marche, g_marche, largeur = 33, NIVEAU_1 / 33, 0.36, 1.5
x0 = -5.9
for k in range(marches):
    boite("Escalier_marche", (g_marche + 0.02, largeur, 0.06), (x0 + k * g_marche, 4.1, (k + 1) * h_marche - 0.03), CHENE, C_ARCHI, arrondi=0.008)
limon_long = math.hypot(marches * g_marche, NIVEAU_1)
angle = math.atan2(NIVEAU_1, marches * g_marche)
for y in (3.33, 4.87):
    boite("Escalier_limon", (limon_long, 0.04, 0.32), (x0 + marches * g_marche / 2 - 0.2, y, NIVEAU_1 / 2 - 0.1), METAL, C_ARCHI, rot=(0, -angle, 0))
boite("Escalier_garde_corps", (limon_long, 0.02, 1.0), (x0 + marches * g_marche / 2 - 0.2, 3.3, NIVEAU_1 / 2 + 0.65), VITRAGE, C_ARCHI, rot=(0, -angle, 0))
boite("Escalier_palier", (2.2, largeur, 0.2), (x0 + marches * g_marche + 1.0, 4.1, NIVEAU_1 - 0.1), BETON, C_ARCHI)
boite("Escalier_main_courante", (limon_long, 0.05, 0.04), (x0 + marches * g_marche / 2 - 0.2, 3.3, NIVEAU_1 / 2 + 1.17), LAITON, C_ARCHI, rot=(0, -angle, 0))

# ================================================================== hall (rez-de-chaussée, côté entrée)

tapis("Hall_tapis", (5.2, 3.6), (-13.5, -8.4, 0), C_HALL)
canape("Hall_canape", (-13.5, -6.9, 0), 0, C_HALL, LIN, 3)
fauteuil("Hall_fauteuil_1", (-16.2, -9.0, 0), math.radians(70), C_HALL)
fauteuil("Hall_fauteuil_2", (-10.8, -9.0, 0), math.radians(-70), C_HALL, TERRACOTTA)
table_basse("Hall_table_basse", (-13.5, -8.8, 0), C_HALL)
for i, (x, y) in enumerate(((-17.8, -10.8), (-9.2, -10.8), (5.5, -10.8), (17.8, -10.8), (-7.2, -4.3), (7.2, -4.3))):
    plante(f"Hall_plante_{i}", (x, y, 0), C_HALL, random.uniform(1.5, 2.3), 0.32)
for i, x in enumerate((9.8, 11.5, 13.2)):
    suspension(f"Accueil_suspension_{i}", (x, -7.6, 3.3), C_HALL, 2.1, 0.22)
cylindre("Accueil_logo_mur", 0.9, 0.02, (11.5, -5.25, 3.0), LAITON, C_HALL, 64, rot=(math.pi / 2, 0, 0))

# Arbre d'intérieur dans l'atrium, dans une grande jardinière.
cylindre("Atrium_jardiniere", 1.4, 0.55, (-3.5, 0.5, 0.275), BETON, C_HALL, 48)
cylindre("Atrium_terre", 1.32, 0.02, (-3.5, 0.5, 0.55), TERRE, C_HALL, 48)
arbre("Atrium_olivier", (-3.5, 0.5, 0.55), C_HALL, 4.6, 1.5, FEUILLAGE_CLAIR)
for i in range(6):
    a = i * 1.05
    sphere(f"Atrium_massif_{i}", 0.35, (-3.5 + math.cos(a) * 0.95, 0.5 + math.sin(a) * 0.95, 0.68), FEUILLAGE, C_HALL, 2, (1, 1, 0.6), 0.25)

# ================================================================== galerie

for i, x in enumerate((-9.0, 0.0, 9.0)):
    banc(f"Galerie_banc_{i}", (x, 8.6, 0), 0, C_GALERIE, 2.8, CUIR if i == 1 else CHENE)
for i, x in enumerate((-18.5, 18.5)):
    plante(f"Galerie_plante_{i}", (x, 10.6, 0), C_GALERIE, 2.2, 0.36)
# Socle avec maquette, au centre de la galerie.
boite("Galerie_socle", (1.2, 1.2, 1.0), (18.0, 6.5, 0.5), PLATRE, C_GALERIE)
boite("Galerie_vitrine", (1.15, 1.15, 0.8), (18.0, 6.5, 1.4), VITRAGE, C_GALERIE)
for k, (dx, dy, h) in enumerate(((-0.2, -0.15, 0.45), (0.15, 0.1, 0.3), (0.0, 0.25, 0.2))):
    boite("Galerie_maquette", (0.25, 0.25, h), (18.0 + dx, 6.5 + dy, 1.0 + h / 2), BLANC_MAT, C_GALERIE)

# ================================================================== atelier (1er étage, à gauche)

z1 = NIVEAU_1 + 0.02
for i, (dx, rot) in enumerate(((-2.0, 0), (0.0, 0), (2.0, 0), (-2.0, math.pi), (0.0, math.pi), (2.0, math.pi))):
    y = 3 + 1.65 if rot == 0 else 3 - 1.65
    chaise(f"Atelier_chaise_{i}", (-12 + dx, y, z1), rot, C_ATELIER)
for i, x in enumerate((-13.8, -12, -10.2)):
    suspension(f"Atelier_suspension_{i}", (x, 3, z1 + 2.3), C_ATELIER, 2.1, 0.28)
for i, y in enumerate((-9.5, -6.0, 6.5, 9.8)):
    bibliotheque(f"Atelier_bibliotheque_{i}", (-19.6, y, z1), math.pi / 2, C_ATELIER, 3.0, 2.4)
for i, x in enumerate((-16.5, -13.5, -10.5)):
    bureau(f"Atelier_bureau_{i}", (x, -9.8, z1), math.pi, C_ATELIER)
    chaise(f"Atelier_bureau_chaise_{i}", (x, -9.0, z1), 0, C_ATELIER, NOIR_MAT)
tapis("Atelier_tapis", (7.5, 4.2), (-12, 3, z1), C_ATELIER, mat=TAPIS)
plante("Atelier_plante_1", (-9.2, 9.8, z1), C_ATELIER, 2.0, 0.34)
plante("Atelier_plante_2", (-18.6, -1.5, z1), C_ATELIER, 1.6, 0.3)

# ================================================================== espace équipe (1er étage, à droite)

table("Equipe_table", (12, 6.2, z1), C_EQUIPE, 3.6, 1.2, mat=NOYER)
for i, dx in enumerate((-1.2, 0, 1.2)):
    chaise(f"Equipe_chaise_a{i}", (12 + dx, 5.3, z1), math.pi, C_EQUIPE, CUIR)
    chaise(f"Equipe_chaise_b{i}", (12 + dx, 7.1, z1), 0, C_EQUIPE, CUIR)
# Suspensions hautes : la caméra Vue_07 regarde les portraits par-dessus la table.
for i, x in enumerate((10.8, 13.2)):
    suspension(f"Equipe_suspension_{i}", (x, 6.2, z1 + 3.4), C_EQUIPE, 1.1, 0.3)
for i, x in enumerate((10.5, 13.5, 16.5)):
    bureau(f"Equipe_bureau_{i}", (x, -9.8, z1), math.pi, C_EQUIPE)
    chaise(f"Equipe_bureau_chaise_{i}", (x, -9.0, z1), 0, C_EQUIPE, NOIR_MAT)
canape("Equipe_canape", (17.8, 0, z1), -math.pi / 2, C_EQUIPE, VELOURS, 2)
table_basse("Equipe_table_basse", (16.4, 0, z1), C_EQUIPE, 0.4, CHENE)
plante("Equipe_plante_1", (9.2, 10.6, z1), C_EQUIPE, 2.0, 0.34)
plante("Equipe_plante_2", (18.7, 10.6, z1), C_EQUIPE, 1.7, 0.3)

# ================================================================== toit-terrasse

zt = TOIT + 0.04
for i, x in enumerate((-18.5, -12.5, -6.5, 6.5, 12.5, 18.5)):  # jardinières de graminées le long de la façade
    boite(f"Toit_jardiniere_{i}", (4.6, 0.9, 0.55), (x if abs(x) > 8 else x, -14.2, zt + 0.275), POT, C_TOIT)
    for k in range(7):
        sphere(f"Toit_graminees_{i}_{k}", 0.28, (x - 1.95 + k * 0.65, -14.2, zt + 0.7), GRAMINEES, C_TOIT, 2, (1, 1, 1.5), 0.35)
for i, x in enumerate((8.5, 10.0, 11.5)):
    transat(f"Toit_transat_{i}", (x, -10.6, zt), 0, C_TOIT)
table("Toit_table", (-13, -9.5, zt), C_TOIT, 2.4, 1.0, mat=DECK)
for i, dx in enumerate((-0.8, 0.8)):
    chaise(f"Toit_chaise_a{i}", (-13 + dx, -10.4, zt), math.pi, C_TOIT, DECK)
    chaise(f"Toit_chaise_b{i}", (-13 + dx, -8.6, zt), 0, C_TOIT, DECK)
# Pergola légère au-dessus de la table.
for sx in (-1, 1):
    for sy in (-1, 1):
        boite("Toit_pergola_poteau", (0.1, 0.1, 2.6), (-13 + sx * 2, -9.5 + sy * 1.5, zt + 1.3), METAL, C_TOIT)
for k in range(12):
    boite("Toit_pergola_lame", (4.2, 0.06, 0.18), (-13, -10.9 + k * 0.26, zt + 2.65), DECK, C_TOIT)
for i, (x, y) in enumerate(((-4.0, -6.0), (4.0, -6.0), (18, 10), (-18, 10))):
    plante(f"Toit_olivier_{i}", (x, y, zt), C_TOIT, 2.4, 0.45, POT, FEUILLAGE_CLAIR)

# ================================================================== abords

# Le sol existant devient une pelouse ; on ajoute rue, trottoirs et allée d'entrée.
boite("Rue", (400, 12, 0.02), (0, -62, 0.0), BITUME, C_PAYSAGE)
boite("Trottoir", (400, 4, 0.12), (0, -54, 0.06), TROTTOIR, C_PAYSAGE)
boite("Allee_entree", (8, 22, 0.03), (0, -42, 0.015), PARVIS, C_PAYSAGE)
for i in range(-9, 10):  # marquage au sol
    boite("Rue_marquage", (3, 0.15, 0.005), (i * 8, -62, 0.012), BLANC_MAT, C_PAYSAGE)

# Arbres d'alignement le long du trottoir et bosquets autour du parvis.
for i, x in enumerate(range(-60, 61, 12)):
    if abs(x) < 6 or abs(x + 28) < 10:  # dégager l'allée et la caméra d'arrivée
        continue
    arbre(f"Arbre_rue_{i}", (x, -54.5, 0.12), C_PAYSAGE, random.uniform(7, 9), random.uniform(2.4, 3.0))
for i, (x, y) in enumerate(((24, -20), (27, -30), (-27, -20), (-38, -30), (30, -6), (-31, -4), (26, 10), (-27, 12), (16, -40), (-44, -14))):
    arbre(f"Arbre_jardin_{i}", (x, y, 0), C_PAYSAGE, random.uniform(6, 9), random.uniform(2.2, 3.2), random.choice((FEUILLAGE, FEUILLAGE_CLAIR)))

# Haies basses qui cadrent le parvis.
for i, (x, l) in enumerate(((-25, 10), (25, 10))):
    boite(f"Haie_{i}", (1.0, l * 2.6, 1.0), (x * 1.04, -29, 0.5), FEUILLAGE, C_PAYSAGE, arrondi=0.3)
# Massifs de graminées le long du bassin.
for k in range(16):
    sphere(f"Massif_{k}", random.uniform(0.35, 0.5), (-21.5 + k * 0.98, -28.2 + random.uniform(-0.3, 0.3), 0.3), GRAMINEES, C_PAYSAGE, 2, (1, 1, 1.3), 0.35)

# Bancs, bornes lumineuses et lampadaires.
for i, (x, y, r) in enumerate(((-8, -30, 0), (8, -30, 0), (-14, -38, 0), (14, -38, 0))):
    banc(f"Parvis_banc_{i}", (x, y, 0), r, C_PAYSAGE, 2.4, CHENE, BETON)
for i, x in enumerate((-4.5, 4.5)):
    for k, y in enumerate((-36, -42, -48)):
        borne(f"Borne_{i}_{k}", (x, y, 0), C_PAYSAGE)
for i, x in enumerate(range(-54, 55, 18)):
    lampadaire(f"Lampadaire_{i}", (x, -55.5, 0.12), C_PAYSAGE)

# Silhouette de ville au loin, gardée simple.
for i in range(70):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(110, 260)
    x, y = math.cos(a) * r, math.sin(a) * r
    if y < -40 and abs(x) < 90:
        continue
    h = random.uniform(8, 45)
    l, p = random.uniform(12, 30), random.uniform(12, 30)
    boite(f"Immeuble_{i}", (l, p, h), (x, y, h / 2), VILLE if random.random() > 0.35 else VILLE_VITRES, C_VILLE, rot=(0, 0, random.choice((0, 0.26, 0.52))))

# Le sol de base est agrandi pour que la pelouse rejoigne l'horizon.
sol = bpy.data.objects.get("Sol_exterieur")
if sol:
    sol.scale = (8, 8, 1)
    # 10 cm sous les planchers et découpé en grille : sur le site (WebGL), un seul immense
    # triangle perd en précision de profondeur et la pelouse transperçait le sol du hall.
    sol.location.z = -0.1
    if len(sol.data.polygons) == 1:
        bm = bmesh.new()
        bm.from_mesh(sol.data)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=31, use_grid_fill=True)
        bm.to_mesh(sol.data)
        bm.free()

# ================================================================== lumière et ciel

scene = bpy.context.scene
monde = scene.world or bpy.data.worlds.new("Monde")
scene.world = monde
monde.use_nodes = True
wn = monde.node_tree
wn.nodes.clear()
ciel = wn.nodes.new("ShaderNodeTexSky")
if "MULTIPLE_SCATTERING" in ciel.bl_rna.properties["sky_type"].enum_items.keys():
    ciel.sky_type = "MULTIPLE_SCATTERING"
elif "NISHITA" in ciel.bl_rna.properties["sky_type"].enum_items.keys():
    ciel.sky_type = "NISHITA"
ciel.sun_elevation = math.radians(28)
ciel.sun_rotation = math.radians(205)
if hasattr(ciel, "sun_intensity"):
    ciel.sun_intensity = 0.6
fond = wn.nodes.new("ShaderNodeBackground")
fond.inputs["Strength"].default_value = 0.35
sortie = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(ciel.outputs["Color"], fond.inputs["Color"])
wn.links.new(fond.outputs["Background"], sortie.inputs["Surface"])

soleil = bpy.data.objects.get("Soleil_Creativ")
if soleil:
    soleil.data.energy = 4.0
    soleil.data.angle = math.radians(0.6)
    soleil.data.color = (1.0, 0.93, 0.84)
    # Même direction que le soleil du ciel : élévation 28°, azimut 205°.
    soleil.rotation_euler = Euler((math.radians(90 - 28), 0, math.radians(205 - 180)), "XYZ")

# Lumières intérieures douces (plafonniers) à chaque niveau.
def plafonnier(nom, loc, taille, puissance):
    d = bpy.data.lights.new(nom, "AREA")
    d.shape, d.size, d.size_y = "RECTANGLE", taille[0], taille[1]
    d.energy, d.color = puissance, (1.0, 0.88, 0.74)
    o = bpy.data.objects.new(nom, d)
    o.location = loc
    C_LUMIERES.objects.link(o)


for nom, loc in (("Plafond_hall_g", (-13, -8.5, 5.4)), ("Plafond_hall_d", (13, -8.5, 5.4)),
                 ("Plafond_galerie_g", (-12, 8.5, 5.4)), ("Plafond_galerie_d", (12, 8.5, 5.4)),
                 ("Plafond_atelier", (-14, 0, 10.4)), ("Plafond_equipe", (14, 0, 10.4)),
                 ("Plafond_N1_avant", (0, -8.5, 10.4)), ("Plafond_N1_arriere", (0, 8.5, 10.4))):
    plafonnier(nom, loc, (10, 5), 900)
for i, x in enumerate((-13.6, -6.8, 0, 6.8, 13.6)):  # éclairage rasant des cadres de la galerie
    d = bpy.data.lights.new(f"Galerie_spot_{i}", "SPOT")
    d.energy, d.spot_size, d.spot_blend, d.color = 600, math.radians(70), 0.6, (1.0, 0.92, 0.82)
    o = bpy.data.objects.new(f"Galerie_spot_{i}", d)
    o.location = (x, 9.5, 5.2)
    o.rotation_euler = Euler((math.radians(35), 0, math.radians(180)), "XYZ")
    C_LUMIERES.objects.link(o)

# Réglages de rendu : EEVEE avec lancer de rayons pour l'aperçu, vue « AgX » réaliste.
if hasattr(scene, "eevee"):
    ev = scene.eevee
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 64)):
        if hasattr(ev, attr):
            setattr(ev, attr, val)
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
scene.view_settings.exposure = -1.6
if hasattr(scene, "cycles"):
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True

print(f"Creativ réalisme : {len(RACINE.all_objects)} objets ajoutés.")
