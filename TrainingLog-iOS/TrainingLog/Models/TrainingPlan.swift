import Foundation
import SwiftData

// CloudKit rules: every property needs a default value (or be optional),
// relationships need an inverse, and no unique constraints.

@Model
final class TrainingPlan {
    var title: String = ""
    var startDate: Date = Date()
    var endDate: Date = Date()
    // CloudKit requires relationships to be optional, so the stored list is optional
    // and `sessions` is a non-optional wrapper the rest of the app keeps using.
    @Relationship(deleteRule: .cascade, originalName: "sessions", inverse: \PlanSession.plan)
    var sessionsStorage: [PlanSession]? = []

    var sessions: [PlanSession] {
        get { sessionsStorage ?? [] }
        set { sessionsStorage = newValue }
    }

    init(title: String, startDate: Date, endDate: Date) {
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.sessionsStorage = []
    }
}

@Model
final class PlanSession {
    var date: Date = Date()
    var type: String = ""
    var target: String = ""
    var isComplete: Bool = false
    var linkedWorkoutID: UUID? = nil
    var plan: TrainingPlan? = nil

    init(date: Date, type: String, target: String) {
        self.date = date
        self.type = type
        self.target = target
        self.isComplete = false
    }
}

// MARK: - Calendar export (.ics)
/// Builds a standard .ics calendar file for a training plan so it can be
/// imported into Google Calendar, Outlook, Apple Calendar, etc.
enum ICSExporter {
    static func fileURL(for plan: TrainingPlan) -> URL {
        let safeName = plan.title
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let name = safeName.isEmpty ? "TrainingPlan" : safeName
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).ics")
        try? makeICS(for: plan).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    static func makeICS(for plan: TrainingPlan) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = TimeZone(identifier: "UTC")
        fmt.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        let stamp = fmt.string(from: Date())

        var lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//InStrides//TrainingLog//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:\(escape(plan.title))"
        ]

        for s in plan.sessions.sorted(by: { $0.date < $1.date }) {
            let end = Calendar.current.date(byAdding: .hour, value: 1, to: s.date) ?? s.date
            let uidSeed = "\(plan.title)-\(Int(s.date.timeIntervalSince1970))-\(s.type)"
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
                .joined(separator: "-")
            let title = s.target.isEmpty ? s.type : "\(s.type): \(s.target)"
            lines += [
                "BEGIN:VEVENT",
                "UID:\(uidSeed)@instrides.app",
                "DTSTAMP:\(stamp)",
                "DTSTART:\(fmt.string(from: s.date))",
                "DTEND:\(fmt.string(from: end))",
                "SUMMARY:\(escape(title))",
                "DESCRIPTION:\(escape(plan.title))",
                "END:VEVENT"
            ]
        }
        lines.append("END:VCALENDAR")
        return lines.joined(separator: "\r\n") + "\r\n"
    }

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: ";", with: "\\;")
            .replacingOccurrences(of: ",", with: "\\,")
            .replacingOccurrences(of: "\n", with: "\\n")
    }
}
