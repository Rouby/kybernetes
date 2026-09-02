export const FLAT_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
void main() {
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const FLAT_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  fragColor = u_color;
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
out vec4 fragColor;

void main() {
  if (u_isVacuum > 0.5) {
    // FTL signature diagonal hazard vacuum stripes
    float stripe = step(0.5, fract((v_worldPos.x + v_worldPos.y - u_time * 24.0) / 28.0));
    vec3 vacColor = mix(vec3(1.0, 0.78, 0.82), vec3(0.92, 0.48, 0.52), stripe);
    fragColor = vec4(vacColor, 1.0);
    return;
  }

  // 35px FTL grid tiles
  vec2 coord = v_worldPos / 35.0;
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);

  vec3 col = mix(u_floorColor, vec3(0.70, 0.76, 0.84), clamp(line * 0.9, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
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
out vec4 fragColor;
void main() {
  float dist = length(v_uv - vec2(0.5));
  float alpha = clamp(1.0 - dist * 2.0, 0.0, 1.0);
  float core = pow(alpha, 2.5);
  vec3 glow = u_color.rgb + vec3(core * 0.8);
  fragColor = vec4(glow, alpha * u_color.a);
}
`;
