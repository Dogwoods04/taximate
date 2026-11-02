package kr.siheung.taximate.externalmobility.adapter;

import java.util.ArrayList;
import java.util.List;
import kr.siheung.taximate.common.geo.LatLng;

public final class Polylines {
    private Polylines() {}
    public static List<LatLng> limit(List<LatLng> points) {
        if (points.size() <= 200) return List.copyOf(points);
        List<LatLng> out = new ArrayList<>(200);
        for (int i = 0; i < 200; i++) out.add(points.get((int) ((long) i * (points.size() - 1) / 199)));
        return List.copyOf(out);
    }
}
