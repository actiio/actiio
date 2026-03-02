from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.supabase import get_supabase

supabase = get_supabase()
from app.schemas.business_profile import BusinessProfileResponse, BusinessProfileUpsert

router = APIRouter(prefix="/business-profile", tags=["business-profile"])


@router.get("", response_model=BusinessProfileResponse)
def get_business_profile(current_user=Depends(get_current_user)):
    response = (
        supabase.table("business_profiles")
        .select(
            "user_id,business_name,industry,target_customer,core_offer,price_range,differentiator,preferred_tone,silence_threshold_hours"
        )
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business profile not found")

    return BusinessProfileResponse(**response.data[0])


@router.put("", response_model=BusinessProfileResponse)
def upsert_business_profile(payload: BusinessProfileUpsert, current_user=Depends(get_current_user)):
    data = payload.model_dump()
    data["user_id"] = current_user.id

    response = (
        supabase.table("business_profiles")
        .upsert(data, on_conflict="user_id")
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save business profile",
        )

    return BusinessProfileResponse(**response.data[0])
