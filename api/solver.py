import json
from typing import Dict, Iterable, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from .models import CoverageInfo, ScheduleRequest, ShortageInfo


def _load_initial_data() -> Dict:
    with open("api/input_data.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _parse_interval(label: str) -> Tuple[int, int]:
    start_str, end_str = label.split("-")
    start = int(start_str)
    end = int(end_str)

    if start == 0 and end <= 7:
        # Treat post-midnight ranges as 24-31 so they work with 24+ hour shifts
        return 24, 24 + end
    return start, end


def _covers_interval(
    shift_start: int, shift_end: int, interval: Tuple[int, int]
) -> bool:
    """Return True when a shift touches the target interval."""

    start, end = interval
    if start >= 24:
        if shift_end <= 24:
            return False
        return shift_start < end and shift_end > start
    if end <= 24:
        effective_end = min(shift_end, 24)
        return shift_start < end and effective_end > start
    # Intervals that cross midnight are not expected here
    return shift_start < end and shift_end > start


def _build_time_ranges(
    shifts: Dict[str, Dict[str, int]],
) -> Tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    """Return mappings for same-day and carry-over coverage per time range."""

    intervals: Dict[str, Tuple[int, int]] = {
        "7-9": (7, 9),
        "9-15": (9, 15),
        "16-18": (16, 18),
        "18-24": (18, 24),
        # Attribute post-midnight hours to the day the shift starts.
        "0-7": (24, 31),
    }

    same_day: Dict[str, List[str]] = {key: [] for key in intervals}
    carry_over: Dict[str, List[str]] = {key: [] for key in intervals}

    for code, shift in shifts.items():
        start = shift["start"]
        end = shift["end"]

        for label, (range_start, range_end) in intervals.items():
            if _covers_interval(start, end, (range_start, range_end)):
                same_day[label].append(code)

        if end <= 24:
            continue

        after_midnight_start = max(start, 24) - 24
        after_midnight_end = end - 24

        for label, (range_start, range_end) in intervals.items():
            if range_start >= 24:
                continue
            if after_midnight_start < range_end and after_midnight_end > range_start:
                carry_over[label].append(code)

    # Remove duplicates while preserving insertion order for determinism
    for mapping in (same_day, carry_over):
        for label, codes in mapping.items():
            seen = set()
            deduped: List[str] = []
            for code in codes:
                if code not in seen:
                    seen.add(code)
                    deduped.append(code)
            mapping[label] = deduped

    return same_day, carry_over


def _build_specific_time_ranges(
    shifts: Dict[str, Dict[str, int]], labels: Iterable[str]
) -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = {label: [] for label in labels}
    intervals = {label: _parse_interval(label) for label in labels}
    for code, shift in shifts.items():
        for label in labels:
            if _covers_interval(shift["start"], shift["end"], intervals[label]):
                mapping[label].append(code)
    return mapping


def solve_shift_scheduling(request: ScheduleRequest):
    data = _load_initial_data()

    num_days = data["days"]
    people = request.people
    num_people = len(people)
    person_indices: Dict[str, int] = {
        person.id: idx for idx, person in enumerate(people)
    }
    i_morikawa = person_indices.get("森川孝")
    i_shibata = person_indices.get("柴田")
    shifts = {s["code"]: s for s in data["shifts"]}
    all_shift_codes = list(shifts.keys())
    time_ranges, carry_over_ranges = _build_time_ranges(shifts)
    night_rest: Dict[str, int] = data["rules"]["nightRest"]
    raw_night_recovery_counts: Dict[str, int] = data["rules"].get(
        "nightRecoveryCounts", {}
    )
    recovery_code_set = set(night_rest.keys()) | set(raw_night_recovery_counts.keys())
    night_recovery_counts: Dict[str, int] = {}
    for code in recovery_code_set:
        rest_value = int(night_rest.get(code, 0))
        recovery_value = int(raw_night_recovery_counts.get(code, rest_value))
        night_recovery_counts[code] = max(0, min(recovery_value, rest_value))

    raw_previous_carry = (
        request.previousMonthNightCarry
        if request.previousMonthNightCarry is not None
        else data.get("previousMonthNightCarry", {})
    )

    if not isinstance(raw_previous_carry, dict):
        raw_previous_carry = {}

    valid_shift_codes = set(all_shift_codes)
    previous_month_carry: Dict[str, List[str]] = {}
    for s_code, entries in raw_previous_carry.items():
        if s_code not in valid_shift_codes:
            continue
        if not isinstance(entries, list):
            continue
        seen_people: Set[str] = set()
        deduped: List[str] = []
        for person_id in entries:
            if not isinstance(person_id, str):
                continue
            if person_id in seen_people:
                continue
            seen_people.add(person_id)
            deduped.append(person_id)
        if deduped:
            previous_month_carry[s_code] = deduped
    initial_recovery_people: Set[int] = set()
    initial_recovery_windows: Dict[int, int] = {}
    for night_code, carried_people in previous_month_carry.items():
        rest_days = night_rest.get(night_code, 0)
        recovery_days = night_recovery_counts.get(night_code, rest_days)
        for person_id in carried_people:
            person_idx = person_indices.get(person_id)
            if person_idx is None:
                continue
            if recovery_days > 0:
                initial_recovery_people.add(person_idx)
            if recovery_days <= 0:
                continue
            previous = initial_recovery_windows.get(person_idx, 0)
            if recovery_days > previous:
                initial_recovery_windows[person_idx] = recovery_days
    previous_carry_counts: Dict[str, int] = {label: 0 for label in time_ranges}
    for label, carry_shifts in carry_over_ranges.items():
        previous_carry_counts[label] = sum(
            len(previous_month_carry.get(s_code, [])) for s_code in carry_shifts
        )

    model = cp_model.CpModel()

    work = {}
    for p in range(num_people):
        for d in range(num_days):
            for s_code in all_shift_codes:
                work[p, d, s_code] = model.NewBoolVar(f"work_{p}_{d}_{s_code}")

    night_recovery = {}
    for p in range(num_people):
        for d in range(num_days):
            night_recovery[p, d] = model.NewBoolVar(f"night_recovery_{p}_{d}")

    if num_days > 0:
        for p in range(num_people):
            literal = model.NewBoolVar(f"initial_night_recovery_{p}")
            if p in initial_recovery_people:
                model.Add(literal == 1)
            else:
                model.Add(literal == 0)
            model.Add(night_recovery[p, 0] == 1).OnlyEnforceIf(literal)
            model.Add(night_recovery[p, 0] == 0).OnlyEnforceIf(literal.Not())

    for person_idx, recovery_days in initial_recovery_windows.items():
        for day in range(1, min(num_days, recovery_days)):
            model.Add(night_recovery[person_idx, day] == 1)

    # Hard constraints -----------------------------------------------------
    def _to_dict(obj):
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        return obj

    pair_conflict_sources = list(data.get("rules", {}).get("pairShiftConflicts", []))
    if request.pairShiftConflicts:
        pair_conflict_sources.extend(request.pairShiftConflicts)

    normalized_conflicts = []
    for conflict in pair_conflict_sources:
        conflict_dict = _to_dict(conflict)
        people_pair = conflict_dict.get("people", [])
        if not isinstance(people_pair, list) or len(people_pair) != 2:
            continue
        rules = []
        for rule in conflict_dict.get("rules", []):
            rule_dict = _to_dict(rule)
            first_shifts = [
                s
                for s in rule_dict.get("firstPersonShifts", [])
                if s in all_shift_codes
            ]
            second_shifts = [
                s
                for s in rule_dict.get("secondPersonShifts", [])
                if s in all_shift_codes
            ]
            if not first_shifts or not second_shifts:
                continue
            day_offset = int(rule_dict.get("dayOffset", 0))
            rules.append((first_shifts, second_shifts, day_offset))
        if rules:
            normalized_conflicts.append((people_pair[0], people_pair[1], rules))

    if (
        i_morikawa is not None
        and i_shibata is not None
        and not any(
            {first, second} == {"森川孝", "柴田"}
            for first, second, _ in normalized_conflicts
        )
    ):
        normalized_conflicts.append(
            (
                "柴田",
                "森川孝",
                [
                    (["NC"], ["NA"], 0),
                    (["NC"], ["EA", "NA"], 1),
                ],
            )
        )

    for first_id, second_id, rules in normalized_conflicts:
        first_idx = person_indices.get(first_id)
        second_idx = person_indices.get(second_id)
        if first_idx is None or second_idx is None:
            continue
        for first_shifts, second_shifts, day_offset in rules:
            for d in range(num_days):
                target_day = d + day_offset
                if target_day < 0 or target_day >= num_days:
                    continue
                for first_shift in first_shifts:
                    for second_shift in second_shifts:
                        model.Add(
                            work[first_idx, d, first_shift]
                            + work[second_idx, target_day, second_shift]
                            <= 1
                        )

    # At most one shift per person per day
    for p in range(num_people):
        for d in range(num_days):
            model.Add(sum(work[p, d, s_code] for s_code in all_shift_codes) <= 1)

    # Shift eligibility
    for p in range(num_people):
        allowed = set(people[p].canWork)
        for d in range(num_days):
            for s_code in all_shift_codes:
                if s_code not in allowed:
                    model.Add(work[p, d, s_code] == 0)

    wish_offs = request.wishOffs or {}
    raw_paid_leaves = request.paidLeaves or {}
    paid_leave_days_by_index: Dict[int, Set[int]] = {}
    for p_idx, person in enumerate(people):
        entries = raw_paid_leaves.get(person.id, [])
        if not isinstance(entries, list):
            continue
        normalized_days: Set[int] = set()
        for day in entries:
            if isinstance(day, int) and 0 <= day < num_days:
                normalized_days.add(day)
        if normalized_days:
            paid_leave_days_by_index[p_idx] = normalized_days

    # Monthly minimum/maximum assignments
    for p in range(num_people):
        assigned_days = sum(
            work[p, d, s_code] for d in range(num_days) for s_code in all_shift_codes
        )
        recovery_days = sum(night_recovery[p, d] for d in range(num_days))
        paid_leave_count = len(paid_leave_days_by_index.get(p, set()))
        model.Add(
            assigned_days + recovery_days + paid_leave_count >= people[p].monthlyMin
        )
        # Treat night-shift recovery days as worked days for both lower and upper
        # monthly limits so "明" contributes to contractual staffing counts.
        model.Add(
            assigned_days + recovery_days + paid_leave_count <= people[p].monthlyMax
        )

    # Night shift rest enforcement
    night_shift_codes = [
        code for code in night_rest.keys() if code in all_shift_codes
    ]

    for p in range(num_people):
        can_work = set(people[p].canWork)
        relevant_night_codes = [
            (code, night_recovery_counts.get(code, 0))
            for code in night_shift_codes
            if code in can_work and night_recovery_counts.get(code, 0) > 0
        ]
        for d in range(1, num_days):
            recovery_sources: List[cp_model.IntVar] = []
            for night_code, recovery_window in relevant_night_codes:
                for offset in range(1, recovery_window + 1):
                    prev_day = d - offset
                    if prev_day < 0:
                        break
                    recovery_sources.append(work[p, prev_day, night_code])
            if recovery_sources:
                model.Add(night_recovery[p, d] <= sum(recovery_sources))
                for literal in recovery_sources:
                    model.AddImplication(literal, night_recovery[p, d])
            else:
                max_initial_recovery = initial_recovery_windows.get(p, 0)
                if d >= max_initial_recovery:
                    model.Add(night_recovery[p, d] == 0)

    for night_code, carried_people in previous_month_carry.items():
        rest_days = night_rest.get(night_code, 0)
        blocked_days = rest_days + 1
        for person_id in carried_people:
            person_idx = person_indices.get(person_id)
            if person_idx is None:
                continue
            for day_offset in range(min(num_days, blocked_days)):
                for s_code in all_shift_codes:
                    model.Add(work[person_idx, day_offset, s_code] == 0)
    for p in range(num_people):
        can_work = set(people[p].canWork)
        for night_code, rest_days in night_rest.items():
            if night_code not in can_work:
                continue
            for d in range(num_days):
                if d + rest_days >= num_days:
                    continue
                night_work = work[p, d, night_code]
                for offset in range(1, rest_days + 1):
                    for s_code in all_shift_codes:
                        model.Add(work[p, d + offset, s_code] == 0).OnlyEnforceIf(
                            night_work
                        )

    # Consecutive working days limit
    for p in range(num_people):
        consec_max = people[p].consecMax
        if consec_max <= 0:
            continue
        paid_leave_days = paid_leave_days_by_index.get(p, set())
        for d in range(num_days - consec_max):
            window = sum(
                work[p, day, s_code]
                for day in range(d, d + consec_max + 1)
                for s_code in all_shift_codes
            )
            window_recovery = sum(
                night_recovery[p, day] for day in range(d, d + consec_max + 1)
            )
            paid_leave_in_window = sum(
                1 for day in range(d, d + consec_max + 1) if day in paid_leave_days
            )
            model.Add(window + window_recovery + paid_leave_in_window <= consec_max)

    # Fixed off weekdays and requested days off
    weekday_map = {0: "月", 1: "火", 2: "水", 3: "木", 4: "金", 5: "土", 6: "日"}
    start_weekday = data["weekdayOfDay1"] % 7
    for p in range(num_people):
        fixed_off = set(people[p].fixedOffWeekdays)
        for d in range(num_days):
            weekday = weekday_map[(start_weekday + d) % 7]
            if weekday in fixed_off:
                for s_code in all_shift_codes:
                    model.Add(work[p, d, s_code] == 0)
        requested = set(wish_offs.get(people[p].id, []))
        for d in requested:
            if 0 <= d < num_days:
                for s_code in all_shift_codes:
                    model.Add(work[p, d, s_code] == 0)
                model.Add(night_recovery[p, d] == 0)
        paid_leave_days = paid_leave_days_by_index.get(p, set())
        for d in paid_leave_days:
            for s_code in all_shift_codes:
                model.Add(work[p, d, s_code] == 0)
            model.Add(night_recovery[p, d] == 0)

    # Soft constraints -----------------------------------------------------
    penalties: List[cp_model.LinearExpr] = []
    shortage_vars: Dict[Tuple[int, str], cp_model.IntVar] = {}
    need_by_day_label: Dict[Tuple[int, str], int] = {}

    weights = data["weights"]
    shortage_time_range_weights: Dict[str, int] = weights.get(
        "shortageTimeRangeWeights", {}
    )
    preference_weight = int(weights.get("W_requested_off_violation", 0))

    for d in range(num_days):
        day_type = data["dayTypeByDate"][d]
        needs = data["needTemplate"][day_type]
        for label, related_shifts in time_ranges.items():
            need_value = needs[label]
            need_by_day_label[(d, label)] = need_value
            actual = sum(
                work[p, d, s_code]
                for p in range(num_people)
                for s_code in related_shifts
            )

            if d > 0:
                carry_shifts = carry_over_ranges.get(label, [])
                if carry_shifts:
                    carry_actual = sum(
                        work[p, d - 1, s_code]
                        for p in range(num_people)
                        for s_code in carry_shifts
                    )
                    actual += carry_actual
            else:
                actual += previous_carry_counts.get(label, 0)
            shortage = model.NewIntVar(0, need_value, f"shortage_{d}_{label}")
            overstaff = model.NewIntVar(0, num_people, f"overstaff_{d}_{label}")
            model.Add(actual + shortage >= need_value)
            model.Add(actual - overstaff <= need_value)
            shortage_weight = weights["W_shortage"] + shortage_time_range_weights.get(
                label, 0
            )
            penalties.append(shortage * shortage_weight)
            penalties.append(overstaff * weights["W_overstaff_gt_need_plus1"])
            shortage_vars[(d, label)] = shortage

    shift_preferences = request.shiftPreferences or {}
    if preference_weight > 0:
        for p_idx, person in enumerate(people):
            prefs = shift_preferences.get(person.id, {}) or {}
            if not isinstance(prefs, dict):
                continue
            allowed_shifts = set(person.canWork)
            for day, shift_code in prefs.items():
                if not isinstance(day, int) or day < 0 or day >= num_days:
                    continue
                if shift_code not in all_shift_codes or shift_code not in allowed_shifts:
                    continue
                preferred_assignment = work[p_idx, day, shift_code]
                unmet = model.NewBoolVar(
                    f"shift_preference_unmet_{p_idx}_{day}_{shift_code}"
                )
                model.Add(unmet + preferred_assignment == 1)
                penalties.append(unmet * preference_weight)

    strict_night: Dict[str, int] = data.get("strictNight", {})
    if strict_night:
        strict_requirements: Dict[str, Dict[str, Optional[int]]] = {}
        for label, value in strict_night.items():
            if label.endswith("_min"):
                base_label = label[: -len("_min")]
                strict_requirements.setdefault(base_label, {})["min"] = value
            elif label.endswith("_max"):
                base_label = label[: -len("_max")]
                strict_requirements.setdefault(base_label, {})["max"] = value
            else:
                strict_requirements.setdefault(label, {})["min"] = value

        strict_ranges = _build_specific_time_ranges(shifts, strict_requirements.keys())

        for d in range(num_days):
            for label, related_shifts in strict_ranges.items():
                if not related_shifts:
                    continue
                actual = sum(
                    work[p, d, s_code]
                    for p in range(num_people)
                    for s_code in related_shifts
                )
                requirements = strict_requirements[label]
                if requirements.get("min") is not None:
                    model.Add(actual >= requirements["min"])
                if requirements.get("max") is not None:
                    model.Add(actual <= requirements["max"])

    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    status = solver.Solve(model)

    schedule: Dict[str, List[Optional[str]]] = {}
    shortages: List[ShortageInfo] = []
    coverage_breakdown: Dict[int, Dict[str, CoverageInfo]] = {
        d + 1: {} for d in range(num_days)
    }

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for p_idx, person in enumerate(people):
            assignments: List[Optional[str]] = []
            paid_leave_days = paid_leave_days_by_index.get(p_idx, set())
            for d in range(num_days):
                if solver.Value(night_recovery[p_idx, d]):
                    assignments.append("明")
                    continue
                if d in paid_leave_days:
                    assignments.append("有給")
                    continue
                assigned = None
                for s_code in all_shift_codes:
                    if solver.Value(work[p_idx, d, s_code]):
                        assigned = s_code
                        break
                assignments.append(assigned)
            schedule[person.id] = assignments

        for d in range(num_days):
            for label, related_shifts in time_ranges.items():
                need_value = need_by_day_label[(d, label)]
                base_actual = sum(
                    solver.Value(work[p, d, s_code])
                    for p in range(num_people)
                    for s_code in related_shifts
                )
                if d > 0:
                    carry_actual = sum(
                        solver.Value(work[p, d - 1, s_code])
                        for p in range(num_people)
                        for s_code in carry_over_ranges.get(label, [])
                    )
                else:
                    carry_actual = previous_carry_counts.get(label, 0)

                actual_value = base_actual + carry_actual
                shortage_value = solver.Value(shortage_vars[(d, label)])

                coverage_breakdown[d + 1][label] = CoverageInfo(
                    need=need_value,
                    actual=actual_value,
                    shortage=shortage_value,
                )

                if shortage_value > 0:
                    shortages.append(
                        ShortageInfo(
                            day=d + 1,
                            time_range=label,
                            shortage=shortage_value,
                        )
                    )

    status_name = solver.StatusName(status)
    return schedule, shortages, coverage_breakdown, status_name
