import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldOpenOnboarding } from '../src/onboardingState.js'

test('onboarding waits for persisted console preferences before opening', () => {
  assert.equal(shouldOpenOnboarding({ hydrated: false, onboardingVersion: 0 }), false)
  assert.equal(shouldOpenOnboarding({ hydrated: true, onboardingVersion: 0 }), true)
})

test('completed onboarding stays closed after hydration', () => {
  assert.equal(shouldOpenOnboarding({ hydrated: true, onboardingVersion: 1 }), true)
  assert.equal(shouldOpenOnboarding({ hydrated: true, onboardingVersion: 2 }), false)
  assert.equal(shouldOpenOnboarding({ hydrated: true, onboardingVersion: 3 }), false)
})
