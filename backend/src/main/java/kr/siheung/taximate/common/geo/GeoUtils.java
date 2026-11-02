package kr.siheung.taximate.common.geo;

import java.util.ArrayList;
import java.util.List;

/**
 * Small spherical-geometry helpers used in Java-side scoring.
 * Radius filtering is done in PostGIS (geography, meters); these are for 2nd-stage evaluation only.
 */
public final class GeoUtils {
    public static final double EARTH_RADIUS_M = 6_371_008.8;

    private GeoUtils() {
    }

    /** Great-circle distance in meters. */
    public static double distanceMeters(LatLng a, LatLng b) {
        double lat1 = Math.toRadians(a.lat()), lat2 = Math.toRadians(b.lat());
        double dLat = lat2 - lat1, dLng = Math.toRadians(b.lng() - a.lng());
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** Initial bearing in degrees [0, 360). */
    public static double bearingDegrees(LatLng from, LatLng to) {
        double lat1 = Math.toRadians(from.lat()), lat2 = Math.toRadians(to.lat());
        double dLng = Math.toRadians(to.lng() - from.lng());
        double y = Math.sin(dLng) * Math.cos(lat2);
        double x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /** Cosine of the angle between two bearings (1 = same direction, -1 = opposite). */
    public static double bearingCosine(double bearingA, double bearingB) {
        return Math.cos(Math.toRadians(bearingA - bearingB));
    }

    /** Total length of a polyline in meters. */
    public static double pathLengthMeters(List<LatLng> path) {
        double sum = 0;
        for (int i = 1; i < path.size(); i++) {
            sum += distanceMeters(path.get(i - 1), path.get(i));
        }
        return sum;
    }

    /** Shortest distance (m) from point p to segment a-b, using a local equirectangular projection. */
    public static double distanceToSegmentMeters(LatLng p, LatLng a, LatLng b) {
        double refLat = Math.toRadians(p.lat());
        double kx = Math.toRadians(1) * EARTH_RADIUS_M * Math.cos(refLat);
        double ky = Math.toRadians(1) * EARTH_RADIUS_M;
        double ax = (a.lng() - p.lng()) * kx, ay = (a.lat() - p.lat()) * ky;
        double bx = (b.lng() - p.lng()) * kx, by = (b.lat() - p.lat()) * ky;
        double dx = bx - ax, dy = by - ay;
        double len2 = dx * dx + dy * dy;
        double t = len2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        double cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt(cx * cx + cy * cy);
    }

    /** Shortest distance (m) from p to a polyline. */
    public static double distanceToPathMeters(LatLng p, List<LatLng> path) {
        if (path.isEmpty()) {
            return Double.POSITIVE_INFINITY;
        }
        if (path.size() == 1) {
            return distanceMeters(p, path.get(0));
        }
        double best = Double.POSITIVE_INFINITY;
        for (int i = 1; i < path.size(); i++) {
            best = Math.min(best, distanceToSegmentMeters(p, path.get(i - 1), path.get(i)));
        }
        return best;
    }

    /** Resample a polyline at roughly fixed spacing (meters). Always keeps first and last points. */
    public static List<LatLng> resample(List<LatLng> path, double spacingMeters) {
        List<LatLng> out = new ArrayList<>();
        if (path.isEmpty()) {
            return out;
        }
        out.add(path.get(0));
        double carry = 0;
        for (int i = 1; i < path.size(); i++) {
            LatLng a = path.get(i - 1), b = path.get(i);
            double seg = distanceMeters(a, b);
            double pos = spacingMeters - carry;
            while (pos <= seg) {
                double t = pos / seg;
                out.add(LatLng.of(a.lat() + (b.lat() - a.lat()) * t, a.lng() + (b.lng() - a.lng()) * t));
                pos += spacingMeters;
            }
            carry = seg - (pos - spacingMeters);
        }
        LatLng last = path.get(path.size() - 1);
        if (!out.get(out.size() - 1).equals(last)) {
            out.add(last);
        }
        return out;
    }
}
