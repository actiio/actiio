from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user, validate_agent_id
from app.core.supabase import get_supabase
from app.core.sanitization import sanitize_payload

supabase = get_supabase()
from app.schemas.business_profile import BusinessProfileResponse, BusinessProfileUpsert

router = APIRouter(prefix="/business-profile", tags=["business-profile"])


@router.get("", response_model=BusinessProfileResponse)
def get_business_profile(current_user=Depends(get_current_user), agent_id: str = Query(default="gmail_followup")):
    agent_id = validate_agent_id(agent_id)
    response = (
        supabase.table("business_profiles")
        .select(
            "user_id,agent_id,business_name,industry,target_customer,core_offer,price_range,differentiator,email_footer,sales_assets"
        )
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business profile not found")

    return BusinessProfileResponse(**response.data[0])


@router.post("", response_model=BusinessProfileResponse)
@router.put("", response_model=BusinessProfileResponse)
def upsert_business_profile(payload: BusinessProfileUpsert, current_user=Depends(get_current_user)):
    data = sanitize_payload(
        payload.model_dump(),
        preserve_newlines_keys={"target_customer", "core_offer", "differentiator", "email_footer"},
    )
    data["agent_id"] = validate_agent_id(data.get("agent_id"))
    data["price_range"] = data.get("price_range") or ""
    data["differentiator"] = data.get("differentiator") or ""
    data["email_footer"] = data.get("email_footer") or ""
    data["user_id"] = current_user.id

    response = (
        supabase.table("business_profiles")
        .upsert(data, on_conflict="user_id,agent_id")
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save business profile",
        )

    return BusinessProfileResponse(**response.data[0])
