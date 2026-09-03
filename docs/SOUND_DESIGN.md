# Kybernetes Sound Design Architecture & Technical Specification

## 1. Vision & Acoustic Aesthetic

The audio landscape of **Kybernetes** (*CSS Hesperia*) establishes an atmospheric, tactile, and claustrophobic hard sci-fi experience inspired by *Alien (Nostromo)*, *The Expanse*, and real-world aerospace telemetry.

To align with the project's zero-DOM simulation core and high-performance WebGL/Canvas client architecture:
- **Pure Procedural Web Audio API**: 100% code-synthesized audio running in the browser. Zero external audio files (`.wav`, `.mp3`, `.ogg`), zero HTTP asset downloads, instant page loads, and direct mathematical coupling to vessel telemetry.
- **Physical Acoustic Modeling**: Algorithmic simulation of metal plate resonances, pneumatic pressure drops, and electrical circuitry via feedback delay networks, comb filters, and non-linear wave shaping.
- **2D Spatialization & Bulkhead Occlusion**: Sound sources are attenuated by distance from the player pawn and low-pass filtered based on real-time raycast intersections with vessel walls and closed blast doors.
- **Diegetic-First with Procedural Tension Drones**: Routine shifts are scored purely by the mechanical hum of life support, reactor cooling, and ventilation; emergencies (breaches, low O2, boarding) seamlessly summon generative sub-bass tension drones and dissonant harmonic clusters.

---

## 2. Core Audio Architecture

```mermaid
graph TD
    subgraph Browser Web Audio Engine (apps/web)
        Core["ShipAudioEngine (Headless Singleton)"]
        Listener["Spatial Listener (Pawn Coordinates x, y)"]
        Raycaster["Bulkhead Occlusion Raycaster"]

        subgraph Gain Buses
            B_Master["Master Dynamic Bus & Filter"]
            B_Amb["Ambience Bus"]
            B_Foley["Foley Bus (Priority Voice Pool)"]
            B_UI["UI & Telemetry Bus"]
            B_Crisis["Crisis & Tension Bus"]
        end

        subgraph Physical Modeling Synths
            S_Metal["Metallic Resonator (Footsteps, Hull Creaks)"]
            S_Pneu["Pneumatic / Air Shaper (Airlocks, Decompression)"]
            S_EM["Electromagnetic / Reactor (Binaural Drone, CRT Whine)"]
            S_Ballistics["Ballistics & Plasma (Carbine, Laser, Welder)"]
            S_Vitals["Vitals Monitor (Heartbeat, Biosuit Breath)"]
        end
    end

    CanvasLoop["Canvas Render Loop (60 FPS)"] -->|Updates Listener x, y| Listener
    SocketEvents["Vessel Socket Telemetry & Events"] -->|Telemetry & Combat| Core
    ReactUI["React UI (useAudio Hook)"] -->|Volume & Mute Controls| B_Master
    Core --> GainBuses
```

---

## 3. Acoustic Physics & 2D Bulkhead Occlusion

### 3.1. Spatial Listener & Attenuation
- **Listener Position**: Synced to the player's active avatar coordinates $(x_p, y_p)$ in world deck units.
- **Distance Attenuation Curve**:
  $$\text{Gain}(d) = \text{clamp}\left(\frac{r_{\text{ref}}}{r_{\text{ref}} + d_{\text{falloff}} \cdot (d - r_{\text{min}})}, 0, 1\right)$$
  - $r_{\text{min}} = 60\text{ px}$ (full volume within personal reach)
  - $r_{\text{ref}} = 300\text{ px}$ (nominal corridor radius)
  - $d_{\text{falloff}} = 1.2$
- **Stereo Panning**: Real-time `StereoPannerNode` calculated from relative horizontal displacement $\Delta x = x_e - x_p$ normalized by half the viewport width.

### 3.2. Raycast Bulkhead Occlusion Matrix
For every spatial emitter $(x_e, y_e)$ relative to the player pawn $(x_p, y_p)$, a direct 2D line segment is tested against `HESPERIA_WALLS` and closed `DoorState[]`:

| Bulkhead Intersections | Filter Cutoff ($\text{Hz}$) | Filter Type | Additional Gain Attenuation | Acoustic Perception |
| :--- | :--- | :--- | :--- | :--- |
| **0 (Direct LoS)** | $20{,}000\text{ Hz}$ | Low-Pass | $0\text{ dB}$ ($1.0$) | Crisp, open-air proximity |
| **1 Bulkhead / Door** | $1{,}200\text{ Hz}$ | Low-Pass | $-4\text{ dB}$ ($0.63$) | Muffled through adjacent wall/blast door |
| **2+ Bulkheads** | $380\text{ Hz}$ | Low-Pass | $-12\text{ dB}$ ($0.25$) | Deep structural hull thrum / distant impact |

---

## 4. Synthesizer Voice Implementations

### 4.1. Metallic Locomotion & Plate Resonances
- **Footsteps**: Modulated pink noise burst (duration $18\text{ ms}$) injected into a resonant comb filter bank tuned to $180\text{ Hz}$, $340\text{ Hz}$, and $820\text{ Hz}$ (steel plate resonance modes).
- **Surface Variation**:
  - *Engineering Bilge (Deck D)*: High $Q$-factor ($Q=9$), higher metallic ping and faster decay.
  - *Transit Corridor (Deck C/B)*: Solid dampened plate impact ($120\text{ Hz}$ fundamental body thump).
  - *Command Bridge (Deck A)*: Damped linoleum matting (low-pass cutoff $600\text{ Hz}$).

### 4.2. Pneumatics & Fluidics
- **Airlock / Blast Door Cycle**: Dual-stage sound:
  1. Pneumatic pressure bleed: Bandpass noise sweep ($3{,}500\text{ Hz} \rightarrow 700\text{ Hz}$ over $350\text{ ms}$).
  2. Heavy locking solenoid: $70\text{ Hz}$ sine thump with cubic non-linear distortion.
- **Atmospheric Decompression & Venting**: Filtered pink noise with an automated gain envelope scaling proportionally with oxygen depletion rate $\Delta O_2 / \Delta t$.

### 4.3. Reactor Dynamics & Electrical Whine
- **Reactor Core Vibration**: Dual detuned triangle oscillators ($48\text{ Hz}$ and $49.5\text{ Hz}$) driving an asymmetric polynomial wave-shaper.
  - Frequency modulates dynamically with `reactor.load`: scales from $48\text{ Hz}$ at idle to $72\text{ Hz}$ under peak load/overheat.
- **Command Bridge CRT Flyback Whine**: $15{,}625\text{ Hz}$ pure sine tone at $-34\text{ dB}$, spatialized to bridge consoles.

### 4.4. Ballistics & Energy Weapons
- **Kinetic Carbine**: Dirac impulse transient + $120\text{ Hz}$ damped body resonance + mechanical bolt slide click.
- **Pulse Laser**: Exponential pitch sweep ($2{,}400\text{ Hz} \rightarrow 220\text{ Hz}$ in $40\text{ ms}$) through a resonant bandpass filter ($Q=14$).
- **Arc Welder**: High-frequency pink noise modulated by $100\text{ Hz}$ rectified mains hum with random micro-dropouts simulating plasma arc instability.

---

## 5. Telemetry-Reactive Living Ship Matrix

The soundscape continuously updates based on incoming `TelemetryDeltaBroadcast`:

| Telemetry Condition | Acoustic Behavior |
| :--- | :--- |
| **Reactor Overheat ($>85\%$)** | Core drone rises to $72\text{ Hz}$; introduces $3\text{ Hz}$ pulsing amplitude modulation (thermal alarm stress). |
| **Low Room Oxygen ($<30\%$)** | Air ventilation hiss rolls off; master mix low-pass clamps down to simulate acoustic attenuation in thin air. |
| **Damaged Hull ($<50\%$)** | Stochastic structural groans (pitch-bent FM sine sweeps between $200\text{ Hz}$ and $500\text{ Hz}$). |
| **Blackout / Emergency Power** | Sub-bass generators spin down ($50\text{ Hz} \rightarrow 20\text{ Hz}$ pitch drop over 2s); emergency relay click; silence. |
| **Suffocation ($O_2 \le 15\%$)** | Mix low-pass filter clamps to $450\text{ Hz}$; amplified procedural biosuit breathing and accelerated double-thump heartbeat. |

---

## 6. Multi-Bus Mixing & Voice Concurrency

```
[Procedural Voices]
        │
        ├──> [Ambience Bus] ──────┐
        ├──> [Foley Bus] ─────────┼──> [Master Dynamic Filter] ──> [Master Gain] ──> Destination
        ├──> [Crisis Bus] ────────┤    (Trauma & Suffocation)
        └──> [UI Bus] ────────────┘
```

- **Voice Concurrency Limit**: 8 active Foley voices.
- **Priority Hierarchy**:
  1. *P1 (Critical)*: Local weapon fire, trauma heartbeat/breathing, red alerts.
  2. *P2 (High)*: Local player footsteps, immediate blast doors.
  3. *P3 (Normal)*: Remote crew footsteps, bot movements, distant doors.
- **Persistence**: Volume levels stored in `localStorage` under `kybernetes_audio_settings`.
- **Hotkeys**: Dedicated HUD Audio Controls modal and `[U]` / top bar quick-mute toggle.
