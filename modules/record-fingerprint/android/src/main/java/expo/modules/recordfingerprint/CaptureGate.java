package expo.modules.recordfingerprint;

/** Debounces the bundled SDK's idle (zero/no image) callbacks between impressions. */
public final class CaptureGate {
  private boolean waiting;
  private boolean image;
  private long firstIdle = -1;
  private long lastIdle = -1;
  public void reset() { waiting = false; image = false; resetIdle(); }
  private void resetIdle() { firstIdle = -1; lastIdle = -1; }
  public boolean waiting() { return waiting; }
  public void requireLift() { waiting = true; image = false; resetIdle(); }
  public void image() { image = !waiting; resetIdle(); }
  public boolean extract() {
    boolean accept = image && !waiting;
    image = false;
    return accept;
  }
  public void extractionFailed() { image = false; resetIdle(); }
  public boolean idle(int code, long now) {
    image = false;
    if (code != 0) { resetIdle(); return false; }
    // Failed quality captures can also return zero, but take longer. Never count
    // sparse errors, one empty frame, or an extraction failure as a release.
    if (lastIdle < 0 || now - lastIdle > 250 || now < lastIdle) firstIdle = now;
    lastIdle = now;
    if (waiting && now - firstIdle >= 400) {
      waiting = false;
      resetIdle();
      return true;
    }
    return false;
  }
}
