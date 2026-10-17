import Foundation
import Testing
@testable import InStrides

struct WeeklySummaryTests {
    @Test func groupsWorkoutsIntoCalendarWeeksIncludingEmptyOnes() {
        // 2026-01-05 is a Monday.
        let workouts = [
            Fixtures.workout(.run, start: Fixtures.date(2026, 1, 5, 7), minutes: 30, distance: 5_000),
            Fixtures.workout(.cycle, start: Fixtures.date(2026, 1, 11, 9), minutes: 60, distance: 25_000),
            Fixtures.workout(.run, start: Fixtures.date(2026, 1, 21, 18), minutes: 45, distance: 8_000),
        ]
        let weeks = WeeklySummaryBuilder.build(
            workouts,
            weeks: 3,
            endingAt: Fixtures.date(2026, 1, 22),
            calendar: Fixtures.calendar,
            load: { _ in 10 }
        )

        #expect(weeks.map(\.weekStart) == [Fixtures.date(2026, 1, 5), Fixtures.date(2026, 1, 12), Fixtures.date(2026, 1, 19)])
        #expect(weeks.map(\.workoutCount) == [2, 0, 1])
        #expect(weeks[0].distanceMeters == 30_000)
        #expect(weeks[0].duration == 90 * 60)
        #expect(weeks[0].load == 20)
        #expect(weeks[0].durationByKind == [.run: 30 * 60, .cycle: 60 * 60])
    }

    @Test func ignoresWorkoutsOutsideTheWindow() {
        let workouts = [Fixtures.workout(start: Fixtures.date(2025, 12, 1), minutes: 30)]
        let weeks = WeeklySummaryBuilder.build(workouts, weeks: 2, endingAt: Fixtures.date(2026, 1, 22), calendar: Fixtures.calendar) { _ in 1 }
        #expect(weeks.allSatisfy { $0.workoutCount == 0 })
    }
}

struct SleepAggregatorTests {
    @Test func nightCrossingMidnightCountsOnWakeDay() {
        let intervals = [
            DateInterval(start: Fixtures.date(2026, 1, 4, 23), end: Fixtures.date(2026, 1, 5, 0)),
            DateInterval(start: Fixtures.date(2026, 1, 5, 0), end: Fixtures.date(2026, 1, 5, 7)),
        ]
        let nights = SleepAggregator.nightlyHours(intervals, calendar: Fixtures.calendar)
        #expect(nights == [DailyValue(date: Fixtures.date(2026, 1, 5), value: 8)])
    }

    @Test func overlappingSourcesAreNotDoubleCounted() {
        // iPhone and Apple Watch both record the same night.
        let intervals = [
            DateInterval(start: Fixtures.date(2026, 1, 4, 23), end: Fixtures.date(2026, 1, 5, 6)),
            DateInterval(start: Fixtures.date(2026, 1, 5, 0), end: Fixtures.date(2026, 1, 5, 7)),
        ]
        #expect(SleepAggregator.nightlyHours(intervals, calendar: Fixtures.calendar).first?.value == 8)
    }

    @Test func mergedDurationKeepsGaps() {
        let start = Fixtures.date(2026, 1, 5)
        let intervals = [
            DateInterval(start: start, duration: 3600),
            DateInterval(start: start.addingTimeInterval(7200), duration: 1800),
            DateInterval(start: start.addingTimeInterval(1800), duration: 600), // inside the first
        ]
        #expect(SleepAggregator.mergedDuration(intervals) == 5400)
    }
}

struct BaselineTests {
    @Test func comparesRecentWeekWithFourWeeks() throws {
        let now = Fixtures.date(2026, 1, 28, 12)
        let values = (0..<28).map { offset in
            DailyValue(
                date: Fixtures.calendar.date(byAdding: .day, value: -offset, to: Fixtures.date(2026, 1, 28))!,
                value: offset < 7 ? 50 : 54
            )
        }
        let baseline = try #require(Baseline.compute(values, now: now, calendar: Fixtures.calendar))
        #expect(baseline.recent == 50)
        #expect(baseline.baseline == 53)
        #expect(baseline.change == -3)
    }

    @Test func noRecentDataMeansNoBaseline() {
        let old = [DailyValue(date: Fixtures.date(2025, 6, 1), value: 50)]
        #expect(Baseline.compute(old, now: Fixtures.date(2026, 1, 28), calendar: Fixtures.calendar) == nil)
    }
}

struct FormatTests {
    @Test func durations() {
        #expect(Format.duration(2712) == "45:12")
        #expect(Format.duration(3932) == "1:05:32")
        #expect(Format.shortDuration(2700) == "45m")
        #expect(Format.shortDuration(3900) == "1h 05m")
    }

    @Test func distances() {
        #expect(Format.distance(5_020, metric: true) == "5.02 km")
        #expect(Format.distance(21_097, metric: true) == "21.1 km")
        #expect(Format.distance(1_609.344, metric: false) == "1.00 mi")
    }

    @Test func paces() {
        // 5 km in 25 minutes.
        #expect(Format.pace(duration: 1500, meters: 5000, kind: .run, metric: true) == "5:00 /km")
        #expect(Format.pace(duration: 3600, meters: 30_000, kind: .cycle, metric: true) == "30.0 km/h")
        #expect(Format.pace(duration: 1200, meters: 1000, kind: .swim, metric: true) == "2:00 /100m")
        #expect(Format.pace(duration: 600, meters: 0, kind: .run, metric: true) == nil)
    }
}
