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


class Rules(BaseModel):
    noEarlyAfterDayAB: bool
    nightRest: NightRest


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
    shifts: List[Shift]
    needTemplate: NeedTemplate
    dayTypeByDate: List[str]
    people: List[Person]
    rules: Rules
    weights: Weights
    wishOffs: Dict[str, List[int]]


class ScheduleRequest(BaseModel):
    people: List[Person]
    wishOffs: Dict[str, List[int]]


class ShortageInfo(BaseModel):
    day: int
    time_range: str
    shortage: int


class ScheduleResponse(BaseModel):
    schedule: Dict[str, List[Optional[str]]]
    shortages: List[ShortageInfo]
    status: str
    message: Optional[str] = None

