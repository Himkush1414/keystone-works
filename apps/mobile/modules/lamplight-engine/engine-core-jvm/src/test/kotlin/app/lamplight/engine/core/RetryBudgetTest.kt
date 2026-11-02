package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RetryBudgetTest {
    @Test
    fun `allows a few retries a minute, then refuses until the window moves on`() {
        val budget = RetryBudget(max = 3, windowMs = 60_000)
        assertEquals(listOf(true, true, true, false), listOf(0L, 1_000L, 2_000L, 3_000L).map(budget::take))
        // A minute after the first retry, one more is allowed.
        assertEquals(true, budget.take(60_000))
        assertEquals(false, budget.take(60_500))
    }
}
