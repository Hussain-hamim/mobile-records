package expo.modules.recordocr;

/** Pixel-only skew estimation; no Android dependencies, I/O, or retained data. */
public final class MrzDeskew {
  private MrzDeskew() {}

  public static double angle(byte[] gray, int width, int height) {
    if (width < 30 || height < 15 || gray.length != width * height) return 0;
    int[] histogram = new int[256];
    for (byte pixel : gray) histogram[pixel & 255]++;
    long total = gray.length, sum = 0, partial = 0, weight = 0;
    for (int i = 0; i < 256; i++) sum += (long) i * histogram[i];
    double variance = -1;
    int threshold = 0;
    for (int i = 0; i < 255; i++) {
      weight += histogram[i];
      partial += (long) i * histogram[i];
      if (weight == 0 || weight == total) continue;
      double difference = (double) partial / weight - (double) (sum - partial) / (total - weight);
      double score = (double) weight * (total - weight) * difference * difference;
      if (score > variance) { variance = score; threshold = i; }
    }
    // White borders can make Otsu separate the entire coloured card from the
    // border. Restrict analysis to the darkest ink instead of that background.
    int cumulative = 0;
    for (int i = 0; i < 256; i++) {
      cumulative += histogram[i];
      if (cumulative >= total * 0.15) { threshold = Math.min(threshold, i); break; }
    }
    int[] xs = new int[gray.length], ys = new int[gray.length];
    int count = 0;
    // Ignore edge artifacts. A small inset still retains every text baseline.
    for (int y = 2; y < height - 2; y++) {
      for (int x = 2; x < width - 2; x++) {
        if ((gray[y * width + x] & 255) <= threshold) {
          xs[count] = x - width / 2;
          ys[count++] = y;
        }
      }
    }
    if (count < 100 || count > gray.length * 0.55) return 0;
    int margin = width / 4 + 2;
    long best = 0, upright = 0;
    double angle = 0;
    int[] rows = new int[height + 2 * margin];
    for (int step = -32; step <= 32; step++) {
      double degrees = step * 0.25;
      double slope = Math.tan(Math.toRadians(degrees));
      java.util.Arrays.fill(rows, 0);
      for (int i = 0; i < count; i++) {
        int row = (int) Math.round(ys[i] - slope * xs[i]) + margin;
        if (row >= 0 && row < rows.length) rows[row]++;
      }
      long score = 0;
      for (int row : rows) score += (long) row * row;
      if (step == 0) upright = score;
      if (score > best) { best = score; angle = degrees; }
    }
    // Avoid rotating noise or already straight text for a negligible gain.
    return best > upright * 1.025 ? angle : 0;
  }
}
