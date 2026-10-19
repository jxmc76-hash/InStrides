import SwiftUI
import FoundationModels

struct InsightsView: View {
    @Environment(HealthKitManager.self) private var hk
    @State private var insights: [String] = []
    @State private var isGenerating = false
    @State private var error: String? = nil
    @State private var lastGenerated: Date? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isGenerating {
                        generatingView
                    } else if insights.isEmpty && error == nil {
                        emptyView
                    } else if let error {
                        errorView(error)
                    } else {
                        insightCards
                    }
                }
                .padding()
            }
            .navigationTitle("Insights")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Image(uiImage: (UIImage(named: "AppIcon") ?? UIImage()))
                        .resizable()
                        .frame(width: 28, height: 28)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await generate() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(isGenerating)
                }
            }
            .task { if insights.isEmpty { await generate() } }
        }
    }

    @ViewBuilder
    private var generatingView: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 60)
            ProgressView()
                .scaleEffect(1.4)
            Text("Analysing your training…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 60)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var emptyView: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 60)
            Image(systemName: "brain")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No Insights Yet")
                .font(.title2.bold())
            Text("Tap the refresh button to generate AI insights from your training data.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Generate Insights") { Task { await generate() } }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
            Spacer(minLength: 60)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Spacer(minLength: 40)
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(.orange)
            Text(msg)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try Again") { Task { await generate() } }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
            Spacer(minLength: 40)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var insightCards: some View {
        if let date = lastGenerated {
            Text("Generated \(date.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        ForEach(Array(insights.enumerated()), id: \.offset) { _, insight in
            InsightCardView(text: insight)
        }
    }

    // MARK: - Generation

    private func generate() async {
        guard !hk.dailyData.isEmpty else {
            error = "No training data found. Sync your workouts first."
            return
        }
        isGenerating = true
        error = nil
        insights = []

        let summary = buildSummary()

        let session = LanguageModelSession()
        let prompt = """
        You are a personal training coach analysing an athlete's recent workout data. \
        Based on the data below, provide exactly 5 concise, personalised insights. \
        Each insight should be on its own line starting with a relevant emoji. \
        Focus on patterns, trends, consistency, and actionable observations. \
        Be specific with numbers where possible. Keep each insight to 1-2 sentences.

        Training data (last 90 days):
        \(summary)
        """

        do {
            let response = try await session.respond(to: prompt)
            let lines = response.content
                .components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            insights = lines
            lastGenerated = .now
        } catch {
            self.error = "Apple Intelligence isn't available on this device or is currently unavailable. (\(error.localizedDescription))"
        }
        isGenerating = false
    }

    private func buildSummary() -> String {
        let cal = Calendar.current
        let cutoff = cal.date(byAdding: .day, value: -90, to: .now) ?? .now
        let recent = hk.dailyData.filter { $0.date >= cutoff }

        var lines: [String] = []

        // Overall workout counts by type
        let allWorkouts = recent.flatMap(\.workouts)
        let byType = Dictionary(grouping: allWorkouts, by: \.type)
        lines.append("Workout counts (90 days):")
        for (type, workouts) in byType.sorted(by: { $0.value.count > $1.value.count }) {
            let totalMins = workouts.reduce(0) { $0 + $1.durationMinutes }
            lines.append("  \(type.displayName): \(workouts.count) sessions, \(totalMins) min total")
        }

        // Weekly breakdown (last 12 weeks)
        let weekCutoff = cal.date(byAdding: .weekOfYear, value: -12, to: .now) ?? .now
        let recentWeeks = recent.filter { $0.date >= weekCutoff }
        var weekGroups: [Date: [DailyHealthData]] = [:]
        for day in recentWeeks {
            let weekStart = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
            weekGroups[weekStart, default: []].append(day)
        }
        let weeklySessionCounts = weekGroups.values.map { days in
            days.flatMap(\.workouts).count
        }
        if !weeklySessionCounts.isEmpty {
            let avg = weeklySessionCounts.reduce(0, +) / weeklySessionCounts.count
            let max = weeklySessionCounts.max() ?? 0
            lines.append("Weekly average: \(avg) sessions, peak week: \(max) sessions")
        }

        // Sleep data
        let sleepDays = recent.compactMap(\.sleep)
        if !sleepDays.isEmpty {
            let avgSleep = sleepDays.map(\.totalMinutes).reduce(0, +) / Double(sleepDays.count)
            let avgScore = sleepDays.map { Double($0.score) }.reduce(0, +) / Double(sleepDays.count)
            lines.append("Average sleep: \(Int(avgSleep / 60))h \(Int(avgSleep.truncatingRemainder(dividingBy: 60)))min, avg sleep score: \(Int(avgScore))/100")
        }

        // Weight trend
        let weightDays = recent.compactMap { d -> (Date, Double)? in
            guard let w = d.weight else { return nil }
            return (d.date, w)
        }.sorted { $0.0 < $1.0 }
        if weightDays.count >= 2, let first = weightDays.first, let last = weightDays.last {
            let diff = last.1 - first.1
            let sign = diff >= 0 ? "+" : ""
            lines.append("Weight: \(String(format: "%.1f", first.1))kg → \(String(format: "%.1f", last.1))kg (\(sign)\(String(format: "%.1f", diff))kg over 90 days)")
        }

        // Run distances
        let runs = allWorkouts.filter { $0.type == .run }.compactMap(\.distanceKm)
        if !runs.isEmpty {
            let avg = runs.reduce(0, +) / Double(runs.count)
            let longest = runs.max() ?? 0
            lines.append("Running: avg \(String(format: "%.1f", avg))km per run, longest \(String(format: "%.1f", longest))km")
        }

        // Day-of-week pattern
        var dayWorkouts: [Int: Int] = [:]
        for wo in allWorkouts {
            let weekday = cal.component(.weekday, from: wo.startDate)
            dayWorkouts[weekday, default: 0] += 1
        }
        if let busiest = dayWorkouts.max(by: { $0.value < $1.value }) {
            let dayName = cal.weekdaySymbols[busiest.key - 1]
            lines.append("Most active day: \(dayName) (\(busiest.value) workouts)")
        }

        return lines.joined(separator: "\n")
    }
}

struct InsightCardView: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(leadingEmoji)
                .font(.title2)
                .frame(width: 36)
            Text(insightText)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }

    private var leadingEmoji: String {
        let parts = text.components(separatedBy: " ")
        if let first = parts.first, first.unicodeScalars.first?.properties.isEmoji == true {
            return first
        }
        return "💡"
    }

    private var insightText: String {
        let parts = text.components(separatedBy: " ")
        if let first = parts.first, first.unicodeScalars.first?.properties.isEmoji == true {
            return parts.dropFirst().joined(separator: " ")
        }
        return text
    }
}
