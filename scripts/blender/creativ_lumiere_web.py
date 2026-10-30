# Creativ Lab Architects : lumière précalculée pour le site (lightmaps)
#
# Appelé par creativ_export_web.py une fois les objets fusionnés, juste avant l'export.
# Cycles calcule pour l'architecture et le mobilier la lumière douce du ciel (avec ses ombres :
# coins, dessous des dalles, fond des pièces) et la lumière du soleil renvoyée par les sols et
# les murs. Le soleil direct, lui, reste calculé en direct sur le site parce qu'il suit l'heure.
#
# Chaque objet reçoit une seconde carte UV (« Lumiere », TEXCOORD_1 dans le glTF) et une image
# public/modeles/lumiere/<objet>.webp. Le fichier lumiere.json donne, pour chaque objet, l'image
# et l'échelle à appliquer (les valeurs sont stockées en 8 bits, racine gamma 2.2).
#
# Les unités suivent celles de three.js : le site retrouve la lumière d'un ciel dégagé en plein
# jour (HemisphereLight 1.44, soleil 3) avec lightMapIntensity = échelle.

import json
import math
import os
import time

import bpy
import numpy as np
from mathutils import Vector

# objet fusionné : résolution de son image
# (Galerie et Equipe ne sont que du métal, qui n'a pas de lumière diffuse : rien à calculer.)
CIBLES = {
    "Structure": 2048,
    "Archi_complements": 2048,
    "Paysage": 2048,
    "Interieur": 1024,
    "Mobilier_hall": 1024,
    "Mobilier_galerie": 512,
    "Mobilier_atelier": 2048,
    "Mobilier_equipe": 1024,
    "Mobilier_toit": 1024,
}
# Matériaux que la lumière traverse pendant le calcul.
TRANSPARENTS = {"Vitrage", "Vitre_voiture", "Eau", "Eau_jet"}

# Ambiance de midi du site (lumiere.ts) : ciel #cfe0ee, lumière ambiante 0.9 × 1.6,
# soleil #fff4e2 d'intensité 3 venant de (0, 70, 40) en coordonnées du site.
CIEL = (0.63, 0.75, 0.85)
AMBIANTE = 1.44
SOLEIL = (1.0, 0.905, 0.76)
SOLEIL_FORCE = 3.0
SOLEIL_VERS = Vector((0, -40, 70)).normalized()  # vers le soleil, en coordonnées Blender

ECHANTILLONS = int(os.environ.get("CREATIV_ECHANTILLONS", "192"))


def _monde(nom, couleur, force):
    w = bpy.data.worlds.get(nom) or bpy.data.worlds.new(nom)
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    fond = nt.nodes.new("ShaderNodeBackground")
    fond.inputs["Color"].default_value = (*couleur, 1)
    fond.inputs["Strength"].default_value = force
    sortie = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(fond.outputs["Background"], sortie.inputs["Surface"])
    return w


def _neutraliser_materiaux():
    """Verre et eau transparents, lampes et écrans éteints. Renvoie de quoi tout rétablir."""
    retour = []
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        sortie = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
        if sortie is None:
            continue
        if m.name in TRANSPARENTS:
            ancien = sortie.inputs["Surface"].links[0].from_socket if sortie.inputs["Surface"].links else None
            t = nt.nodes.new("ShaderNodeBsdfTransparent")
            nt.links.new(t.outputs["BSDF"], sortie.inputs["Surface"])
            retour.append(("verre", m, ancien, t))
            continue
        for n in nt.nodes:
            if n.type == "BSDF_PRINCIPLED" and n.inputs["Emission Strength"].default_value > 0:
                retour.append(("lampe", m, n, n.inputs["Emission Strength"].default_value))
                n.inputs["Emission Strength"].default_value = 0
            elif n.type == "EMISSION":
                retour.append(("lampe", m, n, n.inputs["Strength"].default_value))
                n.inputs["Strength"].default_value = 0
    return retour


def _retablir(retour):
    for genre, m, a, b in retour:
        if genre == "verre":
            nt = m.node_tree
            sortie = b.outputs["BSDF"].links[0].to_socket
            nt.nodes.remove(b)
            if a is not None:
                nt.links.new(a, sortie)
        else:
            cle = "Emission Strength" if a.type == "BSDF_PRINCIPLED" else "Strength"
            a.inputs[cle].default_value = b


def _aire_uv(me):
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    debut = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_start", debut)
    nombre = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_total", nombre)
    # Formule du lacet, sommée sur toutes les faces d'un coup.
    suivant = np.arange(len(uv)) + 1
    fin = debut + nombre
    suivant[fin - 1] = debut
    croix = uv[:, 0] * uv[suivant, 1] - uv[suivant, 0] * uv[:, 1]
    face = np.repeat(np.arange(len(me.polygons)), nombre)
    return float(np.abs(np.bincount(face, croix)).sum() / 2)


def _deplier(o, resolution):
    me = o.data
    rendu = me.uv_layers.active_render.name if me.uv_layers else None
    uv = me.uv_layers.get("Lumiere") or me.uv_layers.new(name="Lumiere")
    me.uv_layers.active = uv
    bpy.context.view_layer.update()
    for autre in bpy.context.scene.objects:
        autre.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    # Quelques pixels entre les îlots pour que la lumière d'une face ne déborde pas sur sa voisine.
    # Le mobilier compte des milliers de petits îlots (livres, pieds de chaises) : si la marge les
    # écrase, on la réduit.
    for pixels in (3, 1.5, 0.75):
        bpy.ops.uv.pack_islands(shape_method="CONCAVE", margin_method="FRACTION", margin=pixels / resolution,
                                rotate=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        couverture = _aire_uv(me)
        if couverture > 0.2:
            break
        bpy.ops.object.mode_set(mode="EDIT")
    if o.mode == "EDIT":
        bpy.ops.object.mode_set(mode="OBJECT")
    print(f"lumière : {o.name} dépliée, {couverture:.0%} de l'image utilisée (marge {pixels} px)")
    if rendu:
        me.uv_layers[rendu].active_render = True


def _cuire(o, resolution, filtre):
    img = bpy.data.images.new(f"_lumiere_{o.name}", resolution, resolution, float_buffer=True, alpha=True)
    img.generated_color = (0, 0, 0, 0)
    noeuds = []
    for m in o.data.materials:
        if m is None or not m.use_nodes:
            continue
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
        noeuds.append((m, n))
    bpy.ops.object.bake(type="DIFFUSE", pass_filter=filtre, margin=6, margin_type="EXTEND", use_clear=True)
    for m, n in noeuds:
        m.node_tree.nodes.remove(n)
    px = np.empty(resolution * resolution * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(resolution, resolution, 4)


def _lisser(e, couvert, rayon=2, sigma=1.1):
    """Atténue le bruit du calcul sans déborder sur le vide entre les îlots UV :
    flou gaussien pondéré par la couverture (convolution normalisée)."""
    k = np.exp(-0.5 * (np.arange(-rayon, rayon + 1) / sigma) ** 2)
    k /= k.sum()
    poids = couvert.astype(np.float32)[..., None]

    def flou(x):
        for axe in (0, 1):
            x = sum(np.roll(x, d, axis=axe) * k[d + rayon] for d in range(-rayon, rayon + 1))
        return x

    lisse = flou(e * poids) / np.maximum(flou(poids), 1e-4)
    return np.where(poids > 0, lisse, e)


def precalculer(dossier):
    scene = bpy.context.scene
    os.makedirs(dossier, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = ECHANTILLONS
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 1
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False

    monde_avant = scene.world
    ciel = _monde("_ciel_lumiere", CIEL, AMBIANTE / math.pi)
    noir = _monde("_noir_lumiere", (0, 0, 0), 0)
    soleil_donnees = bpy.data.lights.new("_soleil_lumiere", "SUN")
    soleil_donnees.energy = SOLEIL_FORCE
    soleil_donnees.color = SOLEIL
    soleil_donnees.angle = math.radians(1.5)
    soleil = bpy.data.objects.new("_soleil_lumiere", soleil_donnees)
    soleil.rotation_euler = (-SOLEIL_VERS).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(soleil)

    retour = _neutraliser_materiaux()
    index = {}
    for nom, resolution in CIBLES.items():
        o = bpy.data.objects.get(nom)
        if o is None or o.type != "MESH":
            print("lumière : objet absent", nom)
            continue
        debut = time.time()
        _deplier(o, resolution)
        # Ciel : lumière directe et renvoyée. Soleil : seulement la lumière renvoyée.
        scene.world = ciel
        soleil.hide_render = True
        a = _cuire(o, resolution, {"DIRECT", "INDIRECT"})
        scene.world = noir
        soleil.hide_render = False
        b = _cuire(o, resolution, {"INDIRECT"})
        # Blender donne la radiance renvoyée par un blanc parfait ; three.js attend l'éclairement
        # (π fois plus) pour sa lumière ambiante et ses lightmaps.
        e = (a[..., :3] + b[..., :3]) * math.pi
        couvert = np.maximum(a[..., 3], b[..., 3]) > 0
        e = _lisser(e, couvert)
        echelle = float(np.percentile(e[couvert], 99.5)) if couvert.any() else 1.0
        echelle = max(echelle, 1e-3)
        code = np.clip(e / echelle, 0, 1) ** (1 / 2.2)
        sortie = bpy.data.images.new(f"lumiere_{nom}", resolution, resolution, alpha=False)
        sortie.colorspace_settings.name = "Non-Color"
        rgba = np.concatenate([code, np.ones((resolution, resolution, 1), dtype=np.float32)], axis=2)
        sortie.pixels.foreach_set(rgba.astype(np.float32).ravel())
        sortie.file_format = "WEBP"
        scene.render.image_settings.quality = 85
        chemin = os.path.join(dossier, f"{nom}.webp")
        sortie.filepath_raw = chemin
        sortie.save(filepath=chemin, quality=85)
        bpy.data.images.remove(sortie)
        index[nom] = {"image": f"{nom}.webp", "echelle": round(echelle, 4)}
        print(f"lumière : {nom} {resolution}px, échelle {echelle:.3f}, {time.time() - debut:.0f} s")

    _retablir(retour)
    bpy.data.objects.remove(soleil, do_unlink=True)
    bpy.data.lights.remove(soleil_donnees)
    scene.world = monde_avant
    with open(os.path.join(dossier, "lumiere.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)
    return index
