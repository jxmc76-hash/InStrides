import Foundation
import SwiftData

// CloudKit sync requires every attribute to have a default (or be optional)
// and every relationship to be optional with an inverse.
@Model
final class TrainingPlan {
    var title: String = ""
    var startDate: Date = Date()
    var endDate: Date = Date()
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
    }
}

@Model
final class PlanSession {
    var date: Date = Date()
    var type: String = ""
    var target: String = ""
    var isComplete: Bool = false
    var linkedWorkoutID: UUID?
    var plan: TrainingPlan?

    init(date: Date, type: String, target: String) {
        self.date = date
        self.type = type
        self.target = target
    }
}
