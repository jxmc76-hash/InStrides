import SwiftUI

/// One day of the fitness/fatigue model.
struct TrainingLoadPoint: Identifiable, Hashable, Sendable {
    let date: Date
    /// Training impulse accumulated on this day.
    let load: Double
    /// Chronic training load (42-day exponentially weighted average), a proxy for fitness.
    let fitness: Double
    /// Acute training load (7-day exponentially weighted average), a proxy for fatigue.
    let fatigue: Double

    var id: Date { date }

    /// Training stress balance: positive means fresh, negative means carrying fatigue.
    var form: Double { fitness - fatigue }

    var status: FormStatus { FormStatus(form: form) }
}

enum FormStatus: Sendable {
    case fresh
    case neutral
    case productive
    case overreaching

    init(form: Double) {
        switch form {
        case 5...: self = .fresh
        case -10..<5: self = .neutral
        case -30 ..< -10: self = .productive
        default: self = .overreaching
        }
    }

    var title: String {
        switch self {
        case .fresh: "Fresh"
        case .neutral: "Maintaining"
        case .productive: "Building"
        case .overreaching: "High fatigue"
        }
    }

    var advice: String {
        switch self {
        case .fresh: "Well rested — a good time for a hard session or race."
        case .neutral: "Load and recovery are balanced."
        case .productive: "You're carrying productive fatigue that builds fitness."
        case .overreaching: "Fatigue is well above fitness. Consider an easy day or rest."
        }
    }

    var color: Color {
        switch self {
        case .fresh: .blue
        case .neutral: .green
        case .productive: .orange
        case .overreaching: .red
        }
    }
}

/// Banister impulse-response model using heart-rate-reserve TRIMP.
struct TrainingLoadCalculator: Sendable {
    static let fitnessDays = 42.0
    static let fatigueDays = 7.0

    var maxHeartRate: Double
    var restingHeartRate: Double
    var sex: BiologicalSex = .unspecified

    /// Banister TRIMP = minutes × HRr × a × e^(b × HRr), where HRr is the fraction of heart-rate
    /// reserve. Falls back to a per-activity estimate when there is no heart-rate data.
    func trimp(for workout: WorkoutSummary) -> Double {
        let minutes = workout.duration / 60
        guard let averageHR = workout.averageHeartRate, maxHeartRate > restingHeartRate else {
            return minutes * workout.kind.fallbackLoadPerMinute
        }
        let reserve = min(max((averageHR - restingHeartRate) / (maxHeartRate - restingHeartRate), 0), 1)
        let male = 0.64 * exp(1.92 * reserve)
        let female = 0.86 * exp(1.67 * reserve)
        let weighting: Double = switch sex {
        case .male: male
        case .female: female
        case .unspecified: (male + female) / 2
        }
        return minutes * reserve * weighting
    }

    /// Total load per calendar day, keyed by start of day.
    func dailyLoads(_ workouts: [WorkoutSummary], calendar: Calendar) -> [Date: Double] {
        workouts.reduce(into: [:]) { totals, workout in
            totals[calendar.startOfDay(for: workout.start), default: 0] += trimp(for: workout)
        }
    }

    /// Daily fitness/fatigue series from `start` through `end` inclusive. Start well before the
    /// period you display (six weeks or more) so the averages have time to warm up.
    func series(_ workouts: [WorkoutSummary], from start: Date, through end: Date, calendar: Calendar) -> [TrainingLoadPoint] {
        let loads = dailyLoads(workouts, calendar: calendar)
        let lastDay = calendar.startOfDay(for: end)
        var day = calendar.startOfDay(for: start)
        var fitness = 0.0
        var fatigue = 0.0
        var points: [TrainingLoadPoint] = []
        while day <= lastDay {
            let load = loads[day] ?? 0
            fitness += (load - fitness) / Self.fitnessDays
            fatigue += (load - fatigue) / Self.fatigueDays
            points.append(TrainingLoadPoint(date: day, load: load, fitness: fitness, fatigue: fatigue))
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return points
    }
}
