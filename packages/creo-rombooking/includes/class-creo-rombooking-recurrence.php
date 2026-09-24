<?php

/**
 * Dates of a recurring booking.
 */
class Creo_Rombooking_Recurrence {

	const RULES = array( 'none', 'weekly', 'biweekly', 'monthly' );

	/**
	 * The most occurrences a series can have.
	 */
	const MAX_OCCURRENCES = 26;

	/**
	 * Returns the dates of a series.
	 *
	 * Monthly series keep the day of the month and skip months without it,
	 * so a series starting on the 31st only has dates in months with 31 days.
	 *
	 * @param string      $start    The first date (Y-m-d).
	 * @param string      $rule     `none`, `weekly`, `biweekly` or `monthly`.
	 * @param int|null    $count    The number of occurrences, or null to end on a date.
	 * @param string|null $end_date The last possible date (Y-m-d), when `$count` is null.
	 * @return string[]
	 */
	public static function dates( $start, $rule, $count = null, $end_date = null ) {
		if ( $rule === 'none' ) {
			return array( $start );
		}

		$first     = new DateTimeImmutable( $start );
		$limit     = $count ? min( (int) $count, self::MAX_OCCURRENCES ) : self::MAX_OCCURRENCES;
		$max_steps = $limit * 3; // Months without the day are skipped, so allow more steps than occurrences.
		$dates     = array();
		$found     = 0;

		for ( $step = 0; $found < $limit && $step < $max_steps; $step++ ) {
			$date = self::step( $first, $rule, $step );

			if ( ! $date ) {
				continue;
			}
			if ( $end_date !== null && $date->format( 'Y-m-d' ) > $end_date ) {
				break;
			}

			$dates[] = $date->format( 'Y-m-d' );
			++$found;
		}

		return $dates;
	}

	/**
	 * @param DateTimeImmutable $first The first date.
	 * @param string            $rule  The rule.
	 * @param int               $step  The step number.
	 * @return DateTimeImmutable|null Null when a monthly date does not exist.
	 */
	protected static function step( DateTimeImmutable $first, $rule, $step ) {
		switch ( $rule ) {
			case 'weekly':
				return $first->modify( '+' . ( 7 * $step ) . ' days' );
			case 'biweekly':
				return $first->modify( '+' . ( 14 * $step ) . ' days' );
			case 'monthly':
				$day   = (int) $first->format( 'j' );
				$month = $first->modify( 'first day of this month' )->modify( "+$step months" );
				if ( $day > (int) $month->format( 't' ) ) {
					return null;
				}
				return $month->setDate( (int) $month->format( 'Y' ), (int) $month->format( 'n' ), $day );
		}
		return null;
	}
}
