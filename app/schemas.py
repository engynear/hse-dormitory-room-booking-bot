from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class BookingBase(BaseModel):
    room: str
    start_time: datetime
    end_time: datetime
    user_room_number: str
    reason: Optional[str] = None

class BookingCreate(BookingBase):
    pass

class _UserInDB(BaseModel):
    username: str
    class Config:
        orm_mode = True

class BookingPublic(BookingBase):
    id: int
    user: _UserInDB
    
    class Config:
        orm_mode = True

class Booking(BookingBase):
    id: int
    user_id: int

    class Config:
        orm_mode = True

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    id: int

class User(UserBase):
    id: int
    bookings: list[Booking] = []

    class Config:
        orm_mode = True 