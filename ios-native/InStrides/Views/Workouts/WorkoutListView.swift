import SwiftUI

struct WorkoutListView: View {
    @Environment(TrainingStore.self) private var store
    @State private var filter: ActivityKind?

    private var filtered: [WorkoutSummary] {
        guard let filter else { return store.workouts }
        return store.workouts.filter { $0.kind == filter }
    }

    private var sections: [WeekSection] {
        let calendar = store.calendar
        let grouped = Dictionary(grouping: filtered) {
            calendar.dateInterval(of: .weekOfYear, for: $0.start)?.start ?? calendar.startOfDay(for: $0.start)
        }
        return grouped
            .map { WeekSection(weekStart: $0.key, workouts: $0.value.sorted { $0.start > $1.start }) }
            .sorted { $0.weekStart > $1.weekStart }
    }

    /// Only offer filters for activities the athlete actually does.
    private var availableKinds: [ActivityKind] {
        let present = Set(store.workouts.map(\.kind))
        return ActivityKind.allCases.filter(present.contains)
    }

    var body: some View {
        NavigationStack {
            List {
                if filtered.isEmpty {
                    ContentUnavailableView(
                        "No Workouts",
                        systemImage: "figure.run",
                        description: Text("Workouts recorded with Apple Watch, Fitness or apps like Strava appear here once they're saved to Health.")
                    )
                    .listRowBackground(Color.clear)
                }
                ForEach(sections) { section in
                    Section {
                        ForEach(section.workouts) { workout in
                            NavigationLink(value: workout) {
                                WorkoutRow(workout: workout)
                            }
                        }
                    } header: {
                        WeekHeader(weekStart: section.weekStart, workouts: section.workouts)
                    }
                }
            }
            .navigationTitle("Workouts")
            .navigationDestination(for: WorkoutSummary.self) { WorkoutDetailView(workout: $0) }
            .refreshable { await store.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Activity", selection: $filter) {
                            Text("All Activities").tag(ActivityKind?.none)
                            ForEach(availableKinds) { kind in
                                Label(kind.displayName, systemImage: kind.symbolName).tag(ActivityKind?.some(kind))
                            }
                        }
                    } label: {
                        Image(systemName: filter == nil
                            ? "line.3.horizontal.decrease.circle"
                            : "line.3.horizontal.decrease.circle.fill")
                    }
                }
            }
        }
    }
}

private struct WeekSection: Identifiable {
    let weekStart: Date
    let workouts: [WorkoutSummary]

    var id: Date { weekStart }
}

private struct WeekHeader: View {
    let weekStart: Date
    let workouts: [WorkoutSummary]

    var body: some View {
        let duration = workouts.map(\.duration).reduce(0, +)
        let distance = workouts.compactMap(\.distanceMeters).reduce(0, +)
        HStack {
            Text("Week of \(weekStart.formatted(.dateTime.day().month(.abbreviated)))")
            Spacer()
            Text([Format.shortDuration(duration), distance > 0 ? Format.distance(distance) : nil]
                .compactMap { $0 }
                .joined(separator: " · "))
                .monospacedDigit()
        }
    }
}

#Preview {
    WorkoutListView()
        .previewStore()
}
