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

    private var average: Double {
        guard !data.isEmpty else { return 0 }
        return data.map(\.value).reduce(0, +) / Double(data.count)
    }

    private var yDomain: ClosedRange<Double> {
        let vals = data.map(\.value)
        guard let lo = vals.min(), let hi = vals.max(), lo < hi else {
            return 0...1
        }
        let pad = (hi - lo) * 0.15
        return (lo - pad)...(hi + pad)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.bold())
                .foregroundStyle(.secondary)

            if data.isEmpty {
                Text("No data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(height: 120)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Chart {
                    ForEach(data) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value(unit, point.value)
                        )
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // Single dot on the last data point only
                    if let last = data.last {
                        PointMark(
                            x: .value("Date", last.date),
                            y: .value(unit, last.value)
                        )
                        .foregroundStyle(color)
                        .symbolSize(28)
                    }

                    RuleMark(y: .value("Avg", average))
                        .foregroundStyle(.secondary.opacity(0.45))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 5]))
                        .annotation(position: .trailing, alignment: .center) {
                            Text(String(format: "%.1f", average))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
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
                    AxisMarks { value in
                        if let date = value.as(Date.self) {
                            AxisValueLabel {
                                Text(date, format: .dateTime.month(.abbreviated))
                                    .font(.caption2)
                            }
                        }
                    }
                }
                .frame(height: 130)
                .padding(.trailing, 32)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}
