from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Shift(BaseModel):
    code: str
    name: str
    start: int
    end: int


class NeedTemplateDetail(BaseModel):
    seven_to_nine: int = Field(alias="7-9")
    nine_to_fifteen: int = Field(alias="9-15")
    sixteen_to_eighteen: int = Field(alias="16-18")
    eighteen_to_twenty_four: int = Field(alias="18-24")
    zero_to_seven: int = Field(alias="0-7")


class NeedTemplate(BaseModel):
    bathDay: NeedTemplateDetail
    normalDay: NeedTemplateDetail
    wednesday: NeedTemplateDetail


class Person(BaseModel):
    id: str
    canWork: List[str]
    fixedOffWeekdays: List[str]
    weeklyMin: int
    weeklyMax: int
    monthlyMin: int
    monthlyMax: int
    consecMax: int


class NightRest(BaseModel):
    NA: int
    NB: int
    NC: int


class PairShiftConflictRule(BaseModel):
    firstPersonShifts: List[str]
    secondPersonShifts: List[str]
    dayOffset: int = 0


class PairShiftConflict(BaseModel):
    people: List[str]
    rules: List[PairShiftConflictRule]


class Rules(BaseModel):
    noEarlyAfterDayAB: bool
    nightRest: NightRest
    nightRecoveryCounts: Dict[str, int] = Field(default_factory=dict)
    pairShiftConflicts: List[PairShiftConflict] = Field(default_factory=list)


class Weights(BaseModel):
    W_shortage: int
    W_overstaff_gt_need_plus1: int
    W_balance_workdays: int
    W_prefer_fill_morning7_9: int
    W_fill_9_15: int
    W_requested_off_violation: int
    shortageTimeRangeWeights: Dict[str, int] = Field(default_factory=dict)


class InitialData(BaseModel):
    year: int
    month: int
    days: int
    weekdayOfDay1: int
    previousMonthNightCarry: Optional[Dict[str, List[str]]] = None
    shifts: List[Shift]
    needTemplate: NeedTemplate
    dayTypeByDate: List[str]
    people: List[Person]
    rules: Rules
    weights: Weights
    wishOffs: Dict[str, List[int]]
    paidLeaves: Dict[str, List[int]] = Field(default_factory=dict)


class ScheduleRequest(BaseModel):
    people: List[Person]
    wishOffs: Dict[str, List[int]]
    paidLeaves: Dict[str, List[int]] = Field(default_factory=dict)
    shiftPreferences: Dict[str, Dict[int, str]] = Field(default_factory=dict)
    previousMonthNightCarry: Optional[Dict[str, List[str]]] = None
    pairShiftConflicts: List[PairShiftConflict] = Field(default_factory=list)


class CoverageInfo(BaseModel):
    need: int
    actual: int
    shortage: int


class ShortageInfo(BaseModel):
    day: int
    time_range: str
    shortage: int


class ScheduleResponse(BaseModel):
    schedule: Dict[str, List[Optional[str]]]
    shortages: List[ShortageInfo]
    coverageBreakdown: Dict[int, Dict[str, CoverageInfo]] = Field(default_factory=dict)
    status: str
    message: Optional[str] = None


class ScheduleChange(BaseModel):
    personId: str
    dayIndex: int
    previous: Optional[str]
    updated: Optional[str]


class ScheduleState(BaseModel):
    version: int = 1
    locked: bool = False
    schedule: Dict[str, List[Optional[str]]] = Field(default_factory=dict)


class ScheduleSaveRequest(BaseModel):
    schedule: Dict[str, List[Optional[str]]]
    baseVersion: Optional[int] = None


class ScheduleSaveResponse(BaseModel):
    version: int
    locked: bool
    changes: List[ScheduleChange] = Field(default_factory=list)
