import Foundation
import EventKit
import UIKit
import SwiftData

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

    /// A key for a session that stays the same between app launches.
    static func key(for session: PlanSession) -> String {
        if let data = try? JSONEncoder().encode(session.persistentModelID),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return session.persistentModelID.hashValue.description
    }

    /// Rebuilds the "InStrides Training" calendar from the current plans: removes the
    /// events created before (and anything left over in that calendar), then adds one
    /// event per session. Returns the new session-to-event map.
    func sync(plans: [TrainingPlan], eventIDs: [String: String], lengthMinutes: Int) async -> [String: String] {
        guard await requestAccess() else { return eventIDs }

        let calendar = getOrCreateCalendar()
        let sessions = plans.flatMap(\.sessions)

        // 1. Remove events created by earlier syncs.
        for id in eventIDs.values {
            if let event = store.event(withIdentifier: id),
               event.calendar?.calendarIdentifier == calendar.calendarIdentifier {
                try? store.remove(event, span: .thisEvent, commit: false)
            }
        }
        // 2. Sweep anything left over in our own calendar.
        sweep(calendar: calendar, sessions: sessions)
        try? store.commit()

        // 3. Add the current sessions.
        var updated: [String: String] = [:]
        for plan in plans {
            for session in plan.sessions {
                let event = EKEvent(eventStore: store)
                event.calendar = calendar
                configureEvent(event, session: session, plan: plan, lengthMinutes: lengthMinutes)
                try? store.save(event, span: .thisEvent)
                if let id = event.eventIdentifier {
                    updated[Self.key(for: session)] = id
                }
            }
        }
        return updated
    }

    /// Removes the calendar events for the given sessions (used when a session or plan is deleted).
    func removeEvents(for sessions: [PlanSession], eventIDs: [String: String]) -> [String: String] {
        var updated = eventIDs
        for session in sessions {
            let key = Self.key(for: session)
            if let id = updated[key], let event = store.event(withIdentifier: id) {
                try? store.remove(event, span: .thisEvent, commit: false)
            }
            updated[key] = nil
        }
        try? store.commit()
        return updated
    }

    func removeAll(eventIDs: [String: String]) {
        for id in eventIDs.values {
            if let event = store.event(withIdentifier: id) {
                try? store.remove(event, span: .thisEvent)
            }
        }
    }

    private func sweep(calendar: EKCalendar, sessions: [PlanSession]) {
        let cal = Calendar.current
        let now = Date()
        let earliest = sessions.map(\.date).min() ?? now
        let latest = sessions.map(\.date).max() ?? now
        var start = cal.date(byAdding: .day, value: -1, to: min(earliest, cal.date(byAdding: .year, value: -1, to: now) ?? now)) ?? earliest
        let end = cal.date(byAdding: .day, value: 1, to: max(latest, cal.date(byAdding: .year, value: 1, to: now) ?? now)) ?? latest

        // EventKit only searches ranges of up to about 4 years at a time.
        while start < end {
            let chunkEnd = min(cal.date(byAdding: .year, value: 3, to: start) ?? end, end)
            let predicate = store.predicateForEvents(withStart: start, end: chunkEnd, calendars: [calendar])
            for event in store.events(matching: predicate) {
                try? store.remove(event, span: .thisEvent, commit: false)
            }
            start = chunkEnd
        }
    }

    private func configureEvent(_ event: EKEvent, session: PlanSession, plan: TrainingPlan, lengthMinutes: Int) {
        event.title = session.target.isEmpty ? session.type : "\(session.type): \(session.target)"
        event.notes = plan.title
        event.startDate = session.date
        event.endDate = Calendar.current.date(byAdding: .minute, value: max(15, lengthMinutes), to: session.date) ?? session.date
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
