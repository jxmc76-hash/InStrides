import Foundation

/// Display formatting. Functions take an explicit `metric` flag so they are deterministic in tests;
/// by default they follow the device's measurement system.
enum Format {
    static var prefersMetric: Bool {
        Locale.current.measurementSystem == .metric
    }

    static let metersPerMile = 1609.344

    static func distance(_ meters: Double, metric: Bool = prefersMetric) -> String {
        let value = metric ? meters / 1000 : meters / metersPerMile
        let pattern = value < 10 ? "%.2f %@" : "%.1f %@"
        return String(format: pattern, value, metric ? "km" : "mi")
    }

    /// Clock-style duration: "45:12" or "1:05:32".
    static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }

    /// Compact duration: "45m" or "1h 05m".
    static func shortDuration(_ seconds: TimeInterval) -> String {
        let totalMinutes = Int((seconds / 60).rounded())
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return hours > 0 ? String(format: "%dh %02dm", hours, minutes) : "\(minutes)m"
    }

    static func paceLabel(for kind: ActivityKind) -> String {
        kind == .cycle ? "Speed" : "Pace"
    }

    /// Pace (or speed for rides) appropriate to the activity: "5:12 /km", "28.4 km/h", "1:52 /100m".
    static func pace(duration: TimeInterval, meters: Double, kind: ActivityKind, metric: Bool = prefersMetric) -> String? {
        guard meters > 0, duration > 0 else { return nil }
        switch kind {
        case .cycle:
            let metersPerSecond = meters / duration
            let speed = metric ? metersPerSecond * 3.6 : metersPerSecond * 3600 / metersPerMile
            return String(format: "%.1f %@", speed, metric ? "km/h" : "mph")
        case .swim, .row:
            let hundred = metric ? 100.0 : 91.44
            return clock(duration / (meters / hundred)) + (metric ? " /100m" : " /100yd")
        default:
            let unit = metric ? 1000.0 : metersPerMile
            return clock(duration / (meters / unit)) + (metric ? " /km" : " /mi")
        }
    }

    private static func clock(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    static func elevation(_ meters: Double, metric: Bool = prefersMetric) -> String {
        metric ? String(format: "%.0f m", meters) : String(format: "%.0f ft", meters * 3.28084)
    }
}
