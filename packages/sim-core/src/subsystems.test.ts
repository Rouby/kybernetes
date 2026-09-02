import { describe, expect, it } from 'vitest';
import { createInitialVesselState, tickVesselState } from './state';
import {
  applyDamageToDefenses,
  calculateHullStatus,
  calculateShieldStatus,
  createInitialHull,
  createInitialShields,
  repairHullPlating,
  tickShields,
} from './systems/hull';
import {
  calculateLifeSupportStatus,
  calibrateScrubbers,
  createInitialLifeSupport,
  tickLifeSupport,
} from './systems/lifeSupport';
import {
  createInitialDefense,
  createNavalDamageEvent,
  deployFireSuppression,
  interceptNavalEvent,
  resolveEventImpact,
} from './systems/navalCombat';
import {
  calculateReactorStatus,
  createInitialReactor,
  refillReactorCoolant,
  tickReactor,
  ventReactorCoolant,
} from './systems/reactor';

describe('Milestone 3 Subsystem Simulation Math', () => {
  describe('Reactor Thermal Dynamics', () => {
    it('initializes with nominal status and baseline temperature', () => {
      const reactor = createInitialReactor();
      expect(reactor.tempKelvin).toBe(320);
      expect(reactor.coolantLevelPercent).toBe(100);
      expect(reactor.status).toBe('nominal');
    });

    it('calculates status thresholds accurately', () => {
      expect(calculateReactorStatus(550)).toBe('nominal');
      expect(calculateReactorStatus(600)).toBe('degraded');
      expect(calculateReactorStatus(850)).toBe('degraded');
      expect(calculateReactorStatus(900)).toBe('critical');
      expect(calculateReactorStatus(1100)).toBe('critical');
    });

    it('heats reactor under load and cools with coolant factor', () => {
      const initial = createInitialReactor();
      // Tick with extra external heat
      const heated = tickReactor(initial, 5, 20);
      expect(heated.tempKelvin).toBeGreaterThan(initial.tempKelvin);
    });

    it('vents coolant to rapidly shed heat', () => {
      const initial = { ...createInitialReactor(), tempKelvin: 850, coolantLevelPercent: 80 };
      const { nextReactor, success, tempDrop } = ventReactorCoolant(initial);

      expect(success).toBe(true);
      expect(tempDrop).toBe(150);
      expect(nextReactor.tempKelvin).toBe(700);
      expect(nextReactor.coolantLevelPercent).toBe(60);
    });

    it('refuses venting when coolant is depleted below minimum threshold', () => {
      const depleted = { ...createInitialReactor(), coolantLevelPercent: 10 };
      const { success, tempDrop } = ventReactorCoolant(depleted);
      expect(success).toBe(false);
      expect(tempDrop).toBe(0);
    });

    it('refills coolant up to maximum 100%', () => {
      const low = { ...createInitialReactor(), coolantLevelPercent: 50 };
      const refilled = refillReactorCoolant(low, 30);
      expect(refilled.coolantLevelPercent).toBe(80);

      const capped = refillReactorCoolant(refilled, 40);
      expect(capped.coolantLevelPercent).toBe(100);
    });
  });

  describe('Life Support Scrubbers', () => {
    it('initializes with nominal status and full efficiency', () => {
      const ls = createInitialLifeSupport();
      expect(ls.o2LevelPercent).toBe(99.4);
      expect(ls.scrubberEfficiencyPercent).toBe(100);
      expect(ls.status).toBe('nominal');
    });

    it('evaluates status thresholds correctly', () => {
      expect(calculateLifeSupportStatus(95)).toBe('nominal');
      expect(calculateLifeSupportStatus(85)).toBe('degraded');
      expect(calculateLifeSupportStatus(65)).toBe('critical');
    });

    it('drains O2 rapidly when breaches and fires are active', () => {
      const baseline = createInitialLifeSupport();
      const intact = tickLifeSupport(baseline, 10, 0, 0);

      const breached = tickLifeSupport(baseline, 10, 2, 1);
      expect(breached.o2LevelPercent).toBeLessThan(intact.o2LevelPercent);
    });

    it('calibrates scrubbers back to 100% efficiency', () => {
      const degraded = { ...createInitialLifeSupport(), scrubberEfficiencyPercent: 45 };
      const calibrated = calibrateScrubbers(degraded);
      expect(calibrated.scrubberEfficiencyPercent).toBe(100);
    });
  });

  describe('Hull Plating & Shield Mitigation', () => {
    it('initializes hull and shields at 100%', () => {
      const hull = createInitialHull();
      const shields = createInitialShields();
      expect(hull.integrityPercent).toBe(100);
      expect(hull.breaches).toHaveLength(0);
      expect(shields.integrityPercent).toBe(100);
    });

    it('evaluates shield and hull status', () => {
      expect(calculateShieldStatus(100)).toBe('nominal');
      expect(calculateShieldStatus(50)).toBe('degraded');
      expect(calculateShieldStatus(10)).toBe('critical');

      expect(calculateHullStatus(100, 10)).toBe('nominal');
      expect(calculateHullStatus(70, 40)).toBe('degraded');
      expect(calculateHullStatus(30, 80)).toBe('critical');
      expect(calculateHullStatus(90, 90)).toBe('critical');
    });

    it('shields absorb 75% of raw incoming damage before penetrating hull', () => {
      const shields = createInitialShields();
      const hull = createInitialHull();

      const result = applyDamageToDefenses(shields, hull, 40, 'engineering');
      expect(result.absorbedByShields).toBe(30);
      expect(result.dealtToHull).toBe(10);
      expect(result.nextShields.integrityPercent).toBe(70);
      expect(result.nextHull.integrityPercent).toBe(90);
    });

    it('applies breach when damage penetrates heavily into target room', () => {
      const depletedShields = { ...createInitialShields(), integrityPercent: 0 };
      const hull = createInitialHull();

      const result = applyDamageToDefenses(depletedShields, hull, 30, 'cargo');
      expect(result.breachOccurred).toBe(true);
      expect(result.nextHull.breaches).toContain('cargo');
    });

    it('welds hull plating to patch breaches and restore integrity', () => {
      const damagedHull = {
        ...createInitialHull(),
        integrityPercent: 60,
        stressPercent: 50,
        breaches: ['engineering'],
      };

      const { nextHull, patchedBreach } = repairHullPlating(damagedHull, 'engineering');
      expect(patchedBreach).toBe(true);
      expect(nextHull.breaches).not.toContain('engineering');
      expect(nextHull.integrityPercent).toBe(75);
      expect(nextHull.stressPercent).toBe(30);
    });

    it('recharges shields when reactor has active output', () => {
      const lowShields = { ...createInitialShields(), integrityPercent: 50 };
      const recharged = tickShields(lowShields, 10, 45.5);
      expect(recharged.integrityPercent).toBeGreaterThan(50);
    });
  });

  describe('Naval Damage Events & Triage', () => {
    it('creates torpedo, radiation, and meteor storm events', () => {
      const torpedo = createNavalDamageEvent('torpedo_run', 'engineering');
      expect(torpedo.type).toBe('torpedo_run');
      expect(torpedo.timeToImpactSeconds).toBe(16);
      expect(torpedo.targetRoomId).toBe('engineering');

      const rad = createNavalDamageEvent('radiation_burst');
      expect(rad.type).toBe('radiation_burst');

      const meteor = createNavalDamageEvent('micrometeor_storm');
      expect(meteor.type).toBe('micrometeor_storm');
    });

    it('intercepts incoming torpedo with PDT', () => {
      const defense = createInitialDefense();
      const torpedo = createNavalDamageEvent('torpedo_run');

      // Roll 0.3 is <= threshold 0.75 -> success
      const result = interceptNavalEvent(torpedo, defense, false, 0.3);
      expect(result.success).toBe(true);
      expect(result.nextEvent.status).toBe('mitigated');
      expect(result.nextDefense.pdtAmmo).toBe(9);
    });

    it('fails interception when out of ammo', () => {
      const defense = { ...createInitialDefense(), pdtAmmo: 0 };
      const torpedo = createNavalDamageEvent('torpedo_run');

      const result = interceptNavalEvent(torpedo, defense, false, 0.1);
      expect(result.success).toBe(false);
      expect(result.nextEvent.status).toBe('incoming');
    });

    it('resolves torpedo impact creating fires and damaging defenses', () => {
      const event = createNavalDamageEvent('torpedo_run', 'engineering');
      const baseState = {
        reactor: createInitialReactor(),
        lifeSupport: createInitialLifeSupport(),
        hull: createInitialHull(),
        shields: createInitialShields(),
        activeFires: [],
      };

      const impact = resolveEventImpact(event, baseState);
      expect(impact.activeFires).toContain('engineering');
      expect(impact.shields.integrityPercent).toBeLessThan(100);
      expect(impact.resolvedEvent.status).toBe('impacting');
    });

    it('extinguishes compartment fire with fire suppression foam', () => {
      const fires = ['engineering', 'cargo'];
      const { nextFires, extinguished } = deployFireSuppression(fires, 'engineering');
      expect(extinguished).toBe(true);
      expect(nextFires).toEqual(['cargo']);
    });
  });

  describe('Vessel State Integration & Escalation', () => {
    it('escalates alertLevel to red when active fires or incoming threats exist', () => {
      const state = createInitialVesselState();
      expect(state.alertLevel).toBe('nominal');

      const torpedo = createNavalDamageEvent('torpedo_run');
      const stateWithThreat = { ...state, activeEvents: [torpedo] };
      const ticked = tickVesselState(stateWithThreat, 1);

      expect(ticked.alertLevel).toBe('red');
    });

    it('ticks event countdown and impacts automatically when timer elapses', () => {
      const state = createInitialVesselState();
      const torpedo = {
        ...createNavalDamageEvent('torpedo_run', 'engineering'),
        timeToImpactSeconds: 1,
      };
      const stateWithThreat = { ...state, activeEvents: [torpedo] };

      // Tick for 2 seconds so timeToImpact hits 0
      const ticked = tickVesselState(stateWithThreat, 2);
      expect(ticked.activeFires).toContain('engineering');
    });
  });
});
