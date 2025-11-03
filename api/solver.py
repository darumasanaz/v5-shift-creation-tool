import json
from ortools.sat.python import cp_model
from .models import ScheduleRequest

def solve_shift_scheduling(request: ScheduleRequest):
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
    num_shifts = len(shifts_data)
    shift_map = {s["code"]: i for i, s in enumerate(shifts_data)}
    
    all_shift_codes = [s["code"] for s in shifts_data]
    
    # モデルの初期化
    model = cp_model.CpModel()

    # --- 決定変数の作成 ---
    # work[p, d, s]: スタッフpがd日目にシフトsで働くかどうか
    work = {}
    for i in range(num_people):
        p_id = people_map_rev[i]
        person_contract = people_contracts[p_id]
        
        # 資格のあるシフトコードのみを変数として作成
        qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
        
        for d in range(num_days):
            for s_code in all_shift_codes:
                # 資格外のシフトは最初から変数を作成しない
                if s_code not in qualified_shift_codes:
                    continue
                work[i, d, s_code] = model.NewBoolVar(f"work_{i}_{d}_{s_code}")

    # --- ハード制約 ---
    # ここから下の制約をコメントアウトしていきます

    # H1: 1人のスタッフは1日に最大1つのシフトしか担当できない (これは残します)
    for i in range(num_people):
        for d in range(num_day):
            p_id = people_map_rev[i]
            person_contract = people_contracts[p_id]
            qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
            
            model.Add(sum(work[i, d, s_code] for s_code in qualified_shift_codes if (i,d,s_code) in work) <= 1)

    # H2: 月間の勤務日数の制約 (コメントアウト)
    # for i in range(num_people):
    #     p_id = people_map_rev[i]
    #     person_contract = people_contracts[p_id]
    #     min_days = person_contract.get("minWorkDays", 0)
    #     max_days = person_contract.get("maxWorkDays", num_days)
    #     
    #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
    #     
    #     total_work_days = sum(work[i, d, s_code] for d in range(num_days) for s_code in qualified_shift_codes if (i,d,s_code) in work)
    #     model.Add(min_days <= total_work_days)
    #     model.Add(total_work_days <= max_days)

    # H3: 週間の最大勤務日数の制約 (コメントアウト)
    # for i in range(num_people):
    #     p_id = people_map_rev[i]
    #     person_contract = people_contracts[p_id]
    #     max_days_per_week = person_contract.get("maxWorkDaysPerWeek", 7)
    #     
    #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
    #
    #     for w in range(num_days // 7):
    #         start_day = w * 7
    #         end_day = start_day + 7
    #         weekly_work_days = sum(work[i, d, s_code] for d in range(start_day, end_day) for s_code in qualified_shift_codes if (i,d,s_code) in work)
    #         model.Add(weekly_work_days <= max_days_per_week)
            
    # H4: 連続勤務日数の上限の制約 (コメントアウト)
    # for i in range(num_people):
    #     p_id = people_map_rev[i]
    #     person_contract = people_contracts[p_id]
    #     max_consecutive_days = person_contract.get("maxConsecutiveWorkDays", num_days)
    #
    #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
    #
    #     for d in range(num_days - max_consecutive_days):
    #         consecutive_work = []
    #         for j in range(max_consecutive_days + 1):
    #             day_work = model.NewBoolVar(f"day_work_{i}_{d+j}")
    #             works_on_day = [work[i, d + j, s_code] for s_code in qualified_shift_codes if (i, d + j, s_code) in work]
    #             model.Add(sum(works_on_day) == day_work)
    #             consecutive_work.append(day_work)
    #         model.Add(sum(consecutive_work) <= max_consecutive_days)
            
    # H5: 夜勤後の休みの制約 (コメントアウト)
    # night_shift_codes = [s["code"] for s in shifts_data if s.get("isNightShift", False)]
    # for i in range(num_people):
    #     for d in range(num_days - 1):
    #         for s_code in night_shift_codes:
    #             if (i, d, s_code) in work:
    #                 # 夜勤があった場合、翌日の全シフトを0にする
    #                 p_id = people_map_rev[i]
    #                 person_contract = people_contracts[p_id]
    #                 qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
    #                 model.Add(sum(work[i, d + 1, next_s_code] for next_s_code in qualified_shift_codes if (i,d+1,next_s_code) in work) == 0).OnlyEnforceIf(work[i, d, s_code])

    # H6: 固定の曜日休みと希望休の制約 (コメントアウト)
    # for i in range(num_people):
    #     p_id = people_map_rev[i]
    #     person_contract = people_contracts[p_id]
    #     
    #     fixed_off_days = person_contract.get("fixedDayOffs", [])
    #     wish_off_dates = request.wishOffs.get(p_id, [])
    #
    #     qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
    #
    #     for d in range(num_days):
    #         day_of_week = (d + input_data["start_day_of_week"]) % 7
    #         date = d + 1
    #         
    #         is_off = False
    #         if day_of_week in fixed_off_days:
    #             is_off = True
    #         if date in wish_off_dates:
    #             is_off = True
    #
    #         if is_off:
    #             for s_code in qualified_shift_codes:
    #                 if (i,d,s_code) in work:
    #                     model.Add(work[i, d, s_code] == 0)

    # --- ソフト制約 ---
    penalties = []
    shortages = {}
    
    # S1: 各シフトの時間帯ごとの必要人数
    # ... (ソフト制約はそのまま)
    # (省略)

    # --- 目的関数 ---
    model.Minimize(sum(penalties))
    
    # --- ソルバーの実行 ---
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    status = solver.Solve(model)

    # --- 結果の整形 ---
    # ... (結果の整形部分はそのまま)
    # (省略)

    return final_schedule, final_shortages, status_str
