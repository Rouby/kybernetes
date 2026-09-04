import { describe, expect, it } from 'vitest';
import {
  ATMOS_GRID_COLS,
  createInitialAtmosGrid,
  formatAtmosOverlayValue,
  getAirflowDragVector,
  getAtmosOverlayColor,
  getDecompressionAirflowSources,
  sampleAirflowVelocityAt,
  sampleAtmosphereAt,
  summarizeRoomAtmospheres,
  tickCellularAtmos,
  worldToCellCoords,
  worldToIndex,
} from './atmosGrid';
import { createInitialDoors } from './doors';

describe('20px Cellular Automata Atmospheric Grid', () => {
  it('initializes interior rooms with nominal Earth-like atmosphere and space with vacuum', () => {
    const grid = createInitialAtmosGrid();

    // Command bridge center (220, 290)
    const bridgeAtmos = sampleAtmosphereAt(grid, 220, 290);
    expect(bridgeAtmos.roomId).toBe('bridge');
    expect(bridgeAtmos.pressureKpa).toBe(101.3);
    expect(bridgeAtmos.o2Percent).toBe(20.9);
    expect(bridgeAtmos.tempCelsius).toBe(21.0);
    expect(bridgeAtmos.toxicSmokePercent).toBe(0);

    // Deep space exterior point (50, 50)
    const spaceAtmos = sampleAtmosphereAt(grid, 50, 50);
    expect(spaceAtmos.roomId).toBeNull();
    expect(spaceAtmos.pressureKpa).toBe(0);
    expect(spaceAtmos.o2Percent).toBe(0);
  });

  it('correctly maps world coordinates to cell indices', () => {
    const { col, row } = worldToCellCoords(100, 200);
    expect(col).toBe(5);
    expect(row).toBe(10);

    const idx = worldToIndex(100, 200);
    expect(idx).toBe(10 * ATMOS_GRID_COLS + 5);
  });

  it('decompresses room when exterior airlock is opened and generates airflow velocity', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // Open starboard exterior airlock
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    expect(stbdOuter).toBeDefined();
    if (stbdOuter) stbdOuter.isOpen = true;

    // Run simulation ticks
    for (let t = 0; t < 10; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }

    // Starboard airlock interior (960, 280) should have dropped in pressure
    const airlockAtmos = sampleAtmosphereAt(grid, 960, 280);
    expect(airlockAtmos.pressureKpa).toBeLessThan(101.3);

    // Airflow velocity towards the outer hatch should be active
    const vel = sampleAirflowVelocityAt(grid, 960, 280);
    expect(Math.hypot(vel.vx, vel.vy)).toBeGreaterThan(0);
  });

  it('decompresses room rapidly to 0 when whole door is opened to vacuum while small puncture vents slowly', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();
    // Isolate engineering from corridor so we test engineering purge vent directly
    const engDoor = doors.find((d) => d.id === 'door_eng');
    const engVent = doors.find((d) => d.id === 'airlock_eng');
    if (engDoor) engDoor.isOpen = false;
    if (engVent) engVent.isOpen = true;

    // After 0.4s (8 ticks of 0.05s), the 4 m2 purge vent has dumped most air
    for (let t = 0; t < 8; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }
    const earlySummary = summarizeRoomAtmospheres(grid, doors, []).engineering;
    expect(earlySummary.pressureKpa).toBeLessThan(60);

    // After ~6s the isolated compartment reaches hard vacuum asymptotically
    for (let t = 8; t < 120; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }

    const engSummary = summarizeRoomAtmospheres(grid, doors, []).engineering;
    expect(engSummary.pressureKpa).toBe(0);
    expect(engSummary.o2Percent).toBe(0);

    // Compare with small puncture: puncture in mess hall should lose air slowly
    const punctureGrid = createInitialAtmosGrid();
    for (let t = 0; t < 20; t++) {
      tickCellularAtmos(punctureGrid, doors, ['puncture_mess'], [], 0.05);
    }
    const messSummary = summarizeRoomAtmospheres(punctureGrid, doors, ['puncture_mess']).mess;
    // 1 second of puncture should still have significant pressure (> 70 kPa)
    expect(messSummary.pressureKpa).toBeGreaterThan(70);
  });

  it('floods the hallway to vacuum over seconds when outer and inner airlock hatches are open', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbdOuter) stbdOuter.isOpen = true;
    // Note: airlock_stbd_inner is already isOpen: true by default!
    // Seal cabins so only the airlock plus corridor spine vent through the hatch.
    for (const d of doors) {
      if (
        d.id !== 'airlock_stbd_outer' &&
        d.id !== 'airlock_stbd_inner' &&
        d.id !== 'door_spine_fwd' &&
        d.id !== 'door_spine_aft'
      ) {
        d.isOpen = false;
      }
    }

    for (let t = 0; t < 200; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }

    const sum = summarizeRoomAtmospheres(grid, doors, []);
    expect(sum.airlock_stbd.pressureKpa).toBe(0);
    expect(sum.corridor.pressureKpa).toBe(0);
  });

  it('isolates decompression behind closed blast doors', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // Close all compartment blast doors to corridor, but keep catwalk spine open
    for (const d of doors) {
      if (d.id === 'door_spine_fwd' || d.id === 'door_spine_aft') {
        d.isOpen = true;
      } else {
        d.isOpen = false;
      }
    }

    // Breach corridor directly (full rupture needs ~35s to pump the sealed spine dry)
    for (let t = 0; t < 700; t++) {
      tickCellularAtmos(grid, doors, ['corridor'], [], 0.05);
    }

    const summary = summarizeRoomAtmospheres(grid, doors, ['corridor']);
    // Corridor should have vented
    expect(summary.corridor.pressureKpa).toBe(0);

    // Every other room was closed, so none should have leaked!
    for (const [roomId, s] of Object.entries(summary)) {
      if (!roomId.startsWith('corridor')) {
        expect(s.pressureKpa).toBe(101.3);
        expect(s.o2Percent).toBe(20.9);
      }
    }

    // Now verify spine door isolates corridor segments:
    const spineGrid = createInitialAtmosGrid();
    const spineDoors = createInitialDoors();
    // Close forward spine door and seal cabins so each corridor third stands alone
    const spineFwd = spineDoors.find((d) => d.id === 'door_spine_fwd');
    if (spineFwd) spineFwd.isOpen = false;
    for (const d of spineDoors) {
      if (d.id !== 'door_spine_aft' && d.id !== 'door_spine_fwd') d.isOpen = false;
    }

    // Breach corridor on far left (col 6)
    for (let t = 0; t < 300; t++) {
      tickCellularAtmos(spineGrid, spineDoors, ['corridor'], [], 0.05);
    }
    // West of spine door (x=300) should be vented
    expect(sampleAtmosphereAt(spineGrid, 300, 400).pressureKpa).toBe(0);
    // East of spine door (x=600) should be protected and remain nominal
    expect(sampleAtmosphereAt(spineGrid, 600, 400).pressureKpa).toBe(101.3);

    // Corridor telemetry must preserve the pressure boundary at the closed bulkhead.
    const segmentedSummary = summarizeRoomAtmospheres(spineGrid, spineDoors, ['corridor']);
    expect(segmentedSummary.corridor_fwd.pressureKpa).toBe(0);
    expect(segmentedSummary.corridor_mid.pressureKpa).toBe(101.3);
  });

  it('rapidly equalizes pressure between connected rooms within 1.5 seconds', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // 1. Fully evacuate starboard airlock: outer hatch open, inner hatch closed
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
    if (stbdOuter) stbdOuter.isOpen = true;
    if (stbdInner) stbdInner.isOpen = false;

    // Vent airlock to hard vacuum (isolated 91 m3 through a 3 m2 hatch: ~3s)
    for (let t = 0; t < 60; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }
    expect(sampleAtmosphereAt(grid, 960, 280).pressureKpa).toBe(0);

    // 2. Seal outer hatch and open inner hatch into corridor
    if (stbdOuter) stbdOuter.isOpen = false;
    if (stbdInner) stbdInner.isOpen = true;

    // Simulate 1.5 seconds (30 ticks at 0.05s) of equalization
    for (let t = 0; t < 30; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }

    const airlockP = sampleAtmosphereAt(grid, 960, 280).pressureKpa;
    const corridorP = sampleAtmosphereAt(grid, 960, 400).pressureKpa;

    // Should have rapidly equalized: airlock pressurized to > 60 kPa, within 10% of corridor
    expect(airlockP).toBeGreaterThan(60.0);
    expect(Math.abs(airlockP - corridorP)).toBeLessThan(10.0);
  });

  it('combusts fire, consumes O2, emits smoke, and starves when vented', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // Start fire in mess hall
    tickCellularAtmos(grid, doors, [], ['mess'], 0.05);

    const initialMess = sampleAtmosphereAt(grid, 810, 290);
    expect(initialMess.toxicSmokePercent).toBeGreaterThanOrEqual(0);

    // Run ticks with fire burning
    for (let t = 0; t < 25; t++) {
      tickCellularAtmos(grid, doors, [], ['mess'], 0.05);
    }

    const burningMess = sampleAtmosphereAt(grid, 840, 298);
    expect(burningMess.toxicSmokePercent).toBeGreaterThan(0);
    expect(burningMess.tempCelsius).toBeGreaterThan(21.0);

    // Isolate the mess hall, then vent it by breach (146 m3 through 1 m2: ~2s)
    const messDoor = doors.find((d) => d.id === 'door_mess');
    if (messDoor) messDoor.isOpen = false;
    for (let t = 0; t < 40; t++) {
      tickCellularAtmos(grid, doors, ['mess'], ['mess'], 0.05);
    }

    const ventedMess = sampleAtmosphereAt(grid, 840, 298);
    expect(ventedMess.pressureKpa).toBeLessThan(70.0);
  });

  it('summarizes room atmospheres into room and corridor-segment telemetry records', () => {
    const grid = createInitialAtmosGrid();
    const summaries = summarizeRoomAtmospheres(grid);

    expect(Object.keys(summaries).length).toBe(14);
    expect(summaries.bridge.pressureKpa).toBe(101.3);
    expect(summaries.engineering.o2Percent).toBe(20.9);
    expect(summaries.quarters.tempCelsius).toBe(21.0);
  });

  it('maps atmos overlay colors and formats values across O2, temperature, and pressure', () => {
    // Oxygen
    const nomO2Color = getAtmosOverlayColor('o2', {
      roomId: 'bridge',
      pressureKpa: 101.3,
      o2Percent: 20.9,
      co2Ppm: 400,
      tempCelsius: 21.0,
      toxicSmokePercent: 0,
      isVenting: false,
      activeFires: 0,
      activeBreaches: 0,
    });
    expect(nomO2Color[3]).toBeGreaterThan(0); // non-zero alpha
    expect(
      formatAtmosOverlayValue('o2', {
        roomId: 'bridge',
        pressureKpa: 101.3,
        o2Percent: 20.9,
        co2Ppm: 400,
        tempCelsius: 21.0,
        toxicSmokePercent: 0,
        isVenting: false,
        activeFires: 0,
        activeBreaches: 0,
      })
    ).toBe('20.9% O₂');

    const hypoxicColor = getAtmosOverlayColor('o2', {
      roomId: 'airlock_port',
      pressureKpa: 10.0,
      o2Percent: 8.0,
      co2Ppm: 400,
      tempCelsius: 21.0,
      toxicSmokePercent: 0,
      isVenting: true,
      activeFires: 0,
      activeBreaches: 0,
    });
    expect(hypoxicColor[0]).toBeGreaterThan(0.9); // Crimson R channel

    // Temperature
    const coldColor = getAtmosOverlayColor('temp', {
      roomId: 'airlock_stbd',
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -30.0,
      toxicSmokePercent: 0,
      isVenting: true,
      activeFires: 0,
      activeBreaches: 1,
    });
    expect(coldColor[2]).toBe(1.0); // Blue B channel
    expect(
      formatAtmosOverlayValue('temp', {
        roomId: 'airlock_stbd',
        pressureKpa: 0,
        o2Percent: 0,
        co2Ppm: 0,
        tempCelsius: -30.0,
        toxicSmokePercent: 0,
        isVenting: true,
        activeFires: 0,
        activeBreaches: 1,
      })
    ).toBe('-30.0°C');

    // Pressure
    const vacuumColor = getAtmosOverlayColor('pressure', {
      roomId: 'airlock_stbd',
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -30.0,
      toxicSmokePercent: 0,
      isVenting: true,
      activeFires: 0,
      activeBreaches: 1,
    });
    expect(vacuumColor[2]).toBeGreaterThan(0.4); // Vacuum indigo B channel
    expect(
      formatAtmosOverlayValue('pressure', {
        roomId: 'bridge',
        pressureKpa: 101.3,
        o2Percent: 20.9,
        co2Ppm: 400,
        tempCelsius: 21.0,
        toxicSmokePercent: 0,
        isVenting: false,
        activeFires: 0,
        activeBreaches: 0,
      })
    ).toBe('101.3 kPa');

    // Off mode
    expect(getAtmosOverlayColor('off')).toEqual([0, 0, 0, 0]);
    expect(formatAtmosOverlayValue('off')).toBe('');
  });

  it('rapidly evacuates an isolated airlock compartment to vacuum within ~2 seconds', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    expect(stbdOuter).toBeDefined();
    if (stbdOuter) stbdOuter.isOpen = true;
    // Isolate the airlock so the hatch vents only its own 91 m3
    const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
    if (stbdInner) stbdInner.isOpen = false;

    // Choked outflow drops pressure across the room within 3 ticks (0.15s)
    for (let t = 0; t < 3; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }
    const earlyAtmos = sampleAtmosphereAt(grid, 960, 280);
    expect(earlyAtmos.pressureKpa).toBeLessThan(90.0);
    expect(earlyAtmos.condensationPlume).toBeGreaterThan(0);

    // After 3.0 seconds (60 ticks at 0.05s), room should have reached hard vacuum (0.0 kPa)
    for (let t = 3; t < 60; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }
    const finalAtmos = sampleAtmosphereAt(grid, 960, 280);
    expect(finalAtmos.pressureKpa).toBe(0.0);
    expect(finalAtmos.o2Percent).toBe(0.0);
  });

  it('differentiates hull punctures with a prolonged 15-30 second evacuation', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // Hull puncture in quarters
    for (let t = 0; t < 60; t++) {
      // 3.0 seconds of simulation
      tickCellularAtmos(grid, doors, ['puncture_quarters'], [], 0.05);
    }

    // After 3s, puncture should still retain significant cabin pressure (> 50 kPa)
    const midAtmos = sampleAtmosphereAt(grid, 680, 280);
    expect(midAtmos.pressureKpa).toBeGreaterThan(50.0);
  });

  it('cascades decompression across multiple rooms when internal doors are open', () => {
    const grid = createInitialAtmosGrid();
    const doors = createInitialDoors();

    // Open starboard outer airlock AND inner door to corridor
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
    if (stbdOuter) stbdOuter.isOpen = true;
    if (stbdInner) stbdInner.isOpen = true;

    // Simulate 10 seconds: one hatch pumps the whole connected ship dry
    for (let t = 0; t < 200; t++) {
      tickCellularAtmos(grid, doors, [], [], 0.05);
    }

    // Both the airlock and the adjacent corridor section should be evacuating together
    const corridorAtmos = sampleAtmosphereAt(grid, 960, 400);
    expect(corridorAtmos.pressureKpa).toBeLessThan(30.0);
  });

  it('computes realistic directional airflow drag towards breach or open airlock hatch', () => {
    const doors = createInitialDoors();

    // 1. All doors closed: zero drag
    const noDrag = getAirflowDragVector(960, 280, doors, []);
    expect(noDrag).toEqual({ u: 0, v: 0 });

    // 2. Starboard airlock open: pulls Northwards (v < 0) towards outer hatch at y=228
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbdOuter) stbdOuter.isOpen = true;

    const stbdDrag = getAirflowDragVector(960, 280, doors, []);
    expect(stbdDrag.v).toBeLessThan(0); // Pulls North towards space
    expect(Math.abs(stbdDrag.v)).toBeGreaterThan(50);

    // 3. Port airlock open: pulls Southwards (v > 0) towards outer hatch at y=572
    if (stbdOuter) stbdOuter.isOpen = false;
    const portOuter = doors.find((d) => d.id === 'airlock_port_outer');
    if (portOuter) portOuter.isOpen = true;

    const portDrag = getAirflowDragVector(380, 500, doors, []);
    expect(portDrag.v).toBeGreaterThan(0); // Pulls South towards space
    expect(Math.abs(portDrag.v)).toBeGreaterThan(50);

    // 4. Engineering purge vent: pulls Eastwards (u > 0) towards x=1020
    if (portOuter) portOuter.isOpen = false;
    const engVent = doors.find((d) => d.id === 'airlock_eng');
    if (engVent) engVent.isOpen = true;

    const engDrag = getAirflowDragVector(900, 500, doors, []);
    expect(engDrag.u).toBeGreaterThan(0); // Pulls East towards space

    // 5. Closes again: drag drops immediately to zero
    if (engVent) engVent.isOpen = false;
    const closedDrag = getAirflowDragVector(900, 500, doors, []);
    expect(closedDrag).toEqual({ u: 0, v: 0 });

    // 6. Hallway doors isolate airflow drag across corridor bulkheads
    const stbdOuterHatch = doors.find((d) => d.id === 'airlock_stbd_outer');
    const spineAft = doors.find((d) => d.id === 'door_spine_aft');
    if (stbdOuterHatch) stbdOuterHatch.isOpen = true;
    if (spineAft) spineAft.isOpen = false;

    // Pawn in mid-corridor (x=600, y=400) should have ZERO drag because spine_aft is closed!
    const midCorridorDragClosed = getAirflowDragVector(600, 400, doors, []);
    expect(midCorridorDragClosed).toEqual({ u: 0, v: 0 });

    // When spine_aft opens, pawn is pulled East towards door_spine_aft (x=760)
    if (spineAft) spineAft.isOpen = true;
    const midCorridorDragOpen = getAirflowDragVector(600, 400, doors, []);
    expect(midCorridorDragOpen.u).toBeGreaterThan(0);
  });

  it('keeps pulling pawns standing inside vent-path doorways instead of stalling on the waypoint', () => {
    const doors = createInitialDoors();
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbdOuter) stbdOuter.isOpen = true;

    // Pawn inside the inner hatch (970, 368): flow routes through this exact door
    const innerHatchDrag = getAirflowDragVector(970, 368, doors, []);
    expect(Math.hypot(innerHatchDrag.u, innerHatchDrag.v)).toBeGreaterThan(50);
    expect(innerHatchDrag.v).toBeLessThan(0);

    // Pawn inside the spine bulkhead doorway on the vent path
    const spineDrag = getAirflowDragVector(440, 400, doors, []);
    expect(Math.hypot(spineDrag.u, spineDrag.v)).toBeGreaterThan(50);

    // Pawn sitting on the outer hatch itself is pushed along the outward normal
    const hatchDrag = getAirflowDragVector(970, 228, doors, []);
    expect(hatchDrag.v).toBeLessThan(-50);
  });

  it('stops venting and pull when room is fully evacuated to vacuum or doors closed', () => {
    const doors = createInitialDoors();
    const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbdOuter) stbdOuter.isOpen = true;

    // Hard vacuum room has no gas to exert aerodynamic drag
    const vacuumSummary = {
      airlock_stbd: {
        roomId: 'airlock_stbd',
        pressureKpa: 0.0,
        o2Percent: 0.0,
        co2Ppm: 0,
        tempCelsius: -270,
        toxicSmokePercent: 0,
        isVenting: false,
        activeFires: 0,
        activeBreaches: 0,
      },
    };

    const vacuumDrag = getAirflowDragVector(960, 280, doors, [], vacuumSummary);
    expect(vacuumDrag).toEqual({ u: 0, v: 0 });
  });

  describe('getDecompressionAirflowSources', () => {
    it('generates an airflow source at open exterior airlock hatch when room has atmosphere', () => {
      const doors = createInitialDoors();
      const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
      if (stbdOuter) stbdOuter.isOpen = true;
      const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
      if (stbdInner) stbdInner.isOpen = false;

      const sources = getDecompressionAirflowSources(doors, []);
      expect(sources).toHaveLength(1);
      expect(sources[0].intensity).toBeGreaterThan(0.9);
      expect(sources[0].v).toBeLessThan(0);
    });

    it('stops emitting airflow source when isolated room reaches vacuum', () => {
      const doors = createInitialDoors();
      const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
      if (stbdOuter) stbdOuter.isOpen = true;
      const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
      if (stbdInner) stbdInner.isOpen = false;

      const vacuumAtmospheres = {
        airlock_stbd: {
          roomId: 'airlock_stbd',
          pressureKpa: 0.0,
          o2Percent: 0,
          co2Ppm: 0,
          tempCelsius: -270,
          toxicSmokePercent: 0,
          isVenting: false,
          activeFires: 0,
          activeBreaches: 0,
        },
      };

      const sources = getDecompressionAirflowSources(doors, [], vacuumAtmospheres);
      expect(sources).toHaveLength(0);
    });

    it('cascades airflow through internal door and maintains exterior vent when connected room is opened', () => {
      const doors = createInitialDoors();
      const stbdOuter = doors.find((d) => d.id === 'airlock_stbd_outer');
      if (stbdOuter) stbdOuter.isOpen = true;
      const stbdInner = doors.find((d) => d.id === 'airlock_stbd_inner');
      if (stbdInner) stbdInner.isOpen = true;

      const atmospheres = {
        airlock_stbd: {
          roomId: 'airlock_stbd',
          pressureKpa: 0.0,
          o2Percent: 0,
          co2Ppm: 0,
          tempCelsius: -270,
          toxicSmokePercent: 0,
          isVenting: false,
          activeFires: 0,
          activeBreaches: 0,
        },
        corridor: {
          roomId: 'corridor',
          pressureKpa: 101.3,
          o2Percent: 20.9,
          co2Ppm: 400,
          tempCelsius: 21,
          toxicSmokePercent: 0,
          isVenting: false,
          activeFires: 0,
          activeBreaches: 0,
        },
      };

      const sources = getDecompressionAirflowSources(doors, [], atmospheres);
      expect(sources).toHaveLength(2);

      const hatchSource = sources.find((s) => Math.abs(s.y - 228) < 30);
      expect(hatchSource).toBeDefined();
      expect(hatchSource?.intensity).toBeGreaterThan(0.9);

      const doorSource = sources.find((s) => Math.abs(s.y - 368) < 20);
      expect(doorSource).toBeDefined();
      expect(doorSource?.v).toBeLessThan(0);
    });

    it('generates airflow source for hull breaches and cascades from upstream rooms', () => {
      const doors = createInitialDoors();
      const sourcesNominal = getDecompressionAirflowSources(doors, ['puncture_mess']);
      expect(sourcesNominal.some((s) => s.intensity > 0.9)).toBe(true);

      const doorMess = doors.find((d) => d.id === 'door_mess');
      if (doorMess) doorMess.isOpen = true;

      const atmospheres = {
        mess: {
          roomId: 'mess',
          pressureKpa: 0.0,
          o2Percent: 0,
          co2Ppm: 0,
          tempCelsius: -270,
          toxicSmokePercent: 0,
          isVenting: false,
          activeFires: 0,
          activeBreaches: 1,
        },
        corridor: {
          roomId: 'corridor',
          pressureKpa: 101.3,
          o2Percent: 20.9,
          co2Ppm: 400,
          tempCelsius: 21,
          toxicSmokePercent: 0,
          isVenting: false,
          activeFires: 0,
          activeBreaches: 0,
        },
      };

      const cascadingSources = getDecompressionAirflowSources(
        doors,
        ['puncture_mess'],
        atmospheres
      );
      expect(cascadingSources.length).toBeGreaterThanOrEqual(2);
    });

    it('aligns venting particle sources and drag vectors to exact impact coordinates instead of room center', () => {
      const doors = createInitialDoors();
      // Breach at x: 815, y: 228 (mess room center is x: 840)
      const sources = getDecompressionAirflowSources(doors, ['puncture_mess_815_228']);
      expect(sources).toHaveLength(1);

      const src = sources[0];
      // Origin is aligned with exact hit at x: 815 (not room center 840)
      expect(src.x).toBe(815);
      expect(src.y).toBe(228 + 4); // 4px inside bulkhead opening
      // Vectors are aligned along outward hull normal (0, -1) into space, not diagonally from room center
      expect(src.u).toBe(0);
      expect(src.v).toBeLessThan(-200);

      // Pawn in mess at x: 800, y: 300 should be dragged East towards x: 815 and North towards y: 228
      const drag = getAirflowDragVector(800, 300, doors, ['puncture_mess_815_228']);
      expect(drag.u).toBeGreaterThan(0); // Pulls towards x: 815
      expect(drag.v).toBeLessThan(0); // Pulls towards y: 228
    });
  });
});
