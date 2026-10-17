import Foundation
import Testing
@testable import InStrides

struct TrainingLoadTests {
    let calculator = TrainingLoadCalculator(maxHeartRate: 190, restingHeartRate: 50, sex: .male)

    @Test func trimpMatchesBanisterFormula() {
        // 60 minutes at 155 bpm → HRr = 105/140 = 0.75.
        let workout = Fixtures.workout(start: Fixtures.date(2026, 1, 5), minutes: 60, averageHR: 155)
        let expected = 60 * 0.75 * 0.64 * exp(1.92 * 0.75)
        #expect(abs(calculator.trimp(for: workout) - expected) < 0.0001)
    }

    @Test func harderSessionsScoreHigher() {
        let start = Fixtures.date(2026, 1, 5)
        let easy = calculator.trimp(for: Fixtures.workout(start: start, minutes: 45, averageHR: 130))
        let hard = calculator.trimp(for: Fixtures.workout(start: start, minutes: 45, averageHR: 170))
        #expect(hard > easy * 1.5)
    }

    @Test func heartRateReserveIsClamped() {
        let start = Fixtures.date(2026, 1, 5)
        let belowRest = calculator.trimp(for: Fixtures.workout(start: start, minutes: 30, averageHR: 40))
        let aboveMax = calculator.trimp(for: Fixtures.workout(start: start, minutes: 30, averageHR: 220))
        let atMax = calculator.trimp(for: Fixtures.workout(start: start, minutes: 30, averageHR: 190))
        #expect(belowRest == 0)
        #expect(aboveMax == atMax)
    }

    @Test func fallsBackToActivityEstimateWithoutHeartRate() {
        let workout = Fixtures.workout(.mobility, start: Fixtures.date(2026, 1, 5), minutes: 40)
        #expect(calculator.trimp(for: workout) == 40 * ActivityKind.mobility.fallbackLoadPerMinute)
    }

    @Test func sameDayWorkoutsAreSummed() {
        let morning = Fixtures.workout(.run, start: Fixtures.date(2026, 1, 5, 7), minutes: 30)
        let evening = Fixtures.workout(.strength, start: Fixtures.date(2026, 1, 5, 18), minutes: 45)
        let loads = calculator.dailyLoads([morning, evening], calendar: Fixtures.calendar)
        #expect(loads.count == 1)
        #expect(loads[Fixtures.date(2026, 1, 5)] == calculator.trimp(for: morning) + calculator.trimp(for: evening))
    }

    @Test func steadyTrainingConvergesFitnessAndFatigue() throws {
        // 200 days of identical training: both averages approach the daily load and form → 0.
        let start = Fixtures.date(2026, 1, 1)
        let workouts = (0..<200).map { day in
            Fixtures.workout(.other, start: Fixtures.calendar.date(byAdding: .day, value: day, to: start)!, minutes: 60)
        }
        let end = Fixtures.calendar.date(byAdding: .day, value: 199, to: start)!
        let series = calculator.series(workouts, from: start, through: end, calendar: Fixtures.calendar)
        let dailyLoad = 60 * ActivityKind.other.fallbackLoadPerMinute

        #expect(series.count == 200)
        let last = try #require(series.last)
        #expect(abs(last.fitness - dailyLoad) / dailyLoad < 0.02)
        #expect(abs(last.fatigue - dailyLoad) / dailyLoad < 0.001)
        #expect(abs(last.form) < 2)
    }

    @Test func restingAfterABlockMakesYouFresh() throws {
        let start = Fixtures.date(2026, 1, 1)
        let block = (0..<42).map { day in
            Fixtures.workout(start: Fixtures.calendar.date(byAdding: .day, value: day, to: start)!, minutes: 60, averageHR: 150)
        }
        let blockEnd = Fixtures.calendar.date(byAdding: .day, value: 41, to: start)!
        let afterTaper = Fixtures.calendar.date(byAdding: .day, value: 10, to: blockEnd)!
        let series = calculator.series(block, from: start, through: afterTaper, calendar: Fixtures.calendar)

        let endOfBlock = try #require(series.first { $0.date == blockEnd })
        let tapered = try #require(series.last)
        #expect(endOfBlock.form < 0)
        #expect(tapered.form > 0)
        #expect(tapered.status == .fresh)
    }

    @Test(arguments: [
        (10.0, FormStatus.fresh),
        (0.0, .neutral),
        (-20.0, .productive),
        (-40.0, .overreaching),
    ])
    func formStatusThresholds(form: Double, expected: FormStatus) {
        #expect(FormStatus(form: form) == expected)
    }
}
