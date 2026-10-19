// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/domain/CardStateMachine.test.ts
// Unit Tests: CardStateMachine Pure Domain Lifecycle Verification
// Test Runner: Node.js Built-in Test Runner via tsx (Zero external dependencies)
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CardStateMachine,
  CardStatus,
  ALLOWED_CARD_TRANSITIONS,
} from '../../src/domain/state-machines/CardStateMachine.js';
import { InvalidCardTransitionException } from '../../src/domain/exceptions/InvalidCardTransitionException.js';

describe('CardStateMachine Domain Unit Tests', () => {
  const allStatuses: CardStatus[] = [
    'GENERATED',
    'AVAILABLE',
    'SOLD',
    'ACTIVE',
    'EXPIRED',
    'CANCELLED',
    'SUSPENDED',
    'REVOKED',
  ];

  describe('1. Allowed Transitions Verification', () => {
    const allowedPairs: Array<[CardStatus, CardStatus]> = [
      // GENERATED
      ['GENERATED', 'AVAILABLE'],
      ['GENERATED', 'CANCELLED'],
      // AVAILABLE
      ['AVAILABLE', 'SOLD'],
      ['AVAILABLE', 'CANCELLED'],
      // SOLD
      ['SOLD', 'ACTIVE'],
      ['SOLD', 'CANCELLED'],
      // ACTIVE
      ['ACTIVE', 'EXPIRED'],
      ['ACTIVE', 'SUSPENDED'],
      ['ACTIVE', 'REVOKED'],
      // SUSPENDED
      ['SUSPENDED', 'ACTIVE'],
      ['SUSPENDED', 'REVOKED'],
    ];

    for (const [from, to] of allowedPairs) {
      it(`should allow transition from '${from}' to '${to}'`, () => {
        // Static check
        assert.equal(CardStateMachine.canTransition(from, to), true);
        const result = CardStateMachine.transition(from, to);
        assert.equal(result, to);

        // Instance check
        const sm = new CardStateMachine();
        assert.equal(sm.canTransition(from, to), true);
        assert.equal(sm.transition(from, to), to);
      });
    }

    it('should verify total allowed transitions count matches specification (11 transitions)', () => {
      let totalCount = 0;
      for (const status of allStatuses) {
        totalCount += ALLOWED_CARD_TRANSITIONS[status].length;
      }
      assert.equal(totalCount, 11);
    });
  });

  describe('2. Forbidden Transitions Verification', () => {
    const forbiddenPairs: Array<[CardStatus, CardStatus]> = [
      // Illegal jumps bypassing lifecycle
      ['GENERATED', 'ACTIVE'],
      ['GENERATED', 'SOLD'],
      ['GENERATED', 'EXPIRED'],
      ['GENERATED', 'REVOKED'],
      ['GENERATED', 'SUSPENDED'],
      ['AVAILABLE', 'ACTIVE'],
      ['AVAILABLE', 'EXPIRED'],
      ['AVAILABLE', 'SUSPENDED'],
      ['AVAILABLE', 'REVOKED'],
      ['SOLD', 'EXPIRED'],
      ['SOLD', 'SUSPENDED'],
      ['SOLD', 'REVOKED'],
      // Backward transitions
      ['ACTIVE', 'GENERATED'],
      ['ACTIVE', 'AVAILABLE'],
      ['ACTIVE', 'SOLD'],
      ['SUSPENDED', 'GENERATED'],
      ['SUSPENDED', 'AVAILABLE'],
      ['SUSPENDED', 'SOLD'],
      ['SUSPENDED', 'EXPIRED'],
      // Self transitions
      ['GENERATED', 'GENERATED'],
      ['AVAILABLE', 'AVAILABLE'],
      ['SOLD', 'SOLD'],
      ['ACTIVE', 'ACTIVE'],
      ['SUSPENDED', 'SUSPENDED'],
    ];

    for (const [from, to] of forbiddenPairs) {
      it(`should prohibit illegal transition from '${from}' to '${to}' and throw InvalidCardTransitionException`, () => {
        // Static check
        assert.equal(CardStateMachine.canTransition(from, to), false);
        assert.throws(
          () => CardStateMachine.transition(from, to),
          (err: unknown) => {
            assert.ok(err instanceof InvalidCardTransitionException);
            assert.equal(err.fromStatus, from);
            assert.equal(err.toStatus, to);
            assert.match(err.message, new RegExp(`Invalid card status transition from '${from}' to '${to}'`));
            return true;
          }
        );

        // Instance check
        const sm = new CardStateMachine();
        assert.equal(sm.canTransition(from, to), false);
        assert.throws(
          () => sm.transition(from, to),
          (err: unknown) => {
            assert.ok(err instanceof InvalidCardTransitionException);
            return true;
          }
        );
      });
    }
  });

  describe('3. Terminal States Verification', () => {
    const terminalStates: CardStatus[] = ['EXPIRED', 'CANCELLED', 'REVOKED'];

    for (const terminal of terminalStates) {
      describe(`Terminal State: ${terminal}`, () => {
        it(`should have zero allowed transitions defined`, () => {
          assert.equal(ALLOWED_CARD_TRANSITIONS[terminal].length, 0);
        });

        for (const target of allStatuses) {
          it(`should reject any transition from terminal '${terminal}' to '${target}'`, () => {
            assert.equal(CardStateMachine.canTransition(terminal, target), false);
            assert.throws(
              () => CardStateMachine.transition(terminal, target),
              (err: unknown) => {
                assert.ok(err instanceof InvalidCardTransitionException);
                assert.equal(err.fromStatus, terminal);
                assert.equal(err.toStatus, target);
                return true;
              }
            );
          });
        }
      });
    }
  });
});
