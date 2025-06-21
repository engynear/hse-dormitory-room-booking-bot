from sqlalchemy.orm import Session, joinedload
from . import models, schemas
from datetime import datetime, timezone, date, timedelta

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(id=user.id, username=user.username)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_user_bookings(db: Session, user_id: int):
    return db.query(models.Booking).filter(
        models.Booking.user_id == user_id,
        models.Booking.end_time > datetime.now(timezone.utc)
    ).all()

def get_bookings_by_date(db: Session, query_date: date):
    start_of_day_utc = datetime(query_date.year, query_date.month, query_date.day, tzinfo=timezone.utc)
    end_of_day_utc = start_of_day_utc + timedelta(days=1)
    
    return db.query(models.Booking).options(joinedload(models.Booking.user)).filter(
        models.Booking.start_time >= start_of_day_utc,
        models.Booking.start_time < end_of_day_utc
    ).all()

def is_room_available(db: Session, room: str, start_time: datetime, end_time: datetime, booking_id_to_exclude: int = None):
    query = db.query(models.Booking).filter(
        models.Booking.room == room,
        models.Booking.end_time > start_time,
        models.Booking.start_time < end_time
    )
    if booking_id_to_exclude:
        query = query.filter(models.Booking.id != booking_id_to_exclude)
    
    return query.count() == 0

def create_booking(db: Session, booking: schemas.BookingCreate, user_id: int):
    db_booking = models.Booking(**booking.model_dump(), user_id=user_id)
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking

def delete_booking(db: Session, booking_id: int, user_id: int):
    db_booking = db.query(models.Booking).filter(
        models.Booking.id == booking_id,
        models.Booking.user_id == user_id
    ).first()
    
    if db_booking:
        db.delete(db_booking)
        db.commit()
        return db_booking
    return None 