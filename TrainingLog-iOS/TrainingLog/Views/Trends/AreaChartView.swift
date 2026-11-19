import SwiftUI
import Charts

struct ChartDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
    /// True when there was no reading for this period and the last one was carried forward.
    var isCarriedForward: Bool = false
}

/// Line chart of one value per period. Data comes newest first and the newest period is
/// drawn on the left, where the chart opens.
struct AreaChartView: View {
    let title: String
    let unit: String
    let data: [ChartDataPoint]
    let color: Color
    var showAverage: Bool = true
    var insight: String? = nil
    var decimals: Int = 0
    var emptyMessage: String = "No data"
    /// Length of time each point covers.
    var period: Calendar.Component = .month
    /// Custom text for values (e.g. times of day); otherwise numbers to `decimals` places.
    var format: ((Double) -> String)? = nil
    /// Gap between y-axis gridlines (e.g. 60 for whole hours); automatic when nil.
    var yAxisStride: Double? = nil

    private func label(_ value: Double) -> String {
        format?(value) ?? String(format: "%.\(decimals)f", value)
    }

    private var isWeekly: Bool { period == .weekOfYear }
    private var hasCarriedForward: Bool { data.contains(where: \.isCarriedForward) }

    private var average: Double {
        let real = data.filter { !$0.isCarriedForward }
        guard !real.isEmpty else { return 0 }
        return real.map(\.value).reduce(0, +) / Double(real.count)
    }

    private var yDomain: ClosedRange<Double> {
        let vals = data.map(\.value)
        guard let lo = vals.min(), let hi = vals.max() else { return 0...1 }
        guard lo < hi else {
            let pad = max(abs(lo) * 0.1, 1)
            return (lo - pad)...(hi + pad)
        }
        // Extra room at the top for the value labels.
        return (lo - (hi - lo) * 0.15)...(hi + (hi - lo) * 0.25)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)

            if let insight {
                Text(insight)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 8) {
                if data.isEmpty {
                    Text(emptyMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(height: 120)
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    if data.count > 10 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            chart.frame(width: CGFloat(data.count) * 36)
                        }
                        .defaultScrollAnchor(.leading)
                    } else {
                        chart
                    }

                    if hasCarriedForward {
                        HStack(spacing: 6) {
                            Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 8, height: 8)
                            Text("No reading that week: last reading carried forward")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var chart: some View {
        Chart {
            ForEach(data) { point in
                LineMark(
                    x: .value("Period", point.date),
                    y: .value(unit, point.value)
                )
                .interpolationMethod(.monotone)
                .foregroundStyle(color)
                .lineStyle(StrokeStyle(lineWidth: 2))

                PointMark(
                    x: .value("Period", point.date),
                    y: .value(unit, point.value)
                )
                .symbol {
                    if point.isCarriedForward {
                        Circle().strokeBorder(color, lineWidth: 1.5)
                            .background(Circle().fill(Color(uiColor: .secondarySystemBackground)))
                            .frame(width: 8, height: 8)
                    } else {
                        Circle().fill(color).frame(width: 7, height: 7)
                    }
                }


                // Value label, drawn as a symbol rather than an annotation: annotations land in
                // the wrong place on a reversed axis.
                if !point.isCarriedForward {
                    PointMark(
                        x: .value("Period", point.date),
                        y: .value(unit, point.value)
                    )
                    .symbol {
                        Text(label(point.value))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(color)
                            .fixedSize()
                            .offset(y: -12)
                    }
                }
            }

            if showAverage, let first = data.first, let last = data.last {
                RuleMark(
                    xStart: .value("Start", first.date),
                    xEnd: .value("End", last.date),
                    y: .value("Avg", average)
                )
                .foregroundStyle(.secondary.opacity(0.45))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 5]))
            }
        }
        .chartYScale(domain: yDomain)
        .chartXScale(domain: .automatic(includesZero: false, reversed: true), range: .plotDimension(padding: 18))
        .chartYAxis {
            AxisMarks(position: .leading, values: yAxisStride.map { .stride(by: $0) } ?? .automatic) { value in
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(label(v))
                            .font(.caption2)
                    }
                }
                AxisGridLine()
            }
        }
        .chartXAxis {
            AxisMarks(values: data.map(\.date)) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        periodLabel(for: date)
                    }
                }
            }
        }
        .frame(height: 220)
        .clipped()
    }

    /// Monthly points: "Mar", with the year under January and the first point.
    /// Weekly points: the day the week starts, with the month under the first week of each month.
    @ViewBuilder
    private func periodLabel(for date: Date) -> some View {
        let cal = Calendar.current
        let isFirst = date == data.first?.date
        VStack(spacing: 0) {
            if isWeekly {
                Text(date, format: .dateTime.day())
                if isFirst || cal.component(.day, from: date) <= 7 {
                    Text(date, format: .dateTime.month(.abbreviated))
                        .fontWeight(.bold)
                }
            } else {
                Text(date, format: .dateTime.month(.abbreviated))
                if isFirst || cal.component(.month, from: date) == 1 {
                    Text(date, format: .dateTime.year(.twoDigits))
                        .fontWeight(.bold)
                }
            }
        }
        .font(.system(size: 9))
        .fixedSize()
    }
}

// MARK: - Energy vs sleep

/// One day: the sleep that ended that morning and the energy score logged that day.
struct SleepEnergyPoint: Identifiable {
    let id = UUID()
    let date: Date
    let sleepHours: Double
    let energy: Double
    /// In the last two weeks; drawn solid, older days faded.
    let isRecent: Bool
}

/// Scatter of energy against the previous night's sleep, with a best-fit line.
struct SleepEnergyChartView: View {
    let points: [SleepEnergyPoint]
    let insight: String?
    var color: Color = .appTeal

    /// Least-squares line through the points, as (slope, intercept), when there's enough spread.
    private var fit: (slope: Double, intercept: Double)? {
        guard points.count >= 5 else { return nil }
        let n = Double(points.count)
        let mx = points.map(\.sleepHours).reduce(0, +) / n
        let my = points.map(\.energy).reduce(0, +) / n
        let sxx = points.map { ($0.sleepHours - mx) * ($0.sleepHours - mx) }.reduce(0, +)
        guard sxx > 0.01 else { return nil }
        let sxy = points.map { ($0.sleepHours - mx) * ($0.energy - my) }.reduce(0, +)
        let slope = sxy / sxx
        return (slope, my - slope * mx)
    }

    /// The best-fit line's two ends, trimmed so it stays inside the 0–10 energy range.
    private var fitEnds: [(x: Double, y: Double)] {
        guard let fit else { return [] }
        func y(_ x: Double) -> Double { fit.intercept + fit.slope * x }
        func x(_ y: Double) -> Double { (y - fit.intercept) / fit.slope }
        var x0 = xRange.lowerBound, x1 = xRange.upperBound
        if fit.slope != 0 {
            let xAt0 = x(0), xAt10 = x(10)
            x0 = max(x0, min(xAt0, xAt10))
            x1 = min(x1, max(xAt0, xAt10))
        }
        guard x0 < x1 else { return [] }
        return [(x0, y(x0)), (x1, y(x1))]
    }

    private var xRange: ClosedRange<Double> {
        let xs = points.map(\.sleepHours)
        let lo = floor((xs.min() ?? 5) - 0.5), hi = ceil((xs.max() ?? 9) + 0.5)
        return lo...max(hi, lo + 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Energy vs Sleep")
                .font(.subheadline.weight(.medium))
            if let insight {
                Text(insight)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 8) {
                if points.isEmpty {
                    Text("No data yet. This fills in once you've logged energy on days with sleep recorded.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(height: 120)
                        .frame(maxWidth: .infinity)
                } else {
                    chart
                    HStack(spacing: 14) {
                        HStack(spacing: 5) {
                            Circle().fill(color).frame(width: 8, height: 8)
                            Text("Last 2 weeks")
                        }
                        HStack(spacing: 5) {
                            Circle().fill(color.opacity(0.25)).frame(width: 8, height: 8)
                            Text("Earlier (12 weeks)")
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var chart: some View {
        Chart {
            // Older days first so the recent ones draw on top.
            ForEach(points.sorted { !$0.isRecent && $1.isRecent }) { p in
                PointMark(
                    x: .value("Sleep (h)", p.sleepHours),
                    y: .value("Energy", p.energy)
                )
                .foregroundStyle(p.isRecent ? color : color.opacity(0.25))
                .symbolSize(p.isRecent ? 55 : 35)
            }
            ForEach(Array(fitEnds.enumerated()), id: \.offset) { _, end in
                LineMark(x: .value("Sleep (h)", end.x),
                         y: .value("Energy", end.y),
                         series: .value("Line", "fit"))
                .foregroundStyle(Color.secondary)
                .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            }
        }
        .chartXScale(domain: xRange)
        .chartYScale(domain: 0...10)
        .chartXAxisLabel("Sleep the night before (hours)", alignment: .center)
        .chartYAxisLabel("Energy")
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 2, 4, 6, 8, 10]) { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine()
            }
        }
        .frame(height: 240)
        .clipped()
    }
}
