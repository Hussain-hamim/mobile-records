import expo.modules.recordocr.MrzDeskew;
import java.util.Arrays;

public class MrzDeskewTest {
  public static void main(String[] args) {
    int w = 800, h = 260;
    for (double expected : new double[] {-6, -3, 0, 3, 6}) {
      byte[] gray = new byte[w*h];
      Arrays.fill(gray, (byte) 220);
      double slope = Math.tan(Math.toRadians(expected));
      for (int row = 0; row < 3; row++) {
        for (int glyph = 0; glyph < 30; glyph++) {
          for (int dx = 0; dx < 12; dx++) {
            for (int dy = 0; dy < 25; dy++) {
              if (dx > 3 && dy > 3 && dy < 21) continue;
              int x = 50 + glyph * 23 + dx;
              int y = 50 + row * 60 + dy + (int)Math.round((x-w/2)*slope);
              gray[y*w+x] = 20;
            }
          }
        }
      }
      double result = MrzDeskew.angle(gray, w, h);
      if (Math.abs(expected-result) > 0.5) throw new AssertionError("Wrong skew: " + expected + " -> " + result);
    }
    byte[] blank = new byte[w*h];
    Arrays.fill(blank, (byte)255);
    if (MrzDeskew.angle(blank,w,h) != 0) throw new AssertionError("Blank image rotated");
    if (MrzDeskew.angle(new byte[0],0,0) != 0) throw new AssertionError("Empty input");
    System.out.println("Native skew tests passed");
  }
}
