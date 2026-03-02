from fastapi import Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.supabase import get_supabase

supabase = get_supabase()


def require_active_subscription(current_user=Depends(get_current_user)):
    response = (
        supabase.table("users")
        .select("subscription_status")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription required")

    subscription_status = response.data[0].get("subscription_status")
    if subscription_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription required")

    return current_user
