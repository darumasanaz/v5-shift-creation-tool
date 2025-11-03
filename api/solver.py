import json
from ortools.sat.python import cp_model
from .models import ScheduleRequest

def solve_shift_scheduling(request: ScheduleRequest):
    # try:
        with open("api/input_data.json", "r", encoding="utf-8") as f:
            input_data = json.load(f)

        # 基本データの読み込み
        people_contracts = {p["personId"]: p for p in request.people}
        people_data = input_data["people"]
        num_people = len(people_data)
        people_map = {p["id"]: i for i, p in enumerate(people_data)}
        people_map_rev = {i: p["id"] for i, p in enumerate(people_data)}

        num_days = input_data["num_days"]
        shifts_data = input_data["shifts"]
        shift_map = {s["code"]: i for i, s in enumerate(shifts_data)}
        
        all_shift_codes = [s["code"] for s in shifts_data]
        
        # モデルの初期化
        model = cp_model.CpModel()

        # --- 決定変数の作成 ---
        work = {}
        for i in range(num_people):
            p_id = people_map_rev[i]
            person_contract = people_contracts[p_id]
            
            qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
            
            for d in range(num_days):
                for s_code in all_shift_codes:
                    if s_code not in qualified_shift_codes:
                        continue
                    work[i, d, s_code] = model.NewBoolVar(f"work_{i}_{d}_{s_code}")

        # --- ハード制約 ---

        # H1: 1人のスタッフは1日に最大1つのシフトしか担当できない (これは残します)
        for i in range(num_people):
            for d in range(num_days): # ← タイプミスを修正！
                p_id = people_map_rev[i]
                person_contract = people_contracts[p_id]
                qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
                
                model.Add(sum(work.get((i, d, s_code), 0) for s_code in qualified_shift_codes) <= 1)

        # H2: 月間の勤務日数の制約 (コメントアウト)
        # for i in range(num_people):
        #     p_id = people_map_rev[i]
        #     person_contract = people_contracts[p_id]
        #     min_days = person_contract.get("minWorkDays", 0)
        #     max_days = person_contract.get("maxWorkDays", num_days)
        #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        #     total_work_days = sum(work.get((i, d, s_code), 0) for d in range(num_days) for s_code in qualified_shift_codes)
        #     model.Add(min_days <= total_work_days)
        #     model.Add(total_work_days <= max_days)

        # H3: 週間の最大勤務日数の制約 (コメントアウト)
        # for i in range(num_people):
        #     p_id = people_map_rev[i]
        #     person_contract = people_contracts[p_id]
        #     max_days_per_week = person_contract.get("maxWorkDaysPerWeek", 7)
        #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        #     for w in range(num_days // 7):
        #         start_day = w * 7
        #         end_day = start_day + 7
        #         weekly_work_days = sum(work.get((i, d, s_code), 0) for d in range(start_day, end_day) for s_code in qualified_shift_codes)
        #         model.Add(weekly_work_days <= max_days_per_week)
                
        # H4: 連続勤務日数の上限の制約 (コメントアウト)
        # for i in range(num_people):
        #     p_id = people_map_rev[i]
        #     person_contract = people_contracts[p_id]
        #     max_consecutive_days = person_contract.get("maxConsecutiveWorkDays", num_days)
        #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        #     for d in range(num_days - max_consecutive_days):
        #         consecutive_work = []
        #         for j in range(max_consecutive_days + 1):
        #             day_work = model.NewBoolVar(f"day_work_{i}_{d+j}")
        #             works_on_day = [work.get((i, d + j, s_code), 0) for s_code in qualified_shift_codes]
        #             model.Add(sum(works_on_day) == day_work)
        #             consecutive_work.append(day_work)
        #         model.Add(sum(consecutive_work) <= max_consecutive_days)
                
        # H5: 夜勤後の休みの制約 (コメントアウト)
        # night_shift_codes = [s["code"] for s in shifts_data if s.get("isNightShift", False)]
        # for i in range(num_people):
        #     for d in range(num_days - 1):
        #         for s_code in night_shift_codes:
        #             if (i, d, s_code) in work:
        #                 p_id = people_map_rev[i]
        #                 person_contract = people_contracts[p_id]
        #                 qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        #                 model.Add(sum(work.get((i, d + 1, next_s_code), 0) for next_s_code in qualified_shift_codes) == 0).OnlyEnforceIf(work[i, d, s_code])

        # H6: 固定の曜日休みと希望休の制約 (コメントアウト)
        # for i in range(num_people):
        #     p_id = people_map_rev[i]
        #     wish_off_dates = request.wishOffs.get(p_id, [])
        #     person_contract = people_contracts.get(p_id, {})
        #     fixed_off_days = person_contract.get("fixedDayOffs", [])
        #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        #     for d in range(num_days):
        #         day_of_week = (d + input_data["start_day_of_week"]) % 7
        #         date = d + 1
        #         is_off = (day_of_week in fixed_off_days) or (date in wish_off_dates)
        #         if is_off:
        #             for s_code in qualified_shift_codes:
        #                 model.Add(work.get((i, d, s_code), 0) == 0)

        # --- ソフト制約 ---
        # (省略) ...

        # --- 目的関数 ---
        # (省略) ...
        
        # --- ソルバーの実行 ---
        # (省略) ...

        # --- 結果の整形 ---
        # (省略) ...

        # return final_schedule, final_shortages, status_str
    # except Exception as e:
    #     print(f"An error occurred: {e}")
    #     return {}, {}, "SOLVER_ERROR"
