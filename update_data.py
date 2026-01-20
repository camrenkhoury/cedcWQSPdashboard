import time
import pandas as pd
import datetime
import os                          # <--- NEW
from dotenv import load_dotenv     # <--- NEW
from pathlib import Path
from supabase import create_client, Client

# Load the secrets from the .env file
load_dotenv()                      # <--- NEW

# --- CONFIGURATION ---
# Now we fetch them from the system environment
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Check if they loaded correctly (sanity check)
if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Supabase keys not found. Did you create the .env file?")
    exit()

EXCEL_PATH = Path("data/water_data.xlsx")
SLEEP_SEC = 4

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def main():
    print(f"🚀 Starting Uploader...")
    
    # Track which row we are on
    cursor = 0
    
    while True:
        try:
            if not EXCEL_PATH.exists():
                print("⚠️ Excel file not found. Waiting...")
                time.sleep(SLEEP_SEC)
                continue

            # 1. Read Excel
            df = pd.read_excel(EXCEL_PATH)
            
            if len(df) == 0:
                print("⚠️ Excel is empty.")
                time.sleep(SLEEP_SEC)
                continue

            # 2. Pick the next row (Loop back to start if we hit the end)
            current_row_index = cursor % len(df)
            row = df.iloc[current_row_index]

            # 3. Prepare Data (Use CURRENT TIME for the chart!)
            # We ignore the Excel timestamp so the dashboard looks "Live" right now.
            current_time = datetime.datetime.now(datetime.timezone.utc).isoformat()

            payload = {
                "timestamp": current_time,
                "ph": float(row["pH"]),
                "turbidity": float(row["Turbidity_NTU"]),
                "temperature": float(row["Temperature_C"]),
                "tds": float(row["TDS_ppm"]),
                "conductivity": float(row["Conductivity_uS"])
            }

            # 4. Upload
            supabase.table('water_readings').insert(payload).execute()
            
            print(f"✅ Sent Row {current_row_index}: pH {payload['ph']} | Temp {payload['temperature']}")
            
            # Move to next row for next time
            cursor += 1

        except Exception as e:
            print(f"❌ Error: {e}")

        time.sleep(SLEEP_SEC)

if __name__ == "__main__":
    main()