from app.core.supabase import get_supabase
import logging
logging.basicConfig(level=logging.ERROR)

supabase = get_supabase()

def test():
    try:
        supabase.auth.admin.create_user({
            "email": "test@example.com",
            "password": "Password123!"
        })
        print("Created first time.")
        supabase.auth.admin.create_user({
            "email": "test@example.com",
            "password": "Password123!"
        })
    except Exception as e:
        print("---ERROR RETURNED---")
        print(str(e))
        print("---ERROR EXPR---")
        print(repr(e))
        if hasattr(e, "message"):
            print("Message:", e.message)
        if hasattr(e, "code"):
            print("Code:", e.code)

if __name__ == "__main__":
    test()
