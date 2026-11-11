// Host-side swing timing. The phone reports how long after it received the
// hit window the gesture finished. Subtract the one-way trip so a swing that
// meets the ball is 0, early is negative, and late is positive.
export function judgeTiming({ swingAfterRecvMs, contactInMs, rttMs }) {
  const error = swingAfterRecvMs - (contactInMs - rttMs / 2);
  const timing = error / 180;
  if (timing > 1) return 1;
  if (timing < -1) return -1;
  return timing;
}
