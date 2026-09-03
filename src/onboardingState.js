export const ONBOARDING_VERSION = 2

export function shouldOpenOnboarding({ hydrated, onboardingVersion }) {
  return hydrated === true && Number(onboardingVersion || 0) < ONBOARDING_VERSION
}
