import json
from ortools.sat.python import cp_model
from .models import ScheduleRequest

def solve_shift_scheduling(request: ScheduleRequest):
    try:
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
        
        all_shift_codes = [s["code"] for s in shifts_data]
        
        # モデルの初期化
        model = cp_model.CpModel()

        # --- 決定変数の作成 ---
        work = {}
        for i in range(num_people):
            p_id = people_map_rev[i]
            person_contract = people_contracts.get(p_id)
            if not person_contract: continue

            qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
            
            for d in range(num_days):
                for s_code in qualified_shift_codes:
                    work[i, d, s_code] = model.NewBoolVar(f"work_{i}_{d}_{s_code}")

        # --- ハード制約 ---

        # H1: 1人のスタッフは1日に最大1つのシフトしか担当できない (これを残します)
        for i in range(num_people):
            for d in range(num_days):
                p_id = people_map_rev[i]
                person_contract = people_contracts.get(p_id)
                if not person_contract: continue
                
                qualified_shift_codes = person_contract.get("qualifiedShifts", all_shift_codes)
                
                # 【修正点】変数と数字の0を混ぜないように、安全な記述に変更
                works_on_day = [work[i, d, s_code] for s_code in qualified_shift_codes if (i, d, s_code) in work]
                model.Add(sum(works_on_day) <= 1)

        # H2: 月間の勤務日数の制約 (コメントアウト)
        # (省略) ...

        # H3: 週間の最大勤務日数の制約 (コメントアウト)
        # (省略) ...
            
        # H4: 連続勤務日数の上限の制約 (コメントアウト)
        # (省略) ...
            
        # H5: 夜勤後の休みの制約 (コメントアウト)
        # (省略) ...

        # H6: 固定の曜日休みと希望休の制約 (コメントアウト)
        # (省略) ...

        # --- ソフト制約 ---
        # (ソフト制約のコードは元のままなので省略)
        
        # --- 目的関数 ---
        # (目的関数のコードは元のままなので省略)
        
        # --- ソルバーの実行 ---
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 60.0 # タイムアウトを60秒に設定
        status = solver.Solve(model)

        # --- 結果の整形 ---
        # (結果整形コードは元のままなので省略)

        # (最終的なreturn文も元のままなので省略)

    except Exception as e:
        print(f"An error occurred in solver: {e}")
        # エラーが発生した場合は、空のスケジュールとエラーメッセージを返す
        return {}, {}, "SOLVER_ERROR"
