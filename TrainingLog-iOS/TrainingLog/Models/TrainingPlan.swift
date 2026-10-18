import Foundation
import SwiftData

@Model
final class TrainingPlan {
    var title: String
    var startDate: Date
    var endDate: Date
    @Relationship(deleteRule: .cascade) var sessions: [PlanSession]

    init(title: String, startDate: Date, endDate: Date) {
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.sessions = []
    }
}

@Model
final class PlanSession {
    var date: Date
    var type: String
    var target: String
    var isComplete: Bool
    var linkedWorkoutID: UUID?

    init(date: Date, type: String, target: String) {
        self.date = date
        self.type = type
        self.target = target
        self.isComplete = false
    }
}
