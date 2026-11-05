import {
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Vector2,
  type DepthTexture,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Rendu « photo » : ce qui fait qu'une image paraît prise par un appareil plutôt que calculée.
// - flou de profondeur doux quand la caméra s'arrête (ordinateur), comme un objectif ;
// - étalonnage (contraste en S, ombres légèrement froides, hautes lumières chaudes), vignettage
//   et grain de pellicule très fin, après la conversion en couleurs d'écran.

/** Flou de profondeur : lit la profondeur déjà rendue par les ombres de contact (GTAO). */
export function creerFlouProfondeur(profondeur: DepthTexture, camera: PerspectiveCamera) {
  const passe = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null as Texture | null },
      tProfondeur: { value: profondeur },
      proche: { value: camera.near },
      loin: { value: camera.far },
      mise: { value: 10 }, // distance de mise au point (m)
      force: { value: 0 }, // 0 = net partout, 1 = flou d'objectif complet
      rayonMax: { value: 5 }, // en pixels d'écran
      texel: { value: new Vector2(1 / innerWidth, 1 / innerHeight) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tDiffuse;
      uniform sampler2D tProfondeur;
      uniform float proche, loin, mise, force, rayonMax;
      uniform vec2 texel;
      varying vec2 vUv;
      float distanceA(vec2 uv) {
        float z = texture2D(tProfondeur, uv).x;
        return -perspectiveDepthToViewZ(z, proche, loin);
      }
      // Cercle de confusion en pixels : nul à la mise au point, plus fort devant que derrière.
      float flou(float d) {
        float c = (d - mise) / max(d, 0.001);
        c = c < 0.0 ? c * 1.2 : c * 0.8;
        return clamp(abs(c) * rayonMax, 0.0, rayonMax) * force;
      }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float c0 = flou(distanceA(vUv));
        if (force < 0.01) { gl_FragColor = base; return; }
        vec3 somme = base.rgb;
        float poids = 1.0;
        // Disque d'échantillons en spirale (angle d'or) : un bokeh rond, sans motif visible.
        const int N = 28;
        for (int i = 1; i < N; i++) {
          float r = sqrt(float(i) / float(N));
          float a = float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * r * rayonMax * texel;
          vec2 uv = vUv + o;
          float ci = flou(distanceA(uv));
          // Un point net ne déborde pas sur ses voisins : il ne compte que si son propre flou l'atteint.
          float w = smoothstep(r * rayonMax - 0.5, r * rayonMax + 0.5, max(min(ci, c0 + 1.0), ci * 0.5 + c0 * 0.5));
          somme += texture2D(tDiffuse, uv).rgb * w;
          poids += w;
        }
        gl_FragColor = vec4(somme / poids, base.a);
      }`,
  });
  // ShaderPass copie ses uniformes, textures comprises : on rebranche la vraie profondeur.
  passe.uniforms.tProfondeur.value = profondeur;
  let force = 0;
  let mise = 10;
  const dernier = { x: 0, y: 0, z: 0 };
  return {
    passe,
    /** À chaque image : le flou s'installe quand la caméra s'immobilise et s'efface quand elle bouge. */
    mettreAJour(dt: number, distanceMise: number, actif: boolean) {
      const p = camera.position;
      const vitesse = Math.hypot(p.x - dernier.x, p.y - dernier.y, p.z - dernier.z) / Math.max(dt, 1e-3);
      dernier.x = p.x;
      dernier.y = p.y;
      dernier.z = p.z;
      const voulue = actif && vitesse < 0.35 ? 1 : 0;
      force += (voulue - force) * (1 - Math.exp(-(voulue > force ? 1.6 : 6) * dt));
      mise += (distanceMise - mise) * (1 - Math.exp(-5 * dt));
      passe.uniforms.force.value = force;
      passe.uniforms.mise.value = mise;
      passe.enabled = force > 0.01;
    },
    redimensionner(largeur: number, hauteur: number) {
      passe.uniforms.texel.value.set(1 / largeur, 1 / hauteur);
      passe.uniforms.rayonMax.value = Math.max(2, Math.min(6, hauteur / 200));
    },
  };
}

/** Étalonnage, vignettage et grain, en couleurs d'écran (après la passe de sortie). */
export function creerEtalonnage() {
  const passe = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null as Texture | null },
      temps: { value: 0 },
      nuit: { value: 0 },
      grain: { value: 0.022 },
      vignette: { value: 0.28 },
      aspect: { value: innerWidth / innerHeight },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float temps, nuit, grain, vignette, aspect;
      varying vec2 vUv;
      float hasard(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // Contraste en S autour du gris moyen, noirs à peine relevés (rendu pellicule).
        vec3 s = c * c * (3.0 - 2.0 * c);
        c = mix(c, s, 0.28);
        c = c * 0.985 + 0.012;
        // Virage : ombres vers le bleu-vert, hautes lumières vers le doré (plus marqué le jour).
        float v = mix(1.0, 0.6, nuit);
        vec3 froid = vec3(-0.012, 0.0, 0.018) * v;
        vec3 chaud = vec3(0.022, 0.006, -0.02) * v;
        c += froid * (1.0 - smoothstep(0.0, 0.5, l)) + chaud * smoothstep(0.45, 1.0, l);
        // Saturation : un peu plus de vie le jour, plus retenue la nuit.
        l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, mix(1.06, 0.96, nuit));
        // Vignettage d'objectif.
        vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
        c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d) * 1.35);
        // Grain fin, surtout dans les tons moyens, renouvelé à chaque image.
        float g = hasard(vUv * 1000.0 + fract(temps) * 37.0) - 0.5;
        c += g * grain * (1.0 - abs(l - 0.45) * 1.4);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  return {
    passe,
    mettreAJour(temps: number, nuit: number) {
      passe.uniforms.temps.value = temps;
      passe.uniforms.nuit.value = nuit;
    },
    redimensionner(largeur: number, hauteur: number) {
      passe.uniforms.aspect.value = largeur / hauteur;
    },
  };
}

/**
 * Verre « photo » : le reflet du ciel et du quartier s'ajoute à ce qu'on voit au travers, au lieu
 * d'être atténué avec la transparence. Comme une vraie vitre, la façade reflète beaucoup sous un
 * angle rasant et presque pas en face.
 */
export function verreReflechissant(m: MeshStandardMaterial, intensite = 2.4) {
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMonde;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPosMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMonde;')
      .replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      // À l'intérieur (garde-corps, cloisons), le ciel du panorama ne se refléterait pas : reflet discret.
      bool dedans = abs(vPosMonde.x) < 19.5 && vPosMonde.z > -11.5 && vPosMonde.z < 11.5;
      vec3 refletVitre = (reflectedLight.directSpecular + reflectedLight.indirectSpecular) * (dedans ? 0.35 : ${intensite.toFixed(2)});
      vec3 corpsVitre = outgoingLight - reflectedLight.directSpecular - reflectedLight.indirectSpecular;
      float rasant = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 4.0);
      float alphaVitre = mix(diffuseColor.a, 0.55, rasant);
      gl_FragColor = vec4(corpsVitre * alphaVitre + refletVitre * (1.0 + 2.0 * rasant), alphaVitre);`,
    );
  };
  m.customProgramCacheKey = () => 'verre-photo';
  m.needsUpdate = true;
}
