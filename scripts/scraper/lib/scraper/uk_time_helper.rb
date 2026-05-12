require 'date'

module AdamStats
  module Scraper
    # Pure-Ruby UK timezone helper.
    #
    # UK is GMT (UTC+0) in winter and BST (UTC+1) from the last Sunday of March
    # until (not including) the last Sunday of October. DST rule is fixed since
    # 1996 (EU harmonisation). Brazil (BRT) is UTC-3 year-round since 2019.
    #
    # No external gem needed — two zones, deterministic DST rule, simple arithmetic.
    # Decision: preferred over adding TZInfo to Gemfile to keep deps minimal.
    module UkTimeHelper
      module_function

      # Returns the day-of-month of the last Sunday in (year, month_1indexed).
      # month_1indexed: 1=Jan, 3=Mar, 10=Oct.
      def last_sunday_of(year, month_1indexed)
        last_day = Date.new(year, month_1indexed, -1)
        last_day.day - last_day.wday
      end

      # Returns true if the given date falls in UK BST (UTC+1).
      # BST: [last_sunday_march, last_sunday_october)
      def uk_bst?(year, month, day)
        return false if month < 3 || month > 10
        return true  if month > 3 && month < 10

        if month == 3
          day >= last_sunday_of(year, 3)  # March
        else
          # month == 10
          day < last_sunday_of(year, 10)  # October
        end
      end

      # Convert match_date (Date) + ko_time (HH:MM string) in UK local time to UTC (Time).
      # Returns nil when ko_time is nil/empty.
      def to_utc(match_date, ko_time)
        return nil if ko_time.nil? || ko_time.to_s.strip.empty?

        m = ko_time.to_s.match(/\A(\d{2}):(\d{2})/)
        return nil unless m

        h  = m[1].to_i
        mi = m[2].to_i
        bst = uk_bst?(match_date.year, match_date.month, match_date.day)
        uk_offset_hours = bst ? 1 : 0

        # Build UTC instant by subtracting UK offset from local time.
        # Using Time.utc arithmetic handles day rollover correctly.
        local_instant = Time.utc(match_date.year, match_date.month, match_date.day, h, mi, 0)
        local_instant - (uk_offset_hours * 3600)
      end

      # Like to_utc but falls back to 12:00 UK local time when ko_time is nil.
      # Used for backfill approximation and persister default.
      def to_utc_or_noon(match_date, ko_time)
        if ko_time.nil? || ko_time.to_s.strip.empty?
          to_utc(match_date, '12:00')
        else
          to_utc(match_date, ko_time)
        end
      end

      # Inverse of to_utc: given a UTC Time, returns [Date (UK local), "HH:MM" (UK local)].
      # Applies BST (+1h) or GMT (+0h) based on the UTC instant's calendar date.
      # Used by ListApiParser to derive match_date and ko_time from the API's UTC ms field.
      def utc_to_uk_local(utc_time)
        bst = uk_bst?(utc_time.year, utc_time.month, utc_time.day)
        uk_offset_hours = bst ? 1 : 0

        local_seconds = utc_time.to_i + (uk_offset_hours * 3600)
        local_time    = Time.at(local_seconds).utc # re-read as UTC to get the shifted wall-clock

        match_date = Date.new(local_time.year, local_time.month, local_time.day)
        ko_time    = format('%02d:%02d', local_time.hour, local_time.min)

        [match_date, ko_time]
      end
    end
  end
end
