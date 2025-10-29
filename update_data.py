import json, time, os
import pandas as pd
from pathlib import Path

EXCEL_PATH = Path("data/water_data.xlsx")  # <-- your file
CURR_JSON  = Path("data/data.json")
HIST_JSON  = Path("data/history.json")
STATE_JSON = Path("data/state.json")       # remembers where we left off
HISTORY_LEN = 120                          # keep last N points (~20 min at 10s)
SLEEP_SEC   = 4                           # match your dashboard polling

# column names in your sheet (adjust if yours differ)
COLS = {
    "ts":  "Timestamp",
    "ph":  "pH",
    "tur": "Turbidity_NTU",
    "tmp": "Temperature_C",
    "tds": "TDS_ppm",
    "con": "Conductivity_uS",
}

def load_state():
    if STATE_JSON.exists():
        try: return json.loads(STATE_JSON.read_text())
        except: pass
    return {"cursor": 0}

def save_state(state):
    STATE_JSON.write_text(json.dumps(state))

def read_excel():
    # read once on each loop to allow spreadsheet to change/extend
    df = pd.read_excel(EXCEL_PATH)
    # normalize columns we care about; raise if missing
    for key in COLS.values():
        if key not in df.columns:
            raise ValueError(f"Missing column in Excel: {key}")
    # ensure timestamp is datetime and not NaT
    df[COLS["ts"]] = pd.to_datetime(df[COLS["ts"]], errors="coerce")
    df = df.dropna(subset=[COLS["ts"]]).reset_index(drop=True)
    return df

def row_to_dict(row):
    return {
        "timestamp": pd.to_datetime(row[COLS["ts"]]).isoformat(),
        "ph": float(row[COLS["ph"]]),
        "turbidity": float(row[COLS["tur"]]),
        "temperature": float(row[COLS["tmp"]]),
        "tds": float(row[COLS["tds"]]),
        "conductivity": float(row[COLS["con"]])
    }

def append_history(sample):
    # load existing history (array of samples)
    hist = []
    if HIST_JSON.exists():
        try: hist = json.loads(HIST_JSON.read_text())
        except: hist = []
    hist.append(sample)
    # trim to rolling window
    if len(hist) > HISTORY_LEN:
        hist = hist[-HISTORY_LEN:]
    HIST_JSON.write_text(json.dumps(hist, indent=2))
    return hist

def main():
    state = load_state()

    while True:
        try:
            df = read_excel()
            n = len(df)
            if n == 0:
                print("⚠️ No rows in Excel yet.")
                time.sleep(SLEEP_SEC); continue

            # wrap cursor when we reach end (loop the dataset)
            i = state.get("cursor", 0) % n
            sample = row_to_dict(df.iloc[i])

            # write current
            CURR_JSON.write_text(json.dumps(sample, indent=2))

            # write rolling history
            hist = append_history(sample)

            # advance & persist cursor
            state["cursor"] = i + 1
            save_state(state)

            print(f"✅ wrote current + history [{len(hist)} pts], row {i+1}/{n}")
        except Exception as e:
            print(f"❌ Error: {e}")

        time.sleep(SLEEP_SEC)

if __name__ == "__main__":
    # make sure data/ exists
    Path("data").mkdir(parents=True, exist_ok=True)
    main()
