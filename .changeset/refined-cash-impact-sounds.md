---
'@kybernetes/web': patch
---

Refined cash-register and kinetic-impact sounds

- Cash register is now a biphase electromechanical event: an unpitched latch/drawer-slide friction burst (staggered ratchet ticks plus a slide sheen, 300 Hz-2.5 kHz, sub-5 ms attack, ~60 ms decay) followed ~75 ms later by a tuned bronze bell strike (3160 Hz fundamental with a beating mode pair and inharmonic overtones reaching ~13.7 kHz, 1.5-2.4 s ring-down).
- Bullet-on-metal impact is now a three-phase kinetic event: a sub-millisecond broadband shock with an 80-250 Hz plate punch and ultrasonic snap, a downward-sweeping dispersive plate chirp through high-Q 1.5-8 kHz modal ringing, and a pitch-dropping ricochet whistle (2.7 kHz to 820 Hz) with vortex-shedding flutter on most hits.
- Laser and welder impacts keep their existing short thump; a shared filtered-noise transient helper in audioHelpers backs the new impulsive layers.
