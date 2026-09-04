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

export const ATMOS_CELL_VS = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
uniform mat3 u_matrix;
out vec4 v_color;

void main() {
  v_color = a_color;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const ATMOS_CELL_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
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
uniform int u_roomType;
uniform vec4 u_roomBounds; // xy = origin, zw = dimensions
uniform vec4 u_projLights[6]; // xy = pos, z = radius, w = intensity
uniform vec3 u_projColors[6];

out vec4 fragColor;

void main() {
  vec3 baseColor;

  if (u_roomType == 0) {
    // COMMAND BRIDGE: High-tech dark slate decking with cyan edge telemetry and central command circle
    vec2 coord = v_worldPos / 28.0;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = 1.0 - min(min(grid.x, grid.y), 1.0);
    vec3 bridgePlate = mix(vec3(0.11, 0.14, 0.20), vec3(0.18, 0.23, 0.32), clamp(line * 0.8, 0.0, 1.0));

    // Command helm dais concentric tactical ring (at helm vicinity x=220, y=290)
    float dCenter = length(v_worldPos - vec2(220.0, 290.0));
    float ring = smoothstep(1.5, 0.0, abs(dCenter - 48.0)) * 0.45;
    float innerRing = smoothstep(1.2, 0.0, abs(dCenter - 28.0)) * 0.35;
    baseColor = bridgePlate + vec3(0.0, 0.85, 1.0) * (ring + innerRing);

  } else if (u_roomType == 7) {
    // AVIONICS MATRIX: Server rack cooling channels with electric cyan data bus tracers
    vec2 avCoord = v_worldPos / 20.0;
    float busline = step(0.85, fract(avCoord.x)) + step(0.85, fract(avCoord.y * 0.5));
    vec3 avMetal = mix(vec3(0.10, 0.13, 0.18), vec3(0.16, 0.20, 0.28), clamp(busline * 0.6, 0.0, 1.0));
    float pulse = 0.5 + 0.5 * sin(v_worldPos.x * 0.1 + u_time * 4.0);
    baseColor = avMetal + vec3(0.0, 0.6, 0.9) * (step(0.92, fract(avCoord.x)) * pulse * 0.4);

  } else if (u_roomType == 8) {
    // LIFE SUPPORT & RECYCLER: Bio-dome drainage tiles with emerald green bioluminescent tracer lines
    vec2 bioCoord = v_worldPos / 24.0;
    vec2 bioGrid = abs(fract(bioCoord - 0.5) - 0.5) / fwidth(bioCoord);
    float bioLine = 1.0 - min(min(bioGrid.x, bioGrid.y), 1.0);
    vec3 bioBase = mix(vec3(0.11, 0.16, 0.13), vec3(0.16, 0.24, 0.19), clamp(bioLine * 0.7, 0.0, 1.0));

    // Bio-scrubber circular intake ring (around scrubber x=520, y=290)
    float dScrub = length(v_worldPos - vec2(520.0, 290.0));
    float scrubRing = smoothstep(1.5, 0.0, abs(dScrub - 38.0)) * 0.5;
    baseColor = bioBase + vec3(0.1, 0.9, 0.4) * scrubRing;

  } else if (u_roomType == 6) {
    // REACTOR ENGINEERING: Industrial steel diamond tread plate with high-voltage hazard zone
    vec2 dPos = v_worldPos * 0.18;
    float diamond = abs(fract(dPos.x + dPos.y) - 0.5) + abs(fract(dPos.x - dPos.y) - 0.5);
    float plate = step(0.68, diamond) * 0.15;
    vec3 engMetal = mix(vec3(0.14, 0.16, 0.20), vec3(0.24, 0.27, 0.33), plate);

    // Hazard warning zone around reactor core monitor (x=890, y=510)
    float dCore = length(v_worldPos - vec2(890.0, 510.0));
    if (dCore > 40.0 && dCore < 50.0) {
      float hStripes = step(0.5, fract((v_worldPos.x + v_worldPos.y) / 14.0));
      baseColor = mix(vec3(0.95, 0.78, 0.05), vec3(0.1, 0.1, 0.12), hStripes);
    } else {
      baseColor = engMetal;
    }

  } else if (u_roomType == 5) {
    // CARGO BAY & ORE HOLD: Scuffed heavy freight plating with yellow/black loading zone markings
    vec2 cCoord = (v_worldPos - u_roomBounds.xy) / 45.0;
    vec2 cGrid = abs(fract(cCoord - 0.5) - 0.5) / fwidth(cCoord);
    float cLine = 1.0 - min(min(cGrid.x, cGrid.y), 1.0);
    vec3 cargoMetal = mix(vec3(0.19, 0.20, 0.23), vec3(0.26, 0.28, 0.31), clamp(cLine * 0.75, 0.0, 1.0));

    // Staging mag-pad hazard box perimeter (around winch x=600, y=510)
    vec2 cargoRel = abs(v_worldPos - vec2(600.0, 510.0));
    if (max(cargoRel.x, cargoRel.y) > 36.0 && max(cargoRel.x, cargoRel.y) < 44.0) {
      float hStripes = step(0.5, fract((v_worldPos.x + v_worldPos.y) / 12.0));
      baseColor = mix(vec3(0.92, 0.74, 0.08), vec3(0.12, 0.12, 0.14), hStripes);
    } else {
      baseColor = cargoMetal;
    }

  } else if (u_roomType == 4) {
    // ARMORY & SECURITY: Reinforced ballistic dark gunmetal deck with crimson security perimeter
    vec2 aCoord = v_worldPos / 28.0;
    vec2 aGrid = abs(fract(aCoord - 0.5) - 0.5) / fwidth(aCoord);
    float aLine = 1.0 - min(min(aGrid.x, aGrid.y), 1.0);
    vec3 armoryBase = mix(vec3(0.13, 0.15, 0.19), vec3(0.22, 0.25, 0.30), clamp(aLine * 0.7, 0.0, 1.0));

    // Perimeter security red warning line inset 7px from walls
    vec2 dWall = min(v_worldPos - u_roomBounds.xy, u_roomBounds.xy + u_roomBounds.zw - v_worldPos);
    if ((dWall.x > 6.0 && dWall.x < 10.0) || (dWall.y > 6.0 && dWall.y < 10.0)) {
      baseColor = mix(armoryBase, vec3(0.9, 0.15, 0.2), 0.75);
    } else {
      baseColor = armoryBase;
    }

  } else if (u_roomType == 9 || u_roomType == 10) {
    // AIRLOCK VESTIBULES (Port & Starboard): High-contrast decompression hazard floor
    float aStripes = step(0.5, fract((v_worldPos.x + v_worldPos.y) / 16.0));
    vec3 hazardDeck = mix(vec3(0.85, 0.65, 0.08), vec3(0.12, 0.14, 0.18), aStripes);
    vec2 dBorder = min(v_worldPos - u_roomBounds.xy, u_roomBounds.xy + u_roomBounds.zw - v_worldPos);
    float borderMask = step(min(dBorder.x, dBorder.y), 5.0);
    baseColor = mix(hazardDeck, vec3(0.8, 0.15, 0.15), borderMask);

  } else if (u_roomType == 3) {
    // CENTRAL CATWALK SPINE: Perforated steel subfloor grating with visible conduit channels beneath
    float distFromCenter = abs(v_worldPos.y - 400.0);
    float runner = step(distFromCenter, 20.0);
    float rib = step(0.45, fract(v_worldPos.x / 16.0)) * 0.18;
    // Subfloor conduit depth effect
    float grateHoles = step(0.65, fract(v_worldPos.x / 8.0)) * step(0.65, fract(v_worldPos.y / 8.0));
    vec3 catwalkMetal = mix(vec3(0.11, 0.13, 0.16), vec3(0.20, 0.24, 0.30), rib);
    catwalkMetal = mix(catwalkMetal, vec3(0.04, 0.05, 0.07), grateHoles * 0.45);

    // Glowing cyan transit guide line at catwalk borders (Y = 400 +/- 20)
    float runnerEdge = smoothstep(1.2, 0.0, abs(distFromCenter - 20.0));
    baseColor = mix(catwalkMetal, vec3(0.0, 0.85, 1.0), runnerEdge * 0.75);

  } else {
    // CREW BUNKS (1) & MESS HALL (2): Modular clean living panels
    vec2 qCoord = v_worldPos / 32.0;
    vec2 qGrid = abs(fract(qCoord - 0.5) - 0.5) / fwidth(qCoord);
    float qLine = 1.0 - min(min(qGrid.x, qGrid.y), 1.0);
    baseColor = mix(u_floorColor, vec3(0.68, 0.74, 0.82), clamp(qLine * 0.85, 0.0, 1.0));
  }

  // Soft Ambient Occlusion / Wall Drop Shadow along room perimeter
  vec2 dPerimeter = min(v_worldPos - u_roomBounds.xy, u_roomBounds.xy + u_roomBounds.zw - v_worldPos);
  float wallShadow = smoothstep(0.0, 12.0, min(dPerimeter.x, dPerimeter.y));
  baseColor *= mix(0.55, 1.0, wallShadow);

  // Dynamic light accumulation from nearby projectile energy
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
    // KINETIC BULLET: Flat tracer trail that fades fast towards the tail (no glow)
    float trailProgress = (u + 1.0) * 0.5; // 0.0 at tail, 1.0 at bullet head

    // Aerodynamic taper: very slim at tail, solid width at bullet tip
    float widthFactor = 0.35 + 0.65 * trailProgress;
    if (abs(v) > widthFactor) discard;

    // Fast-fading flat trail: trail alpha drops off sharply towards the tail
    float fade = pow(trailProgress, 2.2);

    // Flat colors: warm military tracer amber fading back, bright bullet tip
    vec3 tailColor = vec3(1.0, 0.72, 0.2);
    vec3 headColor = vec3(1.0, 1.0, 0.95);
    vec3 flatColor = mix(tailColor, headColor, smoothstep(0.7, 1.0, trailProgress));

    // Crisp flat output, zero bloom/glow
    fragColor = vec4(flatColor, fade * u_color.a);
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

export const LIGHT_FAN_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
uniform vec2 u_lightOrigin;
out vec2 v_relPos;

void main() {
  v_relPos = a_position - u_lightOrigin;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const LIGHT_FAN_FS = `#version 300 es
precision highp float;
in vec2 v_relPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;
uniform float u_isDirectional; // 0.0 = omni, 1.0 = flashlight cone
uniform float u_facingAngle;
uniform float u_fov;
uniform float u_ambientRadius;

out vec4 fragColor;

void main() {
  float dist = length(v_relPos);
  if (dist >= u_radius) discard;

  // Smooth quadratic physical falloff
  float normD = dist / u_radius;
  float radialAtten = clamp(1.0 - normD, 0.0, 1.0);
  radialAtten = radialAtten * radialAtten;

  float finalAtten = radialAtten;
  float coneFactor = 1.0;
  float haloAtten = 0.0;

  if (u_isDirectional > 0.5) {
    // Directional flashlight cone
    float angle = atan(v_relPos.y, v_relPos.x);
    float diff = abs(angle - u_facingAngle);
    if (diff > 3.1415926535) diff = 6.283185307 - diff;

    float halfFov = u_fov * 0.5;
    coneFactor = smoothstep(halfFov, halfFov * 0.4, diff);

    if (u_ambientRadius > 0.0) {
      float haloNorm = dist / u_ambientRadius;
      haloAtten = clamp(1.0 - haloNorm, 0.0, 1.0);
      haloAtten = haloAtten * haloAtten * 0.55;
    }

    finalAtten = max(coneFactor * radialAtten, haloAtten);
  }

  vec3 lit = u_lightColor * (u_intensity * finalAtten);
  float inLoS = max(coneFactor, haloAtten > 0.0 ? 1.0 : 0.0);
  float outAlpha = u_isDirectional > 0.5 ? inLoS : 0.0;
  fragColor = vec4(lit, outAlpha);
}
`;

export const LIGHTMAP_APPLY_VS = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const LIGHTMAP_APPLY_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sceneTexture;
uniform sampler2D u_lightTexture;
out vec4 fragColor;

void main() {
  vec4 scene = texture(u_sceneTexture, v_uv);
  vec4 light = texture(u_lightTexture, v_uv);

  float maxLight = max(light.r, max(light.g, light.b));

  if (maxLight < 0.02) {
    fragColor = vec4(0.015, 0.02, 0.04, 1.0);
    return;
  }

  // Active LoS factor is driven directly by player's active 160-degree cone
  float inLoS = smoothstep(0.04, 0.22, light.a);

  // Explored areas outside active LoS are desaturated to tactical gray
  float gray = dot(scene.rgb, vec3(0.299, 0.587, 0.114));
  vec3 grayColor = vec3(gray * 0.38);

  // Full color illuminated scene inside active LoS
  vec3 litColor = scene.rgb * light.rgb;

  vec3 finalColor = mix(grayColor, litColor, inLoS);
  fragColor = vec4(finalColor, scene.a);
}
`;

export const FOW_STAMP_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
void main() {
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const FOW_STAMP_FS = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`;

export const FOW_AMBIENT_VS = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat3 u_matrix;
out vec2 v_worldPos;
void main() {
  v_worldPos = a_position;
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
`;

export const FOW_AMBIENT_FS = `#version 300 es
precision highp float;
in vec2 v_worldPos;
uniform sampler2D u_fowTexture;
uniform vec2 u_worldBounds;
uniform vec3 u_roomAmbient;
out vec4 fragColor;

void main() {
  vec2 uv = clamp(v_worldPos / u_worldBounds, 0.0, 1.0);
  float explored = texture(u_fowTexture, uv).r;
  vec3 amb = u_roomAmbient * clamp(explored, 0.0, 1.0);
  fragColor = vec4(amb, 0.0);
}
`;

export const VISOR_GLASS_VS = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const VISOR_GLASS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;

void main() {
  vec2 uv = v_uv;
  vec2 centerRel = (uv - 0.5) * 2.0;
  
  // Subtle barrel curvature towards corners
  float r2 = dot(centerRel, centerRel);
  float curve = 1.0 + 0.045 * r2;

  // Outer visor border mask: curved rounded viewport perimeter
  vec2 d = abs(centerRel);
  float cornerDist = length(max(d - vec2(0.86, 0.82), 0.0));
  float outerBezel = smoothstep(0.24, 0.26, cornerDist);

  // Faint scanlines across the visor
  float scanline = 0.96 + 0.04 * sin(gl_FragCoord.y * 1.5 + u_time * 2.0);

  // Subtle glass reflection / cyan tint at periphery
  vec3 glassTint = vec3(0.01, 0.04, 0.06);
  float vignette = smoothstep(0.3, 1.2, r2);
  vec3 cyanGlow = vec3(0.0, 0.9, 1.0);

  // Visor curved perimeter edge glow line
  float rimGlow = smoothstep(0.04, 0.0, abs(cornerDist - 0.20)) * 0.45;

  vec3 col = glassTint + cyanGlow * rimGlow;
  float alpha = (vignette * 0.18 + rimGlow + outerBezel * 0.85) * scanline;

  fragColor = vec4(col, clamp(alpha, 0.0, 0.95));
}
`;

export const HUD_VECTOR_VS = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
uniform mat3 u_matrix;
uniform float u_curvature;
out vec4 v_color;

void main() {
  v_color = a_color;
  vec2 clipPos = (u_matrix * vec3(a_position, 1.0)).xy;
  // Helmet visor barrel curvature (bends corner HUD elements along spherical helmet glass)
  float r2 = dot(clipPos, clipPos);
  vec2 curvedPos = clipPos * (1.0 + u_curvature * r2);
  gl_Position = vec4(curvedPos, 0.0, 1.0);
}
`;

export const HUD_VECTOR_FS = `#version 300 es
precision highp float;
in vec4 v_color;
uniform float u_glow;
out vec4 fragColor;

void main() {
  vec3 rgb = v_color.rgb * (1.0 + u_glow * 0.5);
  fragColor = vec4(rgb, v_color.a);
}
`;

export const HUD_TEXT_VS = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_uv;
uniform mat3 u_matrix;
uniform float u_curvature;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  vec2 clipPos = (u_matrix * vec3(a_position, 1.0)).xy;
  float r2 = dot(clipPos, clipPos);
  vec2 curvedPos = clipPos * (1.0 + u_curvature * r2);
  gl_Position = vec4(curvedPos, 0.0, 1.0);
}
`;

export const HUD_TEXT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_atlas;
uniform vec4 u_tint;
out vec4 fragColor;

void main() {
  vec4 sampleCol = texture(u_atlas, v_uv);
  fragColor = sampleCol * u_tint;
}
`;
