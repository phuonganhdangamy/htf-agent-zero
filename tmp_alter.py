import psycopg2

def alter_schema():
    conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE signal_events ADD COLUMN title TEXT;")
        print("Added title column.")
    except Exception as e:
        print(f"title error: {e}")
        
    try:
        cur.execute("ALTER TABLE signal_events ADD COLUMN summary TEXT;")
        print("Added summary column.")
    except Exception as e:
        print(f"summary error: {e}")

    conn.close()

if __name__ == "__main__":
    alter_schema()
