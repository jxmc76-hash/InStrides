import Foundation
import SwiftData

@Model
final class Injury {
    var date: Date = Date()
    var bodyPart: String = ""
    var pain: Int = 5
    var notes: String = ""

    init(date: Date, bodyPart: String, pain: Int, notes: String = "") {
        self.date = date
        self.bodyPart = bodyPart
        self.pain = pain
        self.notes = notes
    }
}
