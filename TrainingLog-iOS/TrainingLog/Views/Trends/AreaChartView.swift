import SwiftUI
import Charts

struct ChartDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

struct AreaChartView: View {
    let title: String
    let unit: String
    let data: [ChartDataPoint]
    let color: Color
    var showYear: Bool = false
    var showAverage: Bool = true
    var insight: String? = nil
    var useBarChart: Bool = false

    private func barLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = showYear ? "MMM yy" : "d MMM"
        return f.string(from: date)
    }

    private var average: Double {
        guard !data.isEmpty else { return 0 }
        return data.map(\.value).reduce(0, +) / Double(data.count)
    }

    private var yDomain: ClosedRange<Double> {
        if useBarChart {
            let hi = data.map(\.value).max() ?? 1
            return 0...(hi * 1.3)  // extra headroom for value labels above bars
        }
        let vals = data.map(\.value)
        guard let lo = vals.min(), let hi = vals.max(), lo < hi else { return 0...1 }
        let pad = (hi - lo) * 0.15
        return (lo - pad)...(hi + pad)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.bold())
                .foregroundStyle(.primary)

            if let insight {
                Text(insight)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 8) {
            if data.isEmpty {
                Text("No data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(height: 120)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Chart {
                    ForEach(data) { point in
                        if useBarChart {
                            BarMark(
                                x: .value("Week", barLabel(point.date)),
                                y: .value(unit, point.value)
                            )
                            .foregroundStyle(color)
                            .cornerRadius(3)
                            .annotation(position: .top, alignment: .center, spacing: 2) {
                                Text(String(format: "%.0f", point.value))
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(color)
                            }
                        } else {
                            LineMark(
                                x: .value("Date", point.date),
                                y: .value(unit, point.value)
                            )
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(color)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                        }
                    }

                    if !useBarChart, let last = data.last {
                        PointMark(
                            x: .value("Date", last.date),
                            y: .value(unit, last.value)
                        )
                        .foregroundStyle(color)
                        .symbolSize(28)
                        .annotation(position: .trailing, alignment: .center) {
                            Text(String(format: "%.1f", last.value))
                                .font(.caption2.bold())
                                .foregroundStyle(color)
                        }
                    }

                    if showAverage {
                        RuleMark(y: .value("Avg", average))
                            .foregroundStyle(.secondary.opacity(0.45))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 5]))
                    }
                }
                .chartYScale(domain: yDomain)
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(String(format: "%.0f", v))
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    if useBarChart {
                        AxisMarks(preset: .automatic, values: .automatic) { _ in
                            AxisValueLabel()
                                .font(.system(size: 9))
                        }
                    } else {
                        AxisMarks(values: .stride(by: showYear ? .year : .month)) { value in
                            if let date = value.as(Date.self) {
                                AxisValueLabel {
                                    Text(date, format: showYear ? .dateTime.year() : .dateTime.month(.abbreviated))
                                        .font(.caption2)
                                }
                                AxisGridLine()
                            }
                        }
                    }
                }
                .frame(height: 130)
                .padding(.trailing, useBarChart ? 0 : 32)
            }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
        }
    }
}
