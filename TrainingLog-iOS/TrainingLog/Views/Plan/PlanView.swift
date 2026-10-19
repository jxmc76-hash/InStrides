import SwiftUI
import SwiftData
import UIKit

struct PlanView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(\.modelContext) private var context
    @Query(sort: \TrainingPlan.startDate) private var plans: [TrainingPlan]
    @EnvironmentObject var userStore: UserStore
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
            }
        }
        .sheet(isPresented: $showAddPlan) {
            AddPlanSheet(context: context)
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
                    ForEach(plan.sessions.sorted { $0.date < $1.date }) { session in
                        sessionRow(session, plan: plan)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    plan.sessions.removeAll { $0.id == session.id }
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
                if let plan = planToDelete { context.delete(plan) }
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
                        .tint(.orange)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                tablePlan = plan
            } label: {
                Image(systemName: "tablecells")
                    .foregroundStyle(.orange)
                    .padding(.top, 4)
            }
            .buttonStyle(.plain)
        }
    }

    private func stat(_ value: String, label: String) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(value).font(.title3.bold()).foregroundStyle(.orange)
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
                        Text(session.type.uppercased())
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
                        .foregroundStyle(.orange)
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
        WorkoutType(rawValue: type)?.color ?? .orange
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

    private func syncCalendar() async {
        isSyncingCalendar = true
        var allIDs = userStore.calendarEventsBySessionKey
        for plan in plans {
            let updated = await CalendarSyncManager.shared.sync(plan: plan, eventIDs: allIDs)
            allIDs.merge(updated) { _, new in new }
        }
        userStore.setCalendarEventIDs(allIDs)
        isSyncingCalendar = false
    }
}

struct LinkItem: Identifiable {
    let id = UUID()
    let plan: TrainingPlan
    let session: PlanSession
}
