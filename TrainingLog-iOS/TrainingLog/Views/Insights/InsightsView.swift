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
                    Image("Logo")
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
        You are a personal training coach analysing an athlete's workout data. \
        Based on the data below, provide exactly 5 concise, personalised insights. \
        Each insight should be on its own line starting with a relevant emoji. \
        Focus on: (1) what the athlete has done in the past 4 weeks, \
        (2) how that compares to their previous activity, and \
        (3) what will happen if they continue at the current trajectory — are they building, maintaining, or declining? \
        Be specific with numbers. Be honest but encouraging. Keep each insight to 1-2 sentences.

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
        let now = Date.now
        let w4start  = cal.date(byAdding: .day, value: -28, to: now) ?? now
        let w8start  = cal.date(byAdding: .day, value: -56, to: now) ?? now

        let last4  = hk.dailyData.filter { $0.date >= w4start }
        let prev4  = hk.dailyData.filter { $0.date >= w8start && $0.date < w4start }

        var lines: [String] = []

        func sessionSummary(_ days: [DailyHealthData]) -> String {
            let workouts = days.flatMap(\.workouts)
            let byType = Dictionary(grouping: workouts, by: \.type)
            let parts = byType.sorted { $0.value.count > $1.value.count }.map { type, wos in
                let mins = wos.reduce(0) { $0 + $1.durationMinutes }
                return "\(type.displayName): \(wos.count)x (\(mins) min)"
            }
            return parts.isEmpty ? "no workouts" : parts.joined(separator: ", ")
        }

        lines.append("LAST 4 WEEKS: \(sessionSummary(last4))")
        lines.append("PREVIOUS 4 WEEKS: \(sessionSummary(prev4))")

        // Weekly session totals for trend
        func weeklyCounts(_ days: [DailyHealthData]) -> [Int] {
            var groups: [Date: Int] = [:]
            for day in days {
                let w = cal.dateInterval(of: .weekOfYear, for: day.date)?.start ?? day.date
                groups[w, default: 0] += day.workouts.count
            }
            return groups.values.sorted()
        }
        let last4weeks = weeklyCounts(last4)
        let prev4weeks = weeklyCounts(prev4)
        if !last4weeks.isEmpty && !prev4weeks.isEmpty {
            let avgLast = last4weeks.reduce(0,+) / last4weeks.count
            let avgPrev = prev4weeks.reduce(0,+) / prev4weeks.count
            lines.append("Weekly avg sessions: \(avgLast) (last 4w) vs \(avgPrev) (prior 4w)")
        }

        // Run distances comparison
        func runStats(_ days: [DailyHealthData]) -> String? {
            let kms = days.flatMap(\.workouts).filter { $0.type == .run }.compactMap(\.distanceKm)
            guard !kms.isEmpty else { return nil }
            let avg = kms.reduce(0,+) / Double(kms.count)
            let total = kms.reduce(0,+)
            return "\(kms.count) runs, \(String(format: "%.0f", total))km total, avg \(String(format: "%.1f", avg))km"
        }
        if let r4 = runStats(last4) { lines.append("Running last 4w: \(r4)") }
        if let rp = runStats(prev4) { lines.append("Running prior 4w: \(rp)") }

        // Sleep
        let sleep4 = last4.compactMap(\.sleep)
        if !sleep4.isEmpty {
            let avg = sleep4.map(\.totalMinutes).reduce(0,+) / Double(sleep4.count)
            lines.append("Avg sleep last 4w: \(Int(avg/60))h \(Int(avg.truncatingRemainder(dividingBy: 60)))min")
        }

        // Weight trend over last 4 weeks
        let weights = hk.dailyData
            .compactMap { d -> (Date, Double)? in d.weight.map { (d.date, $0) } }
            .sorted { $0.0 < $1.0 }
        if let wFirst = weights.first(where: { $0.0 >= w4start }), let wLast = weights.last {
            let diff = wLast.1 - wFirst.1
            let sign = diff >= 0 ? "+" : ""
            lines.append("Weight last 4w: \(String(format: "%.1f", wFirst.1))kg → \(String(format: "%.1f", wLast.1))kg (\(sign)\(String(format: "%.1f", diff))kg)")
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
