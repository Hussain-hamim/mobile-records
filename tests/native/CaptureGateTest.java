import expo.modules.recordfingerprint.CaptureGate;

public class CaptureGateTest {
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  public static void main(String[] args) {
    CaptureGate gate = new CaptureGate();
    check(!gate.extract());
    gate.image(); check(gate.extract()); check(!gate.extract());
    gate.requireLift();
    for (int i=0;i<20;i++) { gate.image(); check(!gate.extract()); }
    check(gate.waiting());
    check(!gate.idle(0,0)); check(!gate.idle(0,100));
    gate.image(); // a held finger interrupts the release interval
    check(!gate.idle(0,200)); check(!gate.idle(0,300));
    check(!gate.idle(-8,400)); check(gate.waiting());
    for (int i=0;i<5;i++) check(!gate.idle(0,1000+i*2000));
    check(gate.waiting());
    check(!gate.idle(0,10000)); check(!gate.idle(0,10100));
    check(!gate.idle(0,10200)); check(!gate.idle(0,10300));
    check(gate.idle(0,10400)); check(!gate.waiting());
    check(!gate.extract()); gate.image(); check(gate.extract());
    gate.image(); gate.extractionFailed(); check(!gate.extract());
    gate.requireLift(); gate.reset(); check(!gate.waiting()); check(!gate.extract());
    System.out.println("Capture gate tests passed");
  }
}
