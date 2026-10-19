import SwiftUI
import SwiftData
import UIKit

struct PlanView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(\.modelContext) private var context
    @Query(sort: \TrainingPlan.startDate) private var plans: [TrainingPlan]
    @State private var showAddPlan = false
    @State private var showAddSession: TrainingPlan? = nil
    @State private var linkSession: (plan: TrainingPlan, session: PlanSession)? = nil
    @State private var editPlan: TrainingPlan? = nil
    @State private var editSession: PlanSession? = nil
    private let haptic = UIImpactFeedbackGenerator(style: .medium)

    var body: some View {
        NavigationStack {
            if plans.isEmpty {
                emptyState
            } else {
                planList
            }
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
            ToolbarItem(placement: .topBarLeading) {
                Image(uiImage: (UIImage(named: "AppIcon") ?? UIImage()))
                    .resizable()
                    .frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
            }
        }
        .sheet(isPresented: $showAddPlan) {
            AddPlanSheet()
        }
    }

    @ViewBuilder
    private var planList: some View {
        List {
            ForEach(plans) { plan in
                Section {
                    planHeader(plan)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                context.delete(plan)
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
                Image(uiImage: (UIImage(named: "AppIcon") ?? UIImage()))
                    .resizable()
                    .frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAddPlan = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddPlan) { AddPlanSheet() }
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
    }

    @ViewBuilder
    private func planHeader(_ plan: TrainingPlan) -> some View {
        let total = plan.sessions.count
        let done = plan.sessions.filter(\.isComplete).count
        let race = plan.endDate
        let daysLeft = Calendar.current.dateComponents([.day], from: .now, to: race).day ?? 0

        Button {
            editPlan = plan
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(plan.title).font(.headline)
                HStack(spacing: 20) {
                    stat("\(max(0, daysLeft))", label: "days left")
                    stat("\(done)/\(total)", label: "sessions")
                    stat("\(total > 0 ? (done * 100 / total) : 0)%", label: "complete")
                }
                ProgressView(value: total > 0 ? Double(done) / Double(total) : 0)
                    .tint(.orange)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
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

                    if session.isComplete && session.linkedWorkoutID != nil {
                        Text("✓ Linked to Health workout")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else if isPast(session.date) && !session.isComplete {
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
}

struct LinkItem: Identifiable {
    let id = UUID()
    let plan: TrainingPlan
    let session: PlanSession
}
