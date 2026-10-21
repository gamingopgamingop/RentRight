from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from firebase_admin import auth as firebase_auth, initialize_app
from firebase_admin import credentials
from pydantic import BaseModel, Field

from .store import get_db, Record

router = APIRouter(prefix="/api", tags=["RentRight platform"])


def _firebase_ready() -> bool:
    return os.getenv("FIREBASE_PROJECT_ID", "").strip() != ""


def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="A valid Firebase ID token is required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="A valid Firebase ID token is required.")
    if not _firebase_ready():
        raise HTTPException(status_code=503, detail="Firebase token verification is not configured on this backend.")
    try:
        try:
            firebase_auth.get_app()
        except ValueError:
            # Uses GOOGLE_APPLICATION_CREDENTIALS / workload identity in production.
            initialize_app(options={"projectId": os.environ["FIREBASE_PROJECT_ID"]})
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
        return {"uid": decoded["uid"], "email": decoded.get("email", "")}
    except Exception:
        raise HTTPException(status_code=401, detail="Firebase ID token is invalid or expired.")


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    allowed = {x.strip() for x in os.getenv("FIREBASE_ADMIN_UIDS", "").split(",") if x.strip()}
    if not allowed or user["uid"] not in allowed:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user


def _payload(record: Record) -> dict[str, Any]:
    return {
        "id": record.id,
        "type": record.type,
        "ownerUid": record.owner_uid,
        "payload": record.payload,
        "status": record.status,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "updatedAt": record.updated_at.isoformat() if record.updated_at else None,
    }


class RecordInput(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class PropertyInput(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=10000)
    locality: str = Field(min_length=2, max_length=180)
    monthlyRent: int = Field(gt=0, le=100000000)
    securityDeposit: int = Field(default=0, ge=0, le=100000000)
    maintenance: int = Field(default=0, ge=0, le=10000000)
    accommodationType: str = Field(default="Room", max_length=60)
    furnishing: str = Field(default="Unfurnished", max_length=60)
    listingStatus: str = Field(default="Available", max_length=30)
    verificationStatus: str = Field(default="Owner Claimed", max_length=40)
    images: list[str] = Field(default_factory=list, max_length=20)
    amenities: list[str] = Field(default_factory=list, max_length=100)


class PropertyPatch(BaseModel):
    payload: dict[str, Any] = Field(min_length=1)


def _records(db, kind: str, owner_uid: str | None = None, status: str | None = None):
    q = db.query(Record).filter(Record.type == kind)
    if owner_uid is not None:
        q = q.filter(Record.owner_uid == owner_uid)
    if status is not None:
        q = q.filter(Record.status == status)
    return q.order_by(Record.created_at.desc()).all()


def _new(db, kind: str, owner_uid: str, payload: dict[str, Any], status: str = "open") -> Record:
    now = datetime.now(timezone.utc)
    record = Record(
        id=str(uuid.uuid4()),
        type=kind,
        owner_uid=owner_uid,
        payload=payload,
        status=status,
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/properties")
def list_properties(
    q: str | None = None,
    locality: str | None = None,
    max_rent: int | None = Query(default=None, ge=0),
    accommodation_type: str | None = None,
    verified_only: bool = False,
    hide_rented: bool = True,
    db=Depends(get_db),
):
    rows = _records(db, "property")
    result = []
    needle = (q or "").casefold()
    for row in rows:
        p = row.payload
        if hide_rented and p.get("listingStatus", "Available") != "Available":
            continue
        if verified_only and p.get("verificationStatus") != "Verified":
            continue
        if locality and locality.casefold() not in str(p.get("locality", "")).casefold():
            continue
        if needle and needle not in json.dumps(p, ensure_ascii=False).casefold():
            continue
        if max_rent is not None and int(p.get("monthlyRent", 0)) > max_rent:
            continue
        if accommodation_type and p.get("accommodationType") != accommodation_type:
            continue
        result.append(_payload(row))
    return {"items": result, "count": len(result)}


@router.post("/properties", status_code=201)
def create_property(body: PropertyInput, user=Depends(current_user), db=Depends(get_db)):
    payload = body.model_dump()
    payload["verificationStatus"] = "Owner Claimed"  # users cannot self-assign verified status
    payload["listingStatus"] = "Available" if payload["listingStatus"] not in {"Available", "Rented"} else payload["listingStatus"]
    return _payload(_new(db, "property", user["uid"], payload, payload["listingStatus"]))


@router.get("/properties/{property_id}")
def get_property(property_id: str, db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    return _payload(row)


@router.patch("/properties/{property_id}")
def update_property(property_id: str, body: PropertyPatch, user=Depends(current_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    if row.owner_uid != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only update your own listings.")
    allowed = {"title", "description", "locality", "monthlyRent", "securityDeposit", "maintenance",
               "accommodationType", "furnishing", "listingStatus", "images", "amenities", "availableFrom",
               "billsIncluded", "occupancyPreference", "targetAudience", "metroDistanceKm", "collegeDistanceKm",
               "expiryDays", "wifiSpeed", "powerBackup", "ac", "attachedWashroom", "houseRules", "curfew", "visitorPolicy"}
    if set(body.payload) - allowed:
        raise HTTPException(status_code=422, detail="One or more fields cannot be changed.")
    row.payload = {**row.payload, **body.payload}
    row.status = row.payload.get("listingStatus", row.status)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/properties/{property_id}", status_code=204)
def delete_property(property_id: str, user=Depends(current_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    if row.owner_uid != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only remove your own listings.")
    db.delete(row)
    db.commit()
    return None


@router.post("/properties/{property_id}/inquiries", status_code=201)
def create_inquiry(property_id: str, body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    prop = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    data = dict(body.payload)
    data.update({"propertyId": property_id, "ownerUid": prop.owner_uid, "seekerUid": user["uid"]})
    data["sharePhone"] = bool(data.get("sharePhone", False))
    if not data["sharePhone"]:
        data.pop("phone", None)
    return _payload(_new(db, "inquiry", user["uid"], data))


@router.get("/me/inquiries")
def my_inquiries(user=Depends(current_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "inquiry", user["uid"])]}


@router.get("/owner/inquiries")
def owner_inquiries(user=Depends(current_user), db=Depends(get_db)):
    rows = _records(db, "inquiry")
    return {"items": [_payload(x) for x in rows if x.payload.get("ownerUid") == user["uid"]]}


@router.post("/properties/{property_id}/viewings", status_code=201)
def create_viewing(property_id: str, body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    prop = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    data = {**body.payload, "propertyId": property_id, "ownerUid": prop.owner_uid, "seekerUid": user["uid"]}
    return _payload(_new(db, "viewing", user["uid"], data))


@router.post("/properties/{property_id}/reports", status_code=201)
def report_property(property_id: str, body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    prop = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    data = {**body.payload, "propertyId": property_id, "reporterUid": user["uid"]}
    return _payload(_new(db, "report", user["uid"], data))


@router.get("/me/saved-properties")
def get_saved(user=Depends(current_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "saved", user["uid"])]}


@router.put("/me/saved-properties/{property_id}", status_code=201)
def save_property(property_id: str, user=Depends(current_user), db=Depends(get_db)):
    prop = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    existing = next((x for x in _records(db, "saved", user["uid"]) if x.payload.get("propertyId") == property_id), None)
    if existing:
        return _payload(existing)
    return _payload(_new(db, "saved", user["uid"], {"propertyId": property_id}))


@router.delete("/me/saved-properties/{property_id}", status_code=204)
def unsave_property(property_id: str, user=Depends(current_user), db=Depends(get_db)):
    rows = _records(db, "saved", user["uid"])
    for row in rows:
        if row.payload.get("propertyId") == property_id:
            db.delete(row)
    db.commit()
    return None


@router.post("/tools/affordability")
def affordability(body: RecordInput):
    p = body.payload
    income = max(0, float(p.get("monthlyIncome", 0)))
    rent = max(0, float(p.get("monthlyRent", 0)))
    maintenance = max(0, float(p.get("maintenance", 0)))
    total = rent + maintenance
    return {"monthlyHousingCost": total, "incomeRatioPercent": round(total / income * 100, 2) if income else None,
            "recommendedMaxRent": round(income * 0.30), "within30PercentRule": bool(income and total <= income * 0.30)}


@router.post("/tools/roommate-match")
def roommate_match(body: RecordInput):
    answers = body.payload.get("answers", {})
    if not isinstance(answers, dict) or not answers:
        raise HTTPException(status_code=422, detail="Provide an answers object.")
    # Compare only shared answered dimensions; no sensitive demographic inference.
    left, right = answers.get("you", {}), answers.get("roommate", {})
    keys = set(left) & set(right)
    if not keys:
        return {"scorePercent": None, "matchedFactors": [], "comparedFactors": 0}
    matched = [key for key in keys if left[key] == right[key]]
    return {"scorePercent": round(100 * len(matched) / len(keys)), "matchedFactors": matched, "comparedFactors": len(keys)}


@router.post("/tools/commute")
def commute(body: RecordInput):
    p = body.payload
    distance = max(0.0, float(p.get("distanceKm", 0)))
    speed = max(1.0, float(p.get("averageSpeedKmh", 25)))
    fare = max(0.0, float(p.get("farePerKm", 0)))
    days = max(0, min(31, int(p.get("daysPerMonth", 22))))
    one_way = distance / speed * 60
    return {"oneWayMinutes": round(one_way), "dailyRoundTripMinutes": round(one_way * 2),
            "monthlyTravelCostEstimate": round(distance * 2 * fare * days, 2), "assumptions": "Estimates only; traffic and actual fares vary."}


@router.post("/tools/split-rent")
def split_rent(body: RecordInput):
    p = body.payload
    rent = max(0.0, float(p.get("totalRent", 0)))
    people = max(1, min(50, int(p.get("people", 1))))
    weights = p.get("weights")
    if isinstance(weights, list) and len(weights) == people and all(float(w) >= 0 for w in weights) and sum(map(float, weights)) > 0:
        total_weight = sum(map(float, weights))
        shares = [round(rent * float(w) / total_weight, 2) for w in weights]
    else:
        shares = [round(rent / people, 2) for _ in range(people)]
    return {"totalRent": rent, "people": people, "shares": shares, "note": "Agree on utility and room-size adjustments with all roommates."}


@router.post("/tools/broker-fee")
def broker_fee(body: RecordInput):
    p = body.payload
    rent = max(0.0, float(p.get("monthlyRent", 0)))
    rate = max(0.0, float(p.get("feePercent", 0)))
    fixed = max(0.0, float(p.get("fixedFee", 0)))
    return {"estimatedBrokerFee": round(rent * rate / 100 + fixed, 2), "feePercent": rate, "note": "Confirm the written fee agreement before paying."}


@router.post("/tools/moving-cost")
def moving_cost(body: RecordInput):
    p = body.payload
    fields = ["transport", "packing", "cleaning", "setup", "other"]
    costs = {key: max(0.0, float(p.get(key, 0))) for key in fields}
    return {"breakdown": costs, "totalEstimate": round(sum(costs.values()), 2), "estimateOnly": True}


@router.post("/tools/maintenance", status_code=201)
def create_maintenance(body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    return _payload(_new(db, "maintenance", user["uid"], body.payload))


@router.get("/tools/maintenance")
def list_maintenance(user=Depends(current_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "maintenance", user["uid"])]}


@router.post("/tools/payment-reminders", status_code=201)
def create_payment_reminder(body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    return _payload(_new(db, "payment-reminder", user["uid"], body.payload))


@router.get("/tools/payment-reminders")
def list_payment_reminders(user=Depends(current_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "payment-reminder", user["uid"])]}


@router.post("/tools/inspection-checklists", status_code=201)
def save_checklist(body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    return _payload(_new(db, "inspection-checklist", user["uid"], body.payload))


@router.post("/tools/fake-listing-check")
def fake_listing_check(body: RecordInput):
    p = body.payload
    signals = []
    if not p.get("ownerIdentityConfirmed", False): signals.append("Owner identity is not confirmed.")
    if not p.get("inPersonOrLiveTour", False): signals.append("No in-person or live video tour has been completed.")
    if p.get("priceLooksUnusuallyLow", False): signals.append("Price may be unusually low for the area.")
    if p.get("requestsAdvanceBeforeViewing", False): signals.append("Advance payment requested before viewing.")
    if p.get("pressuresUrgentPayment", False): signals.append("Pressure to pay urgently.")
    return {"riskSignals": signals, "signalCount": len(signals), "riskLevel": "high" if len(signals) >= 2 else "caution" if signals else "no_signals_entered",
            "disclaimer": "This is a checklist, not an automated determination that a listing is genuine or fraudulent."}


@router.post("/tools/deposit-trust")
def deposit_trust(body: RecordInput):
    p = body.payload
    checks = ["writtenAgreement", "signedInventory", "paymentReceipt", "refundTermsClear", "ownerIdentityChecked"]
    completed = [key for key in checks if p.get(key) is True]
    return {"completedChecks": completed, "totalChecks": len(checks), "scorePercent": round(100 * len(completed) / len(checks)),
            "note": "Checklist score is not a credit score, legal assessment, or guarantee of deposit recovery."}


@router.post("/tools/negotiation")
async def negotiation(body: RecordInput):
    p = body.payload
    current = max(0, float(p.get("monthlyRent", 0)))
    target = max(0, float(p.get("targetRent", current)))
    reason = str(p.get("reason", "market comparisons and move-in readiness"))[:1000]
    return {"suggestedMessage": f"Hello, thank you for showing me the property. My budget is around ₹{target:,.0f} per month. Considering {reason}, would you be open to discussing the rent? I can share my move-in timeline and references. Thank you.",
            "currentRent": current, "targetRent": target, "negotiationGap": round(current-target, 2),
            "note": "Draft only. Review and personalize before sending."}


@router.post("/tools/rent-agreement-draft")
def rent_agreement_draft(body: RecordInput):
    p = body.payload
    required = ["tenantName", "ownerName", "propertyAddress", "monthlyRent", "deposit", "startDate", "durationMonths"]
    missing = [key for key in required if p.get(key) in (None, "")]
    return {"providedFields": {key: p.get(key) for key in required if p.get(key) not in (None, "")},
            "missingFields": missing,
            "warning": "This endpoint prepares a data checklist only; it does not generate a legally valid agreement. Have the final document reviewed under applicable local law."}


@router.post("/tools/safety")
def safety_guidance(body: RecordInput):
    topic = str(body.payload.get("topic", ""))
    return {"topic": topic, "emergencyIndia": {"police": "112", "womenHelpline": "181"},
            "guidance": "If there is immediate danger, move to a safer public place if possible and contact local emergency services. Do not rely on this app as an emergency dispatch service."}


@router.post("/tools/locality-compare")
def locality_compare(body: RecordInput):
    areas = body.payload.get("localities", [])
    if not isinstance(areas, list):
        raise HTTPException(status_code=422, detail="localities must be a list.")
    return {"localities": areas[:20], "note": "Submit sourced rent, commute, safety and amenity data for a meaningful comparison; this endpoint does not invent live locality statistics."}


@router.post("/tools/heatmap")
def affordability_heatmap(body: RecordInput):
    points = body.payload.get("points", [])
    if not isinstance(points, list):
        raise HTTPException(status_code=422, detail="points must be a list.")
    return {"points": points[:500], "note": "Map-ready data pass-through. Connect a verified rental dataset and geocoding provider for a real affordability heatmap."}


@router.get("/owner/dashboard")
def owner_dashboard(user=Depends(current_user), db=Depends(get_db)):
    properties = _records(db, "property", user["uid"])
    inquiries = [x for x in _records(db, "inquiry") if x.payload.get("ownerUid") == user["uid"]]
    viewings = [x for x in _records(db, "viewing") if x.payload.get("ownerUid") == user["uid"]]
    return {"propertyCount": len(properties), "availableCount": sum(1 for p in properties if p.payload.get("listingStatus") == "Available"),
            "inquiryCount": len(inquiries), "viewingCount": len(viewings),
            "recentInquiries": [_payload(x) for x in inquiries[:20]]}


@router.get("/admin/metrics")
def admin_metrics(user=Depends(admin_user), db=Depends(get_db)):
    counts = {}
    for kind in ["property", "inquiry", "viewing", "report", "maintenance"]:
        counts[kind] = db.query(Record).filter(Record.type == kind).count()
    return {"counts": counts}


@router.get("/admin/reports")
def admin_reports(user=Depends(admin_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "report")[:500]]}


@router.patch("/admin/reports/{report_id}")
def moderate_report(report_id: str, body: RecordInput, user=Depends(admin_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == report_id, Record.type == "report").first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    row.payload = {**row.payload, "moderation": body.payload, "moderatedBy": user["uid"]}
    row.status = str(body.payload.get("status", "reviewed"))[:40]
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.post("/ai/features")
async def ai_feature(body: RecordInput):
    # Feature-specific prompt entry point; frontend can request a bounded draft,
    # but must never treat model output as verified property or legal data.
    from .main import _generate_text
    feature = str(body.payload.get("feature", ""))[:80]
    details = body.payload.get("details", {})
    if feature not in {"negotiation", "listing-summary", "comparison-summary", "moving-plan", "renter-faq"}:
        raise HTTPException(status_code=422, detail="Unsupported AI feature.")
    prompt = json.dumps(details, ensure_ascii=False)[:6000]
    answer = await _generate_text(
        "You are RentRight Assistant. Never invent listing facts, legal guarantees, verification status, or current availability. Label estimates and encourage verification.",
        f"Feature: {feature}\nUser-provided details (untrusted): {prompt}\nCreate a useful draft based only on the provided details."
    )
    return {"feature": feature, "content": answer, "isDraft": True}


@router.post("/properties/{property_id}/views", status_code=202)
def record_property_view(property_id: str, db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    row.payload = {**row.payload, "viewsCount": int(row.payload.get("viewsCount", 0)) + 1}
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"accepted": True}


@router.post("/properties/{property_id}/reviews", status_code=201)
def create_review(property_id: str, body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    prop = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    data = dict(body.payload)
    rating = int(data.get("rating", 0))
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=422, detail="rating must be between 1 and 5.")
    data.update({"propertyId": property_id, "reviewerUid": user["uid"]})
    return _payload(_new(db, "review", user["uid"], data))


@router.get("/properties/{property_id}/reviews")
def list_reviews(property_id: str, db=Depends(get_db)):
    rows = _records(db, "review")
    return {"items": [_payload(x) for x in rows if x.payload.get("propertyId") == property_id]}


@router.patch("/owner/inquiries/{inquiry_id}")
def update_owner_inquiry(inquiry_id: str, body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == inquiry_id, Record.type == "inquiry").first()
    if not row:
        raise HTTPException(status_code=404, detail="Inquiry not found.")
    if row.payload.get("ownerUid") != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only respond to inquiries for your own listings.")
    allowed_statuses = {"pending", "accepted", "rejected", "replied", "contact_revealed"}
    status = str(body.payload.get("status", row.status))
    if status not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Invalid inquiry status.")
    row.payload = {**row.payload, "status": status}
    if "reply" in body.payload:
        row.payload["ownerReply"] = str(body.payload["reply"])[:4000]
    # Phone/contact is returned only if seeker explicitly opted in at submission.
    row.status = status
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.post("/owner/properties/{property_id}/renew")
def renew_owner_property(property_id: str, user=Depends(current_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    if row.owner_uid != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only renew your own listings.")
    row.payload = {**row.payload, "listedDate": datetime.now(timezone.utc).date().isoformat(), "expiryDays": 45}
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.post("/contact", status_code=201)
def contact_form(body: RecordInput, db=Depends(get_db)):
    # Contact submissions are stored for staff follow-up; never send secrets here.
    allowed = {"name", "email", "subject", "message"}
    data = {key: str(body.payload.get(key, ""))[:4000] for key in allowed}
    if not data["email"] or not data["message"]:
        raise HTTPException(status_code=422, detail="Email and message are required.")
    return {"ticket": _payload(_new(db, "contact", "anonymous", data))["id"], "status": "received"}


@router.post("/voice/sessions", status_code=201)
def create_voice_session(body: RecordInput, user=Depends(current_user), db=Depends(get_db)):
    # Session metadata only; a voice provider/call dispatch integration is separate.
    data = {key: value for key, value in body.payload.items() if key in {"channel", "language", "purpose"}}
    data["state"] = "created"
    return _payload(_new(db, "voice-session", user["uid"], data))


@router.get("/me/records/{record_type}")
def get_my_records(record_type: str, user=Depends(current_user), db=Depends(get_db)):
    supported = {"maintenance", "payment-reminder", "inspection-checklist", "viewing", "review", "voice-session"}
    if record_type not in supported:
        raise HTTPException(status_code=404, detail="Unsupported record type.")
    return {"items": [_payload(x) for x in _records(db, record_type, user["uid"])]}


@router.post("/admin/properties/{property_id}/verification")
def verify_property(property_id: str, body: RecordInput, user=Depends(admin_user), db=Depends(get_db)):
    row = db.query(Record).filter(Record.id == property_id, Record.type == "property").first()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found.")
    approved = body.payload.get("verified") is True
    row.payload = {**row.payload, "verificationStatus": "Verified" if approved else "Owner Claimed"}
    if approved:
        row.payload["verificationProof"] = {
            "verifiedBy": user["uid"],
            "verifiedDate": datetime.now(timezone.utc).date().isoformat(),
            "proofNotes": str(body.payload.get("proofNotes", ""))[:2000],
        }
    else:
        row.payload.pop("verificationProof", None)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/owner/properties")
def owner_properties(user=Depends(current_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "property", user["uid"])]}


@router.get("/admin/contacts")
def admin_contacts(user=Depends(admin_user), db=Depends(get_db)):
    return {"items": [_payload(x) for x in _records(db, "contact")[:500]]}
