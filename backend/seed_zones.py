from backend.app.database import SessionLocal
from backend.app.models.zone import Zone

zones = [
    {
        "zone_id": "ZONE_A",
        "name": "Arunachal Zone A",
        "latitude": 27.084,
        "longitude": 93.605,
    },
    {
        "zone_id": "ZONE_B",
        "name": "Arunachal Zone B",
        "latitude": 27.586,
        "longitude": 91.859,
    },
    {
        "zone_id": "ZONE_C",
        "name": "Arunachal Zone C",
        "latitude": 28.066,
        "longitude": 95.327,
    },
    {
        "zone_id": "ZONE_D",
        "name": "Arunachal Zone D",
        "latitude": 27.013,
        "longitude": 92.647,
    },
]

db = SessionLocal()

try:
    for data in zones:
        existing = (
            db.query(Zone)
            .filter(Zone.zone_id == data["zone_id"])
            .first()
        )

        if existing:
            print(f"{data['zone_id']} already exists")
            continue

        db.add(Zone(**data))
        print(f"Added {data['zone_id']}")

    db.commit()
    print("Zone seeding complete.")

finally:
    db.close()
