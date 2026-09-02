export const FLAT_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
out vec2 v_worldPos;
void main() {
  v_worldPos = a_position;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const FLAT_FS = `#version 300 es
precision highp float;
in vec2 v_worldPos;
uniform vec4 u_color;
uniform vec4 u_projLights[6]; // xy = pos, z = radius, w = intensity
uniform vec3 u_projColors[6];
out vec4 fragColor;

void main() {
  // Dynamic bright glow on walls, blast doors, and pawns from passing laser energy
  vec3 lightAccum = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (u_projLights[i].z <= 0.0) continue;
    float d = length(v_worldPos - u_projLights[i].xy);
    if (d < u_projLights[i].z) {
      float atten = 1.0 - d / u_projLights[i].z;
      lightAccum += u_projColors[i] * (atten * atten * u_projLights[i].w);
    }
  }

  vec3 litRgb = u_color.rgb + lightAccum * 0.85;
  fragColor = vec4(litRgb, u_color.a);
}
`;

export const STARFIELD_VS = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const STARFIELD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_camera;
uniform float u_time;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 worldCoord = (v_uv * u_resolution + u_camera * 0.25);
  vec3 bg = vec3(0.015, 0.02, 0.04);

  // Subtle nebula clouds
  float neb = sin(worldCoord.x * 0.0015) * cos(worldCoord.y * 0.0015);
  bg += vec3(0.01, 0.02, 0.035) * max(0.0, neb + 0.5);

  // Layer 1: Distant small stars
  vec2 cell1 = floor(worldCoord / 60.0);
  float h1 = hash(cell1);
  if (h1 > 0.88) {
    vec2 pos1 = (cell1 + vec2(hash(cell1 + 1.0), hash(cell1 + 2.0))) * 60.0;
    float d1 = length(worldCoord - pos1);
    float twinkle = 0.7 + 0.3 * sin(u_time * 2.0 + h1 * 6.28);
    bg += vec3(0.9, 0.95, 1.0) * max(0.0, 1.0 - d1 / 1.5) * twinkle;
  }

  // Layer 2: Closer brighter stars
  vec2 cell2 = floor((worldCoord * 1.5) / 120.0);
  float h2 = hash(cell2 + 9.0);
  if (h2 > 0.93) {
    vec2 pos2 = (cell2 + vec2(hash(cell2 + 4.0), hash(cell2 + 5.0))) * 80.0;
    float d2 = length(worldCoord - pos2);
    float twinkle = 0.8 + 0.4 * sin(u_time * 3.0 + h2 * 6.28);
    bg += vec3(0.6, 0.85, 1.0) * max(0.0, 1.0 - d2 / 2.2) * twinkle;
  }

  fragColor = vec4(bg, 1.0);
}
`;

export const DECK_FLOOR_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
out vec2 v_worldPos;
void main() {
  v_worldPos = a_position;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const DECK_FLOOR_FS = `#version 300 es
precision highp float;
in vec2 v_worldPos;
uniform vec3 u_floorColor;
uniform float u_isVacuum;
uniform float u_time;
uniform vec4 u_projLights[6]; // xy = pos, z = radius, w = intensity
uniform vec3 u_projColors[6];

out vec4 fragColor;

void main() {
  vec3 baseColor;
  if (u_isVacuum > 0.5) {
    // FTL signature diagonal hazard vacuum stripes
    float stripe = step(0.5, fract((v_worldPos.x + v_worldPos.y - u_time * 24.0) / 28.0));
    baseColor = mix(vec3(1.0, 0.78, 0.82), vec3(0.92, 0.48, 0.52), stripe);
  } else {
    // 35px FTL grid tiles
    vec2 coord = v_worldPos / 35.0;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = 1.0 - min(min(grid.x, grid.y), 1.0);
    baseColor = mix(u_floorColor, vec3(0.70, 0.76, 0.84), clamp(line * 0.9, 0.0, 1.0));
  }

  // Subtle localized floor glow from nearby laser fire
  vec3 lightAccum = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (u_projLights[i].z <= 0.0) continue;
    float d = length(v_worldPos - u_projLights[i].xy);
    if (d < u_projLights[i].z) {
      float atten = 1.0 - d / u_projLights[i].z;
      atten = atten * atten * u_projLights[i].w;
      lightAccum += u_projColors[i] * atten;
    }
  }

  // A subtle glow on the floor (~28% intensity)
  vec3 finalColor = baseColor + lightAccum * 0.28;
  fragColor = vec4(finalColor, 1.0);
}
`;

export const PROJECTILE_VS = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_uv;
uniform mat3 u_matrix;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const PROJECTILE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec4 u_color;
uniform int u_style; // 0 = kinetic bullet, 1 = pulse laser, 2 = arc welder, 3 = raider plasma
uniform float u_time;
out vec4 fragColor;

void main() {
  float u = v_uv.x;
  float v = v_uv.y;

  if (u_style == 0) {
    // KINETIC CARBINE: Sleek normal bullet (solid metallic slug with hot nose)
    float bulletDist = sqrt(max(0.0, abs(u) - 0.4) / 0.6 * max(0.0, abs(u) - 0.4) / 0.6 + v * v);
    if (bulletDist > 1.0) discard;

    float tip = clamp((u + 1.0) * 0.5, 0.0, 1.0);
    vec3 brass = vec3(0.98, 0.76, 0.22);
    vec3 hotNose = vec3(1.0, 0.98, 0.85);
    vec3 col = mix(brass, hotNose, pow(tip, 3.0));
    float edge = 1.0 - smoothstep(0.7, 1.0, bulletDist);
    fragColor = vec4(col, edge * u_color.a);
    return;
  }

  if (u_style == 2) {
    // ARC WELDER: Short-range crackling electric ZAP
    float jitter = sin(u * 28.0 + u_time * 45.0) * 0.35 + cos(u * 55.0 - u_time * 30.0) * 0.2;
    float arcDist = abs(v - jitter);
    if (arcDist > 0.8) discard;

    float core = exp(-arcDist * arcDist * 20.0);
    float glow = exp(-arcDist * 3.5);
    vec3 elecBlue = vec3(0.1, 0.85, 1.0);
    vec3 violet = vec3(0.75, 0.4, 1.0);
    vec3 whiteHot = vec3(1.0, 1.0, 1.0);
    vec3 arcCol = mix(elecBlue, violet, sin(u * 10.0 + u_time * 20.0) * 0.5 + 0.5);
    vec3 emissive = arcCol * (glow * 2.5) + whiteHot * (core * 3.0);
    float alpha = clamp(core * 1.8 + glow, 0.0, 1.0) * u_color.a;
    fragColor = vec4(emissive, alpha);
    return;
  }

  // PULSE LASER & RAIDER PLASMA: Intense glowing capsule energy slug
  float segDist = max(0.0, abs(u) - 0.55) / 0.45;
  float d = sqrt(segDist * segDist + v * v);
  if (d > 1.0) discard;

  float core = exp(-d * d * 10.0);
  float innerGlow = exp(-d * d * 3.5);
  float outerHalo = exp(-d * 1.8);

  vec3 whiteHot = vec3(1.0, 1.0, 1.0);
  vec3 laserColor = mix(u_color.rgb, whiteHot, clamp(core * 1.5, 0.0, 1.0));
  vec3 emissive = laserColor * (innerGlow * 2.2 + outerHalo * 0.9) + whiteHot * (core * 2.5);
  float alpha = clamp(core * 1.5 + innerGlow + outerHalo * 0.4, 0.0, 1.0) * u_color.a;

  fragColor = vec4(emissive, alpha);
}
`;
