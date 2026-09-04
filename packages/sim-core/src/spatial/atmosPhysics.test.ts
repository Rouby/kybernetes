import { describe, expect, it } from 'vitest';
import {
  ATMOS_FULL_BREACH_AREA_M2,
  ATMOS_PUNCTURE_REFERENCE_DIAMETER_MM,
  buildCompartmentGraph,
  COMPARTMENT_DEFS,
  type CompartmentState,
  compartmentIndex,
  createNominalCompartmentState,
  getBreachWeldSeconds,
  orificeMassFlowKgPerS,
  parseBreachDescriptors,
  punctureAreaM2,
  subCompartmentId,
  tickCompartments,
} from './atmosPhysics';
import { createInitialDoors } from './doors';

function nominalStates(): CompartmentState[] {
  return COMPARTMENT_DEFS.map(() => createNominalCompartmentState());
}

describe('atmosPhysics orifice model', () => {
  it('produces choked mass flow matching the isentropic reference value', () => {
    const mdot = orificeMassFlowKgPerS(101325, 294.15, 0, 3.0);
    expect(mdot).toBeGreaterThan(420);
    expect(mdot).toBeLessThan(510);
  });

  it('returns zero flow for equal or adverse pressure gradients', () => {
    expect(orificeMassFlowKgPerS(101325, 294.15, 101325, 3.0)).toBe(0);
    expect(orificeMassFlowKgPerS(50000, 294.15, 101325, 3.0)).toBe(0);
    expect(orificeMassFlowKgPerS(101325, 294.15, 0, 0)).toBe(0);
  });

  it('uses subsonic branch for small pressure differences', () => {
    const choked = orificeMassFlowKgPerS(101325, 294.15, 0, 0.01);
    const mild = orificeMassFlowKgPerS(101325, 294.15, 95000, 0.01);
    expect(mild).toBeGreaterThan(0);
    expect(mild).toBeLessThan(choked);
  });

  it('maps breach strings to area descriptors', () => {
    const descs = parseBreachDescriptors(['puncture_mess', 'cargo', 'puncture_bridge_200_228']);
    expect(descs).toHaveLength(3);
    expect(descs[0].kind).toBe('puncture');
    expect(descs[0].roomId).toBe('mess');
    expect(descs[0].areaM2).toBeCloseTo(punctureAreaM2(ATMOS_PUNCTURE_REFERENCE_DIAMETER_MM), 10);
    expect(descs[1].kind).toBe('breach');
    expect(descs[1].areaM2).toBe(ATMOS_FULL_BREACH_AREA_M2);
    expect(descs[2].x).toBe(200);
    expect(descs[2].y).toBe(228);
  });

  it('builds interior edges from open doors and vacuum edges from breaches', () => {
    const doors = createInitialDoors();
    const graph = buildCompartmentGraph(doors, ['puncture_mess']);
    expect(graph.interiorEdges.length).toBeGreaterThan(8);
    expect(graph.vacuumEdges).toHaveLength(1);
    const stbd = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbd) stbd.isOpen = true;
    const graph2 = buildCompartmentGraph(doors, []);
    expect(graph2.vacuumEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('splits corridor doors into fwd/mid/aft thirds', () => {
    expect(subCompartmentId('corridor', 100)).toBe('corridor_fwd');
    expect(subCompartmentId('corridor', 600)).toBe('corridor_mid');
    expect(subCompartmentId('corridor', 900)).toBe('corridor_aft');
    expect(subCompartmentId('mess', 900)).toBe('mess');
    expect(compartmentIndex('corridor_mid')).toBeGreaterThan(-1);
  });

  it('conserves total moles for interior-only equalization', () => {
    const states = nominalStates();
    const low = compartmentIndex('cargo');
    states[low] = { pressurePa: 50000, tempK: 294.15, o2Frac: 0.209, co2Frac: 0.0004 };
    const doors = createInitialDoors();
    const graph = buildCompartmentGraph(doors, []);
    const totalBefore = states.reduce(
      (s, st, i) => s + (st.pressurePa * COMPARTMENT_DEFS[i].volumeM3) / (8.314462618 * st.tempK),
      0
    );
    const out = tickCompartments(states, graph, 0.1);
    const totalAfter = out.reduce(
      (s, st, i) =>
        s + (st.pressurePa * COMPARTMENT_DEFS[i].volumeM3) / (8.314462618 * Math.max(st.tempK, 3)),
      0
    );
    expect(totalAfter).toBeCloseTo(totalBefore, totalBefore * 0.001 + 1e-6);
  });

  it('vents an open-door compartment in seconds and a puncture over minutes', () => {
    const doors = createInitialDoors();
    const stbd = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbd) stbd.isOpen = true;
    const inner = doors.find((d) => d.id === 'airlock_stbd_inner');
    if (inner) inner.isOpen = false;
    const graph = buildCompartmentGraph(doors, []);
    let states = nominalStates();
    for (let t = 0; t < 120; t++)
      states = tickCompartments(states, graph, 0.05).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    const idx = compartmentIndex('airlock_stbd');
    expect(states[idx].pressurePa).toBeLessThan(1);

    const doors2 = createInitialDoors();
    const graph2 = buildCompartmentGraph(doors2, ['puncture_mess']);
    let slow = nominalStates();
    for (let t = 0; t < 20; t++)
      slow = tickCompartments(slow, graph2, 0.05).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    const mess = compartmentIndex('mess');
    expect(slow[mess].pressurePa / 1000).toBeGreaterThan(95);
    for (let t = 0; t < 1180; t++)
      slow = tickCompartments(slow, graph2, 0.05).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    expect(slow[mess].pressurePa / 1000).toBeLessThan(101);
    expect(slow[mess].pressurePa / 1000).toBeGreaterThan(95);
  });

  it('keeps connected compartments at a common pressure while venting', () => {
    const doors = createInitialDoors();
    const graph = buildCompartmentGraph(doors, ['puncture_mess']);
    let states = nominalStates();
    for (let t = 0; t < 200; t++)
      states = tickCompartments(states, graph, 0.05).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    const messP = states[compartmentIndex('mess')].pressurePa;
    const aftP = states[compartmentIndex('corridor_aft')].pressurePa;
    expect(Math.abs(messP - aftP) / Math.max(1, messP)).toBeLessThan(0.02);
  });

  it('is dt-invariant across 50ms and 100ms steps', () => {
    const doors = createInitialDoors();
    const stbd = doors.find((d) => d.id === 'airlock_stbd_outer');
    if (stbd) stbd.isOpen = true;
    const graph = buildCompartmentGraph(doors, []);
    let fine = nominalStates();
    for (let t = 0; t < 10; t++)
      fine = tickCompartments(fine, graph, 0.05).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    let coarse = nominalStates();
    for (let t = 0; t < 5; t++)
      coarse = tickCompartments(coarse, graph, 0.1).map((s) => ({
        pressurePa: s.pressurePa,
        tempK: s.tempK,
        o2Frac: s.o2Frac,
        co2Frac: s.co2Frac,
      }));
    const idx = compartmentIndex('airlock_stbd');
    expect(
      Math.abs(fine[idx].pressurePa - coarse[idx].pressurePa) / Math.max(1, fine[idx].pressurePa)
    ).toBeLessThan(0.25);
  });

  it('scales weld time by breach size', () => {
    expect(getBreachWeldSeconds('puncture_mess')).toBe(3.0);
    expect(getBreachWeldSeconds('puncture_mess_815_228')).toBe(3.0);
    expect(getBreachWeldSeconds('cargo')).toBeGreaterThan(3.0);
  });
});
