# Creativ Lab Architects : export du bâtiment pour le site (public/modeles/creativ-batiment.glb)
#
# À lancer sur une COPIE du fichier, ou en ligne de commande, car le script transforme la scène
# (fusion des objets, matériaux cuits en images) :
#
#   blender -b creativ-batiment.blend -P creativ_export_web.py -- chemin/creativ-batiment.glb
#
# Étapes :
#   1. Les matériaux procéduraux (béton, terrazzo, bois, dallages, pelouse...) sont « cuits »
#      en petites textures répétables (couleur, et relief pour les sols et le béton banché).
#   2. Chaque objet reçoit des coordonnées de texture en projection cubique, à l'échelle réelle.
#   3. Les objets sont fusionnés par collection (quelques dizaines d'appels de dessin au lieu de
#      2 000), modificateurs appliqués. Les cadres et portraits restent séparés : le site les
#      retrouve par leur nom (Cadre_01..10, Portrait_01..04) pour y afficher les images.
#   4. Export glTF binaire, textures en WebP. La géométrie est ensuite compressée côté site :
#      npm run optimiser-modele (meshopt, environ 6 Mo → 2 Mo).

import os
import sys
from collections import defaultdict

import bpy
import numpy as np

SORTIE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(
    os.path.dirname(bpy.data.filepath) or os.getcwd(), "creativ-batiment.glb")

# nom du matériau : (plan de cuisson, largeur et hauteur du motif en mètres, résolution, relief)
# Les dimensions suivent la période des motifs (lames, dalles, banches) pour que la texture
# se répète sans couture visible.
CUISSON = {
    "Beton": ("XZ", 4.0, 4.0, 512, False),
    "Beton_sombre": ("XZ", 4.82, 4.82, 1024, True),
    "Sol_interieur": ("XY", 2.0, 2.0, 1024, False),
    "Parvis": ("XY", 4.8, 4.8, 1024, True),
    "Sol_exterieur": ("XY", 8.0, 8.0, 512, False),
    "Chene": ("XY", 1.0, 1.0, 512, False),
    "Noyer": ("XY", 1.0, 1.0, 512, False),
    "Deck_bois": ("XY", 2.0, 2.0, 512, False),
    "Parquet_chene": ("XY", 3.2, 3.24, 1024, True),
    "Marbre": ("XY", 2.0, 2.0, 512, False),
    "Dalles_terrasse": ("XY", 2.4, 2.4, 1024, True),
    "Bitume": ("XY", 4.0, 4.0, 512, False),
    "Trottoir": ("XY", 2.0, 2.0, 512, True),
    "Pot_beton": ("XZ", 2.0, 2.0, 256, False),
    "Feuillage": ("XY", 2.0, 2.0, 256, False),
    "Feuillage_clair": ("XY", 2.0, 2.0, 256, False),
    "Graminees": ("XY", 2.0, 2.0, 256, False),
    "Ville_facades": ("XZ", 9.6, 10.2, 512, False),
    "Ville_vitres": ("XZ", 9.6, 10.2, 512, False),
}

# Motifs réguliers déjà périodiques (dalles, lames, fenêtres) : pas besoin de fondre les bords.
PERIODIQUES = {"Parvis", "Parquet_chene", "Dalles_terrasse", "Trottoir", "Ville_facades", "Ville_vitres"}

# Rugosité moyenne des matériaux dont la rugosité vient d'une texture procédurale.
RUGOSITE = {"Beton": 0.82, "Beton_sombre": 0.82, "Bitume": 0.82, "Pot_beton": 0.82,
            "Ville_facades": 0.5, "Ville_vitres": 0.5}

scene = bpy.context.scene

# ================================================================== 1. cuisson des matériaux


def plan_de_cuisson(materiau, orientation, largeur, hauteur):
    me = bpy.data.meshes.new("_cuisson")
    if orientation == "XY":
        sommets = [(0, 0, 0), (largeur, 0, 0), (largeur, hauteur, 0), (0, hauteur, 0)]
    else:
        sommets = [(0, 0, 0), (largeur, 0, 0), (largeur, 0, hauteur), (0, 0, hauteur)]
    me.from_pydata(sommets, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = c
    me.materials.append(materiau)
    o = bpy.data.objects.new("_cuisson", me)
    scene.collection.objects.link(o)
    return o


def raccorder(img):
    """Rend une texture répétable sans couture : chaque bord est fondu avec la même image
    décalée d'une demi-largeur, dont le centre est continu (une direction après l'autre)."""
    largeur, hauteur = img.size
    px = np.empty(largeur * hauteur * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(hauteur, largeur, 4)
    for axe, n in ((1, largeur), (0, hauteur)):
        poids = 1 - np.abs(1 - 2 * np.arange(n) / n)  # 0 au bord, 1 au centre
        poids = poids * poids * (3 - 2 * poids)
        forme = [1, 1, 1]
        forme[axe] = n
        poids = poids.reshape(forme)
        px = px * poids + np.roll(px, n // 2, axis=axe) * (1 - poids)
    img.pixels.foreach_set(px.astype(np.float32).ravel())


def cuire(materiau, orientation, largeur, hauteur, resolution, avec_relief):
    o = plan_de_cuisson(materiau, orientation, largeur, hauteur)
    for autre in bpy.context.view_layer.objects:
        autre.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    nt = materiau.node_tree
    images = {}
    passes = [("couleur", "DIFFUSE")] + ([("relief", "NORMAL")] if avec_relief else [])
    for nom, type_cuisson in passes:
        img = bpy.data.images.new(f"{materiau.name}_{nom}", resolution, resolution)
        if nom == "relief":
            img.colorspace_settings.name = "Non-Color"
        noeud = nt.nodes.new("ShaderNodeTexImage")
        noeud.image = img
        nt.nodes.active = noeud
        if type_cuisson == "DIFFUSE":
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=0, use_clear=True)
        else:
            bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=0, use_clear=True)
        nt.nodes.remove(noeud)
        if materiau.name not in PERIODIQUES:
            raccorder(img)
        img.pack()
        images[nom] = img
    bpy.data.objects.remove(o, do_unlink=True)
    return images


def materiau_cuit(materiau, images):
    """Remplace le réseau procédural par des textures, en gardant métal et rugosité."""
    nt = materiau.node_tree
    ancien = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    metal = ancien.inputs["Metallic"].default_value
    rugosite = RUGOSITE.get(materiau.name, ancien.inputs["Roughness"].default_value)
    nt.nodes.clear()
    sortie = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rugosite
    nt.links.new(bsdf.outputs["BSDF"], sortie.inputs["Surface"])
    couleur = nt.nodes.new("ShaderNodeTexImage")
    couleur.image = images["couleur"]
    nt.links.new(couleur.outputs["Color"], bsdf.inputs["Base Color"])
    if "relief" in images:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = images["relief"]
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
scene.render.bake.margin = 0
for nom, (orientation, largeur, hauteur, resolution, avec_relief) in CUISSON.items():
    m = bpy.data.materials.get(nom)
    if m is None:
        print("matériau absent :", nom)
        continue
    materiau_cuit(m, cuire(m, orientation, largeur, hauteur, resolution, avec_relief))
    print("cuit :", nom)

# ================================================================== 2 et 3. fusion et projection


def a_garder_seul(o):
    return (o.name.startswith("Cadre_") and not o.name.endswith("_bordure")) or o.name.startswith("Portrait_")


def projection_cubique(position, normale, largeur, hauteur):
    ax, ay, az = abs(normale.x), abs(normale.y), abs(normale.z)
    if az >= ax and az >= ay:
        u, v = position.x, position.y
    elif ax >= ay:
        u, v = position.y, position.z
    else:
        u, v = position.x, position.z
    return u / largeur, v / hauteur


depsgraph = bpy.context.evaluated_depsgraph_get()
groupes = defaultdict(lambda: {"sommets": [], "faces": [], "uv": [], "normales": [], "mats": [], "index_mat": {}})
seuls = []

for o in list(scene.objects):
    if o.type != "MESH" or not o.visible_get() or o.hide_render:
        continue
    if a_garder_seul(o):
        seuls.append(o)
        continue
    # Les très grandes surfaces (sol extérieur) restent seules : la compression arrondit les
    # positions à l'échelle de chaque objet, et le sol ferait disparaître le plancher voisin.
    g = groupes[o.name if max(o.dimensions) > 300 else o.users_collection[0].name]
    oe = o.evaluated_get(depsgraph)
    me = oe.to_mesh()
    mw = o.matrix_world
    rot = mw.to_3x3().inverted_safe().transposed()
    depart = len(g["sommets"])
    g["sommets"].extend(mw @ v.co for v in me.vertices)
    normales_coins = [(rot @ n.vector).normalized() for n in me.corner_normals]
    for p in me.polygons:
        slot = oe.material_slots[p.material_index].material if oe.material_slots else None
        cle = slot.name if slot else ""
        if cle not in g["index_mat"]:
            g["index_mat"][cle] = len(g["index_mat"])
        largeur, hauteur = CUISSON.get(cle, (None, 1.0, 1.0))[1:3]
        normale = (rot @ p.normal).normalized()
        g["faces"].append([depart + i for i in p.vertices])
        g["mats"].append(g["index_mat"][cle])
        for li in p.loop_indices:
            pos = g["sommets"][depart + me.loops[li].vertex_index]
            g["uv"].extend(projection_cubique(pos, normale, largeur, hauteur))
            g["normales"].append(normales_coins[li])
    oe.to_mesh_clear()

# Les cadres et portraits : coordonnées de texture 0..1 pour y poser les images.
for o in seuls:
    me = o.data
    if not me.uv_layers:
        uv = me.uv_layers.new(name="UVMap")
        for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)][: len(uv.data)]):
            uv.data[i].uv = c
    if o.parent:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw

# On retire tout le reste, puis on recrée un objet fusionné par collection.
for o in list(scene.objects):
    if o not in seuls:
        bpy.data.objects.remove(o, do_unlink=True)
for coll in list(bpy.data.collections):
    for o in seuls:
        if o.name in coll.objects:
            coll.objects.unlink(o)
            scene.collection.objects.link(o)
    bpy.data.collections.remove(coll)

total = 0
for nom, g in groupes.items():
    me = bpy.data.meshes.new(nom)
    me.from_pydata([tuple(v) for v in g["sommets"]], [], g["faces"])
    for cle in sorted(g["index_mat"], key=g["index_mat"].get):
        me.materials.append(bpy.data.materials.get(cle))
    me.polygons.foreach_set("material_index", g["mats"])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", g["uv"])
    me.normals_split_custom_set([tuple(n) for n in g["normales"]])
    me.validate(clean_customdata=False)
    o = bpy.data.objects.new(nom, me)
    scene.collection.objects.link(o)
    me.calc_loop_triangles()
    total += len(me.loop_triangles)
    print(f"{nom} : {len(me.loop_triangles)} triangles, {len(me.materials)} matériaux")
print("triangles au total :", total)

# ================================================================== 4. export

options = dict(
    filepath=SORTIE,
    export_format="GLB",
    export_image_format="WEBP",
    export_image_quality=82,
    export_cameras=False,
    export_lights=False,
    export_apply=True,
    export_yup=True,
)
bpy.ops.export_scene.gltf(**options)
print("fichier :", SORTIE, round(os.path.getsize(SORTIE) / 1e6, 2), "Mo")
