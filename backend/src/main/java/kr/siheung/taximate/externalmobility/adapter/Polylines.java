package kr.siheung.taximate.externalmobility.adapter;

import java.util.ArrayList;
import java.util.List;
import kr.siheung.taximate.common.geo.LatLng;

public final class Polylines {
    private Polylines() {}
    public static List<LatLng> limit(List<LatLng> points) { return limit(points, 200); }
    /** Evenly samples down to {@code max} points, always keeping the first and last. */
    public static List<LatLng> limit(List<LatLng> points, int max) {
        if (max < 2) throw new IllegalArgumentException("max must be >= 2");
        if (points.size() <= max) return List.copyOf(points);
        List<LatLng> out = new ArrayList<>(max);
        for (int i = 0; i < max; i++) out.add(points.get((int) ((long) i * (points.size() - 1) / (max - 1))));
        return List.copyOf(out);
    }
}
