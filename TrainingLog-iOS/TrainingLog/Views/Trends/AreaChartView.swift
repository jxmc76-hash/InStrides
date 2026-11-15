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
                        Text(String(format: "%.\(decimals)f", point.value))
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
            AxisMarks(position: .leading) { value in
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(String(format: "%.\(decimals)f", v))
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
