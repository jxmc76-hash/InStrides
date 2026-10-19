import Foundation
import EventKit
import UIKit

@MainActor
final class CalendarSyncManager {
    static let shared = CalendarSyncManager()
    private let store = EKEventStore()
    private let calendarTitle = "InStrides Training"

    func requestAccess() async -> Bool {
        if #available(iOS 17, *) {
            return (try? await store.requestFullAccessToEvents()) ?? false
        } else {
            return await withCheckedContinuation { cont in
                store.requestAccess(to: .event) { granted, _ in
                    cont.resume(returning: granted)
                }
            }
        }
    }

    func sync(plan: TrainingPlan, eventIDs: [String: String]) async -> [String: String] {
        guard await requestAccess() else { return eventIDs }

        let calendar = getOrCreateCalendar()
        var updated = eventIDs

        for session in plan.sessions {
            let key = session.persistentModelID.hashValue.description
            if let existingID = eventIDs[key],
               let event = store.event(withIdentifier: existingID) {
                configureEvent(event, session: session, plan: plan)
                try? store.save(event, span: .thisEvent)
                updated[key] = event.eventIdentifier
            } else {
                let event = EKEvent(eventStore: store)
                event.calendar = calendar
                configureEvent(event, session: session, plan: plan)
                try? store.save(event, span: .thisEvent)
                if let id = event.eventIdentifier {
                    updated[key] = id
                }
            }
        }

        return updated
    }

    func removeAll(eventIDs: [String: String]) {
        for id in eventIDs.values {
            if let event = store.event(withIdentifier: id) {
                try? store.remove(event, span: .thisEvent)
            }
        }
    }

    private func configureEvent(_ event: EKEvent, session: PlanSession, plan: TrainingPlan) {
        event.title = "\(session.type): \(session.target)"
        event.notes = plan.title
        event.startDate = session.date
        event.endDate = Calendar.current.date(byAdding: .hour, value: 1, to: session.date) ?? session.date
        event.isAllDay = false
    }

    private func getOrCreateCalendar() -> EKCalendar {
        if let cal = store.calendars(for: .event).first(where: { $0.title == calendarTitle }) {
            return cal
        }
        let cal = EKCalendar(for: .event, eventStore: store)
        cal.title = calendarTitle
        cal.cgColor = UIColor.systemOrange.cgColor
        cal.source = store.defaultCalendarForNewEvents?.source ?? store.sources.first
        try? store.saveCalendar(cal, commit: true)
        return cal
    }
}
