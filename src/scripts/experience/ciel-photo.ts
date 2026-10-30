import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Fog,
} from 'three';

// Ciel photo derrière le décor : une image HDRI de Poly Haven (ciel seul, sans le soleil, qui reste
// celui du site), préparée dans Blender par creativ_ciel_web.py. Le dôme suit la caméra : le ciel
// est à l'infini. Il prend la teinte de l'ambiance (aube, crépuscule, nuit) rapportée au ciel de
// midi, et se fond dans le brouillard à l'horizon pour que la ville lointaine s'y raccorde.

const CIEL_MIDI = new Color('#cfe0ee');

export function creerCielPhoto(fog: Fog) {
  const materiau = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      carte: { value: null },
      teinte: { value: new Color(1, 1, 1) },
      brume: { value: fog.color },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      varying vec2 vUv;
      void main() {
        vDirection = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // toujours au fond
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D carte;
      uniform vec3 teinte;
      uniform vec3 brume;
      varying vec3 vDirection;
      varying vec2 vUv;
      void main() {
        vec3 ciel = texture2D(carte, vUv).rgb * teinte;
        float hauteur = smoothstep(-0.02, 0.22, vDirection.y);
        gl_FragColor = vec4(mix(brume, ciel, hauteur), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new Mesh(new SphereGeometry(500, 48, 24), materiau);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.visible = false;
  dome.onBeforeRender = (_r, _s, camera) => dome.position.copy(camera.position);

  new TextureLoader().load(
    '/modeles/ciel-fond.webp',
    (t) => {
      t.colorSpace = SRGBColorSpace;
      materiau.uniforms.carte.value = t;
      dome.visible = true;
    },
    undefined,
    () => {}, // pas de ciel photo : le fond uni du site reste
  );

  return {
    dome,
    /** Suit la couleur du ciel de l'ambiance courante. */
    reglerCiel(ciel: Color) {
      const t = materiau.uniforms.teinte.value as Color;
      t.setRGB(ciel.r / CIEL_MIDI.r, ciel.g / CIEL_MIDI.g, ciel.b / CIEL_MIDI.b);
    },
  };
}
