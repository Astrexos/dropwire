// client/src/utils/stealthGuard.js

export function filterOutboundCandidate(candidate, isStealthMode) {
  if (!candidate || !candidate.candidate) return null;

  if (isStealthMode && !candidate.candidate.includes('typ relay')) {
    return null;
  }

  return candidate;
}

