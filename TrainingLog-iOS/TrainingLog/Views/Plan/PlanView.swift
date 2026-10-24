import SwiftUI
import SwiftData
import UIKit

struct PlanView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(\.modelContext) private var context
    @EnvironmentObject var userStore: UserStore
    @Query private var allPlans: [TrainingPlan]
    private var plans: [TrainingPlan] { allPlans.sorted { $0.startDate < $1.startDate } }
    @State private var showAddPlan = false
    @State private var isSyncingCalendar = false
    @State private var showAddSession: TrainingPlan? = nil
    @State private var linkSession: (plan: TrainingPlan, session: PlanSession)? = nil
    @State private var editPlan: TrainingPlan? = nil
    @State private var editSession: PlanSession? = nil
    @State private var tablePlan: TrainingPlan? = nil
    @State private var planToDelete: TrainingPlan? = nil
    @State private var showDeleteAlert = false
    private let haptic = UIImpactFeedbackGenerator(style: .medium)

    var body: some View {
        NavigationStack {
            if plans.isEmpty {
                emptyState
            } else {
                planList
                    .contentWidth(760)
                    .background(Color(.systemGroupedBackground))
            }
        }
        .sheet(isPresented: $showAddPlan) {
            AddPlanSheet { plan in
                context.insert(plan)
                try? context.save()
            }
        }
        .task(id: "\(hk.dailyData.count)-\(plans.reduce(0) { $0 + $1.sessions.count })") {
            autoMatchSessions()
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: 56))
                .foregroundStyle(.secondary)
            Text("No Training Plans")
                .font(.title2.bold())
            Text("Create a plan and add sessions to track your training.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Create Plan") { showAddPlan = true }
                .buttonStyle(.borderedProminent)
            Spacer()
        }
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAddPlan = true } label: { Image(systemName: "plus") }
            }
        }
    }

    @ViewBuilder
    private var planList: some View {
        List {
            ForEach(plans) { plan in
                Section {
                    planHeader(plan)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                planToDelete = plan
                                showDeleteAlert = true
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    ForEach(todayFirst(plan.sessions)) { session in
                        sessionRow(session, plan: plan)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    let ids = CalendarSyncManager.shared.removeEvents(
                                        for: [session], eventIDs: userStore.calendarEventsBySessionKey)
                                    userStore.setCalendarEventIDs(ids)
                                    context.delete(session)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                    Button {
                        showAddSession = plan
                    } label: {
                        Label("Add Session", systemImage: "plus.circle")
                            .font(.subheadline)
                    }
                }
            }
        }
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    Task { await syncCalendar() }
                } label: {
                    if isSyncingCalendar {
                        ProgressView().scaleEffect(0.7)
                    } else {
                        Image(systemName: "calendar.badge.plus")
                    }
                }
                .disabled(isSyncingCalendar || plans.isEmpty)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAddPlan = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(item: $showAddSession) { plan in
            AddSessionSheet(plan: plan)
        }
        .sheet(item: Binding(
            get: { linkSession.map { LinkItem(plan: $0.plan, session: $0.session) } },
            set: { _ in linkSession = nil }
        )) { item in
            LinkWorkoutSheet(plan: item.plan, session: item.session,
                             workouts: hk.dailyData.flatMap(\.workouts))
        }
        .sheet(item: $editPlan) { plan in
            EditPlanSheet(plan: plan)
        }
        .sheet(item: $editSession) { session in
            EditSessionSheet(session: session)
        }
        .sheet(item: $tablePlan) { plan in
            EditPlanTableSheet(plan: plan)
        }
        .alert("Delete Plan?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                if let plan = planToDelete {
                    let ids = CalendarSyncManager.shared.removeEvents(
                        for: plan.sessions, eventIDs: userStore.calendarEventsBySessionKey)
                    userStore.setCalendarEventIDs(ids)
                    context.delete(plan)
                    try? context.save()
                }
                planToDelete = nil
            }
            Button("Cancel", role: .cancel) { planToDelete = nil }
        } message: {
            Text(planToDelete.map { "\($0.title) and all its sessions will be permanently deleted." } ?? "")
        }
    }

    @ViewBuilder
    private func planHeader(_ plan: TrainingPlan) -> some View {
        let total = plan.sessions.count
        let done = plan.sessions.filter(\.isComplete).count
        let race = plan.endDate
        let daysLeft = max(0, Calendar.current.dateComponents([.day], from: .now, to: race).day ?? 0)
        let pct = total > 0 ? done * 100 / total : 0
        let progress = total > 0 ? Double(done) / Double(total) : 0.0

        HStack(alignment: .top) {
            Button {
                editPlan = plan
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    Text(plan.title).font(.headline)
                    HStack(spacing: 20) {
                        stat("\(daysLeft)", label: "days left")
                        stat("\(done)/\(total)", label: "sessions")
                        stat("\(pct)%", label: "complete")
                    }
                    ProgressView(value: progress)
                        .tint(.appTeal)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                tablePlan = plan
            } label: {
                Image(systemName: "tablecells")
                    .foregroundStyle(.appTeal)
                    .padding(.top, 4)
            }
            .buttonStyle(.plain)
        }
        .contextMenu {
            ShareLink(item: ICSExporter.fileURL(for: plan)) {
                Label("Export Calendar File", systemImage: "square.and.arrow.up")
            }
            Button(role: .destructive) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    planToDelete = plan
                    showDeleteAlert = true
                }
            } label: {
                Label("Delete Plan", systemImage: "trash")
            }
        }
    }

    private func stat(_ value: String, label: String) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(value).font(.title3.bold()).foregroundStyle(.appTeal)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func sessionRow(_ session: PlanSession, plan: TrainingPlan) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(session.isComplete ? Color.green : sessionColor(session.type))
                .frame(width: 10, height: 10)

            Button {
                editSession = session
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(fmtDate(session.date))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Label(session.type.uppercased(), systemImage: WorkoutType(rawValue: session.type)?.icon ?? "circle")
                            .font(.caption.bold())
                            .foregroundStyle(sessionColor(session.type))
                    }
                    Text(session.target)
                        .font(.subheadline)
                        .lineLimit(2)

                    if session.isComplete, let wid = session.linkedWorkoutID,
                       let wo = hk.dailyData.flatMap(\.workouts).first(where: { $0.id == wid }) {
                        linkedWorkoutSummary(wo)
                    } else if session.isComplete || isPast(session.date) {
                        Button("Link workout →") {
                            linkSession = (plan, session)
                        }
                        .font(.caption)
                        .foregroundStyle(.appTeal)
                        .buttonStyle(.plain)
                    }
                }
            }
            .buttonStyle(.plain)

            Button {
                haptic.impactOccurred()
                session.isComplete.toggle()
            } label: {
                Image(systemName: session.isComplete ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(session.isComplete ? .green : .secondary)
                    .font(.title3)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func linkedWorkoutSummary(_ wo: HealthWorkout) -> some View {
        let timeFmt: DateFormatter = {
            let f = DateFormatter(); f.dateFormat = "h:mm a"; return f
        }()
        HStack(spacing: 6) {
            Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
            Text(timeFmt.string(from: wo.startDate))
            Text("·")
            Text("\(wo.durationMinutes) min")
            if let km = wo.distanceKm {
                Text("·")
                Text(String(format: "%.2f km", km))
            }
            if let pace = wo.avgPacePerKm {
                Text("·")
                Text(pace)
            }
            if let cal = wo.calories {
                Text("·")
                Text("\(Int(cal)) kcal")
            }
        }
        .font(.caption)
        .foregroundStyle(.green)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    private func sessionColor(_ type: String) -> Color {
        WorkoutType(rawValue: type)?.color ?? .appTeal
    }

    private func isPast(_ date: Date) -> Bool {
        date < Calendar.current.startOfDay(for: .now)
    }

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"; return f
    }()

    private func fmtDate(_ date: Date) -> String {
        Self.dateFmt.string(from: date)
    }

    private func todayFirst(_ sessions: [PlanSession]) -> [PlanSession] {
        let cal = Calendar.current
        return sessions.sorted { lhs, rhs in
            let lhsToday = cal.isDateInToday(lhs.date)
            let rhsToday = cal.isDateInToday(rhs.date)
            if lhsToday != rhsToday { return lhsToday }
            return lhs.date < rhs.date
        }
    }

    /// Links unlinked sessions to a same-day, same-type workout from Apple Health
    /// and marks them complete.
    private func autoMatchSessions() {
        let cal = Calendar.current
        let allWorkouts = hk.dailyData.flatMap(\.workouts)
        guard !allWorkouts.isEmpty else { return }
        var used = Set(plans.flatMap(\.sessions).compactMap(\.linkedWorkoutID))
        var changed = false

        for plan in plans {
            for session in plan.sessions.sorted(by: { $0.date < $1.date }) where session.linkedWorkoutID == nil {
                guard let type = WorkoutType(rawValue: session.type.uppercased()) else { continue }
                let match = allWorkouts
                    .filter { !used.contains($0.id) && $0.type == type
                              && cal.isDate($0.startDate, inSameDayAs: session.date) }
                    .min { abs($0.startDate.timeIntervalSince(session.date))
                         < abs($1.startDate.timeIntervalSince(session.date)) }
                if let match {
                    session.linkedWorkoutID = match.id
                    session.isComplete = true
                    used.insert(match.id)
                    changed = true
                }
            }
        }
        if changed { try? context.save() }
    }

    private func syncCalendar() async {
        isSyncingCalendar = true
        let updated = await CalendarSyncManager.shared.sync(
            plans: plans,
            eventIDs: userStore.calendarEventsBySessionKey,
            lengthMinutes: userStore.sessionLengthMinutes)
        userStore.setCalendarEventIDs(updated)
        isSyncingCalendar = false
    }
}

struct LinkItem: Identifiable {
    let id = UUID()
    let plan: TrainingPlan
    let session: PlanSession
}
